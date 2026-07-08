import express from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const router = express.Router();
const dataDir = './data';
const dbPath = path.join(dataDir, 'design-projects.sqlite');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

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
  db.exec(`
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

const listProjectsStatement = db.prepare(`
  SELECT * FROM projects ORDER BY datetime(created_at) DESC;
`);

const getProjectByIdStatement = db.prepare(`
  SELECT * FROM projects WHERE id = ? LIMIT 1;
`);

const createProjectStatement = db.prepare(`
  INSERT INTO projects (
    id, name, thumbnail, width, height, unit, background_color,
    bleedless_width, bleedless_height, canvas_data, created_at, updated_at
  ) VALUES (
    @id, @name, @thumbnail, @width, @height, @unit, @background_color,
    @bleedless_width, @bleedless_height, @canvas_data, @created_at, @updated_at
  );
`);

const updateProjectStatement = db.prepare(`
  UPDATE projects SET
    name = @name,
    thumbnail = @thumbnail,
    width = @width,
    height = @height,
    unit = @unit,
    background_color = @background_color,
    bleedless_width = @bleedless_width,
    bleedless_height = @bleedless_height,
    canvas_data = @canvas_data,
    updated_at = @updated_at
  WHERE id = @id;
`);

const deleteProjectStatement = db.prepare(`
  DELETE FROM projects WHERE id = ?;
`);

router.get('/', (req, res) => {
  try {
    const rows = listProjectsStatement.all() as ProjectRow[];
    res.json({ projects: rows.map(mapProject) });
  } catch (error) {
    console.error('Failed to list projects:', error);
    res.status(500).json({ success: false, error: 'Failed to list projects' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = getProjectByIdStatement.get(req.params.id) as ProjectRow | undefined;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ project: mapProject(row) });
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

    createProjectStatement.run({
      id,
      name,
      thumbnail: '',
      width,
      height,
      unit,
      background_color: backgroundColor,
      bleedless_width: bleedlessWidth,
      bleedless_height: bleedlessHeight,
      canvas_data: JSON.stringify(canvasData),
      created_at: now,
      updated_at: now,
    });

    const row = getProjectByIdStatement.get(id) as ProjectRow | undefined;
    if (!row) {
      return res.status(500).json({ success: false, error: 'Failed to create project' });
    }

    res.json({ success: true, project: mapProject(row) });
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const now = new Date().toISOString();
    const width = Number(req.body.width || 1200);
    const height = Number(req.body.height || 700);
    const unit = req.body.unit || 'cm';
    const backgroundColor = req.body.backgroundColor || '#ffffff';
    const bleedlessWidth = Number(req.body.bleedlessWidth || 840);
    const bleedlessHeight = Number(req.body.bleedlessHeight || 400);
    const canvasData = req.body.canvasData || buildDefaultCanvasData({
      width,
      height,
      unit,
      backgroundColor,
      bleedlessWidth,
      bleedlessHeight,
    });

    const result = updateProjectStatement.run({
      id,
      name: req.body.name || '未命名项目',
      thumbnail: req.body.thumbnail || '',
      width,
      height,
      unit,
      background_color: backgroundColor,
      bleedless_width: bleedlessWidth,
      bleedless_height: bleedlessHeight,
      canvas_data: JSON.stringify(canvasData),
      updated_at: now,
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const row = getProjectByIdStatement.get(id) as ProjectRow | undefined;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({ success: true, project: mapProject(row) });
  } catch (error) {
    console.error('Failed to update project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    deleteProjectStatement.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;