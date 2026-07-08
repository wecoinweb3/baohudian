import express from 'express';
import Database from 'better-sqlite3';
import { getDbPath } from '../lib/dbPath.js';

const router = express.Router();
const dbPath = getDbPath();
const db = new Database(dbPath);

interface ConversationRow {
  id: string;
  title: string;
  messages: string;
  created_at: string;
  updated_at: string;
}

const ensureDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

const mapConversation = (row: ConversationRow) => ({
  id: row.id,
  title: row.title,
  messages: JSON.parse(row.messages),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

ensureDatabase();

const listConversationsStatement = db.prepare(`
  SELECT * FROM conversations ORDER BY datetime(updated_at) DESC;
`);

const getConversationByIdStatement = db.prepare(`
  SELECT * FROM conversations WHERE id = ? LIMIT 1;
`);

const createConversationStatement = db.prepare(`
  INSERT INTO conversations (id, title, messages, created_at, updated_at)
  VALUES (@id, @title, @messages, @created_at, @updated_at);
`);

const updateConversationStatement = db.prepare(`
  UPDATE conversations
  SET title = @title,
      messages = @messages,
      updated_at = @updated_at
  WHERE id = @id;
`);

const deleteConversationStatement = db.prepare(`
  DELETE FROM conversations WHERE id = ?;
`);

router.get('/', (req, res) => {
  try {
    const rows = listConversationsStatement.all() as ConversationRow[];
    res.json({ conversations: rows.map(mapConversation) });
  } catch (error) {
    console.error('Failed to list conversations:', error);
    res.status(500).json({ success: false, error: 'Failed to list conversations' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = getConversationByIdStatement.get(req.params.id) as ConversationRow | undefined;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ conversation: mapConversation(row) });
  } catch (error) {
    console.error('Failed to get conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to get conversation' });
  }
});

router.post('/', (req, res) => {
  try {
    const now = new Date().toISOString();
    const id = `conversation_${Date.now()}`;

    createConversationStatement.run({
      id,
      title: req.body.title || '未命名对话',
      messages: JSON.stringify(req.body.messages || []),
      created_at: now,
      updated_at: now,
    });

    const row = getConversationByIdStatement.get(id) as ConversationRow | undefined;
    if (!row) {
      return res.status(500).json({ success: false, error: 'Failed to create conversation' });
    }

    res.json({ success: true, conversation: mapConversation(row) });
  } catch (error) {
    console.error('Failed to create conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const result = updateConversationStatement.run({
      id: req.params.id,
      title: req.body.title || '未命名对话',
      messages: JSON.stringify(req.body.messages || []),
      updated_at: new Date().toISOString(),
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const row = getConversationByIdStatement.get(req.params.id) as ConversationRow | undefined;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, conversation: mapConversation(row) });
  } catch (error) {
    console.error('Failed to update conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    deleteConversationStatement.run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

export default router;