import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dataDir = './data';
const dbPath = path.join(dataDir, 'design-projects.sqlite');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

export const defaultCanvasSystemPrompt = `你是保护垫画布设计助手。根据用户中文需求，生成可渲染的结构化画布 JSON。
只返回 JSON，不要 markdown，不要解释。
JSON 格式：
{
  "reply": "简短回复，说明已生成图片，不要提工作台",
  "draft": {
    "projectName": "名称",
    "canvas": { "width": 120, "height": 70, "backgroundColor": "#ffffff", "safeAreaWidth": 84, "safeAreaHeight": 40, "unit": "cm" },
    "elements": [
      { "type": "text", "text": "文字", "color": "#111111", "x": 0.15, "y": 0.12, "width": 0.7, "height": 0.14 },
      { "type": "rect", "color": "#ef0000", "x": 0.15, "y": 0.72, "width": 0.7, "height": 0.1 },
      { "type": "image", "x": 0.56, "y": 0.24, "width": 0.26, "height": 0.34 }
    ],
    "missingFields": [],
    "readyToGenerate": true
  }
}
坐标 x/y/width/height 是相对非留白安全区域的 0-1 比例。用户未说明尺寸时默认画布 120x70cm，非留白 84x40cm。用户提到白底只设置背景，不能影响红色标题/红色横条。`;

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