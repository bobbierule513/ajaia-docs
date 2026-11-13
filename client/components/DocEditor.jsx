import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { api } from '../api.js';
import Header from './Header.jsx';
import Toolbar from './Toolbar.jsx';
import ShareDialog from './ShareDialog.jsx';
import { useToast } from './Toast.jsx';

const SAVE_DELAY_MS = 700;

const STATUS_TEXT = {
  idle: '',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Couldn’t save',
  conflict: 'Edited elsewhere',
};

/**
 * Debounced autosave with a single in-flight request at a time.
 * Title and content edits are merged into one PATCH that carries the
 * document version, so the server can reject stale writes (409).
 */
function useAutosave(docId, initialVersion, onConflict) {
  const [status, setStatus] = useState('idle');
  const pending = useRef({});
  const version = useRef(initialVersion);
  const inFlight = useRef(false);
  const timer = useRef(null);
  const blocked = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || blocked.current || Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus('saving');
    try {
      const { document } = await api.updateDoc(docId, { ...patch, version: version.current });
      version.current = document.version;
      setStatus(Object.keys(pending.current).length ? 'unsaved' : 'saved');
    } catch (err) {
      if (err.status === 409) {
        blocked.current = true;
        setStatus('conflict');
        onConflict(err.body.document);
      } else {
        pending.current = { ...patch, ...pending.current }; // keep it for retry
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
    }
    if (!blocked.current && Object.keys(pending.current).length) flush();
  }, [docId, onConflict]);

  const schedule = useCallback(
    (patch) => {
      Object.assign(pending.current, patch);
      if (blocked.current) return; // keep showing the conflict until the user loads the latest version
      setStatus('unsaved');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  const reset = useCallback((newVersion) => {
    version.current = newVersion;
    pending.current = {};
    blocked.current = false;
    setStatus('saved');
  }, []);

  // Warn before closing the tab with unsaved work; flush when leaving the editor.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (Object.keys(pending.current).length || inFlight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  return { status, schedule, flush, reset };
}

export default function DocEditor({ id, user, onLogout }) {
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.getDoc(id).then(
      ({ document }) => setDoc(document),
      (err) => setLoadError(err.status === 404 ? 'This document doesn’t exist or you don’t have access to it.' : err.message),
    );
  }, [id]);

  if (loadError) {
    return (
      <div className="page">
        <Header user={user} onLogout={onLogout} />
        <div className="center">
          <p>{loadError}</p>
          <a className="btn btn-primary" href="#/">
            Back to documents
          </a>
        </div>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="page">
        <Header user={user} onLogout={onLogout} />
        <div className="center muted">Loading document…</div>
      </div>
    );
  }
  return <LoadedEditor initialDoc={doc} user={user} onLogout={onLogout} />;
}

function LoadedEditor({ initialDoc, user, onLogout }) {
  const [doc, setDoc] = useState(initialDoc);
  const [title, setTitle] = useState(initialDoc.title);
  const [conflictDoc, setConflictDoc] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const savedTitle = useRef(initialDoc.title);
  const toast = useToast();
  const canEdit = doc.role !== 'viewer';

  const { status, schedule, flush, reset } = useAutosave(doc.id, doc.version, setConflictDoc);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      Placeholder.configure({ placeholder: canEdit ? 'Start writing…' : '' }),
    ],
    content: initialDoc.content,
    editable: canEdit,
    autofocus: canEdit ? 'end' : false,
    onUpdate: ({ editor }) => schedule({ content: editor.getHTML() }),
  });

  function onTitleChange(value) {
    setTitle(value);
    const t = value.trim();
    if (t && t.length <= 200) {
      savedTitle.current = t;
      schedule({ title: t });
    }
  }

  function onTitleBlur() {
    if (!title.trim()) {
      setTitle(savedTitle.current);
      toast('A document needs a title', 'error');
    }
    flush();
  }

  function loadLatest() {
    editor?.commands.setContent(conflictDoc.content, false);
    setTitle(conflictDoc.title);
    savedTitle.current = conflictDoc.title;
    setDoc((d) => ({ ...d, ...conflictDoc }));
    reset(conflictDoc.version);
    setConflictDoc(null);
  }

  return (
    <div className="page editor-page">
      <Header user={user} onLogout={onLogout}>
        <div className="title-wrap">
          <input
            className="title-input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            readOnly={!canEdit}
            maxLength={200}
            aria-label="Document title"
          />
          <span className={`save-status status-${status}`} aria-live="polite">
            {STATUS_TEXT[status]}
            {status === 'error' && (
              <button className="link-btn" onClick={flush}>
                Retry
              </button>
            )}
          </span>
        </div>
        <div className="editor-actions">
          {doc.role === 'owner' ? (
            <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
              Share{doc.shares?.length ? ` · ${doc.shares.length}` : ''}
            </button>
          ) : (
            <span className={`badge badge-${doc.role}`} title={`Owned by ${doc.owner.name}`}>
              {doc.role === 'editor' ? 'Can edit' : 'View only'} · {doc.owner.name}
            </span>
          )}
        </div>
      </Header>

      <Toolbar editor={editor} disabled={!canEdit} />

      {conflictDoc && (
        <div className="banner banner-warn">
          Someone else saved a newer version of this document while you were editing.
          <button className="btn btn-small" onClick={loadLatest}>
            Load latest version
          </button>
        </div>
      )}
      {!canEdit && (
        <div className="banner">
          You have view-only access to this document. Ask {doc.owner.name} for edit access.
        </div>
      )}

      <main className="canvas" onClick={() => editor?.commands.focus()}>
        <div className="paper" onClick={(e) => e.stopPropagation()}>
          <EditorContent editor={editor} />
        </div>
      </main>

      {shareOpen && (
        <ShareDialog
          doc={doc}
          onClose={() => setShareOpen(false)}
          onChange={(shares) => setDoc((d) => ({ ...d, shares }))}
        />
      )}
    </div>
  );
}
