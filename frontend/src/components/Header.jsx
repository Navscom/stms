export default function Header({ advice, onLogin, onLogout, user, theme, onToggleTheme, onUseLocation }) {
  return (
    <header className="header">
      <div className="header-actions">
        <button onClick={onToggleTheme} className="primary-btn">
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
        <button onClick={onUseLocation} className="secondary-btn">📍 Use My Location</button>
        {user ? (
          <button onClick={onLogout} className="primary-btn">Logout {user.name}</button>
        ) : (
          <button onClick={onLogin} className="primary-btn">Login / Register</button>
        )}
      </div>
      <h1>Smart Tourism Management System</h1>
      <p className="subtitle">AI-Based Geolocation Guidance and Crowd Monitoring</p>
      <div className="ai-card"><strong>AI Insight:</strong> {advice}</div>
    </header>
  );
}
