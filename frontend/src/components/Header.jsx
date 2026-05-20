export default function Header({ advice, onLogin, onLogout, user, theme, onToggleTheme, onUseLocation }) {
  return (
    <header className="header">

      {/* ── Top bar: brand · spacer · actions ── */}
      <div className="header-top">

        <a className="header-brand" href="#">
          <img className="header-brand-icon" src="/icons.svg" alt="Smart Tourism AI" />
          <span className="header-brand-name">Smart Tourism AI</span>
        </a>

        <div className="header-spacer" />

        <div className="live-badge">
          <div className="live-dot" />
          <span>Live</span>
        </div>

        <div className="header-actions">
          {/* Theme toggle */}
          <div className="theme-toggle-wrap" onClick={onToggleTheme}>
            <span className="theme-toggle-label">
              {theme === 'light' ? 'Light' : 'Dark'}
            </span>
            <div className="t-track"><div className="t-thumb" /></div>
          </div>

          {/* Location button */}
          <button onClick={onUseLocation} className="secondary-btn">
            📍 My Location
          </button>

          {/* Auth button */}
          {user ? (
            <button onClick={onLogout} className="primary-btn">
              Logout {user.name}
            </button>
          ) : (
            <button onClick={onLogin} className="primary-btn">
              Login / Register
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom bar: title · subtitle · AI card ── */}
      <div className="header-bottom">
        <h1>Smart Tourism Management System</h1>
        <p className="subtitle">AI-Based Geolocation Guidance and Crowd Monitoring</p>
        <div className="ai-card">
          <strong>AI:</strong>
          <span>{advice}</span>
        </div>
      </div>

    </header>
  );
}
