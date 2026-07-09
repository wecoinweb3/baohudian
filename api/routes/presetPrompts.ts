import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import { getDbPath } from '../lib/dbPath.js';

const router = express.Router();

const dbPath = getDbPath();
const getDb = () => new Database(dbPath);

interface PresetPromptRow {
  id: string;
  title: string;
  description: string;
  prompt: string;
  thumbnail_url: string;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const ensureTable = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS preset_prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // 兼容旧表：若缺列则补上
  const cols = (db.prepare('PRAGMA table_info(preset_prompts)').all() as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes('thumbnail_url')) {
    db.exec('ALTER TABLE preset_prompts ADD COLUMN thumbnail_url TEXT NOT NULL DEFAULT ""');
  }
  if (!cols.includes('enabled')) {
    db.exec('ALTER TABLE preset_prompts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
  }
};

// GET /api/preset-prompts — 获取示例模板，可选只返回启用项
router.get('/', (req, res) => {
  try {
    const db = getDb();
    ensureTable(db);
    const enabledOnly = String(req.query.enabledOnly || '').trim() === 'true';
    const rows = enabledOnly
      ? db.prepare('SELECT * FROM preset_prompts WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC').all() as PresetPromptRow[]
      : db.prepare('SELECT * FROM preset_prompts ORDER BY sort_order ASC, created_at ASC').all() as PresetPromptRow[];
    db.close();
    res.json({
      success: true,
      presets: rows.map((row) => ({
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        thumbnailUrl: row.thumbnail_url,
        sortOrder: row.sort_order,
        enabled: row.enabled === 1,
      })),
    });
  } catch (error) {
    console.error('Failed to get preset prompts:', error);
    res.status(500).json({ success: false, error: 'Failed to get preset prompts' });
  }
});

// GET /api/preset-prompts/:id — 获取单个示例模板详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    ensureTable(db);
    const row = db.prepare('SELECT * FROM preset_prompts WHERE id = ? LIMIT 1').get(id) as PresetPromptRow | undefined;
    db.close();

    if (!row) {
      return res.status(404).json({ success: false, error: 'Preset prompt not found' });
    }

    res.json({
      success: true,
      preset: {
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        thumbnailUrl: row.thumbnail_url,
        sortOrder: row.sort_order,
        enabled: row.enabled === 1,
      },
    });
  } catch (error) {
    console.error('Failed to get preset prompt detail:', error);
    res.status(500).json({ success: false, error: 'Failed to get preset prompt detail' });
  }
});

// POST /api/preset-prompts — 新增或更新
router.post('/', (req, res) => {
  try {
    const { id, title, prompt, thumbnailUrl, sortOrder, enabled } = req.body;
    if (!title?.trim() || !prompt?.trim()) {
      return res.status(400).json({ success: false, error: 'title and prompt are required' });
    }
    const db = getDb();
    ensureTable(db);
    const now = new Date().toISOString();
    if (id) {
      const existing = db.prepare('SELECT id FROM preset_prompts WHERE id = ?').get(id);
      if (existing) {
        db.prepare('UPDATE preset_prompts SET title=?, prompt=?, thumbnail_url=?, sort_order=?, enabled=?, updated_at=? WHERE id=?')
          .run(title.trim(), prompt.trim(), thumbnailUrl?.trim() || '', sortOrder ?? 0, enabled === false ? 0 : 1, now, id);
      } else {
        db.prepare('INSERT INTO preset_prompts (id, title, prompt, thumbnail_url, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, title.trim(), prompt.trim(), thumbnailUrl?.trim() || '', sortOrder ?? 0, enabled === false ? 0 : 1, now, now);
      }
    } else {
      const newId = `preset_${Date.now()}`;
      db.prepare('INSERT INTO preset_prompts (id, title, prompt, thumbnail_url, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(newId, title.trim(), prompt.trim(), thumbnailUrl?.trim() || '', sortOrder ?? 0, enabled === false ? 0 : 1, now, now);
    }
    db.close();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save preset prompt:', error);
    res.status(500).json({ success: false, error: 'Failed to save preset prompt' });
  }
});

// DELETE /api/preset-prompts/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    ensureTable(db);
    db.prepare('DELETE FROM preset_prompts WHERE id = ?').run(id);
    db.close();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete preset prompt:', error);
    res.status(500).json({ success: false, error: 'Failed to delete preset prompt' });
  }
});

export default router;
