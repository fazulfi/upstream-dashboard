export default function Header({ title, context, live, updatedAt, onMenu }) {
  return (
    <header className="topbar">
      <button className="topbar-menu" onClick={onMenu} aria-label="Menu">☰</button>
      <div className="topbar-title">
        <div className="crumbs">{context || 'Dashboard'}</div>
        <h1>{title}</h1>
      </div>
      <div className="topbar-right">
        {live && (
          <span className="live-pill"><i />Live</span>
        )}
        <span className="updated tnum">{updatedAt ? `updated ${updatedAt}` : ''}</span>
      </div>
    </header>
  );
}
