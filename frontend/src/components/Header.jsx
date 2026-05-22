import React, { useState } from 'react';
import '../css/Header.css';

export default function Header({ advice, onLogin, onLogout, onDeleteAccount, user, theme, onToggleTheme, onRequestLocation, locationMode }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleProfileMenu = () => {
    setIsProfileOpen((prev) => {
      if (prev) setConfirmDelete(false);
      return !prev;
    });
  };

  const handleLogoutClick = () => {
    setIsProfileOpen(false);
    setConfirmDelete(false);
    onLogout();
  };

  const handleDeleteAccountClick = () => {
    setIsProfileOpen(false);
    setConfirmDelete(false);
    onDeleteAccount();
  };

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
            <div className="profile-menu">
              <button type="button" className="secondary-btn" onClick={toggleProfileMenu}>
                {user.name ? user.name : 'Account'}
              </button>
              {isProfileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-item"><strong>{user.name || 'Logged in user'}</strong></div>
                  <div className="profile-dropdown-item">{user.email || 'No email available'}</div>
                  <button type="button" className="secondary-btn logout-btn" onClick={handleLogoutClick}>
                    Logout
                  </button>
                  <div className="profile-delete-section">
                    <div className="delete-account-confirm">
                      <label className="confirm-delete-checkbox">
                        <input
                          type="checkbox"
                          checked={confirmDelete}
                          onChange={(e) => setConfirmDelete(e.target.checked)}
                        />
                        Confirm delete account
                      </label>
                      <button
                        type="button"
                        className="secondary-btn danger-btn"
                        disabled={!confirmDelete}
                        onClick={handleDeleteAccountClick}
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
