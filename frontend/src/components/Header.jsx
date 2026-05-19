import React, { useEffect, useRef, useState } from 'react';

export default function Header({ advice, onLogin, onLogout, onDeleteAccount, user, theme, onToggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      setShowDeleteConfirm(false);
      setDeleteConfirmed(false);
    }
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="header">
      <div className="header-actions">
        <button onClick={onToggleTheme} className="primary-btn">
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
        {user ? (
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="primary-btn"
            >
              Profile
            </button>
            {menuOpen && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-item">
                  Logged in as <strong>{user.name}</strong>
                </div>
                <button
                  type="button"
                  className="secondary-btn logout-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  Logout
                </button>
                <div className="profile-dropdown-item profile-delete-section">
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      className="secondary-btn logout-btn danger-btn"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete Account
                    </button>
                  ) : (
                    <div className="delete-account-confirm">
                      <label className="confirm-delete-checkbox">
                        <input
                          type="checkbox"
                          checked={deleteConfirmed}
                          onChange={(e) => setDeleteConfirmed(e.target.checked)}
                        />
                        Confirm delete my account
                      </label>
                      <button
                        type="button"
                        className="secondary-btn danger-btn"
                        disabled={!deleteConfirmed}
                        onClick={() => {
                          setMenuOpen(false);
                          setShowDeleteConfirm(false);
                          setDeleteConfirmed(false);
                          onDeleteAccount();
                        }}
                      >
                        Delete Account
                      </button>
                      <button
                        type="button"
                        className="secondary-btn logout-btn"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmed(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
