import React from 'react';

export default function Header({ advice, onLogin, onLogout, user, theme, onToggleTheme, onRequestLocation, locationMode }) {
  return (
    <header className="header">
      <div className="status-row">
        <div className="status-pill status-live">Live</div>
        <div className="status-actions">
          <button className={locationMode ? 'secondary-btn active' : 'secondary-btn'} onClick={onRequestLocation}>
            My Location
          </button>
          <button className="secondary-btn" onClick={onToggleTheme}>
            {theme === 'light' ? 'Light' : 'Dark'}
          </button>
          {user ? (
            <button className="secondary-btn" onClick={onLogout}>Logout</button>
          ) : (
            <button className="secondary-btn" onClick={onLogin}>Login / Register</button>
          )}
        </div>
      </div>

      <div className="title-row">
        <div>
          <h1>Smart Tourism Management System</h1>
          <p className="subtitle">AI-Based Geolocation Guidance and Crowd Monitoring</p>
        </div>
      </div>
      
    </header>
  );
}
