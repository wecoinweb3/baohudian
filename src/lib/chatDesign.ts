import type { DesignElement, ProjectPayload } from '../types';

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageKind = 'text' | 'clarification' | 'prepared_prompt' | 'generation_progress' | 'generation_result' | 'error';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  kind?: ChatMessageKind;
  content: string;
  imageUrl?: string;
  suggestionChips?: string[];
  exampleInput?: string;
  draft?: ConversationDesignDraft;
  tweakMeta?: {
    mode: 'local' | 'ai';
    sourcePrompt: string;
    appliedPatches?: DraftAdjustmentPatch[];
    previousDraft?: ConversationDesignDraft;
  };
  ephemeral?: boolean;
  progressSteps?: Array<{
    id: string;
    label: string;
    status: 'pending' | 'active' | 'completed' | 'skipped' | 'error';
    children?: Array<{
      id: string;
      label: string;
      status: 'pending' | 'active' | 'completed' | 'skipped' | 'error';
    }>;
  }>;
}

export interface PresetPrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

export interface ConversationDraftElement {
  type: 'text' | 'rect' | 'image';
  semanticRole?: ElementSemanticRole;
  text?: string;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  src?: string;
}

export interface ConversationDesignDraft {
  projectName: string;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
    safeAreaWidth: number;
    safeAreaHeight: number;
    unit: 'cm';
  };
  elements: ConversationDraftElement[];
  bottomMeta?: {
    proofingNote?: string;
    colorLegend?: Array<{ label: string; value: string; swatchColor?: string }>;
  };
  missingFields: string[];
  readyToGenerate: boolean;
}

export type ElementSemanticRole = 'canvas' | 'logo' | 'title' | 'subtitle' | 'hotline' | 'safety' | 'accentBar' | 'bodyText' | 'image';

export interface DraftAdjustmentPatch {
  targetRole: ElementSemanticRole;
  action: 'move' | 'resize' | 'recolor' | 'restyle';
  dx?: number;
  dy?: number;
  dw?: number;
  dh?: number;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  safeAreaWidth?: number;
  safeAreaHeight?: number;
}

const isHotlineText = (text?: string) => Boolean(text && /(?:热线|电话|联系电话|联系客服|1\d{10})/.test(text));

const isSafetyNoticeText = (text?: string) => Boolean(text && /(?:成品保护|正在施工|小心地滑|注意安全|禁止|温馨提示)/.test(text));

const isSubtitleText = (text?: string) => Boolean(text && /(?:铭记初心|用心装饰|副标题|标语|宣传语|slogan)/i.test(text));

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(3))));
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value.toFixed(3))));

const normalizeDraftLayout = (draft: ConversationDesignDraft): ConversationDesignDraft => {
  const nextElements = draft.elements.map((element) => ({
    ...element,
    x: clamp01(element.x ?? 0.1),
    y: clamp01(element.y ?? 0.1),
    width: clamp01(element.width ?? 0.3),
    height: clamp01(element.height ?? 0.12),
    fontSize: typeof element.fontSize === 'number' ? clampNumber(element.fontSize, 0.6, 2) : element.fontSize,
    letterSpacing: typeof element.letterSpacing === 'number' ? clampNumber(element.letterSpacing, -0.05, 0.2) : element.letterSpacing,
  }));

  for (let i = 0; i < nextElements.length; i += 1) {
    const current = nextElements[i];
    current.x = clamp01(Math.min(current.x ?? 0.1, 1 - (current.width ?? 0.3)));
    current.y = clamp01(Math.min(current.y ?? 0.1, 1 - (current.height ?? 0.12)));

    for (let j = 0; j < i; j += 1) {
      const prev = nextElements[j];
      const allowsIntentionalOverlay =
        (current.semanticRole === 'hotline' && prev.type === 'rect')
        || (prev.semanticRole === 'hotline' && current.type === 'rect')
        || (current.semanticRole === 'subtitle' && prev.type === 'rect' && current.backgroundColor)
        || (prev.semanticRole === 'subtitle' && current.type === 'rect' && prev.backgroundColor);
      if (allowsIntentionalOverlay) continue;

      const overlapX = (current.x ?? 0) < (prev.x ?? 0) + (prev.width ?? 0) && (current.x ?? 0) + (current.width ?? 0) > (prev.x ?? 0);
      const overlapY = (current.y ?? 0) < (prev.y ?? 0) + (prev.height ?? 0) && (current.y ?? 0) + (current.height ?? 0) > (prev.y ?? 0);
      if (overlapX && overlapY) {
        current.y = clamp01(Math.min((prev.y ?? 0) + (prev.height ?? 0) + 0.02, 1 - (current.height ?? 0.12)));
      }
    }
  }

  return { ...draft, elements: nextElements };
};

const annotateElementSemanticRoles = (draft: ConversationDesignDraft): ConversationDesignDraft => {
  const nextElements = draft.elements.map((element) => {
    if (element.type === 'image') {
      return {
        ...element,
        semanticRole: element.semanticRole || (element.src ? 'logo' : 'image'),
      };
    }

    if (element.type === 'rect') {
      return {
        ...element,
        semanticRole: element.semanticRole || 'accentBar',
      };
    }

    const text = element.text || '';
    let semanticRole: ElementSemanticRole = 'bodyText';
    if (isHotlineText(text)) semanticRole = 'hotline';
    else if (isSafetyNoticeText(text)) semanticRole = 'safety';
    else if (isSubtitleText(text)) semanticRole = 'subtitle';
    else semanticRole = 'title';

    return {
      ...element,
      semanticRole: element.semanticRole || semanticRole,
    };
  });

  return { ...draft, elements: nextElements };
};

const optimizeBrandLogoLayout = (draft: ConversationDesignDraft): ConversationDesignDraft => {
  const imageIndexes = draft.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.type === 'image' && !!element.src);

  if (imageIndexes.length !== 1) return draft;

  const textIndexes = draft.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.type === 'text' && typeof element.text === 'string' && element.text.trim().length > 0);

  if (textIndexes.length < 3) return draft;

  const hotline = textIndexes.find(({ element }) => isHotlineText(element.text));
  const safety = textIndexes.find(({ element }) => isSafetyNoticeText(element.text));
  const subtitle = textIndexes.find(({ element }) => isSubtitleText(element.text));
  const title = textIndexes.find(({ element }) => !isHotlineText(element.text) && !isSafetyNoticeText(element.text) && !isSubtitleText(element.text));

  if (!title || !hotline) return draft;

  const nextElements = [...draft.elements];
  const imageIndex = imageIndexes[0].index;
  const imageElement = nextElements[imageIndex];
  nextElements[imageIndex] = {
    ...imageElement,
    x: 0.10,
    y: 0.20,
    width: 0.16,
    height: 0.20,
  };

  nextElements[title.index] = {
    ...nextElements[title.index],
    x: 0.24,
    y: 0.17,
    width: 0.52,
    height: 0.16,
  };

  if (subtitle) {
    nextElements[subtitle.index] = {
      ...nextElements[subtitle.index],
      x: 0.14,
      y: 0.38,
      width: 0.62,
      height: 0.08,
    };
  }

  const rectIndex = nextElements.findIndex((element) => element.type === 'rect');
  if (rectIndex >= 0) {
    nextElements[rectIndex] = {
      ...nextElements[rectIndex],
      x: 0.14,
      y: 0.50,
      width: 0.62,
      height: 0.10,
    };
  }

  nextElements[hotline.index] = {
    ...nextElements[hotline.index],
    color: '#ffffff',
    x: 0.16,
    y: 0.505,
    width: 0.58,
    height: 0.09,
  };

  if (safety) {
    nextElements[safety.index] = {
      ...nextElements[safety.index],
      x: 0.14,
      y: 0.66,
      width: 0.62,
      height: 0.08,
    };
  }

  return normalizeDraftLayout(annotateElementSemanticRoles({
    ...draft,
    elements: nextElements,
  }));
};

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 70;
const DEFAULT_SAFE_WIDTH = 84;
const DEFAULT_SAFE_HEIGHT = 40;
const CM_TO_CANVAS_SCALE = 10;

const COLOR_MAP: Array<{ keywords: string[]; value: string }> = [
  { keywords: ['白色', '白底', '白'], value: '#ffffff' },
  { keywords: ['红色', '红', '大红'], value: '#ef4444' },
  { keywords: ['蓝色', '蓝', '深蓝'], value: '#2563eb' },
  { keywords: ['绿色', '绿'], value: '#16a34a' },
  { keywords: ['黑色', '黑'], value: '#111827' },
  { keywords: ['黄色', '黄'], value: '#eab308' },
];

export const PRESET_PROMPTS: PresetPrompt[] = [
  {
    id: 'promo',
    title: '促销款保护垫',
    description: '带主标题、横条和产品图的高频布局',
    prompt: '做一个 120×70 的保护垫，白底，安全区域 84×40，放红色主标题“夏季大促”，底部加一条红色横条，再放一张产品图。',
  },
  {
    id: 'brand',
    title: '品牌展示款',
    description: '简洁风格，突出品牌名与 Logo',
    prompt: '做一个 120×70 的保护垫，背景白色，安全区域 84×40，顶部放品牌标题“品牌推荐”，中间保留大面积留白，右下角预留 logo 区域。',
  },
  {
    id: 'single-product',
    title: '单品主推款',
    description: '主图突出，适合单品视觉陈列',
    prompt: '生成一个 100×60 的保护垫，白底，安全区域 80×35，以产品图为核心，标题放上方，右侧增加卖点文字。',
  },
  {
    id: 'text-heavy',
    title: '文字信息款',
    description: '适合说明型、活动型内容展示',
    prompt: '做一个 120×70 的保护垫，背景白色，安全区域 84×40，包含主标题“门店活动”，副标题和底部说明文字，不放图片。',
  },
];

const createDefaultDraft = (): ConversationDesignDraft => ({
  projectName: 'AI 新建项目',
  canvas: {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    backgroundColor: '#ffffff',
    safeAreaWidth: DEFAULT_SAFE_WIDTH,
    safeAreaHeight: DEFAULT_SAFE_HEIGHT,
    unit: 'cm',
  },
  elements: [],
  bottomMeta: undefined,
  missingFields: ['设计描述'],
  readyToGenerate: false,
});

const pickColor = (content: string, fallback: string) => {
  for (const item of COLOR_MAP) {
    if (item.keywords.some((keyword) => content.includes(keyword))) {
      return item.value;
    }
  }
  return fallback;
};

const pickBackgroundColor = (content: string) => {
  if (content.includes('黄底') || content.includes('黄色背景') || content.includes('背景黄色')) return '#fff200';
  if (content.includes('红底') || content.includes('红色背景') || content.includes('背景红色')) return '#ef4444';
  if (content.includes('蓝底') || content.includes('蓝色背景') || content.includes('背景蓝色')) return '#2563eb';
  if (content.includes('黑底') || content.includes('黑色背景') || content.includes('背景黑色')) return '#111827';
  return '#ffffff';
};

const pickAccentColor = (content: string) => {
  if (content.includes('红色') || content.includes('红字') || content.includes('红色标题') || content.includes('红色横条')) return '#ef0000';
  if (content.includes('蓝色') || content.includes('蓝字') || content.includes('蓝色标题') || content.includes('蓝色横条')) return '#2563eb';
  if (content.includes('绿色') || content.includes('绿字') || content.includes('绿色标题') || content.includes('绿色横条')) return '#16a34a';
  if (content.includes('黄色') || content.includes('黄字') || content.includes('黄色标题') || content.includes('黄色横条')) return '#eab308';
  return '#ef0000';
};

const extractQuotedText = (content: string) => {
  const matched = content.match(/[“"]([^”"]+)[”"]/);
  return matched?.[1];
};

const extractSize = (content: string) => {
  const matched = content.match(/(\d{2,3})\s*[x×＊*]\s*(\d{2,3})/i);
  if (!matched) return null;
  return { width: Number(matched[1]), height: Number(matched[2]) };
};

const extractSafeArea = (content: string) => {
  const matched = content.match(/(?:安全区域|非留白(?:区域)?)[^\d]{0,8}(\d{2,3})\s*[x×＊*]\s*(\d{2,3})/i);
  if (!matched) return null;
  return { width: Number(matched[1]), height: Number(matched[2]) };
};

const isProofingNoteText = (text: string) => /(?:底部印刷校对提示|温馨提示|校对提示|请仔细确认版面|二维码扫描|图稿颜色|色差|出错概不负责)/.test(text);

const isColorLegendText = (text: string) => /(?:色标说明|材料颜色|印刷颜色|印刷专色|底材材料色)/.test(text);

const normalizeLegendColor = (text: string) => {
  if (/白|底材材料色/.test(text)) return '#ffffff';
  if (/橙/.test(text)) return '#f97316';
  if (/红/.test(text)) return '#ef4444';
  if (/蓝/.test(text)) return '#2563eb';
  if (/黄/.test(text)) return '#eab308';
  if (/绿/.test(text)) return '#16a34a';
  if (/黑/.test(text)) return '#111827';
  return undefined;
};

const extractColorLegend = (text: string) => {
  const normalized = text.replace(/色标说明[:：]?/g, '').replace(/\s+/g, ' ').trim();
  const segments = normalized.split(/[；;。]/).map((item) => item.trim()).filter(Boolean);
  const legends = segments.flatMap((segment) => {
    const matched = segment.match(/(.+?)[:：]\s*(.+)/);
    if (!matched) return [] as Array<{ label: string; value: string; swatchColor?: string }>;
    return [{
      label: matched[1].trim(),
      value: matched[2].trim(),
      swatchColor: normalizeLegendColor(matched[2]),
    }];
  });

  if (legends.length > 0) return legends;

  const compactColorMatches = Array.from(normalized.matchAll(/(白色|红色|橙色|蓝色|黄色|绿色|黑色|白|红|橙|蓝|黄|绿|黑)/g)).map((item) => item[0]);
  if (compactColorMatches.length > 0) {
    return compactColorMatches.map((colorText, index) => ({
      label: index === 0 ? '材料颜色' : '印刷颜色',
      value: colorText,
      swatchColor: normalizeLegendColor(colorText),
    }));
  }

  if (normalized) {
    return [{
      label: '色标说明',
      value: normalized,
      swatchColor: normalizeLegendColor(normalized),
    }];
  }

  return [] as Array<{ label: string; value: string; swatchColor?: string }>;
};

const extractColorLegendFromPrompt = (prompt: string) => {
  const matched = prompt.match(/(?:四[、，.]\s*)?色标说明\s*[:：]?\s*([\s\S]*?)(?:$|\n\s*[五六七八九十][、，.]|\n\s*$)/);
  if (!matched?.[1]) return [] as Array<{ label: string; value: string; swatchColor?: string }>;
  return extractColorLegend(matched[1]);
};

export const buildDraftFromPrompt = (prompt: string): ConversationDesignDraft => {
  const draft = createDefaultDraft();
  const content = prompt.trim();

  if (!content) {
    return draft;
  }

  const canvasSize = extractSize(content);
  const safeArea = extractSafeArea(content);
  const backgroundColor = pickBackgroundColor(content);
  const titleText = extractQuotedText(content)
    || (content.includes('标题') ? '主标题文案' : undefined);
  const accentColor = pickAccentColor(content);

  if (canvasSize) {
    draft.canvas.width = canvasSize.width;
    draft.canvas.height = canvasSize.height;
  }

  if (safeArea) {
    draft.canvas.safeAreaWidth = safeArea.width;
    draft.canvas.safeAreaHeight = safeArea.height;
  }

  draft.canvas.backgroundColor = backgroundColor;
  draft.projectName = titleText ? `${titleText} 项目` : 'AI 新建项目';

  const elements: ConversationDraftElement[] = [];

  if (titleText || content.includes('标题')) {
    elements.push({ type: 'text', text: titleText || '主标题文案', color: accentColor, fontSize: 1.1, fontWeight: '700', textAlign: 'center', x: 0.15, y: 0.14, width: 0.7, height: 0.14 });
  }

  if (content.includes('横条') || content.includes('色块')) {
    elements.push({ type: 'rect', color: accentColor, x: 0.15, y: 0.74, width: 0.7, height: 0.08 });
  }

  if (content.includes('产品图') || content.includes('图片') || content.includes('主图')) {
    elements.push({ type: 'image', x: content.includes('左') ? 0.12 : 0.56, y: 0.24, width: 0.26, height: 0.34 });
  }

  if (content.includes('卖点') || content.includes('说明') || content.includes('副标题')) {
    elements.push({ type: 'text', text: content.includes('副标题') ? '副标题 / 卖点说明' : '卖点说明', color: '#334155', fontSize: 0.85, fontWeight: '500', textAlign: 'center', x: content.includes('右侧') ? 0.6 : 0.15, y: 0.34, width: 0.24, height: 0.18 });
  }

  draft.elements = elements;
  draft.missingFields = [];
  if (!canvasSize) draft.missingFields.push('画布尺寸');
  if (!safeArea) draft.missingFields.push('非留白区域');
  if (elements.length === 0) draft.missingFields.push('元素描述');
  draft.readyToGenerate = draft.missingFields.length === 0;
  return draft;
};

export const buildAssistantReply = (draft: ConversationDesignDraft) => {
  const elementTypes = draft.elements.map((item) => item.type === 'text' ? `文字${item.text ? `（${item.text}）` : ''}` : item.type === 'image' ? '图片区' : '色块');

  if (draft.missingFields.length > 0) {
    return `我已经识别出部分内容：画布 ${draft.canvas.width}×${draft.canvas.height}cm，非留白 ${draft.canvas.safeAreaWidth}×${draft.canvas.safeAreaHeight}cm。还建议你继续补充：${draft.missingFields.join('、')}。`;
  }

  return `已生成画布：${draft.canvas.width}×${draft.canvas.height}cm，非留白 ${draft.canvas.safeAreaWidth}×${draft.canvas.safeAreaHeight}cm，包含 ${elementTypes.join('、')}。`;
};

export const normalizeDraft = (draft: Partial<ConversationDesignDraft>, originalPrompt?: string): ConversationDesignDraft => {
  const fallback = createDefaultDraft();
  const rawElements = Array.isArray(draft.elements) ? draft.elements.filter((item) => ['text', 'rect', 'image'].includes(item.type)) : [];
  const extractedProofingTexts: string[] = [];
  const extractedLegends: Array<{ label: string; value: string; swatchColor?: string }> = [];

  const normalizedElements = rawElements.filter((item) => {
    if (item.type !== 'text' || typeof item.text !== 'string') return true;
    const text = item.text.trim();
    if (!text) return true;

    if (isProofingNoteText(text)) {
      extractedProofingTexts.push(text.replace(/^底部印刷校对提示[:：]?/g, '').trim());
      return false;
    }

    if (isColorLegendText(text)) {
      extractedLegends.push(...extractColorLegend(text));
      return false;
    }

    return true;
  });

  const draftProofing = typeof draft.bottomMeta?.proofingNote === 'string' ? draft.bottomMeta.proofingNote : undefined;
  const draftLegend = Array.isArray(draft.bottomMeta?.colorLegend)
    ? draft.bottomMeta?.colorLegend
        .filter((item) => item && typeof item.label === 'string' && typeof item.value === 'string')
        .map((item) => ({
          label: item.label,
          value: item.value,
          swatchColor: typeof item.swatchColor === 'string' ? item.swatchColor : undefined,
        }))
    : undefined;

  const mergedProofing = draftProofing || extractedProofingTexts.join(' ');
  const promptLegend = originalPrompt ? extractColorLegendFromPrompt(originalPrompt) : [];
  const mergedLegend = promptLegend.length > 0
    ? promptLegend
    : draftLegend && draftLegend.length > 0
      ? draftLegend
      : extractedLegends.length > 0
      ? extractedLegends
      : (promptLegend.length > 0 ? promptLegend : undefined);

  const normalizedDraft: ConversationDesignDraft = {
    projectName: draft.projectName || fallback.projectName,
    canvas: {
      width: Number(draft.canvas?.width) || fallback.canvas.width,
      height: Number(draft.canvas?.height) || fallback.canvas.height,
      backgroundColor: draft.canvas?.backgroundColor || fallback.canvas.backgroundColor,
      safeAreaWidth: Number(draft.canvas?.safeAreaWidth) || fallback.canvas.safeAreaWidth,
      safeAreaHeight: Number(draft.canvas?.safeAreaHeight) || fallback.canvas.safeAreaHeight,
      unit: 'cm',
    },
    elements: normalizedElements,
    bottomMeta: mergedProofing || mergedLegend
      ? {
          proofingNote: mergedProofing,
          colorLegend: mergedLegend,
        }
      : fallback.bottomMeta,
    missingFields: Array.isArray(draft.missingFields) ? draft.missingFields : [],
    readyToGenerate: Boolean(draft.readyToGenerate),
  };

  return normalizeDraftLayout(annotateElementSemanticRoles(optimizeBrandLogoLayout(normalizedDraft)));
};

export const applyDraftAdjustmentPatches = (draft: ConversationDesignDraft, patches: DraftAdjustmentPatch[]): ConversationDesignDraft => {
  if (!patches.length) return draft;

  const canvasPatches = patches.filter((patch) => patch.targetRole === 'canvas');
  const elementPatches = patches.filter((patch) => patch.targetRole !== 'canvas');

  const nextCanvas = canvasPatches.reduce<ConversationDesignDraft['canvas']>((current, patch) => {
    if ((patch.action === 'recolor' || patch.action === 'restyle') && patch.backgroundColor) {
      return {
        ...current,
        backgroundColor: patch.backgroundColor,
      };
    }

    if (patch.action === 'restyle' && (typeof patch.safeAreaWidth === 'number' || typeof patch.safeAreaHeight === 'number')) {
      return {
        ...current,
        safeAreaWidth: typeof patch.safeAreaWidth === 'number' ? clampNumber(patch.safeAreaWidth, 10, current.width) : current.safeAreaWidth,
        safeAreaHeight: typeof patch.safeAreaHeight === 'number' ? clampNumber(patch.safeAreaHeight, 10, current.height) : current.safeAreaHeight,
      };
    }

    return current;
  }, draft.canvas);

  const nextElements = draft.elements.map((element) => {
    const matchedPatches = elementPatches.filter((patch) => patch.targetRole === element.semanticRole);
    if (!matchedPatches.length) return element;

    return matchedPatches.reduce<ConversationDraftElement>((current, patch) => {
      if (patch.action === 'move') {
        return {
          ...current,
          x: clamp01((current.x ?? 0) + (patch.dx ?? 0)),
          y: clamp01((current.y ?? 0) + (patch.dy ?? 0)),
        };
      }

      if (patch.action === 'resize') {
        return {
          ...current,
          width: clamp01((current.width ?? 0.2) + (patch.dw ?? 0)),
          height: clamp01((current.height ?? 0.1) + (patch.dh ?? 0)),
        };
      }

      if (patch.action === 'recolor' && patch.color) {
        return {
          ...current,
          color: patch.color,
          backgroundColor: patch.backgroundColor ?? current.backgroundColor,
        };
      }

      if (patch.action === 'restyle') {
        return {
          ...current,
          color: patch.color ?? current.color,
          backgroundColor: patch.backgroundColor ?? current.backgroundColor,
          fontSize: typeof patch.fontSize === 'number' ? clampNumber((current.fontSize ?? 1) + patch.fontSize, 0.6, 2) : current.fontSize,
          letterSpacing: typeof patch.letterSpacing === 'number' ? clampNumber((current.letterSpacing ?? 0) + patch.letterSpacing, -0.05, 0.2) : current.letterSpacing,
          fontWeight: patch.fontWeight || current.fontWeight,
          textAlign: patch.textAlign || current.textAlign,
        };
      }

      return current;
    }, element);
  });

  return normalizeDraftLayout({
    ...draft,
    canvas: nextCanvas,
    elements: nextElements,
  });
};

const buildMovePatch = (targetRole: ElementSemanticRole, dx: number, dy: number): DraftAdjustmentPatch => ({
  targetRole,
  action: 'move',
  dx,
  dy,
});

const buildResizePatch = (targetRole: ElementSemanticRole, dw: number, dh: number): DraftAdjustmentPatch => ({
  targetRole,
  action: 'resize',
  dw,
  dh,
});

const TWEAK_COLOR_MAP: Array<{ names: string[]; value: string }> = [
  { names: ['白色', '白'], value: '#ffffff' },
  { names: ['黄色', '黄'], value: '#fff200' },
  { names: ['米黄色', '米黄'], value: '#fef3c7' },
  { names: ['橙色', '橙'], value: '#f97316' },
  { names: ['红色', '红'], value: '#ef0000' },
  { names: ['粉色', '粉'], value: '#ec4899' },
  { names: ['紫色', '紫'], value: '#7c3aed' },
  { names: ['蓝色', '蓝'], value: '#2563eb' },
  { names: ['天蓝色', '天蓝'], value: '#38bdf8' },
  { names: ['绿色', '绿'], value: '#16a34a' },
  { names: ['浅绿色', '浅绿'], value: '#86efac' },
  { names: ['黑色', '黑'], value: '#111827' },
  { names: ['灰色', '灰'], value: '#e5e7eb' },
];

const getNamedTweakColor = (normalized: string) => {
  const matchedHex = normalized.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/)?.[0];
  if (matchedHex) return matchedHex;

  return TWEAK_COLOR_MAP.find((item) => item.names.some((name) => normalized.includes(name)))?.value;
};

export const QUICK_TWEAK_COMMANDS = [
  '背景色改为蓝色',
  '背景色改为黄色',
  '安全区域宽度改为80',
  'Logo往右一点',
  'Logo往左一点',
  'Logo放大一点',
  'Logo缩小一点',
  '标题变大一点',
  '标题变小一点',
  '标题往右一点',
  '标题往左一点',
  '副标题往下移一点',
  '副标题往上移一点',
  '安全提示往下移一点',
  '热线条缩短一点',
  '热线条加长一点',
  '标题居中一点',
  'Logo居中一点',
  '标题改成红色',
  '标题更粗一点',
  '标题左对齐',
  '标题右对齐',
  '标题字更大一点',
  '副标题字更大一点',
  '联系电话往上一点',
  '副标题红底白字',
  '更接近示例图',
];

export const interpretLocalTweakCommand = (input: string): { patches: DraftAdjustmentPatch[]; summary: string } | null => {
  const normalized = input.replace(/\s+/g, '');
  const patches: DraftAdjustmentPatch[] = [];
  const safeAreaWidthMatch = normalized.match(/(?:安全区域|非留白(?:区域)?).*(?:宽度|宽).*(?:改成|改为|调整为|变成)(\d{2,3})/);
  const safeAreaHeightMatch = normalized.match(/(?:安全区域|非留白(?:区域)?).*(?:高度|高).*(?:改成|改为|调整为|变成)(\d{2,3})/);

  if (safeAreaWidthMatch) {
    patches.push({ targetRole: 'canvas', action: 'restyle', safeAreaWidth: Number(safeAreaWidthMatch[1]) });
  }
  if (safeAreaHeightMatch) {
    patches.push({ targetRole: 'canvas', action: 'restyle', safeAreaHeight: Number(safeAreaHeightMatch[1]) });
  }

  if (/(?:背景|背景色|底色).*(?:改成|改为|换成|调整为|变成)/.test(normalized)) {
    const backgroundColor = getNamedTweakColor(normalized);
    if (backgroundColor) {
      patches.push({ targetRole: 'canvas', action: 'restyle', backgroundColor });
    }
  }

  if (/logo.*往右/.test(normalized)) patches.push(buildMovePatch('logo', 0.03, 0));
  if (/logo.*往左/.test(normalized)) patches.push(buildMovePatch('logo', -0.03, 0));
  if (/logo.*往上/.test(normalized)) patches.push(buildMovePatch('logo', 0, -0.03));
  if (/logo.*往下/.test(normalized)) patches.push(buildMovePatch('logo', 0, 0.03));
  if (/logo.*放大/.test(normalized)) patches.push(buildResizePatch('logo', 0.03, 0.03));
  if (/logo.*缩小/.test(normalized)) patches.push(buildResizePatch('logo', -0.03, -0.03));
  if (/标题.*变大|标题.*放大/.test(normalized)) patches.push(buildResizePatch('title', 0.05, 0.02));
  if (/标题.*变小|标题.*缩小/.test(normalized)) patches.push(buildResizePatch('title', -0.05, -0.02));
  if (/标题.*往右/.test(normalized)) patches.push(buildMovePatch('title', 0.03, 0));
  if (/标题.*往左/.test(normalized)) patches.push(buildMovePatch('title', -0.03, 0));
  if (/标题.*居中/.test(normalized)) patches.push(buildMovePatch('title', 0.015, 0));
  if (/logo.*居中/.test(normalized)) patches.push(buildMovePatch('logo', 0.015, 0));
  if (/副标题.*往下/.test(normalized)) patches.push(buildMovePatch('subtitle', 0, 0.03));
  if (/副标题.*往上/.test(normalized)) patches.push(buildMovePatch('subtitle', 0, -0.03));
  if (/(?:联系电话|热线|电话).*(?:往上|上移)/.test(normalized)) patches.push(buildMovePatch('hotline', 0, -0.03));
  if (/(?:联系电话|热线|电话).*(?:往下|下移)/.test(normalized)) patches.push(buildMovePatch('hotline', 0, 0.03));
  if (/安全提示.*往下/.test(normalized)) patches.push(buildMovePatch('safety', 0, 0.03));
  if (/安全提示.*往上/.test(normalized)) patches.push(buildMovePatch('safety', 0, -0.03));
  if (/热线.*缩短|热线条.*缩短/.test(normalized)) patches.push(buildResizePatch('accentBar', -0.06, 0));
  if (/热线.*加长|热线条.*加长/.test(normalized)) patches.push(buildResizePatch('accentBar', 0.06, 0));
  if (/标题.*红色|标题.*改红/.test(normalized)) patches.push({ targetRole: 'title', action: 'recolor', color: '#ef0000' });
  if (/标题.*蓝色|标题.*改蓝/.test(normalized)) patches.push({ targetRole: 'title', action: 'recolor', color: '#2563eb' });
  if (/标题.*更粗|标题.*加粗/.test(normalized)) patches.push({ targetRole: 'title', action: 'restyle', fontWeight: '800' });
  if (/标题.*左对齐/.test(normalized)) patches.push({ targetRole: 'title', action: 'restyle', textAlign: 'left' });
  if (/标题.*右对齐/.test(normalized)) patches.push({ targetRole: 'title', action: 'restyle', textAlign: 'right' });
  if (/标题.*字更大|标题.*字号更大/.test(normalized)) patches.push({ targetRole: 'title', action: 'restyle', fontSize: 0.15 });
  if (/副标题.*字更大|副标题.*字号更大/.test(normalized)) patches.push({ targetRole: 'subtitle', action: 'restyle', fontSize: 0.12 });
  if (/副标题.*红底白字|副标题.*白字红底/.test(normalized)) {
    patches.push({ targetRole: 'subtitle', action: 'restyle', backgroundColor: '#ef0000', color: '#ffffff', fontWeight: '700' });
  }
  if (/更接近示例图/.test(normalized)) {
    patches.push(buildMovePatch('logo', 0.02, -0.01));
    patches.push(buildResizePatch('logo', 0.02, 0.02));
    patches.push(buildResizePatch('title', 0.06, 0.03));
  }

  if (!patches.length) return null;

  return {
    patches,
    summary: '已根据你的微调指令更新当前排版。',
  };
};

export const buildProjectPayloadFromDraft = (draft: ConversationDesignDraft): ProjectPayload => {
  const renderWidth = draft.canvas.width * CM_TO_CANVAS_SCALE;
  const renderHeight = draft.canvas.height * CM_TO_CANVAS_SCALE;
  const safeWidth = draft.canvas.safeAreaWidth * CM_TO_CANVAS_SCALE;
  const safeHeight = draft.canvas.safeAreaHeight * CM_TO_CANVAS_SCALE;
  const safeLeft = (renderWidth - safeWidth) / 2;
  const safeTop = (renderHeight - safeHeight) / 2;

  const elements: DesignElement[] = draft.elements.map((element, index) => ({
    id: `${element.type}_${Date.now()}_${index}`,
    type: element.type,
    x: safeLeft + safeWidth * (element.x ?? 0.1),
    y: safeTop + safeHeight * (element.y ?? 0.1),
    width: Math.max(60, safeWidth * (element.width ?? 0.3)),
    height: Math.max(40, safeHeight * (element.height ?? 0.12)),
    zIndex: index + 1,
    text: element.text,
    fontFamily: 'Microsoft YaHei',
    fontSize: element.type === 'text' ? 40 : undefined,
    fill: element.color || '#ef4444',
    fontWeight: element.type === 'text' ? '700' : undefined,
    backgroundColor: element.backgroundColor,
    src: element.type === 'image' ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="%23e2e8f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-size="26">图片占位</text></svg>' : undefined,
    opacity: 1,
  }));

  return {
    name: draft.projectName,
    width: draft.canvas.width,
    height: draft.canvas.height,
    unit: draft.canvas.unit,
    backgroundColor: draft.canvas.backgroundColor,
    bleedlessWidth: draft.canvas.safeAreaWidth,
    bleedlessHeight: draft.canvas.safeAreaHeight,
    canvasData: {
      canvas: {
        width: draft.canvas.width,
        height: draft.canvas.height,
        unit: draft.canvas.unit,
        backgroundColor: draft.canvas.backgroundColor,
        safeArea: { width: draft.canvas.safeAreaWidth, height: draft.canvas.safeAreaHeight },
      },
      elements,
    },
  };
};