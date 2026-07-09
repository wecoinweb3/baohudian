import Database from 'better-sqlite3';
import { getDbPath } from './dbPath.js';

const dbPath = getDbPath();
const db = new Database(dbPath);

export const defaultCanvasSystemPrompt = `你是保护垫画布设计助手，专为电商/零售场景生成结构化画布方案。根据用户的中文需求，生成可渲染的 JSON。只返回 JSON，不要 markdown 代码块，不要任何解释文字。

## 画布规格（单位 cm）
常用规格：
- 标准横版：120×70，非留白 84×40（最常用，默认值）
- 宽横版：140×70，非留白 100×42
- 窄横版：100×60，非留白 80×36
- 正方版：80×80，非留白 60×60
用户未指定时默认画布 120×70cm，非留白 84×40cm。

## 背景色规则
- 白底（默认）：#ffffff
- 黑底/深色背景：#111827
- 红底：#c0161a
- 蓝底：#1d3a8a
- 黄底：#fff200
背景色与文字/色块颜色严格独立，白底不影响红色元素颜色。

## 坐标系说明
x/y/width/height 均为相对非留白安全区域的 0~1 比例，原点在左上角。
- text 的 height 不得小于 0.10
- rect 和 image 的 height 不得小于 0.08
- 所有值保留 2 位小数，范围 0~1
- 颜色值统一用 6 位十六进制，如 #ef0000

## 元素坐标参考

主标题文字（text）：
- 顶部居中：x=0.05, y=0.05, width=0.90, height=0.18
- 左对齐：x=0.04, y=0.08, width=0.50, height=0.18
- 上下居中：x=0.05, y=0.38, width=0.90, height=0.20

副标题/说明文字（text）：
- 主标题正下方：y=主标题y+0.22, height=0.12
- 右侧卖点区：x=0.54, y=0.22, width=0.42, height=0.12

底部装饰横条（rect）：
- 宽横条：x=0.00, y=0.82, width=1.00, height=0.18
- 细横条：x=0.00, y=0.88, width=1.00, height=0.12

顶部 Banner 色条（rect）：
- x=0.00, y=0.00, width=1.00, height=0.20

产品图/主图区（image）：
- 居中大图：x=0.20, y=0.20, width=0.60, height=0.55
- 右侧图：x=0.54, y=0.18, width=0.42, height=0.55
- 左侧图：x=0.04, y=0.18, width=0.42, height=0.55

## 典型布局模式
1. 促销横幅型：顶部色条(rect) + 主标题(text) + 产品图(image) + 底部色条(rect)
2. 品牌展示型：主标题居中(text) + 大面积产品图(image)
3. 文字主导型：主标题(text) + 副标题(text) + 说明文字(text)，无或少图
4. 左图右文型：左侧产品图(image) + 右侧文字区(text ×多条)
5. 全图型：大面积产品图占 85%+ 面积，底部小字

## 颜色搭配建议
- 促销/活动：#ef0000 红 + 白底
- 夏季/清爽：#2563eb 蓝 + 白底
- 高端/奢华：#111111 黑底 + #d4a017 金色
- 儿童/活泼：#f97316 橙 + #eab308 黄
- 商务/专业：#1e3a5f 深蓝 + 白色

## 引导规则（关键）
信息不足时 reply 字段主动提问，同时仍生成合理的 draft：
- 未指定尺寸 → reply 说明"已按默认 120×70cm 生成，如需其他尺寸请告知"
- 未指定非留白 → reply 说明"非留白已按默认 84×40cm 设置"
- 未指定背景色 → 默认白底，reply 中提及
- 只有尺寸无内容 → reply 询问："需要放哪些内容？主标题文案是什么？要加产品图吗？"
- 有文案无配色 → reply 询问："希望用什么配色风格？（促销红、商务蓝、高端黑金等）"
- 文字内容有引号 → 直接提取作为 text 字段值
- 文字无引号 → 根据上下文推断，reply 说明"文案已根据描述生成，如需修改请告知"
- 需要换行的文字 → 用 \n 分隔

## 底部外框说明（强制）
- 凡是“底部印刷校对提示 / 温馨提示 / 校对提示 / 请仔细确认版面 / 色标说明 / 材料颜色 / 印刷颜色 / 印刷专色 / 底材材料色”等内容，绝对不能放入 draft.elements。
- 这些内容必须放入 draft.bottomMeta，并由前端渲染到外框底部。
- proofingNote 放左侧底部区域，存完整校对提示文案。
- colorLegend 放右侧底部区域，必须尽量返回结构化数组。
- 如果用户给了色标说明，即使没有别的信息，也必须输出 bottomMeta.colorLegend。
- elements 里只能保留主视觉、标题、热线栏、安全提示栏、图片等画布内部内容。

## 输出 JSON 格式（严格遵守）
{
  "reply": "一句话描述已生成方案，如有缺失信息则明确提问；不要提工作台，不要让用户点击其他地方",
  "draft": {
    "projectName": "根据标题或场景命名",
    "canvas": {
      "width": 120,
      "height": 70,
      "backgroundColor": "#ffffff",
      "safeAreaWidth": 84,
      "safeAreaHeight": 40,
      "unit": "cm"
    },
    "elements": [
      { "type": "text", "text": "主标题文案", "color": "#ef0000", "x": 0.05, "y": 0.05, "width": 0.90, "height": 0.18 },
      { "type": "rect", "color": "#ef0000", "x": 0.00, "y": 0.82, "width": 1.00, "height": 0.18 },
      { "type": "image", "x": 0.20, "y": 0.22, "width": 0.60, "height": 0.52 }
    ],
    "bottomMeta": {
      "proofingNote": "请仔细确认版面，注意 logo、英文字幕、电话、二维码等内容校对无误。",
      "colorLegend": [
        { "label": "材料颜色", "value": "白色", "swatchColor": "#ffffff" },
        { "label": "印刷颜色", "value": "橙/红", "swatchColor": "#ef4444" }
      ]
    },
    "missingFields": [],
    "readyToGenerate": true
  }
}`;

export type AiSettings = {
  canvasApiKey: string;
  canvasBaseUrl: string;
  canvasModel: string;
  canvasTemperature: number;
  canvasMaxHistory: number;
  canvasSystemPrompt: string;
};

type AiSettingsRow = {
  id: number;
  canvas_api_key: string;
  canvas_base_url: string;
  canvas_model: string;
  canvas_temperature: number;
  canvas_max_history: number;
  canvas_system_prompt: string;
  updated_at: string;
};

const ensureAiSettingsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      canvas_api_key TEXT NOT NULL DEFAULT '',
      canvas_base_url TEXT NOT NULL DEFAULT '',
      canvas_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      canvas_temperature REAL NOT NULL DEFAULT 0.2,
      canvas_max_history INTEGER NOT NULL DEFAULT 6,
      canvas_system_prompt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const columns = db.prepare(`PRAGMA table_info(ai_settings)`).all() as Array<{ name: string }>;
  const columnNames = columns.map((column) => column.name);
  if (!columnNames.includes('canvas_api_key')) {
    db.exec(`ALTER TABLE ai_settings ADD COLUMN canvas_api_key TEXT NOT NULL DEFAULT '';`);
  }
  if (!columnNames.includes('canvas_base_url')) {
    db.exec(`ALTER TABLE ai_settings ADD COLUMN canvas_base_url TEXT NOT NULL DEFAULT '';`);
  }

  const row = db.prepare('SELECT id FROM ai_settings WHERE id = 1 LIMIT 1').get() as { id: number } | undefined;
  if (!row) {
    db.prepare(`
      INSERT INTO ai_settings (
        id, canvas_api_key, canvas_base_url, canvas_model, canvas_temperature, canvas_max_history, canvas_system_prompt, updated_at
      ) VALUES (
        1, @canvas_api_key, @canvas_base_url, @canvas_model, @canvas_temperature, @canvas_max_history, @canvas_system_prompt, @updated_at
      )
    `).run({
      canvas_api_key: process.env.OPENAI_API_KEY || '',
      canvas_base_url: process.env.OPENAI_API_BASE_URL || '',
      canvas_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      canvas_temperature: 0.2,
      canvas_max_history: 6,
      canvas_system_prompt: defaultCanvasSystemPrompt,
      updated_at: new Date().toISOString(),
    });
  }
};

ensureAiSettingsTable();

const mapAiSettings = (row: AiSettingsRow): AiSettings => ({
  canvasApiKey: row.canvas_api_key || '',
  canvasBaseUrl: row.canvas_base_url || '',
  canvasModel: row.canvas_model,
  canvasTemperature: Number(row.canvas_temperature),
  canvasMaxHistory: Number(row.canvas_max_history),
  canvasSystemPrompt: row.canvas_system_prompt,
});

export const getAiSettings = (): AiSettings => {
  const row = db.prepare('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1').get() as AiSettingsRow;
  return mapAiSettings(row);
};

export const saveAiSettings = (payload: Partial<AiSettings>) => {
  const current = getAiSettings();
  const next: AiSettings = {
    canvasApiKey: payload.canvasApiKey?.trim() ?? current.canvasApiKey,
    canvasBaseUrl: payload.canvasBaseUrl?.trim() ?? current.canvasBaseUrl,
    canvasModel: payload.canvasModel?.trim() || current.canvasModel,
    canvasTemperature: typeof payload.canvasTemperature === 'number' ? payload.canvasTemperature : current.canvasTemperature,
    canvasMaxHistory: typeof payload.canvasMaxHistory === 'number' ? payload.canvasMaxHistory : current.canvasMaxHistory,
    canvasSystemPrompt: payload.canvasSystemPrompt?.trim() || current.canvasSystemPrompt,
  };

  db.prepare(`
    UPDATE ai_settings SET
      canvas_api_key = @canvas_api_key,
      canvas_base_url = @canvas_base_url,
      canvas_model = @canvas_model,
      canvas_temperature = @canvas_temperature,
      canvas_max_history = @canvas_max_history,
      canvas_system_prompt = @canvas_system_prompt,
      updated_at = @updated_at
    WHERE id = 1
  `).run({
    canvas_api_key: next.canvasApiKey,
    canvas_base_url: next.canvasBaseUrl,
    canvas_model: next.canvasModel,
    canvas_temperature: next.canvasTemperature,
    canvas_max_history: next.canvasMaxHistory,
    canvas_system_prompt: next.canvasSystemPrompt,
    updated_at: new Date().toISOString(),
  });

  return getAiSettings();
};