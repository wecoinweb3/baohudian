import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, CheckCircle2, ChevronDown, Clock3, Copy, Download, ImagePlus, Images, LoaderCircle, RotateCw, Send, TextCursorInput, Trash2, X } from 'lucide-react';
import { QUICK_TWEAK_COMMANDS, applyDraftAdjustmentPatches, interpretLocalTweakCommand, normalizeDraft, type ChatMessage, type ConversationDesignDraft, type DraftAdjustmentPatch } from '../lib/chatDesign';
import { renderDraftToPng } from '../lib/renderDraftToPng';
import type { ConversationItem } from '../types';
import { api } from '../utils/api';

type PresetPrompt = { id: string; title: string; prompt: string; thumbnailUrl: string; sortOrder: number; enabled: boolean };
type ConversationStage = 'idle' | 'awaiting_prompt_confirmation' | 'generating';
type ConversationIntent =
  | 'prepare_from_reference'
  | 'clarify_reference_intent'
  | 'missing_reference_for_prepare'
  | 'missing_draft_for_tweak'
  | 'tweak_existing_draft'
  | 'confirm_prepared_prompt'
  | 'generate_design';

interface ConversationContext {
  stage: ConversationStage;
  latestDraft: ConversationDesignDraft | null;
  uploadedLogos: Array<{ id: string; name: string; src: string }>;
  referenceImages: Array<{ id: string; name: string; src: string }>;
  preparedPrompt?: string;
  pendingIntent?: ConversationIntent;
}

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

function getLatestAssistantDraft(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' && message.draft) {
      return message.draft;
    }
  }
  return null;
}

function isTweakIntent(input: string) {
  const normalized = input.trim();
  if (!normalized) return false;

  const hasAdjustmentVerb = /(往左|往右|往上|往下|上移|下移|左移|右移|变大|变小|放大|缩小|加长|缩短|居中|改成|改为|换成|调整为|变成|改红|改蓝|更粗|加粗|左对齐|右对齐|字更大|字号更大|红底白字|白字红底|更接近示例图)/.test(normalized);
  const hasTweakTarget = /(上一版|这版|当前|logo|标题|副标题|联系电话|热线|电话|安全提示|示例图|排版|背景|背景色|底色|安全区域|非留白)/i.test(normalized);
  const looksLikeFullSpec = /(尺寸|规格|宽\s*\d+.*高\s*\d+|安全区域\s*\d+\s*[x×＊*]\s*\d+|主体宣传|标语|热线栏|安全提示栏|校对提示|色标说明|背景色|配色|cm|CM|一、|二、|三、|四、|五、|六、|七、)/.test(normalized);

  if (!hasAdjustmentVerb || !hasTweakTarget) return false;
  if (looksLikeFullSpec && normalized.length > 30) return false;
  return true;
}

function getMissingDraftGuidance(input: string) {
  const normalized = input.trim();
  const matchedTarget = normalized.match(/(logo|标题|副标题|联系电话|热线|安全提示)/i)?.[0] || '元素';
  return `你这句“${normalized}”更像是在微调上一版里的${matchedTarget}，但当前还是一个新对话，我这里还没有可供调整的上一版设计。你可以先告诉我基础需求（例如尺寸、底色、标题文案、logo、电话、安全提示等），我先生成第一版；生成后你再点这些微调词，我就会直接按上一版继续调整。`;
}

function isUnclearReferenceIntent(input: string) {
  const normalized = input.trim();
  if (!normalized) return true;
  if (normalized.length <= 6) return true;
  return /^(参考这个|参考这张图|按这个来|帮我改一下|改一下|看看这个|照这个做|按这个改)$/i.test(normalized);
}

function isPrepareFromReferenceIntent(input: string) {
  const normalized = input.trim();
  if (!normalized) return false;
  return /(提取图中文字|提取图片文字|提取文字信息|识别图中文字|提取图中的文字|提取图片中的文字|根据图片文字重新制作|重新制作新设计|重新排版制作|提取图中文字后让我修改|提取图中的文字，让我修改|提取图中的文字,让我修改)/i.test(normalized);
}

function createUserTextMessage(content: string): ChatMessage {
  return { id: `user_${Date.now()}`, role: 'user', kind: 'text', content };
}

function getMissingReferenceGuidance(input: string) {
  const normalized = input.trim() || '提取图中的文字，让我修改';
  return `你这句“${normalized}”属于“先看参考图，再提取文案并整理提示词”的流程，但当前还没有上传参考图。请先上传一张参考图，然后我就可以先帮你提取图片中的关键信息、回填到输入框，等你确认后再正式出图。`;
}

function resolveIntent(params: {
  content: string;
  latestDraft: ConversationDesignDraft | null;
  hasReferenceImages: boolean;
  hasUploadedImages: boolean;
  stage: ConversationStage;
}) : ConversationIntent {
  const { content, latestDraft, hasReferenceImages, hasUploadedImages, stage } = params;

  if (isPrepareFromReferenceIntent(content)) {
    return hasReferenceImages ? 'prepare_from_reference' : 'missing_reference_for_prepare';
  }

  if (hasReferenceImages && isUnclearReferenceIntent(content)) {
    return 'clarify_reference_intent';
  }

  if (!latestDraft && isTweakIntent(content)) {
    return 'missing_draft_for_tweak';
  }

  if (latestDraft && isTweakIntent(content) && !hasUploadedImages) {
    return 'tweak_existing_draft';
  }

  if (stage === 'awaiting_prompt_confirmation') {
    return 'confirm_prepared_prompt';
  }

  return 'generate_design';
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
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetDialogMessage, setPresetDialogMessage] = useState('请先在管理端启用模板。');
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [pendingQuickCommand, setPendingQuickCommand] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; name: string; src: string }>>([]);
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState<Array<{ id: string; name: string; src: string }>>([]);
  const [shouldPreprocessLogos, setShouldPreprocessLogos] = useState(true);
  const [quickAdjustOpen, setQuickAdjustOpen] = useState(false);
  const [conversationContext, setConversationContext] = useState<ConversationContext>({
    stage: 'idle',
    latestDraft: null,
    uploadedLogos: [],
    referenceImages: [],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const hasAdjustableDraft = Boolean(getLatestAssistantDraft(messages));

  const createProgressSteps = (hasImages: boolean, enablePreprocess: boolean): NonNullable<ChatMessage['progressSteps']> => [
    { id: 'step1', label: '1. 理解需求', status: 'pending' },
    {
      id: 'step2',
      label: '2. 图片预处理',
      status: 'pending',
      children: hasImages && enablePreprocess
        ? [
            { id: 'step2-1', label: '2-1. 去背景', status: 'pending' },
            { id: 'step2-2', label: '2-2. 单色化与扁平化', status: 'pending' },
          ]
        : [
            { id: 'step2-0', label: hasImages ? '2-0. 已关闭自动预处理，跳过' : '2-0. 暂无图片上传，跳过', status: 'pending' },
          ],
    },
    {
      id: 'step3',
      label: '3. 设计出图',
      status: 'pending',
      children: [
        { id: 'step3-1', label: '3-1. 生成布局', status: 'pending' },
        { id: 'step3-2', label: '3-2. 合成预览图', status: 'pending' },
      ],
    },
  ];

  const getStepStatusText = (status: 'pending' | 'active' | 'completed' | 'skipped' | 'error') => {
    if (status === 'active') return '进行中';
    if (status === 'completed') return '已完成';
    if (status === 'skipped') return '已跳过';
    if (status === 'error') return '失败';
    return '待开始';
  };

  const updateMessageById = (messageId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, ...patch } : item));
  };

  const updateProgressStep = (
    messageId: string,
    stepId: string,
    status: 'pending' | 'active' | 'completed' | 'skipped' | 'error',
    childId?: string,
  ) => {
    setMessages((prev) => prev.map((item) => {
      if (item.id !== messageId || !item.progressSteps) return item;
      return {
        ...item,
        progressSteps: item.progressSteps.map((step) => {
          if (step.id !== stepId) return step;
          if (!childId) return { ...step, status };
          return {
            ...step,
            children: step.children?.map((child) => child.id === childId ? { ...child, status } : child),
          };
        }),
      };
    }));
  };

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

  const conversationStage = conversationContext.stage;
  const setConversationStage = (value: ConversationStage | ((current: ConversationStage) => ConversationStage)) => {
    setConversationContext((prev) => ({
      ...prev,
      stage: typeof value === 'function' ? value(prev.stage) : value,
    }));
  };

  useEffect(() => {
    setConversationContext((prev) => ({
      ...prev,
      latestDraft: getLatestAssistantDraft(messages),
      uploadedLogos: uploadedImages,
      referenceImages: uploadedReferenceImages,
    }));
  }, [messages, uploadedImages, uploadedReferenceImages]);

  useEffect(() => {
    setInput('');
    setActiveConversationId(null);
    setMessages(initialMessages);
    setConversationContext({
      stage: 'idle',
      latestDraft: null,
      uploadedLogos: [],
      referenceImages: [],
    });
  }, [newChatSignal]);

  useEffect(() => {
    void loadConversationHistory();
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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImages((prev) => [
          ...prev,
          { id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, src: String(reader.result || '') },
        ]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const handleReferenceImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedReferenceImages((prev) => [
          ...prev,
          { id: `ref_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, src: String(reader.result || '') },
        ]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const removeUploadedImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeUploadedReferenceImage = (id: string) => {
    setUploadedReferenceImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleUsePreset = async (presetId: string) => {
    const result = await api.presetPrompts.get(presetId);
    if (!result.success || !result.preset) return;
    setInput(result.preset.prompt);
    setShowPresets(false);
  };

  const handleTogglePresets = async () => {
    if (isLoadingPresets) return;

    setIsLoadingPresets(true);
    try {
      const result = await api.presetPrompts.list({ enabledOnly: true });
      const nextPresets = result.success ? result.presets : [];
      setPresetPrompts(nextPresets);

      if (nextPresets.length === 0) {
        setShowPresets(false);
        setPresetDialogMessage(result.success ? '请先在管理端启用模板。' : (result.error || '模板数据加载失败，请检查后端服务和数据库连接。'));
        setPresetDialogOpen(true);
        return;
      }

      setPresetDialogOpen(false);
      setShowPresets((v) => !v);
    } catch (error) {
      setShowPresets(false);
      setPresetDialogMessage((error as Error).message || '模板数据加载失败，请检查后端服务和数据库连接。');
      setPresetDialogOpen(true);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const handleClosePresetDialog = () => {
    setPresetDialogOpen(false);
  };

  const handleOpenPresets = async () => {
    if (presetPrompts.length === 0) {
      setShowPresets(false);
      await handleTogglePresets();
      return;
    }
    await handleTogglePresets();
  };

  const appendQuickCommand = (command: string) => {
    setInput((prev) => prev.trim() ? `${prev.trim()}，${command}` : `在上一版基础上，${command}`);
  };

  const buildQuickCommandMessage = (command: string) => input.trim() ? `${input.trim()}，${command}` : `在上一版基础上，${command}`;

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? null : current);
      }, 1500);
    } catch {
      setCopiedMessageId(null);
    }
  };

  const handleReuseMessage = (message: ChatMessage) => {
    setInput(message.content);
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleUndoLastTweak = async () => {
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant' && message.tweakMeta?.previousDraft);
    if (!lastAssistantMessage?.tweakMeta?.previousDraft) return;

    const undoUserMessage: ChatMessage = {
      id: `user_undo_${Date.now()}`,
      role: 'user',
      content: '撤销上一步微调',
    };

    const revertedDraft = lastAssistantMessage.tweakMeta.previousDraft;
    const imageUrl = await renderDraftToPng(revertedDraft);
    const assistantMessage: ChatMessage = {
      id: `assistant_undo_${Date.now()}`,
      role: 'assistant',
      content: '已撤销上一步微调，恢复到上一版排版。',
      imageUrl,
      draft: revertedDraft,
      tweakMeta: {
        mode: 'local',
        sourcePrompt: '撤销上一步微调',
      },
    };

    const nextMessages = [...messages, undoUserMessage, assistantMessage];
    setMessages(nextMessages);
    await persistConversation('撤销上一步微调', nextMessages);
  };

  const handleSubmit = async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim();
    if ((!content && uploadedReferenceImages.length === 0) || isGenerating) return;
    const latestDraft = conversationContext.latestDraft ?? getLatestAssistantDraft(messages);
    const resolvedIntent = resolveIntent({
      content,
      latestDraft,
      hasReferenceImages: uploadedReferenceImages.length > 0,
      hasUploadedImages: uploadedImages.length > 0,
      stage: conversationStage,
    });

    if (resolvedIntent === 'missing_reference_for_prepare') {
      const userMessage = createUserTextMessage(content || '提取图中的文字，让我修改');
      const assistantMessage: ChatMessage = {
        id: `assistant_missing_reference_${Date.now()}`,
        role: 'assistant',
        kind: 'clarification',
        content: getMissingReferenceGuidance(content),
      };
      const nextMessages = [...messages, userMessage, assistantMessage];
      setMessages(nextMessages);
      setInput('');
      await persistConversation(content || '提取图中的文字，让我修改', nextMessages);
      return;
    }

    if (resolvedIntent === 'prepare_from_reference') {
      const submitContent = content || '提取图中文字后重新制作新设计';
      const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', kind: 'text', content: submitContent };
      setIsGenerating(true);
      setConversationStage('generating');
      try {
        const result = await api.generate.prepareFromReference({
          prompt: submitContent,
          messages: messages.filter((message) => !message.ephemeral).map((message) => ({ role: message.role, content: message.content })),
          referenceImages: uploadedReferenceImages,
        });

        const preparedPrompt = result.preparedPrompt?.trim() || '请根据参考图中的主要文案和版式信息，重新设计一款保护垫效果图。请补充尺寸、底色、标题文案、电话与安全提示等信息后再生成。';
        const assistantMessage: ChatMessage = {
          id: `assistant_prepared_prompt_${Date.now()}`,
          role: 'assistant',
          kind: 'prepared_prompt',
          content: result.summary || '我已根据参考图提取并整理出一版设计说明，你可以先修改文字，再点击发送生成。',
          suggestionChips: result.extractedTexts && result.extractedTexts.length > 0 ? result.extractedTexts.slice(0, 6) : undefined,
          exampleInput: '你可以直接修改输入框里的整理结果，然后点击发送，系统才会正式出图。',
        };
        const nextMessages = [...messages, userMessage, assistantMessage];
        setMessages(nextMessages);
        setInput(preparedPrompt);
        setConversationStage('awaiting_prompt_confirmation');
        await persistConversation(preparedPrompt, nextMessages);
      } finally {
        setIsGenerating(false);
        setConversationStage((current) => current === 'generating' ? 'idle' : current);
      }
      return;
    }

    if (resolvedIntent === 'clarify_reference_intent') {
      const submitContent = content || '参考这张图';
      const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', kind: 'text', content: submitContent };
      setIsGenerating(true);
      setConversationStage('generating');
      try {
        const result = await api.generate.clarifyReferenceIntent({
          prompt: submitContent,
          messages: messages.filter((message) => !message.ephemeral).map((message) => ({ role: message.role, content: message.content })),
          referenceImages: uploadedReferenceImages,
        });

        const assistantMessage: ChatMessage = {
          id: `assistant_reference_guidance_${Date.now()}`,
          role: 'assistant',
          kind: 'clarification',
          content: result.question || '我识别到你上传了一张参考图。你是想保留版式改文字，还是参考这个风格重新生成一版？',
          suggestionChips: result.suggestions || ['保留版式，只改文字', '参考这个风格重新生成', '提取图中文字后让我修改'],
          exampleInput: result.exampleInput,
        };
        const nextMessages = [...messages, userMessage, assistantMessage];
        setMessages(nextMessages);
        setInput('');
        await persistConversation(submitContent, nextMessages);
      } finally {
        setIsGenerating(false);
        setConversationStage('idle');
      }
      return;
    }

    if (resolvedIntent === 'missing_draft_for_tweak') {
      const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', kind: 'text', content };
      const assistantMessage: ChatMessage = {
        id: `assistant_guidance_${Date.now()}`,
        role: 'assistant',
        kind: 'clarification',
        content: getMissingDraftGuidance(content),
      };
      const nextMessages = [...messages, userMessage, assistantMessage];
      setMessages(nextMessages);
      setInput('');
      await persistConversation(content, nextMessages);
      return;
    }

    if (resolvedIntent === 'tweak_existing_draft' && latestDraft) {
      setIsGenerating(true);
      setConversationStage('generating');
      const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', kind: 'text', content };
      setInput('');

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
          const assistantMessage: ChatMessage = {
            id: `assistant_tweak_${Date.now()}`,
            role: 'assistant',
            kind: 'generation_result',
            content: reply,
            imageUrl,
            draft: nextDraft,
            tweakMeta: {
              mode: tweakMode,
              sourcePrompt: content,
              appliedPatches: patches,
              previousDraft: latestDraft,
            },
          };
          const nextMessages = [...messages, userMessage, assistantMessage];
          setMessages(nextMessages);
          await persistConversation(content, nextMessages);
          setIsGenerating(false);
          setConversationStage('idle');
          return;
        }
      } catch {
        // 如果微调失败，则回退到完整生成流程
      }
    }

    const thinkingMessageId = `assistant_progress_${Date.now()}`;
    const hasImages = uploadedImages.length > 0;
    const hasReferenceImages = uploadedReferenceImages.length > 0;
    const submittedImages = uploadedImages;
    const submittedReferenceImages = uploadedReferenceImages;
    const enablePreprocess = shouldPreprocessLogos;
    const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', kind: 'text', content };
    const nextUserAndThinkingMessages: ChatMessage[] = [
      ...messages,
      userMessage,
      {
        id: thinkingMessageId,
        role: 'assistant',
        kind: 'generation_progress',
        content: hasImages ? `已收到你的需求，并检测到 ${uploadedImages.length} 张 Logo 图片。` : '已收到你的需求，开始按步骤处理。',
        ephemeral: true,
        progressSteps: createProgressSteps(hasImages, enablePreprocess),
      },
    ];
    setMessages(nextUserAndThinkingMessages);
    setInput('');
    setUploadedImages([]);
    setUploadedReferenceImages([]);
    setIsGenerating(true);
    setConversationStage('generating');

    try {
      updateProgressStep(thinkingMessageId, 'step1', 'active');
      updateMessageById(thinkingMessageId, { content: hasImages ? `已收到你的需求，检测到 ${submittedImages.length} 张 Logo 图片，正在处理中。` : '已收到你的需求，正在处理中。' });

      const normalizedImages: Array<{ id: string; name: string; src: string }> = [];

      updateProgressStep(thinkingMessageId, 'step1', 'completed');
      updateMessageById(thinkingMessageId, {
        content: hasImages ? `已识别 ${submittedImages.length} 张 Logo 图片，继续处理中。` : '正在继续处理中。',
      });

      if (hasImages && enablePreprocess) {
        updateProgressStep(thinkingMessageId, 'step2', 'active');
        updateProgressStep(thinkingMessageId, 'step2', 'active', 'step2-1');
        updateMessageById(thinkingMessageId, {
          content: '正在处理上传的 Logo 图片。',
        });

        for (const image of submittedImages) {
          const normalized = await api.generate.normalizeLogo({
            image: image.src,
            fileName: image.name,
            targetColor: '#ef0000',
          });

          if (!normalized.success || !normalized.imageUrl) {
            updateProgressStep(thinkingMessageId, 'step2', 'error', 'step2-1');
            updateProgressStep(thinkingMessageId, 'step2', 'error');
            throw new Error(normalized.error || `Logo 处理失败：${image.name}`);
          }

          normalizedImages.push({ ...image, src: normalized.imageUrl });
        }

        updateProgressStep(thinkingMessageId, 'step2', 'completed', 'step2-1');
        updateProgressStep(thinkingMessageId, 'step2', 'active', 'step2-2');
        updateMessageById(thinkingMessageId, {
          content: '正在优化 Logo 图片效果。',
        });
        updateProgressStep(thinkingMessageId, 'step2', 'completed', 'step2-2');
        updateProgressStep(thinkingMessageId, 'step2', 'completed');
        updateMessageById(thinkingMessageId, {
          content: `已完成 ${normalizedImages.length} 张 Logo 图片处理，准备生成设计图。`,
        });
      } else {
        updateProgressStep(thinkingMessageId, 'step2', 'active');
        updateProgressStep(thinkingMessageId, 'step2', 'skipped', 'step2-0');
        updateProgressStep(thinkingMessageId, 'step2', 'skipped');
        updateMessageById(thinkingMessageId, {
          content: hasImages
            ? (hasReferenceImages ? '已关闭自动预处理，正在结合参考图与原始 Logo 生成设计图。' : '已关闭自动预处理，直接使用原始 Logo 生成设计图。')
            : (hasReferenceImages ? '正在结合参考图生成设计图。' : '未上传图片，直接开始生成设计图。'),
        });
      }

      updateProgressStep(thinkingMessageId, 'step3', 'active');
      updateProgressStep(thinkingMessageId, 'step3', 'active', 'step3-1');
      updateMessageById(thinkingMessageId, {
        content: hasReferenceImages ? '正在分析参考图并生成设计布局。' : '正在生成设计布局。',
      });

      const imagesForGeneration = hasImages
        ? (enablePreprocess ? normalizedImages : submittedImages)
        : [];

      const result = await api.generate.canvas({
        prompt: content,
        messages: messages.filter((message) => !message.ephemeral).map((message) => ({ role: message.role, content: message.content })),
        images: imagesForGeneration,
        referenceImages: submittedReferenceImages,
      });

      if (!result.success || !result.draft) {
        throw new Error(result.error || '生成失败');
      }

      updateProgressStep(thinkingMessageId, 'step3', 'completed', 'step3-1');
      updateProgressStep(thinkingMessageId, 'step3', 'active', 'step3-2');
      updateMessageById(thinkingMessageId, {
        content: '正在合成预览图。',
      });

      const nextDraft = normalizeDraft(result.draft, content);
      const imageUrl = await renderDraftToPng(nextDraft);
      const persistedProgressMessage: ChatMessage = {
        id: thinkingMessageId,
        role: 'assistant',
        kind: 'generation_result',
        content: result.reply || '已生成图片，请查看。',
        imageUrl,
        draft: nextDraft,
        progressSteps: [
          { id: 'step1', label: '1. 理解需求', status: 'completed' },
          {
            id: 'step2',
            label: '2. 图片预处理',
            status: hasImages && enablePreprocess ? 'completed' : 'skipped',
            children: hasImages && enablePreprocess
              ? [
                  { id: 'step2-1', label: '2-1. 去背景', status: 'completed' },
                  { id: 'step2-2', label: '2-2. 单色化与扁平化', status: 'completed' },
                ]
              : [
                  { id: 'step2-0', label: hasImages ? '2-0. 已关闭自动预处理，跳过' : '2-0. 暂无图片上传，跳过', status: 'skipped' },
                ],
          },
          {
            id: 'step3',
            label: '3. 设计出图',
            status: 'completed',
            children: [
              { id: 'step3-1', label: '3-1. 生成布局', status: 'completed' },
              { id: 'step3-2', label: '3-2. 合成预览图', status: 'completed' },
            ],
          },
        ],
      };
      const nextMessages = [
        ...messages,
        userMessage,
        persistedProgressMessage,
      ];
      setMessages(nextMessages);
      await persistConversation(content, nextMessages);
      setConversationStage('idle');
    } catch (error) {
      updateProgressStep(thinkingMessageId, 'step3', 'error');
      updateMessageById(thinkingMessageId, {
        content: `当前流程中断：${(error as Error).message || '处理失败'}。请调整内容后重试。`,
      });
      const friendlyMessage = getFriendlyAssistantError(content, error as Error);
      const persistedProgressMessage: ChatMessage = {
        id: thinkingMessageId,
        role: 'assistant',
        kind: 'error',
        content: `当前流程中断：${(error as Error).message || '处理失败'}。请调整内容后重试。`,
        progressSteps: [
          { id: 'step1', label: '1. 理解需求', status: 'completed' },
          {
            id: 'step2',
            label: '2. 图片预处理',
            status: hasImages && enablePreprocess ? 'completed' : 'skipped',
            children: hasImages && enablePreprocess
              ? [
                  { id: 'step2-1', label: '2-1. 去背景', status: 'completed' },
                  { id: 'step2-2', label: '2-2. 单色化与扁平化', status: 'completed' },
                ]
              : [
                  { id: 'step2-0', label: hasImages ? '2-0. 已关闭自动预处理，跳过' : '2-0. 暂无图片上传，跳过', status: 'skipped' },
                ],
          },
          {
            id: 'step3',
            label: '3. 设计出图',
            status: 'error',
            children: [
              { id: 'step3-1', label: '3-1. 生成布局', status: 'error' },
              { id: 'step3-2', label: '3-2. 合成预览图', status: 'pending' },
            ],
          },
        ],
      };
      const nextMessages = [
        ...messages,
        userMessage,
        persistedProgressMessage,
        { id: `assistant_error_${Date.now()}`, role: 'assistant' as const, kind: 'error' as const, content: friendlyMessage },
      ];
      setMessages(nextMessages);
      await persistConversation(content, nextMessages);
    } finally {
      setIsGenerating(false);
      setConversationStage((current) => current === 'generating' ? 'idle' : current);
    }
  };

  const handleQuickCommandSend = async (command: string) => {
    if (isGenerating) return;
    setPendingQuickCommand(command);
    try {
      await handleSubmit(buildQuickCommandMessage(command));
    } finally {
      setPendingQuickCommand((current) => current === command ? null : current);
    }
  };

  const handleQuickAdjustSelect = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const command = event.target.value;
    if (!command) return;
    event.target.value = '';
    await handleQuickCommandSend(command);
  };

  const handleSubmitClick = () => {
    void handleSubmit();
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
        kind: message.kind,
        content: message.content,
        imageUrl: message.imageUrl,
        suggestionChips: message.suggestionChips,
        exampleInput: message.exampleInput,
        draft: message.draft,
        tweakMeta: message.tweakMeta,
        progressSteps: message.progressSteps,
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

      <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden pb-[210px] sm:min-h-0 sm:pb-0">
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-4">
          <div className="min-h-0 flex-1 border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
            <div
              ref={messagesScrollRef}
              className="h-full overflow-y-auto px-3 pr-3 sm:px-0 sm:pr-1 sm:pb-4"
            >
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`group relative max-w-[86%] px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {message.role === 'user' && (
                        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(message)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white transition hover:bg-white/25"
                            title="复制文本"
                            aria-label="复制文本"
                          >
                            {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReuseMessage(message)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white transition hover:bg-white/25"
                            title="带入输入框"
                            aria-label="带入输入框"
                          >
                            <TextCursorInput className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {message.id.startsWith('assistant_thinking_') && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-600">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          AI 思考中
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      {message.suggestionChips && message.suggestionChips.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.suggestionChips.map((chip) => (
                            <button
                              key={`${message.id}_${chip}`}
                              type="button"
                              onClick={() => {
                                setInput(chip);
                                if (message.kind === 'prepared_prompt') {
                                  setConversationStage('awaiting_prompt_confirmation');
                                }
                              }}
                              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                      {message.exampleInput && (
                        <div className="mt-2 text-xs text-slate-500">示例：{message.exampleInput}</div>
                      )}
                      {message.progressSteps && message.progressSteps.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white/70 p-3">
                          {message.progressSteps.map((step) => (
                            <div key={step.id} className="space-y-1">
                              <div className="flex items-center gap-2 text-xs sm:text-sm">
                                {step.status === 'active' ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                                ) : step.status === 'completed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : step.status === 'skipped' ? (
                                  <CheckCircle2 className="h-4 w-4 text-slate-400" />
                                ) : step.status === 'error' ? (
                                  <X className="h-4 w-4 text-red-500" />
                                ) : (
                                  <span className="inline-block h-4 w-4 rounded-full border border-slate-300" />
                                )}
                                <span className={step.status === 'completed' ? 'text-slate-900' : step.status === 'active' ? 'text-blue-700' : 'text-slate-600'}>{step.label}</span>
                                <span className="text-[11px] text-slate-400">{getStepStatusText(step.status)}</span>
                              </div>
                              {step.children && step.children.length > 0 && (
                                <div className="ml-6 space-y-1">
                                  {step.children.map((child) => (
                                    <div key={child.id} className="flex items-center gap-2 text-xs text-slate-600">
                                      {child.status === 'active' ? (
                                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                      ) : child.status === 'completed' ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      ) : child.status === 'skipped' ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                                      ) : child.status === 'error' ? (
                                        <X className="h-3.5 w-3.5 text-red-500" />
                                      ) : (
                                        <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-300" />
                                      )}
                                      <span>{child.label}</span>
                                      <span className="text-[11px] text-slate-400">{getStepStatusText(child.status)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
                          {message.role === 'assistant' && message.draft && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {['Logo往右一点', '标题变大一点', '副标题往下移一点', '更接近示例图'].map((command) => (
                                <button
                                  key={`${message.id}_${command}`}
                                  type="button"
                                  onClick={() => void handleQuickCommandSend(command)}
                                  disabled={isGenerating}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    {pendingQuickCommand === command && isGenerating ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                                    {command}
                                  </span>
                                </button>
                              ))}
                              {message.tweakMeta?.previousDraft && (
                                <button
                                  type="button"
                                  onClick={() => void handleUndoLastTweak()}
                                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 transition hover:bg-amber-100"
                                >
                                  撤销上一步
                                </button>
                              )}
                            </div>
                          )}
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
            <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap sm:gap-4">
                  <div className="flex items-center gap-2 sm:min-w-[160px]">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1 whitespace-nowrap border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 sm:px-8"
                    >
                      <ImagePlus className="h-3 w-3" />添加logo
                    </button>
                    {uploadedImages.length > 0 && (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600 select-none whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={shouldPreprocessLogos}
                          onChange={(event) => setShouldPreprocessLogos(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        自动预处理Logo
                      </label>
                    )}
                  </div>

                  <div className="sm:min-w-[160px]">
                    <button
                      type="button"
                      onClick={() => referenceFileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1 whitespace-nowrap border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 sm:px-8"
                    >
                      <Images className="h-3 w-3" />参考图
                    </button>
                  </div>
                </div>

                {(uploadedImages.length > 0 || uploadedReferenceImages.length > 0) && (
                <div className="flex flex-wrap items-start gap-4">
                  {uploadedImages.length > 0 && (
                  <div className="flex min-h-12 min-w-[160px] flex-wrap gap-2">
                    {uploadedImages.map((img) => (
                      <div key={img.id} className="relative flex h-12 w-12 items-center justify-center border border-slate-200 bg-slate-50 p-1">
                        <img src={img.src} alt={img.name} className="h-full w-full rounded object-cover" />
                        <button
                          type="button"
                          onClick={() => removeUploadedImage(img.id)}
                          className="absolute -right-1 -top-1 rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  )}

                  {uploadedReferenceImages.length > 0 && (
                  <div className="flex min-h-12 min-w-[160px] flex-wrap gap-2">
                    {uploadedReferenceImages.map((img) => (
                      <div key={img.id} className="relative flex h-12 w-12 items-center justify-center border border-amber-200 bg-amber-50 p-1">
                        <img src={img.src} alt={img.name} className="h-full w-full rounded object-cover" />
                        <button
                          type="button"
                          onClick={() => removeUploadedReferenceImage(img.id)}
                          className="absolute -right-1 -top-1 rounded-full border border-amber-200 bg-white text-amber-400 transition hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <input
                  ref={referenceFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleReferenceImageUpload}
                  className="hidden"
                />
              </div>
              <div className="relative shrink-0" data-presets-menu>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleOpenPresets()}
                    className="inline-flex items-center gap-1 whitespace-nowrap border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    示例模板
                    <ChevronDown className={`h-3 w-3 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInput('');
                      setUploadedImages([]);
                      setUploadedReferenceImages([]);
                    }}
                    className="whitespace-nowrap border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    清空
                  </button>
                </div>
                {showPresets && presetPrompts.length > 0 && (
                  <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+188px)] left-3 right-3 z-[90] max-h-[60vh] border border-slate-200 bg-white shadow-xl sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:z-50 sm:mb-1 sm:max-h-none sm:w-80">
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
                              onClick={() => void handleUsePreset(preset.id)}
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
            {hasAdjustableDraft && (
              <div className="mb-2 border border-slate-200 bg-slate-50 p-2 sm:mb-3 sm:p-3">
                <button
                  type="button"
                  onClick={() => setQuickAdjustOpen((value) => !value)}
                  className="flex w-full items-center justify-between text-left sm:hidden"
                >
                  <span>
                    <span className="block text-xs font-semibold text-slate-800">快速微调</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">点开后调整上一版参数</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${quickAdjustOpen ? 'rotate-180' : ''}`} />
                </button>

                <div className={`${quickAdjustOpen ? 'block' : 'hidden'} space-y-2 sm:block`}>
                <div className="hidden items-center justify-between gap-2 sm:flex">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">快速微调</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">先用选项改高频参数；复杂调整仍可直接输入文字。</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">背景色</span>
                    <select
                      defaultValue=""
                      onChange={(event) => void handleQuickAdjustSelect(event)}
                      disabled={isGenerating}
                      className="h-9 border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">请选择</option>
                      <option value="背景色改为白色">白色</option>
                      <option value="背景色改为蓝色">蓝色</option>
                      <option value="背景色改为红色">红色</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">标题调整</span>
                    <select
                      defaultValue=""
                      onChange={(event) => void handleQuickAdjustSelect(event)}
                      disabled={isGenerating}
                      className="h-9 border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">请选择</option>
                      <option value="标题变大一点">标题变大一点</option>
                      <option value="标题变小一点">标题变小一点</option>
                      <option value="标题左对齐">标题左对齐</option>
                      <option value="标题右对齐">标题右对齐</option>
                      <option value="标题改成红色">标题改成红色</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Logo 位置</span>
                    <select
                      defaultValue=""
                      onChange={(event) => void handleQuickAdjustSelect(event)}
                      disabled={isGenerating}
                      className="h-9 border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">请选择</option>
                      <option value="Logo往左一点">往左一点</option>
                      <option value="Logo往右一点">往右一点</option>
                      <option value="Logo放大一点">放大一点</option>
                      <option value="Logo缩小一点">缩小一点</option>
                      <option value="Logo居中一点">居中一点</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">热线 / 副标题</span>
                    <select
                      defaultValue=""
                      onChange={(event) => void handleQuickAdjustSelect(event)}
                      disabled={isGenerating}
                      className="h-9 border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">请选择</option>
                      <option value="联系电话往上一点">联系电话往上一点</option>
                      <option value="副标题往上移一点">副标题往上移一点</option>
                      <option value="副标题往下移一点">副标题往下移一点</option>
                      <option value="副标题红底白字">副标题红底白字</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {QUICK_TWEAK_COMMANDS.filter((command) => ['更接近示例图', '安全提示往下移一点', '热线条加长一点', '热线条缩短一点'].includes(command)).map((command) => (
                    <button
                      key={command}
                      type="button"
                      onClick={() => void handleQuickCommandSend(command)}
                      disabled={isGenerating}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingQuickCommand === command && isGenerating ? '处理中…' : command}
                    </button>
                  ))}
                </div>
                </div>
              </div>
            )}
            {conversationStage === 'awaiting_prompt_confirmation' && (
              <div className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                当前是“待确认提示词”阶段：我已经根据参考图整理好一版可编辑文案。你可以先修改输入框内容，确认后再点击发送，系统才会正式生图。
              </div>
            )}
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="描述你想要的保护垫设计，例如：宽度120cm，高度70cm，白底，安全区域 宽度84cm，高度40cm，红色标题、底部横条。也可以说：在上一版基础上，logo往右一点。" className="h-20 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 sm:h-auto sm:min-h-40 sm:leading-7" />
            <div className="mt-2 flex border-t border-slate-200 pt-2 sm:mt-3 sm:pt-3 sm:justify-end">
              <button
                type="button"
                onClick={() => void handleUndoLastTweak()}
                className="mr-2 inline-flex items-center justify-center border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!messages.some((message) => message.role === 'assistant' && message.tweakMeta?.previousDraft) || isGenerating}
              >
                撤销上一步
              </button>
              <button type="button" onClick={handleSubmitClick} disabled={isGenerating} className="inline-flex w-full items-center justify-center gap-2 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"><Send className="h-4 w-4" />{isGenerating ? '生成中...' : '发送'}</button>
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

      {presetDialogOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-sm border border-slate-200 bg-white p-6 shadow-xl">
            <div className="text-base font-semibold text-slate-900">暂无可用模板</div>
            <div className="mt-2 text-sm text-slate-600">{presetDialogMessage}</div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleClosePresetDialog}
                className="bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function legacyRenderDraftToPng(draft: ConversationDesignDraft) {
  const canvasWidth = 1200;
  const canvasHeight = canvasWidth * (draft.canvas.height / draft.canvas.width);
  const safeWidth = canvasWidth * (draft.canvas.safeAreaWidth / draft.canvas.width);
  const safeHeight = canvasHeight * (draft.canvas.safeAreaHeight / draft.canvas.height);
  const safeLeft = (canvasWidth - safeWidth) / 2;
  const safeTop = (canvasHeight - safeHeight) / 2;
  const padding = 140;
  const bottomMetaHeight = draft.bottomMeta?.proofingNote || (draft.bottomMeta?.colorLegend?.length ?? 0) > 0 ? 110 : 0;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth + padding * 2;
  canvas.height = canvasHeight + padding * 2 + bottomMetaHeight;
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

  const drawWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) => {
    const normalized = text.replace(/\s*\n\s*/g, ' ');
    const chars = normalized.split('');
    let line = '';
    let currentY = y;
    let lineCount = 0;

    for (const char of chars) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = char;
        currentY += lineHeight;
        lineCount += 1;
        if (lineCount >= maxLines - 1) break;
      } else {
        line = testLine;
      }
    }

    if (line) {
      const remainingText = lineCount >= maxLines - 1 && chars.join('').length > 0;
      let finalLine = line;
      while (remainingText && ctx.measureText(`${finalLine}…`).width > maxWidth && finalLine.length > 0) {
        finalLine = finalLine.slice(0, -1);
      }
      ctx.fillText(remainingText ? `${finalLine}…` : finalLine, x, currentY);
    }
  };

  for (const item of draft.elements) {
    const x = originX + safeLeft + safeWidth * (item.x ?? 0);
    const y = originY + safeTop + safeHeight * (item.y ?? 0);
    const width = safeWidth * (item.width ?? 0.3);
    const height = safeHeight * (item.height ?? 0.12);
    if (item.type === 'rect') {
      ctx.fillStyle = item.color || '#ef0000';
      ctx.fillRect(x, y, width, height);
    }
    if (item.type === 'text') {
      if (item.backgroundColor) {
        ctx.fillStyle = item.backgroundColor;
        ctx.fillRect(x, y, width, height);
      }
      ctx.fillStyle = item.color || '#111111';
      const fontWeight = item.fontWeight || '700';
      const fontSizePx = Math.max(24, height * 0.55 * (item.fontSize ?? 1));
      ctx.font = `${fontWeight} ${fontSizePx}px Microsoft YaHei`;
      ctx.textAlign = item.textAlign || 'center';
      ctx.textBaseline = 'middle';

      const text = item.text || '文字';
      const centerY = y + height / 2;
      const paddingX = 8;
      const drawX = item.textAlign === 'left'
        ? x + paddingX
        : item.textAlign === 'right'
          ? x + width - paddingX
          : x + width / 2;

      if ((item.letterSpacing ?? 0) !== 0) {
        const chars = text.split('');
        const spacingPx = (item.letterSpacing ?? 0) * fontSizePx;
        const charWidths = chars.map((char) => ctx.measureText(char).width);
        const totalWidth = charWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, chars.length - 1) * spacingPx;
        let cursorX = item.textAlign === 'left'
          ? drawX
          : item.textAlign === 'right'
            ? drawX - totalWidth
            : drawX - totalWidth / 2;

        chars.forEach((char, index) => {
          ctx.fillText(char, cursorX, centerY);
          cursorX += charWidths[index] + spacingPx;
        });
      } else {
        ctx.fillText(text, drawX, centerY, width);
      }
    }
    if (item.type === 'image') {
      if (item.src) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, width, height);
            resolve();
          };
          img.onerror = () => {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = '#94a3b8';
            ctx.strokeRect(x, y, width, height);
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 26px Microsoft YaHei';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('图片区', x + width / 2, y + height / 2);
            resolve();
          };
          img.src = item.src;
        });
      } else {
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
    }
  }

  if (bottomMetaHeight > 0) {
    const footerTop = originY + canvasHeight + 18;
    const footerLeft = originX;
    const footerWidth = canvasWidth;
    const proofingWidth = Math.round(footerWidth * 0.68);
    const legendWidth = footerWidth - proofingWidth;

    ctx.fillStyle = '#111111';
    ctx.font = 'bold 16px Microsoft YaHei';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (draft.bottomMeta?.proofingNote) {
      drawWrappedText(draft.bottomMeta.proofingNote, footerLeft, footerTop + 8, proofingWidth - 20, 20, 4);
    }

    const legends = draft.bottomMeta?.colorLegend || [];
    if (legends.length > 0) {
      const legendAreaLeft = footerLeft + proofingWidth + 12;
      const swatchSize = 42;
      let cursorX = legendAreaLeft;
      const rowY = footerTop + 12;

      legends.forEach((legend, index) => {
        if (index > 0) cursorX += 26;
        ctx.fillStyle = legend.swatchColor || '#ffffff';
        ctx.fillRect(cursorX, rowY, swatchSize, swatchSize * 0.72);
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.strokeRect(cursorX, rowY, swatchSize, swatchSize * 0.72);

        ctx.fillStyle = '#111111';
        ctx.font = 'bold 16px Microsoft YaHei';
        ctx.textBaseline = 'middle';
        ctx.fillText(legend.label, cursorX + swatchSize + 10, rowY + 11);
        ctx.font = '16px Microsoft YaHei';
        ctx.fillText(legend.value, cursorX + swatchSize + 10, rowY + 31);

        cursorX += swatchSize + 10 + Math.max(80, ctx.measureText(`${legend.label}${legend.value}`).width + 20);
        if (cursorX > footerLeft + footerWidth - 120 && index < legends.length - 1) {
          cursorX = legendAreaLeft;
        }
      });
    }
  }

  return canvas.toDataURL('image/png');
}