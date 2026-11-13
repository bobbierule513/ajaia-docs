import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeContent, fileToDocument, MAX_UPLOAD_BYTES, SUPPORTED_EXTENSIONS } from './content.js';

const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 1024 * 1024; // 1 MB of HTML is plenty for this scope
const SESSION_COOKIE = 'ajaia_session';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db) {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Fly/etc. TLS-terminating proxies
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // ---------- data access helpers ----------
  const q = {
    userByEmail: db.prepare('SELECT id, email, name FROM users WHERE email = ? COLLATE NOCASE'),
    // Sessions are valid for the same 7 days as the cookie; older tokens are rejected server-side.
    userBySession: db.prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.created_at > datetime('now', '-7 days')`,
    ),
    allUsers: db.prepare('SELECT id, email, name FROM users ORDER BY name'),
    doc: db.prepare(
      `SELECT d.*, u.name AS owner_name, u.email AS owner_email
       FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`,
    ),
    shareRole: db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?'),
    shares: db.prepare(
      `SELECT u.id, u.email, u.name, s.role FROM document_shares s
       JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
    ),
    // List queries select only metadata columns: the list view never needs document content.
    ownedDocs: db.prepare(
      `SELECT d.id, d.owner_id, d.title, d.version, d.created_at, d.updated_at,
              u.name AS owner_name, u.email AS owner_email
       FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
    ),
    sharedDocs: db.prepare(
      `SELECT d.id, d.owner_id, d.title, d.version, d.created_at, d.updated_at,
              u.name AS owner_name, u.email AS owner_email, s.role
       FROM document_shares s JOIN documents d ON d.id = s.document_id JOIN users u ON u.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
    ),
    sharesForOwner: db.prepare(
      `SELECT s.document_id, u.id, u.email, u.name, s.role FROM document_shares s
       JOIN documents d ON d.id = s.document_id JOIN users u ON u.id = s.user_id
       WHERE d.owner_id = ? ORDER BY u.name`,
    ),
  };

  /** Returns 'owner' | 'editor' | 'viewer' | null */
  function roleFor(doc, userId) {
    if (!doc) return null;
    if (doc.owner_id === userId) return 'owner';
    return q.shareRole.get(doc.id, userId)?.role ?? null;
  }

  /** Load a document the current user can access, or throw 404 (we don't reveal existence). */
  function loadDoc(req, minRole = 'viewer') {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid document id');
    const doc = q.doc.get(id);
    const role = roleFor(doc, req.user.id);
    if (!role) throw new HttpError(404, 'Document not found');
    const rank = { viewer: 0, editor: 1, owner: 2 };
    if (rank[role] < rank[minRole]) {
      throw new HttpError(403, minRole === 'owner' ? 'Only the owner can do this' : 'You have view-only access');
    }
    return { doc, role };
  }

  function serializeDoc(doc, role, { includeContent = true, shares } = {}) {
    const out = {
      id: doc.id,
      title: doc.title,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      owner: { id: doc.owner_id, name: doc.owner_name, email: doc.owner_email },
      role,
    };
    if (includeContent) out.content = doc.content;
    if (role === 'owner') out.shares = shares ?? q.shares.all(doc.id);
    return out;
  }

  function validateTitle(title) {
    if (typeof title !== 'string') throw new HttpError(400, 'Title must be a string');
    const t = title.trim();
    if (!t) throw new HttpError(400, 'Title cannot be empty');
    if (t.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
    return t;
  }

  function validateContent(content) {
    if (typeof content !== 'string') throw new HttpError(400, 'Content must be a string');
    if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large (max 1 MB)');
    return sanitizeContent(content);
  }

  function createDocument(ownerId, title, content = '') {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)')
      .run(ownerId, title, content);
    return q.doc.get(Number(lastInsertRowid));
  }

  // ---------- auth (mocked: pick a seeded user, no password) ----------
  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) throw new HttpError(400, 'Email is required');
    const user = q.userByEmail.get(email);
    if (!user) throw new HttpError(401, 'Unknown user. Use one of the demo accounts.');
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.json({ user });
  });

  app.get('/api/auth/demo-users', (_req, res) => res.json({ users: q.allUsers.all() }));

  app.use('/api', (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const user = token && q.userBySession.get(token);
    if (!user) return next(new HttpError(401, 'Not signed in'));
    req.user = user;
    next();
  });

  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  app.get('/api/me', (req, res) => res.json({ user: req.user }));

  app.get('/api/users', (req, res) => {
    res.json({ users: q.allUsers.all().filter((u) => u.id !== req.user.id) });
  });

  // ---------- documents ----------
  app.get('/api/documents', (req, res) => {
    // One query for all share lists instead of one per owned document.
    const sharesByDoc = new Map();
    for (const { document_id, ...share } of q.sharesForOwner.all(req.user.id)) {
      if (!sharesByDoc.has(document_id)) sharesByDoc.set(document_id, []);
      sharesByDoc.get(document_id).push(share);
    }
    const owned = q.ownedDocs
      .all(req.user.id)
      .map((d) => serializeDoc(d, 'owner', { includeContent: false, shares: sharesByDoc.get(d.id) ?? [] }));
    const shared = q.sharedDocs.all(req.user.id).map((d) => serializeDoc(d, d.role, { includeContent: false }));
    res.json({ owned, shared });
  });

  app.post('/api/documents', (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    const content = req.body?.content === undefined ? '' : validateContent(req.body.content);
    res.status(201).json({ document: serializeDoc(createDocument(req.user.id, title, content), 'owner') });
  });

  app.post(
    '/api/documents/import',
    upload.single('file'),
    asyncRoute(async (req, res) => {
      if (!req.file) throw new HttpError(400, `Attach a file (${SUPPORTED_EXTENSIONS.join(', ')})`);
      const { title, html } = await fileToDocument(req.file);
      if (Buffer.byteLength(html) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Imported document is too large');
      res.status(201).json({ document: serializeDoc(createDocument(req.user.id, title, html), 'owner') });
    }),
  );

  app.get('/api/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(req);
    res.json({ document: serializeDoc(doc, role) });
  });

  app.patch('/api/documents/:id', (req, res) => {
    const { doc, role } = loadDoc(req, 'editor');
    const { title, content, version } = req.body ?? {};
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update');

    // Optimistic concurrency: if the client says which version it edited and
    // someone else saved in between, refuse instead of silently overwriting.
    if (version !== undefined && version !== doc.version) {
      return res.status(409).json({
        error: 'This document was changed by someone else. Reload to see the latest version.',
        document: serializeDoc(doc, role),
      });
    }

    const newTitle = title === undefined ? doc.title : validateTitle(title);
    const newContent = content === undefined ? doc.content : validateContent(content);
    db.prepare(
      `UPDATE documents SET title = ?, content = ?, version = version + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).run(newTitle, newContent, doc.id);
    res.json({ document: serializeDoc(q.doc.get(doc.id), role) });
  });

  app.delete('/api/documents/:id', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.status(204).end();
  });

  // ---------- sharing ----------
  app.put('/api/documents/:id/shares', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const role = req.body?.role ?? 'editor';
    if (!email) throw new HttpError(400, 'Email is required');
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor"');
    const target = q.userByEmail.get(email);
    if (!target) throw new HttpError(404, `No user with email ${email}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'You already own this document');
    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    ).run(doc.id, target.id, role);
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.delete('/api/documents/:id/shares/:userId', (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'Invalid user id');
    db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(doc.id, userId);
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // ---------- static client (production build) ----------
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  // ---------- errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message;
      return res.status(status).json({ error: msg });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message });
  });

  return app;
}
