import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Clock3, LoaderCircle, Send } from 'lucide-react';
import { buildDraftFromPrompt, normalizeDraft, PRESET_PROMPTS, type ChatMessage, type ConversationDesignDraft } from '../lib/chatDesign';
import { api } from '../utils/api';

const initialDraft = buildDraftFromPrompt('');
const initialMessages: ChatMessage[] = [
  { id: 'welcome', role: 'assistant', content: '你好，我可以帮你通过对话快速配置保护垫画布、非留白区域以及标题、图片、色块等元素。你可以直接输入需求，也可以点击下方高频模板。' },
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
  const [draft, setDraft] = useState<ConversationDesignDraft>(initialDraft);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setInput('');
    setDraft(initialDraft);
    setMessages(initialMessages);
  }, [newChatSignal]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isGenerating]);

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || isGenerating) return;
    const thinkingMessageId = `assistant_thinking_${Date.now()}`;
    const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', content };
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: thinkingMessageId,
        role: 'assistant',
        content: '我正在整理你的需求并生成画布方案，请稍等一下…',
      },
    ]);
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
      setDraft(nextDraft);
      setMessages((current) => [
        ...current.filter((message) => message.id !== thinkingMessageId),
        {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: result.reply || '已生成图片，请查看。',
          imageUrl,
        },
      ]);
    } catch (error) {
      const friendlyMessage = getFriendlyAssistantError(content, error as Error);
      setMessages((current) => [
        ...current.filter((message) => message.id !== thinkingMessageId),
        { id: `assistant_error_${Date.now()}`, role: 'assistant', content: friendlyMessage },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="relative mx-auto flex h-[calc(var(--app-viewport-height,100dvh)-88px)] w-full max-w-none gap-3 px-0 pt-3 sm:h-full sm:px-4 sm:pb-3 lg:gap-4"
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
        className={`z-30 min-h-0 shrink-0 flex-col border border-slate-200 bg-white p-2 shadow-sm transition-all ${
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
              {[
                '促销款保护垫草稿',
                '品牌展示款布局',
                '单品主推保护垫',
              ].map((title, index) => (
                <button
                  key={title}
                  type="button"
                  className={`px-3 py-3 text-left text-sm transition ${index === 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <div className="truncate font-medium">{title}</div>
                  <div className="mt-1 text-xs text-slate-400">本地草稿 · 示例</div>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 pb-[180px] pr-3 sm:px-0 sm:pb-4 sm:pr-1">
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
                    <img src={message.imageUrl} alt="生成的保护垫画布" className="mt-3 w-full max-w-[520px] border border-slate-200 bg-white" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="fixed left-3 right-3 bottom-0 z-40 border border-slate-200 bg-white p-2 pb-[max(env(safe-area-inset-bottom),8px)] shadow-lg sm:static sm:left-auto sm:right-auto sm:z-auto sm:mx-0 sm:shrink-0 sm:p-3 sm:pb-3">
            <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
              <button
                type="button"
                onClick={() => setInput('')}
                className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => setInput(PRESET_PROMPTS[0]?.prompt || '')}
                className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
              >
                示例模板
              </button>
            </div>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="描述你想要的保护垫设计，例如：120×70，白底，安全区域 84×40，放红色标题、底部横条和产品图。" className="h-14 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 sm:h-auto sm:min-h-40 sm:leading-7" />
            <div className="mt-2 flex border-t border-slate-200 pt-2 sm:mt-3 sm:pt-3 sm:justify-end">
              <button type="button" onClick={handleSubmit} disabled={isGenerating} className="inline-flex w-full items-center justify-center gap-2 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"><Send className="h-4 w-4" />{isGenerating ? '生成中...' : '发送'}</button>
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden h-full min-h-0 w-[360px] shrink-0 space-y-4 overflow-auto xl:block">
        <div className="border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <GeneratedCanvas draft={draft} />
        </div>
      </aside>
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

function GeneratedCanvas({ draft }: { draft: ConversationDesignDraft }) {
  const canvasWidth = 560;
  const canvasHeight = canvasWidth * (draft.canvas.height / draft.canvas.width);
  const safeWidth = canvasWidth * (draft.canvas.safeAreaWidth / draft.canvas.width);
  const safeHeight = canvasHeight * (draft.canvas.safeAreaHeight / draft.canvas.height);
  const safeLeft = (canvasWidth - safeWidth) / 2;
  const safeTop = (canvasHeight - safeHeight) / 2;
  const topMeasureHeight = 58;
  const leftMeasureWidth = 58;
  const rightMeasureWidth = 46;
  const bottomPadding = 22;
  const totalWidth = leftMeasureWidth + canvasWidth + rightMeasureWidth;
  const totalHeight = topMeasureHeight + canvasHeight + bottomPadding;

  return (
    <div className="overflow-auto">
      <div className="mx-auto w-fit min-w-full border border-slate-200 bg-white p-4">
        <div className="relative origin-top-left" style={{ width: totalWidth, height: totalHeight }}>
          <DimensionLine
            direction="horizontal"
            left={leftMeasureWidth}
            top={8}
            length={canvasWidth}
            label={`${draft.canvas.width}CM`}
          />
          <DimensionLine
            direction="horizontal"
            left={leftMeasureWidth + safeLeft}
            top={35}
            length={safeWidth}
            label={`${draft.canvas.safeAreaWidth}CM`}
          />
          <DimensionLine
            direction="vertical"
            left={18}
            top={topMeasureHeight + safeTop}
            length={safeHeight}
            label={`${draft.canvas.safeAreaHeight}CM`}
          />
          <DimensionLine
            direction="vertical"
            left={leftMeasureWidth + canvasWidth + 28}
            top={topMeasureHeight}
            length={canvasHeight}
            label={`${draft.canvas.height}CM`}
          />

          <div
            className="absolute overflow-hidden border border-slate-500 shadow-sm"
            style={{
              left: leftMeasureWidth,
              top: topMeasureHeight,
              width: canvasWidth,
              height: canvasHeight,
              backgroundColor: draft.canvas.backgroundColor,
            }}
          >
          <div className="absolute border border-slate-400/60" style={{ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight }} />
          {draft.elements.map((item, index) => (
            <div key={`${item.type}_${index}`} className="absolute overflow-hidden" style={{ left: safeLeft + safeWidth * (item.x ?? 0), top: safeTop + safeHeight * (item.y ?? 0), width: safeWidth * (item.width ?? 0.3), height: safeHeight * (item.height ?? 0.12), background: item.type === 'rect' ? item.color || '#ef0000' : item.type === 'image' ? '#e2e8f0' : 'transparent', border: item.type === 'image' ? '1px dashed #94a3b8' : 'none' }}>
              {item.type === 'text' && <div className="flex h-full items-center justify-center px-2 text-center text-xl font-black leading-tight" style={{ color: item.color || '#111111' }}>{item.text || '标题'}</div>}
              {item.type === 'image' && <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">图片区</div>}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DimensionLine({ direction, left, top, length, label }: { direction: 'horizontal' | 'vertical'; left: number; top: number; length: number; label: string }) {
  if (direction === 'horizontal') {
    return (
      <div className="absolute text-slate-950" style={{ left, top, width: length, height: 26 }}>
        <div className="absolute left-0 right-0 top-3 border-t border-slate-500" />
        <div className="absolute left-0 top-0 h-6 border-l border-slate-500" />
        <div className="absolute right-0 top-0 h-6 border-l border-slate-500" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 bg-white px-2 text-sm font-black leading-5">{label}</div>
      </div>
    );
  }

  return (
    <div className="absolute text-slate-950" style={{ left, top, width: 30, height: length }}>
      <div className="absolute bottom-0 top-0 left-3 border-l border-slate-500" />
      <div className="absolute left-0 top-0 w-6 border-t border-slate-500" />
      <div className="absolute bottom-0 left-0 w-6 border-t border-slate-500" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 bg-white px-2 text-sm font-black leading-5">{label}</div>
    </div>
  );
}