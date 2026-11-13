// Persistence layer: SQLite via Node's built-in `node:sqlite` (Node >= 22.5).
// Chosen because it needs no native build step (works the same on Windows,
// macOS, Linux and Render) and a single file is easy to inspect and reset.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const SEED_USERS = [
  { id: 1, email: 'alice@ajaia.test', name: 'Alice Chen' },
  { id: 2, email: 'bob@ajaia.test', name: 'Bob Martinez' },
  { id: 3, email: 'carol@ajaia.test', name: 'Carol Singh' },
];

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS document_shares (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (document_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

const WELCOME_DOC = `
<h1>Welcome to Ajaia Docs</h1>
<p>This is a <strong>seeded document</strong> owned by Alice and shared with Bob as an <em>editor</em>.</p>
<h2>Try it out</h2>
<ul>
  <li>Format text with <strong>bold</strong>, <em>italic</em> and <u>underline</u></li>
  <li>Use headings and lists from the toolbar</li>
  <li>Click <strong>Share</strong> to give another user access</li>
</ul>
<ol>
  <li>Changes save automatically</li>
  <li>Refresh the page — everything is still here</li>
</ol>
`.trim();

export function openDb(file = process.env.DB_FILE || path.resolve('data', 'ajaia.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) insertUser.run(u.id, u.email, u.name);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents').get();
  if (n === 0) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)')
      .run(1, 'Welcome to Ajaia Docs', WELCOME_DOC);
    db.prepare("INSERT INTO document_shares (document_id, user_id, role) VALUES (?, 2, 'editor')").run(
      lastInsertRowid,
    );
  }
}
