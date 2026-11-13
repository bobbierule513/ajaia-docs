# Architecture note

## Shape

```
Browser (React + TipTap)  ──fetch /api/*──▶  Express (one Node process)  ──▶  SQLite file (node:sqlite)
         ▲                                         │
         └────────── static build (dist/) ─────────┘
```

One deployable unit. In production Express serves the API and the built React app from the same origin, so there's no CORS, cookies just work, and deploying is one service.

## What I prioritised and why

1. **An editing experience that feels trustworthy.** TipTap (ProseMirror) gives solid rich text without me hand-rolling `contentEditable`. I spent the time on the parts users notice when they fail: debounced autosave with one request in flight at a time, a clear save-status indicator with Retry, a warning before closing the tab with unsaved changes, and **optimistic concurrency**. Every save sends the `version` it was based on, and the server answers `409` instead of silently overwriting someone else's newer save. That's a cheap, honest stand-in for real-time collaboration.

2. **Access control that's correct, not just visible.** Every document route goes through one `loadDoc(req, minRole)` helper that resolves `owner | editor | viewer` and enforces the minimum role. Docs you can't access return `404`, not `403`, so their existence isn't leaked. Owners manage sharing. Editors edit. Viewers read. I added roles (the "role-based sharing" stretch) because "can view" vs "can edit" is the first question anyone asks when sharing, and the extra cost was small once access went through one function.

3. **Import that produces real documents.** `.txt`, `.md` and `.docx` become new editable documents (mammoth for Word, marked for Markdown). Everything, from imports and from the editor, goes through the same server-side HTML allowlist that matches what the editor can render. That blocks stored XSS between users and keeps content consistent.

4. **Persistence with no setup friction.** `node:sqlite` (built into Node 22) means no native module builds, no external DB to provision, and reviewers can run it with `npm install && npm run dev`. Documents are stored as sanitised HTML: simple to render, diff and export, and it round-trips through TipTap without loss for the supported formatting.

## Data model

- `users(id, email, name)`: seeded demo accounts
- `sessions(token, user_id)`: random 256-bit token in an httpOnly, SameSite=Lax cookie
- `documents(id, owner_id, title, content, version, created_at, updated_at)`
- `document_shares(document_id, user_id, role ∈ {viewer, editor})`: composite primary key, cascade on delete

## Deliberate cuts

| Cut | Why | What I'd do |
| --- | --- | --- |
| Real-time co-editing (CRDT/OT) | The biggest time sink, and easy to get subtly wrong. Version-checked saves stop data loss in the meantime. | Yjs + y-prosemirror over a WebSocket, with Yjs updates persisted alongside HTML snapshots |
| Real authentication | The brief allows mocked users. Passwords would add risk without showing anything new. | OAuth/magic link. The session table and cookie handling are already in place |
| Durable hosting storage | Free hosts have ephemeral disks. Seeding on boot keeps the demo working. | Point `DB_FILE` at a mounted volume, or swap to Postgres (queries are plain SQL) |
| Attachments / images | Needs blob storage and a cleanup story | S3-compatible bucket + `attachments` table |
| Version history, comments, export | Stretch items. I chose roles instead | `document_versions` snapshot table |

## Testing

`server/test/api.test.js` (node:test + supertest, in-memory DB per test) covers the riskiest logic:
auth gating; create, rename, edit and reopen keeping formatting; validation and XSS stripping; stale-write `409`; the full share lifecycle across three users (owner, editor, viewer, plus revoke); and `.md` and `.docx` import, corrupt files and unsupported types.
The UI flows (create, format, rename, reload, share, view-only, import, phone layout) were checked by hand in a browser.
