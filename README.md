# Ajaia Docs

A lightweight collaborative document editor: create, format, import, and share documents. Built for the Ajaia AI-Native Full Stack Developer assignment.

- **Live demo:** https://ajaia-docs-chi-two.vercel.app
- **Walkthrough video:** see [`VIDEO_URL.txt`](VIDEO_URL.txt)
- **Architecture note:** [`ARCHITECTURE.md`](ARCHITECTURE.md)
- **AI workflow note:** [`AI_WORKFLOW.md`](AI_WORKFLOW.md)

## Demo accounts

Auth is mocked: pick a user on the sign-in screen (no password).

| User | Email | Seeded data |
| --- | --- | --- |
| Alice Chen | `alice@ajaia.test` | Owns "Welcome to Ajaia Docs" |
| Bob Martinez | `bob@ajaia.test` | Has **edit** access to Alice's welcome doc |
| Carol Singh | `carol@ajaia.test` | Nothing yet. Use her to test view-only sharing |

**Quick sharing test:** sign in as Alice → open a doc → **Share** → add `carol@ajaia.test` as *Can view* → sign out → sign in as Carol → the doc is under **Shared with me** and opens read-only.

## Features

| Area | What works |
| --- | --- |
| Documents | Create, rename (click the title), edit, delete (owner only), reopen. Autosaves ~0.7 s after you stop typing, with a "Saving… / All changes saved / Couldn't save · Retry" indicator. |
| Rich text | Bold, italic, underline, strikethrough, Heading 1–3, bulleted and numbered lists, block quotes, undo/redo, clear formatting. Keyboard shortcuts (Ctrl/⌘+B/I/U) and Markdown-style shortcuts (`# `, `- `, `1. `) work too. |
| File import | Upload **.txt, .md or .docx (max 2 MB)** with the "Import a file" tile or by dropping a file onto the home page. Each file becomes a new editable document named after the file. Formatting is kept for headings, bold/italic and lists. Other file types are rejected with a clear message. |
| Sharing | Owner shares by email as **Can edit** or **Can view**, changes roles, and revokes access. The home page splits **My documents** from **Shared with me** (with role badge and owner). Viewers get a read-only editor and a banner. Non-owners can't delete or re-share. |
| Persistence | SQLite file (`data/ajaia.db`). Documents are stored as sanitised HTML, so formatting survives reloads. |
| Safety | Server-side HTML allowlist (no stored XSS), input validation (title, size, role, email), 404 instead of 403 for docs you can't see (doesn't reveal they exist), and optimistic concurrency (409 instead of silently overwriting a newer save). |

## Run locally

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`, so there is no native module to compile).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Vite serves the client with hot reload and proxies `/api` to the Express server on port 3001.

Production-style run (one process serves the API and the built client):

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:3001.

Run the tests:

```bash
npm test
```

The first run creates `data/ajaia.db` and seeds the demo users and the welcome doc. Delete the `data/` folder to reset. Set `DB_FILE` to store the database somewhere else and `PORT` to change the port.

> Node prints `ExperimentalWarning: SQLite is an experimental feature` on start. It's expected and harmless.

## Deploy

**Vercel (live demo):** `vercel.json` defines two services in one project: the Vite client, and the Express API (`server/vercel.js`) which receives every `/api/*` request. Pushing to `main` deploys. A function's filesystem is read-only apart from `/tmp`, so the SQLite file lives in `/tmp/ajaia.db`: it is per-instance and resets to the seed data whenever the instance is recycled, so the persistence caveat below applies here too.

**Render:** `render.yaml` describes a single free Render web service: **New → Blueprint →** select the repo. Build: `npm ci --include=dev && npm run build`. Start: `npm start`.

**Persistence caveat on free hosting:** Render's free plan has an ephemeral filesystem, so the SQLite file resets when the service restarts or redeploys (it also sleeps after ~15 min idle). Demo users and the welcome doc are re-seeded on boot, so the demo always works, but documents you create won't survive a restart. For durable storage, mount a persistent disk (Render paid, Fly.io or Railway volume) and set `DB_FILE=/data/ajaia.db`. No code changes needed.

## Project layout

```
server/
  index.js        entry point (port, DB)
  vercel.js       Vercel entry point (same app, exported as a function)
  app.js          Express app: auth, documents, sharing, import, static client
  db.js           schema + seed data (node:sqlite)
  content.js      HTML sanitising, .txt/.md/.docx → HTML
  test/           API tests (node:test + supertest) and a .docx fixture
client/
  App.jsx         session bootstrap + hash routing
  api.js          fetch wrapper
  components/     Login, DocList, DocEditor (+ autosave), Toolbar, ShareDialog, Toast
```

## Status

**Working end to end:** everything in the feature table, verified in the browser and covered by 14 API tests.

**Not built (intentional cuts):** real-time co-editing, comments, version history, export, real authentication, attachments/images.

**Next 2–4 hours:**
1. Live updates: poll or use SSE so open docs show others' edits and presence ("Bob is viewing"), instead of the current conflict banner.
2. Version history: snapshot every Nth save into a `document_versions` table, with a restore UI.
3. Export to Markdown/PDF.
4. Real auth (magic link or OAuth) and a hosted Postgres so data survives on free hosting.
5. Browser E2E tests (Playwright) for the editor and share flows.
