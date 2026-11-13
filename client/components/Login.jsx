import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.demoUsers().then(({ users }) => setUsers(users), () => {});
  }, []);

  async function submit(e, chosen = email) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await api.login(chosen);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden /> Ajaia Docs
        </div>
        <p className="muted">Sign in with a demo account. Authentication is mocked for this prototype — no password needed.</p>

        <div className="demo-users">
          {users.map((u) => (
            <button key={u.id} className="demo-user" disabled={busy} onClick={() => submit(null, u.email)}>
              <span className="avatar">{u.name[0]}</span>
              <span>
                <strong>{u.name}</strong>
                <br />
                <span className="muted small">{u.email}</span>
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="small muted" htmlFor="email">
            Or type an email
          </label>
          <div className="row">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@ajaia.test"
              required
            />
            <button className="btn btn-primary" disabled={busy}>
              Sign in
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
