import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, Clock3, Download, LoaderCircle, RotateCw, Send, Trash2, X } from 'lucide-react';
import { normalizeDraft, type ChatMessage, type ConversationDesignDraft } from '../lib/chatDesign';
import type { ConversationItem } from '../types';
import { api } from '../utils/api';

type PresetPrompt = { id: string; title: string; prompt: string; thumbnailUrl: string; sortOrder: number };

const initialMessages: ChatMessage[] = [
  { id: 'welcome', role: 'assistant', content: '你好，我可以生成保护垫效果图。你可以直接输入描述，也可以基于示例模板进行修改。' },
];

function getFriendlyAssistantError(input: string, error: Error) {
  const normalizedInput = input.trim();
  const normalizedMessage = error.message.toLowerCase();

  if (normalizedInput.length <= 6) {
    return '我已经收到你的消息啦，不过当前内容还不够具体，暂时没法直接生成画布。你可以试试告诉我尺寸、底色、非留白区域，或者想放哪些标题/图片。';
  }

  if (normalizedMessage.includes('model did not return json') || normalizedMessage.includes('json')) {
    return '我理解了你的需求，但这次生成结果不够稳定，暂时没能整理成可用的画布方案。你可以稍微补充一下尺寸、颜色或元素位置，我再继续帮你生成。';
  }

  if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('network')) {
    return '当前网络连接似乎有点不稳定，我还没有成功拿到生成结果。你可以稍后再试一次，或检查一下当前服务连接是否正常。';
  }

  return '这次没有成功生成画布方案，不过别担心，你可以把需求再描述具体一点，比如尺寸、背景颜色、标题文案和图片区位置，我继续帮你生成。';
}

type ChatSetupPageProps = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  newChatSignal: number;
};

export default function ChatSetupPage({ sidebarCollapsed, setSidebarCollapsed, newChatSignal }: ChatSetupPageProps) {
  const [input, setInput] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const previewTouchDistanceRef = useRef(0);
  const previewTouchScaleRef = useRef(1);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(false);
  const [historyItems, setHistoryItems] = useState<ConversationItem[]>([]);
  const [pendingDeleteHistory, setPendingDeleteHistory] = useState<ConversationItem | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [composerHeight, setComposerHeight] = useState(188);
  const [headerHeight, setHeaderHeight] = useState(76);
  const [presetPrompts, setPresetPrompts] = useState<PresetPrompt[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [zoomPresetImage, setZoomPresetImage] = useState<string | null>(null);

  useEffect(() => {
    if (!showPresets) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-presets-menu]')) setShowPresets(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showPresets]);

  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header');
      if (header) setHeaderHeight(header.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    setInput('');
    setActiveConversationId(null);
    setMessages(initialMessages);
  }, [newChatSignal]);

  useEffect(() => {
    void loadConversationHistory();
    void api.presetPrompts.list().then((result) => {
      if (result.success && result.presets.length > 0) {
        setPresetPrompts(result.presets);
      }
    });
  }, []);

  useEffect(() => {
    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isGenerating]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    const updateComposerHeight = () => {
      setComposerHeight(composer.getBoundingClientRect().height);
    };

    updateComposerHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateComposerHeight);
      return () => window.removeEventListener('resize', updateComposerHeight);
    }

    const resizeObserver = new ResizeObserver(() => updateComposerHeight());
    resizeObserver.observe(composer);
    window.addEventListener('resize', updateComposerHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateComposerHeight);
    };
  }, [input, isGenerating]);

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || isGenerating) return;
    const thinkingMessageId = `assistant_thinking_${Date.now()}`;
    const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', content };
    const nextUserAndThinkingMessages: ChatMessage[] = [
      ...messages,
      userMessage,
      {
        id: thinkingMessageId,
        role: 'assistant',
        content: '我正在理解你的需求，请稍等…',
      },
    ];
    setMessages(nextUserAndThinkingMessages);
    setInput('');
    setIsGenerating(true);

    try {
      const result = await api.generate.canvas({
        prompt: content,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      });

      if (!result.success || !result.draft) {
        throw new Error(result.error || '生成失败');
      }

      const nextDraft = normalizeDraft(result.draft);
      const imageUrl = await renderDraftToPng(nextDraft);
      const nextMessages = [
        ...nextUserAndThinkingMessages.filter((message) => message.id !== thinkingMessageId),
        {
          id: `assistant_${Date.now()}`,
          role: 'assistant' as const,
          content: result.reply || '已生成图片，请查看。',
          imageUrl,
        },
      ];
      setMessages(nextMessages);
      await persistConversation(content, nextMessages);
    } catch (error) {
      const friendlyMessage = getFriendlyAssistantError(content, error as Error);
      const nextMessages = [
        ...nextUserAndThinkingMessages.filter((message) => message.id !== thinkingMessageId),
        { id: `assistant_error_${Date.now()}`, role: 'assistant' as const, content: friendlyMessage },
      ];
      setMessages(nextMessages);
      await persistConversation(content, nextMessages);
    } finally {
      setIsGenerating(false);
    }
  };

  const buildConversationTitle = (content: string) => {
    const normalized = content.trim().replace(/\s+/g, ' ');
    return normalized.slice(0, 18) || '未命名对话';
  };

  const loadConversationHistory = async (targetConversationId?: string | null) => {
    setIsLoadingHistory(true);
    try {
      const result = await api.conversations.list();
      setHistoryItems(result.conversations || []);

      if (targetConversationId) {
        const targetConversation = result.conversations.find((item) => item.id === targetConversationId);
        if (targetConversation) {
          setActiveConversationId(targetConversation.id);
          setMessages((targetConversation.messages as ChatMessage[]).length > 0 ? (targetConversation.messages as ChatMessage[]) : initialMessages);
        }
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const persistConversation = async (content: string, nextMessages: ChatMessage[]) => {
    const title = buildConversationTitle(content);
    const payload = {
      title,
      messages: nextMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        imageUrl: message.imageUrl,
      })),
    };

    const result = activeConversationId
      ? await api.conversations.update(activeConversationId, payload)
      : await api.conversations.create(payload);

    if (!result.success) {
      throw new Error(result.error || '保存对话失败');
    }

    setActiveConversationId(result.conversation.id);
    await loadConversationHistory(result.conversation.id);
  };

  const handleSelectConversation = async (conversationId: string) => {
    const result = await api.conversations.get(conversationId);
    setActiveConversationId(result.conversation.id);
    setMessages((result.conversation.messages as ChatMessage[]).length > 0 ? (result.conversation.messages as ChatMessage[]) : initialMessages);
  };

  const handleDeleteConversation = async () => {
    if (!pendingDeleteHistory) return;
    await api.conversations.delete(pendingDeleteHistory.id);
    const isDeletingActiveConversation = pendingDeleteHistory.id === activeConversationId;
    setPendingDeleteHistory(null);
    if (isDeletingActiveConversation) {
      setActiveConversationId(null);
      setMessages(initialMessages);
    }
    await loadConversationHistory(isDeletingActiveConversation ? null : activeConversationId);
  };

  const handleDownloadImage = (imageUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetPreviewState = () => {
    previewTouchDistanceRef.current = 0;
    previewTouchScaleRef.current = 1;
    setPreviewScale(1);
    setPreviewRotation(0);
    setPreviewImageUrl(null);
  };

  const handleRotatePreview = () => {
    setPreviewRotation((current) => (current + 90) % 360);
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const [firstTouch, secondTouch] = [touches[0], touches[1]];
    const deltaX = secondTouch.clientX - firstTouch.clientX;
    const deltaY = secondTouch.clientY - firstTouch.clientY;
    return Math.hypot(deltaX, deltaY);
  };

  const handlePreviewTouchStart = (event: React.TouchEvent<HTMLImageElement>) => {
    if (event.touches.length < 2) return;
    const distance = getTouchDistance(event.touches);
    if (!distance) return;
    previewTouchDistanceRef.current = distance;
    previewTouchScaleRef.current = previewScale;
  };

  const handlePreviewTouchMove = (event: React.TouchEvent<HTMLImageElement>) => {
    if (event.touches.length < 2 || !previewTouchDistanceRef.current) return;
    event.preventDefault();
    const nextDistance = getTouchDistance(event.touches);
    if (!nextDistance) return;
    const rawScale = previewTouchScaleRef.current * (nextDistance / previewTouchDistanceRef.current);
    const clampedScale = Math.min(4, Math.max(1, rawScale));
    setPreviewScale(clampedScale);
  };

  const handlePreviewTouchEnd = () => {
    previewTouchDistanceRef.current = 0;
    previewTouchScaleRef.current = previewScale;
  };

  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-none gap-3 px-0 pt-3 sm:px-4 sm:pb-3 lg:gap-4"
    >
      {!sidebarCollapsed && (
        <button
          type="button"
          aria-label="关闭历史侧边栏遮罩"
          onClick={() => setSidebarCollapsed(true)}
          className="fixed inset-0 z-20 bg-slate-950/20 lg:hidden"
        />
      )}

      <aside
        className={`z-50 min-h-0 shrink-0 flex-col border border-slate-200 bg-white p-2 shadow-sm transition-all ${
          sidebarCollapsed
            ? 'hidden'
            : 'fixed left-3 top-[88px] flex h-[calc(100vh-100px)] w-[280px] max-w-[calc(100vw-24px)] lg:relative lg:left-auto lg:top-auto lg:h-full'
        }`}
      >
        {!sidebarCollapsed && (
          <>
            <div className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-900">
              <Clock3 className="h-4 w-4 text-blue-500" /> 历史对话
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              {historyItems.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-400">{isLoadingHistory ? '正在加载历史记录...' : '暂无历史记录'}</div>
              ) : (
                historyItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 px-3 py-3 text-sm transition ${item.id === activeConversationId ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                  >
                    <button type="button" onClick={() => void handleSelectConversation(item.id)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-medium">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{new Date(item.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteHistory(item)}
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 transition hover:bg-white hover:text-red-500"
                      aria-label={`删除${item.title}`}
                      title="删除历史记录"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      <section className="relative min-w-0 flex-1 sm:flex sm:min-h-0 sm:flex-col sm:overflow-hidden sm:h-full sm:pb-0">
        <div className="flex flex-col gap-2 sm:flex-1 sm:min-h-0 sm:gap-4">
          <div className="border border-slate-200 bg-white p-3 shadow-sm sm:flex-1 sm:min-h-0 sm:p-6">
            <div
              ref={messagesScrollRef}
              className="overflow-y-auto px-3 pr-3 sm:h-full sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-4"
              style={{ maxHeight: `calc(var(--app-viewport-height, 100dvh) - ${headerHeight}px - ${composerHeight}px - 56px)` }}
            >
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {message.id.startsWith('assistant_thinking_') && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-600">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          AI 思考中
                        </div>
                      )}
                      {message.content}
                      {message.imageUrl && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewScale(1);
                              setPreviewRotation(0);
                              setPreviewImageUrl(message.imageUrl ?? null);
                            }}
                            className="block w-full text-left"
                            title="点击放大查看"
                          >
                            <img src={message.imageUrl} alt="生成的保护垫画布" className="w-full max-w-[520px] cursor-zoom-in border border-slate-200 bg-white transition hover:opacity-95" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadImage(message.imageUrl as string, `protective-pad-design-${message.id}.png`)}
                            className="mt-3 inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Download className="h-4 w-4" />下载图片
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div ref={composerRef} className="fixed bottom-0 left-3 right-3 z-40 border border-slate-200 bg-white p-2 pb-[max(env(safe-area-inset-bottom),8px)] shadow-lg md:static md:left-auto md:right-auto md:z-auto md:mx-0 md:shrink-0 md:p-4 md:pb-4">
            <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
              <button
                type="button"
                onClick={() => setInput('')}
                className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
              >
                清空
              </button>
              <div className="relative" data-presets-menu>
                <button
                  type="button"
                  onClick={() => setShowPresets((v) => !v)}
                  className="inline-flex items-center gap-1 border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  示例模板
                  <ChevronDown className={`h-3 w-3 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                </button>
                {showPresets && presetPrompts.length > 0 && (
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-80 border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">选择模板（点击图片可放大）</div>
                    <div className="max-h-[70vh] overflow-y-auto">
                      {presetPrompts.map((preset) => (
                        <div key={preset.id} className="flex gap-3 border-b border-slate-50 p-3 last:border-0 hover:bg-slate-50">
                          {/* 缩略图 */}
                          {preset.thumbnailUrl ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setZoomPresetImage(preset.thumbnailUrl); }}
                              className="relative h-16 w-24 shrink-0 overflow-hidden border border-slate-200 bg-slate-100"
                              title="点击放大查看"
                            >
                              <img
                                src={preset.thumbnailUrl}
                                alt={preset.title}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/20">
                                <svg className="h-4 w-4 text-white opacity-0 drop-shadow transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                              </div>
                            </button>
                          ) : (
                            <div className="h-16 w-24 shrink-0 bg-slate-100 border border-slate-200" />
                          )}
                          {/* 文字 + 使用按钮 */}
                          <div className="flex min-w-0 flex-1 flex-col justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-800">{preset.title}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setInput(preset.prompt); setShowPresets(false); }}
                              className="mt-1 self-start border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                            >
                              使用此模板
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="描述你想要的保护垫设计，例如：宽度120cm，高度70cm，白底，安全区域 宽度84cm，高度40cm，红色标题、底部横条。" className="h-14 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 sm:h-auto sm:min-h-40 sm:leading-7" />
            <div className="mt-2 flex border-t border-slate-200 pt-2 sm:mt-3 sm:pt-3 sm:justify-end">
              <button type="button" onClick={handleSubmit} disabled={isGenerating} className="inline-flex w-full items-center justify-center gap-2 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"><Send className="h-4 w-4" />{isGenerating ? '生成中...' : '发送'}</button>
            </div>
          </div>
        </div>
      </section>

      {pendingDeleteHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
            <div className="text-lg font-semibold text-slate-900">确认删除这条历史对话吗？</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              删除后，这条历史记录将从当前列表中移除，操作后无法恢复。<br />
              <span className="mt-2 inline-block font-medium text-slate-800">“{pendingDeleteHistory.title}”</span>
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteHistory(null)}
                className="border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                先保留
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConversation()}
                className="bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4" onClick={resetPreviewState}>
          <div className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={handleRotatePreview}
                className="inline-flex h-10 w-10 items-center justify-center bg-black/60 text-white transition hover:bg-black/80"
                aria-label="顺时针旋转图片"
                title="旋转图片"
              >
                <RotateCw className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={resetPreviewState}
              className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center bg-black/60 text-white transition hover:bg-black/80"
              aria-label="关闭图片预览"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewImageUrl}
              alt="放大预览的保护垫画布"
              onTouchStart={handlePreviewTouchStart}
              onTouchMove={handlePreviewTouchMove}
              onTouchEnd={handlePreviewTouchEnd}
              className="max-h-[90vh] max-w-[90vw] border border-slate-700 bg-white object-contain shadow-2xl"
              style={{ transform: `scale(${previewScale}) rotate(${previewRotation}deg)`, transformOrigin: 'center center', touchAction: 'none' }}
            />
          </div>
        </div>
      )}

      {/* 模板图片放大遮罩 */}
      {zoomPresetImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4"
          onClick={() => setZoomPresetImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomPresetImage(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center bg-black/60 text-white transition hover:bg-black/80"
              aria-label="关闭图片预览"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={zoomPresetImage}
              alt="模板预览"
              className="max-h-[88vh] max-w-[90vw] border border-slate-600 bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

async function renderDraftToPng(draft: ConversationDesignDraft) {
  const canvasWidth = 1200;
  const canvasHeight = canvasWidth * (draft.canvas.height / draft.canvas.width);
  const safeWidth = canvasWidth * (draft.canvas.safeAreaWidth / draft.canvas.width);
  const safeHeight = canvasHeight * (draft.canvas.safeAreaHeight / draft.canvas.height);
  const safeLeft = (canvasWidth - safeWidth) / 2;
  const safeTop = (canvasHeight - safeHeight) / 2;
  const padding = 140;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth + padding * 2;
  canvas.height = canvasHeight + padding * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const originX = padding;
  const originY = padding;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = draft.canvas.backgroundColor;
  ctx.fillRect(originX, originY, canvasWidth, canvasHeight);
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, canvasWidth, canvasHeight);

  const drawLine = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) => {
    ctx.save();
    ctx.strokeStyle = '#555555';
    ctx.fillStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.font = 'bold 30px Microsoft YaHei';
    ctx.textAlign = 'center';
    if (vertical) {
      ctx.translate(x1 - 20, (y1 + y2) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, 0, 0);
    } else {
      ctx.fillText(label, (x1 + x2) / 2, y1 - 10);
    }
    ctx.restore();
  };

  drawLine(originX, originY - 80, originX + canvasWidth, originY - 80, `${draft.canvas.width}CM`);
  drawLine(originX + safeLeft, originY - 35, originX + safeLeft + safeWidth, originY - 35, `${draft.canvas.safeAreaWidth}CM`);
  drawLine(originX - 45, originY + safeTop, originX - 45, originY + safeTop + safeHeight, `${draft.canvas.safeAreaHeight}CM`, true);
  drawLine(originX + canvasWidth + 70, originY, originX + canvasWidth + 70, originY + canvasHeight, `${draft.canvas.height}CM`, true);

  draft.elements.forEach((item) => {
    const x = originX + safeLeft + safeWidth * (item.x ?? 0);
    const y = originY + safeTop + safeHeight * (item.y ?? 0);
    const width = safeWidth * (item.width ?? 0.3);
    const height = safeHeight * (item.height ?? 0.12);
    if (item.type === 'rect') {
      ctx.fillStyle = item.color || '#ef0000';
      ctx.fillRect(x, y, width, height);
    }
    if (item.type === 'text') {
      ctx.fillStyle = item.color || '#111111';
      ctx.font = `bold ${Math.max(28, height * 0.55)}px Microsoft YaHei`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text || '文字', x + width / 2, y + height / 2, width);
    }
    if (item.type === 'image') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 26px Microsoft YaHei';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('图片区', x + width / 2, y + height / 2);
    }
  });

  return canvas.toDataURL('image/png');
}