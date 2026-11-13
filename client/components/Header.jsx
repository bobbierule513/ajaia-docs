export default function Header({ user, onLogout, children }) {
  return (
    <header className="topbar">
      <a href="#/" className="brand" title="All documents">
        <span className="brand-mark" aria-hidden /> Ajaia Docs
      </a>
      <div className="topbar-middle">{children}</div>
      <div className="topbar-user">
        <span className="avatar" title={user.email}>
          {user.name[0]}
        </span>
        <span className="hide-sm">{user.name}</span>
        <button className="btn btn-ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
