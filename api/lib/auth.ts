import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dataDir = './data';
const dbPath = path.join(dataDir, 'design-projects.sqlite');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

type UserRow = {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'user';
  display_name: string;
  created_at: string;
};

export type AuthUser = {
  id: string;
  username: string;
  role: 'admin' | 'user';
  displayName: string;
};

const ensureUsersTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO users (id, username, password, role, display_name, created_at)
    VALUES (@id, @username, @password, @role, @display_name, @created_at)
    ON CONFLICT(id) DO UPDATE SET password = excluded.password
  `);

  upsert.run({
    id: 'user_admin',
    username: 'admin',
    password: '123456',
    role: 'admin',
    display_name: '系统管理员',
    created_at: now,
  });

  upsert.run({
    id: 'user_normal',
    username: 'user',
    password: '123456',
    role: 'user',
    display_name: '普通用户',
    created_at: now,
  });
};

ensureUsersTable();

const mapUser = (row: UserRow): AuthUser => ({
  id: row.id,
  username: row.username,
  role: row.role,
  displayName: row.display_name,
});

export const findUserByCredentials = (username: string, password: string): AuthUser | null => {
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1').get(username, password) as UserRow | undefined;
  return row ? mapUser(row) : null;
};