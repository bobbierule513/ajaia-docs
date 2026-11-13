import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import DocList from './components/DocList.jsx';
import DocEditor from './components/DocEditor.jsx';
import { ToastProvider } from './components/Toast.jsx';

// Tiny hash router: "#/" = document list, "#/doc/42" = editor.
function useHashRoute() {
  const parse = () => {
    const m = window.location.hash.match(/^#\/doc\/(\d+)/);
    return m ? { name: 'doc', id: Number(m[1]) } : { name: 'list' };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const navigate = (hash) => {
  window.location.hash = hash;
};

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const route = useHashRoute();

  useEffect(() => {
    api.me().then(({ user }) => setUser(user), () => setUser(null));
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/');
  }, []);

  let body;
  if (user === undefined) body = <div className="center muted">Loading…</div>;
  else if (!user) body = <Login onLogin={setUser} />;
  else if (route.name === 'doc') body = <DocEditor key={route.id} id={route.id} user={user} onLogout={logout} />;
  else body = <DocList user={user} onLogout={logout} />;

  return <ToastProvider>{body}</ToastProvider>;
}
