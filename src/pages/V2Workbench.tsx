import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ImagePlus, Images, LoaderCircle, Send, Sparkles, Trash2, X } from 'lucide-react';
import { applyDraftAdjustmentPatches, interpretLocalTweakCommand, normalizeDraft, type ChatMessage, type ConversationDesignDraft, type DraftAdjustmentPatch } from '../lib/chatDesign';
import { renderDraftToPng } from '../lib/renderDraftToPng';
import { api } from '../utils/api';

type UploadedImage = { id: string; name: string; src: string };
type PresetPrompt = { id: string; title: string; prompt: string; thumbnailUrl: string; sortOrder: number; enabled: boolean };

const initialMessages: ChatMessage[] = [
  { id: 'welcome_v2', role: 'assistant', content: '你好，请输入需求。' },
];

export default function V2Workbench() {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [logos, setLogos] = useState<UploadedImage[]>([]);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [shouldPreprocessLogos, setShouldPreprocessLogos] = useState(true);
  const [presets, setPresets] = useState<PresetPrompt[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [latestDraft, setLatestDraft] = useState<ConversationDesignDraft | null>(null);
  const [selectedPresetThumbnailUrl, setSelectedPresetThumbnailUrl] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(430);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => { void loadPresets(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, isGenerating]);

  useEffect(() => {
    if (!isResizing) return;
    const move = (event: PointerEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPreviewWidth(Math.min(760, Math.max(340, rect.right - event.clientX - 4)));
    };
    const up = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const loadPresets = async () => {
    setIsLoadingPresets(true);
    try {
      const result = await api.presetPrompts.list({ enabledOnly: true });
      setPresets(result.success ? result.presets : []);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'reference') => {
    const files = event.target.files;
    if (!files?.length) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = { id: `${target}_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, src: String(reader.result || '') };
        if (target === 'logo') setLogos((prev) => [...prev, image]);
        else setReferenceImages((prev) => [...prev, image]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const removeImage = (target: 'logo' | 'reference', id: string) => {
    if (target === 'logo') setLogos((prev) => prev.filter((item) => item.id !== id));
    else setReferenceImages((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUsePreset = (preset: PresetPrompt) => {
    if (selectedPresetId === preset.id) {
      setSelectedPresetId(null);
      setSelectedPresetThumbnailUrl(null);
      setInput('');
      return;
    }
    setSelectedPresetId(preset.id);
    setSelectedPresetThumbnailUrl(preset.thumbnailUrl || null);
    setInput(preset.prompt);
  };

  const updateProgress = (id: string, content: string, generateStatus: 'active' | 'completed' | 'error', imageUrl?: string, draft?: ConversationDesignDraft) => {
    setMessages((prev) => prev.map((message) => message.id === id ? {
      ...message,
      kind: generateStatus === 'error' ? 'error' : generateStatus === 'completed' ? 'generation_result' : 'generation_progress',
      content,
      imageUrl,
      draft,
      progressSteps: [
        { id: 'material', label: '整理素材', status: 'completed' },
        { id: 'generate', label: '生成布局', status: generateStatus },
        { id: 'preview', label: '刷新右侧预览', status: generateStatus === 'completed' ? 'completed' : 'pending' },
      ],
    } : message));
  };

  const handleSubmit = async (promptOverride?: string) => {
    const content = (promptOverride ?? input).trim();
    if ((!content && referenceImages.length === 0) || isGenerating) return;

    if (latestDraft && content && logos.length === 0 && referenceImages.length === 0) {
      const userMessage: ChatMessage = { id: `user_v2_tweak_${Date.now()}`, role: 'user', kind: 'text', content };
      setInput('');
      setSelectedPresetId(null);
      setSelectedPresetThumbnailUrl(null);
      setIsGenerating(true);
      try {
        let patches: DraftAdjustmentPatch[] = [];
        let reply = '已根据你的要求微调当前排版。';
        let tweakMode: 'local' | 'ai' = 'local';
        const localTweak = interpretLocalTweakCommand(content);
        if (localTweak) {
          patches = localTweak.patches;
          reply = localTweak.summary;
        } else {
          const aiTweak = await api.generate.tweakLayout({ prompt: content, draft: latestDraft });
          if (aiTweak.success && aiTweak.patches && aiTweak.patches.length > 0) {
            patches = aiTweak.patches as DraftAdjustmentPatch[];
            reply = aiTweak.reply || reply;
            tweakMode = 'ai';
          }
        }
        if (patches.length > 0) {
          const nextDraft = applyDraftAdjustmentPatches(latestDraft, patches);
          const imageUrl = await renderDraftToPng(nextDraft);
          setCurrentImageUrl(imageUrl);
          setLatestDraft(nextDraft);
          const assistantMessage: ChatMessage = { id: `assistant_v2_tweak_${Date.now()}`, role: 'assistant', kind: 'generation_result', content: reply, imageUrl, draft: nextDraft, tweakMeta: { mode: tweakMode, sourcePrompt: content, appliedPatches: patches, previousDraft: latestDraft } };
          setMessages((prev) => [...prev, userMessage, assistantMessage]);
          return;
        }
      } catch {
        // 微调失败时回退到完整生成流程
      } finally {
        setIsGenerating(false);
      }
    }

    const progressId = `assistant_v2_progress_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `user_v2_${Date.now()}`, role: 'user', kind: 'text', content: content || '请参考左侧参考图生成保护垫设计' },
      {
        id: progressId,
        role: 'assistant',
        kind: 'generation_progress',
        content: '已收到需求，正在准备素材并生成画布。',
        progressSteps: [
          { id: 'material', label: '整理素材', status: 'active' },
          { id: 'generate', label: '生成布局', status: 'pending' },
          { id: 'preview', label: '刷新右侧预览', status: 'pending' },
        ],
      },
    ]);
    setInput('');
    setSelectedPresetId(null);
    setSelectedPresetThumbnailUrl(null);
    setIsGenerating(true);

    try {
      const normalizedLogos: UploadedImage[] = [];
      if (logos.length > 0 && shouldPreprocessLogos) {
        for (const logo of logos) {
          const normalized = await api.generate.normalizeLogo({ image: logo.src, fileName: logo.name, targetColor: '#ef0000' });
          normalizedLogos.push(normalized.success && normalized.imageUrl ? { ...logo, src: normalized.imageUrl } : logo);
        }
      }
      updateProgress(progressId, '素材已整理完成，正在生成设计布局。', 'active');
      const generationReferences: UploadedImage[] = selectedPresetThumbnailUrl ? [
        { id: `preset_reference_${Date.now()}`, name: '参考模板图', src: selectedPresetThumbnailUrl },
        ...referenceImages,
      ] : referenceImages;
      const result = await api.generate.canvas({
        prompt: content || '请参考上传的参考图生成一版保护垫设计',
        messages: messages.filter((message) => !message.ephemeral).map((message) => ({ role: message.role, content: message.content })),
        images: logos.length > 0 ? (shouldPreprocessLogos ? normalizedLogos : logos) : [],
        referenceImages: generationReferences,
      });
      if (!result.success || !result.draft) throw new Error(result.error || '生成失败');
      const draft = normalizeDraft(result.draft, content);
      const imageUrl = await renderDraftToPng(draft);
      setCurrentImageUrl(imageUrl);
      setLatestDraft(draft);
      setLogos([]);
      setReferenceImages([]);
      updateProgress(progressId, result.reply || '已生成新版画布，右侧预览已同步更新。', 'completed', imageUrl, draft);
    } catch (error) {
      updateProgress(progressId, `生成失败：${(error as Error).message || '请稍后重试'}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!currentImageUrl) return;
    const link = document.createElement('a');
    link.href = currentImageUrl;
    link.download = `protective-pad-v2-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-full min-h-0 bg-slate-100 p-4">
      <div ref={layoutRef} className="grid min-h-0 w-full grid-cols-[320px_minmax(0,1fr)_10px_var(--preview-panel-width)] gap-4 max-lg:grid-cols-1" style={{ '--preview-panel-width': `${previewWidth}px` } as React.CSSProperties}>
        <MaterialPanel
          logos={logos}
          referenceImages={referenceImages}
          presets={presets}
          selectedPresetId={selectedPresetId}
          isLoadingPresets={isLoadingPresets}
          shouldPreprocessLogos={shouldPreprocessLogos}
          setShouldPreprocessLogos={setShouldPreprocessLogos}
          logoInputRef={logoInputRef}
          referenceInputRef={referenceInputRef}
          onFileUpload={handleFileUpload}
          onRemoveImage={removeImage}
          onUsePreset={handleUsePreset}
        />
        <ChatPanel input={input} setInput={setInput} messages={messages} isGenerating={isGenerating} hasPreview={Boolean(currentImageUrl)} messagesEndRef={messagesEndRef} onClear={() => { setInput(''); setSelectedPresetId(null); }} onSubmit={() => void handleSubmit()} onQuickSend={(prompt) => void handleSubmit(prompt)} />
        <ResizeHandle isResizing={isResizing} onStart={() => setIsResizing(true)} />
        <PreviewPanel imageUrl={currentImageUrl} onDownload={handleDownload} />
      </div>
    </div>
  );
}

function MaterialPanel(props: {
  logos: UploadedImage[]; referenceImages: UploadedImage[]; presets: PresetPrompt[]; selectedPresetId: string | null; isLoadingPresets: boolean; shouldPreprocessLogos: boolean;
  setShouldPreprocessLogos: (value: boolean) => void; logoInputRef: React.RefObject<HTMLInputElement>; referenceInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'reference') => void; onRemoveImage: (target: 'logo' | 'reference', id: string) => void; onUsePreset: (preset: PresetPrompt) => void;
}) {
  const [activeTab, setActiveTab] = useState<'template' | 'reference'>('template');
  const [previewPreset, setPreviewPreset] = useState<PresetPrompt | null>(null);
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><div className="flex items-center gap-2 text-base font-semibold text-slate-900"><Sparkles className="h-5 w-5 text-blue-600" />素材与模板</div></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <UploadBlock title="上传 Logo" count={props.logos.length} buttonClass="border-slate-300 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" icon={<ImagePlus className="h-5 w-5" />} label="添加 Logo 图片" onClick={() => props.logoInputRef.current?.click()} />
        {props.logos.length > 0 && <label className="-mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={props.shouldPreprocessLogos} onChange={(event) => props.setShouldPreprocessLogos(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600" />自动预处理 Logo</label>}
        <ImageGrid images={props.logos} onRemove={(id) => props.onRemoveImage('logo', id)} tone="blue" />
        <input ref={props.logoInputRef} type="file" accept="image/*" multiple onChange={(event) => props.onFileUpload(event, 'logo')} className="hidden" />

        <section>
          <div className="mb-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-semibold">
            <button type="button" onClick={() => setActiveTab('template')} className={`rounded-md px-3 py-2 transition ${activeTab === 'template' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>参考模板</button>
            <button type="button" onClick={() => setActiveTab('reference')} className={`rounded-md px-3 py-2 transition ${activeTab === 'reference' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>上传参考图</button>
          </div>
          {activeTab === 'template' ? <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">参考模板</h3>{props.isLoadingPresets && <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />}</div><div className="space-y-3">
            {props.presets.length === 0 && <div className="border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">暂无可用模板</div>}
            {props.presets.map((preset) => {
              const isSelected = props.selectedPresetId === preset.id;
              return <button key={preset.id} type="button" onClick={() => props.onUsePreset(preset)} className={`relative flex w-full items-center gap-3 border p-2 text-left transition ${isSelected ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'}`}>{isSelected && <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white shadow-sm"><CheckCircle2 className="h-4 w-4" /></span>}<span role="button" tabIndex={0} title="点击放大查看模板" onClick={(event) => { event.stopPropagation(); setPreviewPreset(preset); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setPreviewPreset(preset); } }} className="group relative h-16 w-24 shrink-0 cursor-zoom-in overflow-hidden bg-slate-100">{preset.thumbnailUrl ? <img src={preset.thumbnailUrl} alt={preset.title} className="h-full w-full object-cover transition group-hover:scale-105" /> : null}<span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[10px] text-white opacity-0 transition group-hover:opacity-100">放大</span></span><div className="min-w-0 flex-1 pr-7"><div className={`truncate text-sm font-semibold ${isSelected ? 'text-green-800' : 'text-slate-800'}`}>{preset.title}</div></div></button>;
            })}
          </div></div> : <div><UploadBlock title="上传参考图" count={props.referenceImages.length} buttonClass="border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100" icon={<Images className="h-5 w-5" />} label="添加参考图" onClick={() => props.referenceInputRef.current?.click()} /><ImageGrid images={props.referenceImages} onRemove={(id) => props.onRemoveImage('reference', id)} tone="amber" /></div>}
          <input ref={props.referenceInputRef} type="file" accept="image/*" multiple onChange={(event) => props.onFileUpload(event, 'reference')} className="hidden" />
        </section>
      </div>
      {previewPreset?.thumbnailUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setPreviewPreset(null)}><button type="button" aria-label="关闭模板预览" onClick={() => setPreviewPreset(null)} className="absolute right-6 top-6 rounded-full bg-white/95 p-2 text-slate-700 shadow-lg transition hover:bg-white hover:text-red-500"><X className="h-6 w-6" /></button><div className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}><img src={previewPreset.thumbnailUrl} alt={previewPreset.title} className="max-h-[86vh] max-w-[90vw] object-contain shadow-2xl" /><div className="mt-3 text-center text-sm font-semibold text-white">{previewPreset.title}</div></div></div>}
    </aside>
  );
}

function UploadBlock({ title, count, icon, label, buttonClass, onClick }: { title: string; count: number; icon: React.ReactNode; label: string; buttonClass: string; onClick: () => void }) {
  return <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">{title}</h3>{count > 0 && <span className="text-xs text-slate-400">{count} 张</span>}</div><button type="button" onClick={onClick} className={`flex h-24 w-full flex-col items-center justify-center gap-2 border border-dashed text-sm font-semibold transition ${buttonClass}`}>{icon}{label}</button></section>;
}

function ChatPanel({ input, setInput, messages, isGenerating, hasPreview, messagesEndRef, onClear, onSubmit, onQuickSend }: { input: string; setInput: (value: string) => void; messages: ChatMessage[]; isGenerating: boolean; hasPreview: boolean; messagesEndRef: React.RefObject<HTMLDivElement>; onClear: () => void; onSubmit: () => void; onQuickSend: (prompt: string) => void }) {
  const tunePrompts = ['把主要标题放大并居中', '整体颜色更醒目，增强红色元素', 'Logo 区域放大并保持清晰', '减少文字拥挤，留出更多安全边距'];
  const followUpPrompts = hasPreview ? ['继续优化这一版', '换一种更醒目的风格', '让文字层级更清晰'] : ['需要上传 Logo 吗？', '可以参考模板生成吗？', '帮我生成一版默认方案'];
  return <aside className="flex min-h-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h2 className="text-base font-semibold text-slate-900">AI 对话</h2></div><div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">{messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-blue-600 text-white' : message.kind === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}><div className="whitespace-pre-wrap break-words">{message.content}</div>{message.progressSteps && <div className="mt-3 space-y-1 border-t border-slate-200/70 pt-2">{message.progressSteps.map((step) => <div key={step.id} className="flex items-center gap-2 text-xs">{step.status === 'active' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-blue-600" /> : step.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : step.status === 'error' ? <X className="h-3.5 w-3.5 text-red-500" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}<span>{step.label}</span></div>)}</div>}{message.role === 'assistant' && message.kind !== 'error' && <div className="mt-3 border-t border-slate-200/70 pt-2"><div className="mb-2 text-xs font-semibold text-slate-500">你可以继续问：</div><div className="flex flex-wrap gap-2">{followUpPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => onQuickSend(prompt)} disabled={isGenerating} className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{prompt}</button>)}</div></div>}</div></div>)}<div ref={messagesEndRef} /></div><div className="border-t border-slate-100 p-4">{hasPreview && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-semibold text-emerald-700">微调快捷指令</div><div className="mt-2 flex flex-wrap gap-2">{tunePrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">{prompt}</button>)}</div></div>}<textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={hasPreview ? '继续输入微调需求，例如：把标题再放大、Logo 左移、底色换成浅灰。' : '描述保护垫需求：尺寸、底色、安全区域、标题、电话、安全提示等。'} className="h-36 w-full resize-none border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400" /><div className="mt-3 flex items-center justify-between gap-3"><button type="button" onClick={onClear} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"><Trash2 className="h-4 w-4" />清空输入</button><button type="button" onClick={onSubmit} disabled={isGenerating} className="inline-flex items-center gap-2 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"><Send className="h-4 w-4" />发送</button></div></div></aside>;
}

function ResizeHandle({ isResizing, onStart }: { isResizing: boolean; onStart: () => void }) {
  return <div role="separator" aria-orientation="vertical" aria-label="拖动调整 AI 对话和预览区域宽度" title="拖动调整 AI 对话和预览区域宽度" onPointerDown={(event) => { event.preventDefault(); onStart(); }} className={`group flex cursor-col-resize items-center justify-center max-lg:hidden ${isResizing ? 'bg-blue-50' : ''}`}><div className={`h-full w-1 rounded-full transition ${isResizing ? 'bg-blue-500' : 'bg-slate-200 group-hover:bg-blue-400'}`} /></div>;
}

function PreviewPanel({ imageUrl, onDownload }: { imageUrl: string | null; onDownload: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return <main className="flex min-h-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-base font-semibold text-slate-900">实时预览</h2></div><button type="button" onClick={onDownload} disabled={!imageUrl} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />下载</button></div><div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] p-6 [background-size:24px_24px]">{imageUrl ? <button type="button" onClick={() => setIsOpen(true)} className="group relative max-h-full max-w-full cursor-zoom-in"><img src={imageUrl} alt="新版实时预览" className="max-h-full max-w-full border border-slate-300 bg-white object-contain shadow-2xl" /><span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/75 px-3 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">点击放大查看</span></button> : <div className="flex h-full w-full flex-col items-center justify-center border border-dashed border-slate-300 bg-white/80 p-8 text-center"><p className="mt-3 max-w-md text-sm leading-6 text-slate-500">待生成</p></div>}</div>{isOpen && imageUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setIsOpen(false)}><button type="button" aria-label="关闭预览" onClick={() => setIsOpen(false)} className="absolute right-6 top-6 rounded-full bg-white/95 p-2 text-slate-700 shadow-lg transition hover:bg-white hover:text-red-500"><X className="h-6 w-6" /></button><img src={imageUrl} alt="放大预览" onClick={(event) => event.stopPropagation()} className="max-h-full max-w-full cursor-default object-contain shadow-2xl" /></div>}</main>;
}

function ImageGrid({ images, onRemove, tone }: { images: UploadedImage[]; onRemove: (id: string) => void; tone: 'blue' | 'amber' }) {
  if (images.length === 0) return null;
  const toneClass = tone === 'blue' ? 'border-blue-100 bg-blue-50' : 'border-amber-100 bg-amber-50';
  return <div className="mt-3 grid grid-cols-4 gap-2">{images.map((image) => <div key={image.id} className={`group relative aspect-square border p-1 ${toneClass}`}><img src={image.src} alt={image.name} className="h-full w-full object-cover" /><button type="button" onClick={() => onRemove(image.id)} className="absolute -right-1 -top-1 hidden rounded-full border border-slate-200 bg-white p-0.5 text-slate-400 shadow-sm transition hover:text-red-500 group-hover:block" aria-label={`删除${image.name}`}><X className="h-3.5 w-3.5" /></button></div>)}</div>;
}