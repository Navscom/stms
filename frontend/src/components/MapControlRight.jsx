import React, { useState } from 'react';
import '../css/MapControlRight.css';

export default function MapControlRight({ user, onLogin, onLogout, onDeleteAccount, onToggleTheme, theme }) {
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
    onLogout?.();
  };

  const handleDeleteAccountClick = () => {
    setIsProfileOpen(false);
    setConfirmDelete(false);
    onDeleteAccount?.();
  };

  const initials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map((s) => s[0]).slice(0,2).join('').toUpperCase();
  };

  return (
    <div className="map-controls-right">
      <div className="profile-menu">
        <button
          type="button"
          className="pill-btn profile-toggle-btn"
          onClick={user ? toggleProfileMenu : onLogin}
          aria-label={user ? 'Open profile menu' : 'Login / Register'}
          title={user ? user.name || 'Account' : 'Login / Register'}
        >
          👤
        </button>

        {isProfileOpen && user && (
          <div className="profile-dropdown">
            <div className="profile-header">
              <div className="avatar-large">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name || 'User avatar'} />
                ) : (
                  <div className="avatar-large-fallback">{initials(user?.name)}</div>
                )}
              </div>
              <div className="profile-info">
                <div className="profile-name">{user.name || 'Account'}</div>
                <div className="profile-email">{user.email || 'No email provided'}</div>
                {user.role && <div className="profile-role">{user.role}</div>}
              </div>
            </div>

            <div className="profile-actions">
              <button type="button" className="logout-btn" onClick={handleLogoutClick}>
                Sign out
              </button>

              <div className="profile-delete-section">
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
                  className="danger-btn"
                  disabled={!confirmDelete}
                  onClick={handleDeleteAccountClick}
                >
                  Delete account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="pill-btn"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? '🌙' : '☀️'}
      </button>

      <button type="button" className="pill-btn" aria-label="Compass">
        🧭
      </button>
    </div>
  );
}
