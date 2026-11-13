import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import Header from './Header.jsx';
import { useToast } from './Toast.jsx';

const ACCEPT = '.txt,.md,.docx';

function formatDate(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function DocRow({ doc, shared, onDelete }) {
  return (
    <li className="doc-row">
      <a href={`#/doc/${doc.id}`} className="doc-link">
        <span className="doc-icon" aria-hidden />
        <span className="doc-title">{doc.title}</span>
      </a>
      <span className="doc-meta">
        {shared ? (
          <>
            <span className={`badge badge-${doc.role}`}>{doc.role === 'editor' ? 'Can edit' : 'View only'}</span>
            <span className="muted hide-sm">from {doc.owner.name}</span>
          </>
        ) : (
          doc.shares?.length > 0 && (
            <span className="badge badge-shared" title={doc.shares.map((s) => s.name).join(', ')}>
              Shared with {doc.shares.length}
            </span>
          )
        )}
        <span className="muted small">{formatDate(doc.updatedAt)}</span>
        {!shared && (
          <button className="icon-btn" title="Delete document" aria-label={`Delete ${doc.title}`} onClick={() => onDelete(doc)}>
            ✕
          </button>
        )}
      </span>
    </li>
  );
}

export default function DocList({ user, onLogout }) {
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const toast = useToast();

  const load = useCallback(() => {
    api.listDocs().then(setDocs, (err) => toast(err.message, 'error'));
  }, [toast]);
  useEffect(load, [load]);

  async function createDoc() {
    setBusy(true);
    try {
      const { document } = await api.createDoc();
      navigate(`/doc/${document.id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const { document } = await api.importDoc(file);
      toast(`Imported “${file.name}”`, 'success');
      navigate(`/doc/${document.id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function deleteDoc(doc) {
    if (!window.confirm(`Delete “${doc.title}”? This can't be undone and removes access for everyone it's shared with.`)) return;
    try {
      await api.deleteDoc(doc.id);
      toast('Document deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="page">
      <Header user={user} onLogout={onLogout} />
      <main
        className={`home ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Ignore leave events caused by moving onto a child element.
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          importFile(e.dataTransfer.files?.[0]);
        }}
      >
        <section className="start">
          <button className="tile tile-new" onClick={createDoc} disabled={busy}>
            <span className="tile-plus">+</span>
            <span>Blank document</span>
          </button>
          <button className="tile" onClick={() => fileInput.current?.click()} disabled={busy}>
            <span className="tile-plus">⇪</span>
            <span>Import a file</span>
            <span className="muted small">.txt, .md or .docx · max 2 MB</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => importFile(e.target.files?.[0])}
          />
          <p className="muted small drop-hint">Tip: you can also drop a file anywhere on this page.</p>
        </section>

        {!docs ? (
          <p className="muted">Loading documents…</p>
        ) : (
          <>
            <section>
              <h2 className="section-title">My documents</h2>
              {docs.owned.length === 0 ? (
                <p className="empty">You haven't created any documents yet.</p>
              ) : (
                <ul className="doc-list">
                  {docs.owned.map((d) => (
                    <DocRow key={d.id} doc={d} onDelete={deleteDoc} />
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="section-title">Shared with me</h2>
              {docs.shared.length === 0 ? (
                <p className="empty">Nothing has been shared with you yet.</p>
              ) : (
                <ul className="doc-list">
                  {docs.shared.map((d) => (
                    <DocRow key={d.id} doc={d} shared />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
