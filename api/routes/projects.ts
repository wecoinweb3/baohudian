import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const router = express.Router();
const dataDir = './data';
const dbPath = path.join(dataDir, 'design-projects.sqlite');

interface ProjectRow {
  id: string;
  name: string;
  thumbnail?: string;
  width: number;
  height: number;
  unit: string;
  background_color: string;
  bleedless_width: number;
  bleedless_height: number;
  canvas_data: string;
  created_at: string;
  updated_at: string;
}

const ensureDatabase = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  runSql(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      thumbnail TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT 'cm',
      background_color TEXT NOT NULL DEFAULT '#ffffff',
      bleedless_width INTEGER NOT NULL,
      bleedless_height INTEGER NOT NULL,
      canvas_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

const escapeSql = (value: unknown) => String(value ?? '').replace(/'/g, "''");

const runSql = (sql: string) => {
  execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf-8' });
};

const querySql = <T>(sql: string): T[] => {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf-8' });
  if (!output.trim()) return [];
  return JSON.parse(output) as T[];
};

const mapProject = (row: ProjectRow) => ({
  id: row.id,
  name: row.name,
  thumbnail: row.thumbnail || '',
  width: Number(row.width),
  height: Number(row.height),
  unit: row.unit,
  backgroundColor: row.background_color,
  bleedlessWidth: Number(row.bleedless_width),
  bleedlessHeight: Number(row.bleedless_height),
  canvasData: JSON.parse(row.canvas_data),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const buildDefaultCanvasData = (params: {
  width: number;
  height: number;
  unit: string;
  backgroundColor: string;
  bleedlessWidth: number;
  bleedlessHeight: number;
}) => ({
  canvas: {
    width: params.width,
    height: params.height,
    unit: params.unit,
    backgroundColor: params.backgroundColor,
    safeArea: {
      width: params.bleedlessWidth,
      height: params.bleedlessHeight,
    },
  },
  elements: [],
});

ensureDatabase();

router.get('/', (req, res) => {
  try {
    const rows = querySql<ProjectRow>(`
      SELECT * FROM projects ORDER BY datetime(created_at) DESC;
    `);
    res.json({ projects: rows.map(mapProject) });
  } catch (error) {
    console.error('Failed to list projects:', error);
    res.status(500).json({ success: false, error: 'Failed to list projects' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = escapeSql(req.params.id);
    const rows = querySql<ProjectRow>(`SELECT * FROM projects WHERE id = '${id}' LIMIT 1;`);
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ project: mapProject(rows[0]) });
  } catch (error) {
    console.error('Failed to get project:', error);
    res.status(500).json({ success: false, error: 'Failed to get project' });
  }
});

router.post('/', (req, res) => {
  try {
    const now = new Date().toISOString();
    const id = `project_${Date.now()}`;
    const name = req.body.name || '未命名项目';
    const width = Number(req.body.width || 1200);
    const height = Number(req.body.height || 700);
    const unit = req.body.unit || 'cm';
    const backgroundColor = req.body.backgroundColor || '#ffffff';
    const bleedlessWidth = Number(req.body.bleedlessWidth || Math.round(width * 0.7));
    const bleedlessHeight = Number(req.body.bleedlessHeight || Math.round(height * 0.57));
    const canvasData = req.body.canvasData || buildDefaultCanvasData({
      width,
      height,
      unit,
      backgroundColor,
      bleedlessWidth,
      bleedlessHeight,
    });

    runSql(`
      INSERT INTO projects (
        id, name, thumbnail, width, height, unit, background_color,
        bleedless_width, bleedless_height, canvas_data, created_at, updated_at
      ) VALUES (
        '${escapeSql(id)}', '${escapeSql(name)}', '', ${width}, ${height}, '${escapeSql(unit)}',
        '${escapeSql(backgroundColor)}', ${bleedlessWidth}, ${bleedlessHeight},
        '${escapeSql(JSON.stringify(canvasData))}', '${now}', '${now}'
      );
    `);

    const rows = querySql<ProjectRow>(`SELECT * FROM projects WHERE id = '${escapeSql(id)}' LIMIT 1;`);
    res.json({ success: true, project: mapProject(rows[0]) });
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = escapeSql(req.params.id);
    const now = new Date().toISOString();
    const canvasData = req.body.canvasData || buildDefaultCanvasData({
      width: Number(req.body.width || 1200),
      height: Number(req.body.height || 700),
      unit: req.body.unit || 'cm',
      backgroundColor: req.body.backgroundColor || '#ffffff',
      bleedlessWidth: Number(req.body.bleedlessWidth || 840),
      bleedlessHeight: Number(req.body.bleedlessHeight || 400),
    });

    runSql(`
      UPDATE projects SET
        name = '${escapeSql(req.body.name || '未命名项目')}',
        thumbnail = '${escapeSql(req.body.thumbnail || '')}',
        width = ${Number(req.body.width || 1200)},
        height = ${Number(req.body.height || 700)},
        unit = '${escapeSql(req.body.unit || 'cm')}',
        background_color = '${escapeSql(req.body.backgroundColor || '#ffffff')}',
        bleedless_width = ${Number(req.body.bleedlessWidth || 840)},
        bleedless_height = ${Number(req.body.bleedlessHeight || 400)},
        canvas_data = '${escapeSql(JSON.stringify(canvasData))}',
        updated_at = '${now}'
      WHERE id = '${id}';
    `);

    const rows = querySql<ProjectRow>(`SELECT * FROM projects WHERE id = '${id}' LIMIT 1;`);
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, project: mapProject(rows[0]) });
  } catch (error) {
    console.error('Failed to update project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    runSql(`DELETE FROM projects WHERE id = '${escapeSql(req.params.id)}';`);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;