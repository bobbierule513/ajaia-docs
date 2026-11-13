import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

export default function ShareDialog({ doc, onClose, onChange }) {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const shares = doc.shares ?? [];
  const toast = useToast();
  const inputRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    api.users().then(({ users }) => setUsers(users), () => {});
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sharedIds = new Set(shares.map((s) => s.id));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  async function run(fn, successMsg) {
    setBusy(true);
    setError('');
    try {
      const { shares } = await fn();
      onChange(shares);
      if (successMsg) toast(successMsg, 'success');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    if (await run(() => api.share(doc.id, target, role), `Shared with ${target}`)) setEmail('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="share-title">Share “{doc.title}”</h2>

        <form className="share-form" onSubmit={submit}>
          <input
            ref={inputRef}
            type="email"
            list="share-suggestions"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          <datalist id="share-suggestions">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name}
              </option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Permission">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !email.trim()}>
            Share
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {suggestions.length > 0 && (
          <p className="muted small">
            Demo users:{' '}
            {suggestions.map((u, i) => (
              <span key={u.id}>
                {i > 0 && ', '}
                <button type="button" className="link-btn" onClick={() => setEmail(u.email)}>
                  {u.email}
                </button>
              </span>
            ))}
          </p>
        )}

        <h3 className="small muted">People with access</h3>
        <ul className="share-list">
          <li>
            <span className="avatar">{doc.owner.name[0]}</span>
            <span className="share-who">
              {doc.owner.name} <span className="muted small">{doc.owner.email}</span>
            </span>
            <span className="muted small">Owner</span>
          </li>
          {shares.map((s) => (
            <li key={s.id}>
              <span className="avatar">{s.name[0]}</span>
              <span className="share-who">
                {s.name} <span className="muted small">{s.email}</span>
              </span>
              <select
                value={s.role}
                disabled={busy}
                onChange={(e) => run(() => api.share(doc.id, s.email, e.target.value))}
                aria-label={`Permission for ${s.name}`}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                className="icon-btn"
                disabled={busy}
                title={`Remove ${s.name}`}
                aria-label={`Remove ${s.name}`}
                onClick={() => run(() => api.unshare(doc.id, s.id), `Removed ${s.name}`)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
