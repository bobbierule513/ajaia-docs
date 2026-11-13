# AI workflow note

> Draft. Edit this to reflect your own decisions and review before submitting.

## Tools used

- **Claude Code (Claude desktop app, Code tab)** as a pair programmer: scaffolding, writing the server, client and tests, driving a browser to check the UI, and drafting these docs.
- Its built-in browser pane to click through the real app (sign-in, editing, sharing as different users, import, phone layout).

## Where AI materially sped things up

- **Boilerplate and wiring:** Express routes, the SQLite schema, the fetch wrapper, React components and CSS came together in minutes instead of hours.
- **Test scaffolding:** the supertest suite, especially the multi-user share lifecycle (owner, editor, viewer, revoke), which is tedious to write by hand.
- **Fixtures:** generating a minimal valid `.docx` so `.docx` import is tested automatically, not just by hand.
- **Browser checks:** scripted clicks plus DOM reads confirmed that formatting actually persisted after a full reload, not just that the UI looked right.

## What I changed or rejected

- **Rejected `better-sqlite3`.** Native builds are fragile on Windows and some hosts. Switched to Node 22's built-in `node:sqlite`.
- **Rejected storing editor HTML as-is.** Added a server-side allowlist sanitiser so one user can't store script for another. A test asserts `<script>` and `onerror` are stripped.
- **Rejected last-write-wins saves.** Added version-checked saves (409 on conflict) and a "Load latest version" banner.
- **Fixed bugs found while verifying:**
  - The new-document editor wasn't focused, so the first keystrokes went nowhere. Added autofocus.
  - The share dialog re-ran its focus/keyboard effect on every render, which stole focus after each share. Stabilised it with a ref.
  - The test script's directory path didn't work with `node --test` on Windows. Switched to a glob.
  - Building the `.docx` fixture with PowerShell's zip produced a file Word readers rejected. Rebuilt it with jszip.
- **Scope pushback:** chose role-based sharing as the one stretch item and skipped real-time collaboration, version history and comments.

## How I verified correctness, UX and reliability

- **Automated:** 14 API tests (`npm test`) cover auth, CRUD and formatting round-trip, validation and XSS, concurrency conflicts, permissions across three users, and import (md, docx, corrupt, unsupported).
- **Manual, in a real browser:** created a doc, used toolbar and keyboard formatting, renamed it, did a full reload and checked the stored HTML, shared it with Carol as view-only, signed in as Carol to confirm it appears under "Shared with me" and is read-only, imported a Markdown file by drag-and-drop, checked the error for an unsupported file, and checked the 375 px phone layout. Also checked: italic, underline and numbered list from the toolbar; Markdown typing shortcuts (`# `, `- `, `1. `); Bob editing Alice's shared doc with no Share or Delete options; and the save-conflict banner plus "Load latest version" after a write from another tab.
- **Review:** read every generated file before keeping it, with extra attention on the access-control helper (`loadDoc`) and the autosave queue, the two places where subtle bugs would hurt users most.
