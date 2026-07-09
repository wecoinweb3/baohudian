import type { DesignElement, ProjectPayload } from '../types';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  imageUrl?: string;
}

export interface PresetPrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

export interface ConversationDraftElement {
  type: 'text' | 'rect' | 'image';
  text?: string;
  color?: string;
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
    elements.push({ type: 'text', text: titleText || '主标题文案', color: accentColor, x: 0.15, y: 0.14, width: 0.7, height: 0.14 });
  }

  if (content.includes('横条') || content.includes('色块')) {
    elements.push({ type: 'rect', color: accentColor, x: 0.15, y: 0.74, width: 0.7, height: 0.08 });
  }

  if (content.includes('产品图') || content.includes('图片') || content.includes('主图')) {
    elements.push({ type: 'image', x: content.includes('左') ? 0.12 : 0.56, y: 0.24, width: 0.26, height: 0.34 });
  }

  if (content.includes('卖点') || content.includes('说明') || content.includes('副标题')) {
    elements.push({ type: 'text', text: content.includes('副标题') ? '副标题 / 卖点说明' : '卖点说明', color: '#334155', x: content.includes('右侧') ? 0.6 : 0.15, y: 0.34, width: 0.24, height: 0.18 });
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

  return {
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