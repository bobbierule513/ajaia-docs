# Submission

## Links

- **Live product:** https://ajaia-docs-chi-two.vercel.app
- **Walkthrough video:** in [`VIDEO_URL.txt`](VIDEO_URL.txt)

## Test accounts

No passwords. Pick a user on the sign-in screen:

- `alice@ajaia.test`: owns the seeded "Welcome to Ajaia Docs" doc
- `bob@ajaia.test`: has edit access to Alice's welcome doc
- `carol@ajaia.test`: no docs yet; use her to test view-only sharing

## What's included

| Item | Location |
| --- | --- |
| Source code | `server/` (Express API + SQLite), `client/` (React + TipTap), `package.json`, `vite.config.js` |
| Setup and run instructions | [`README.md`](README.md) |
| Architecture note | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| AI workflow note | [`AI_WORKFLOW.md`](AI_WORKFLOW.md) |
| Automated tests | `server/test/api.test.js` (14 tests, run with `npm test`) and `server/test/fixtures/quarterly-review.docx` |
| Deployment config | `vercel.json` and `server/vercel.js` (live demo on Vercel), `render.yaml`, `.nvmrc` |
| Walkthrough video URL | [`VIDEO_URL.txt`](VIDEO_URL.txt) |
| This file | `SUBMISSION.md` |

Generated folders (`node_modules/`, `dist/`, `data/`) are left out of the upload on purpose. `npm install` and `npm run build` recreate them, and `data/` is created on first run. Screenshots aren't included because setup needs no extra steps beyond `npm install && npm run dev`.

## Suggested review path (about 5 minutes)

1. Sign in as **Alice**. Create a blank document, rename it, and format it (bold, italic, underline, a heading, bulleted and numbered lists). Reload the page: the content and formatting are still there.
2. Import a `.md`, `.txt` or `.docx` file with the **Import a file** tile, or drag it onto the home page. It opens as a new editable document.
3. Click **Share** and add `carol@ajaia.test` as **Can view**.
4. Sign out and sign in as **Carol**. The document is under **Shared with me** and opens read-only.
5. Sign in as **Bob** and open "Welcome to Ajaia Docs". He can edit it but has no Share or Delete options.

## Status

**Working:** create, rename, edit, autosave and reopen documents; rich text (bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes); import from .txt, .md and .docx; sharing with Can edit or Can view roles, role changes and revoke; separate "My documents" and "Shared with me" lists; read-only mode for viewers; SQLite persistence; validation, HTML sanitisation and save-conflict detection.

**Incomplete or known limits:** auth is mocked. There's no real-time co-editing (concurrent edits are caught with a conflict banner instead). On the free hosting plan, documents created during review are lost when the service restarts. Seed data is always restored.

**Next 2–4 hours:** live updates and presence (SSE or Yjs), version history with restore, Markdown/PDF export, real auth with hosted Postgres, Playwright end-to-end tests.
