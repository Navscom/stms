import React, { useState } from 'react';
import '../css/MapControlRight.css';

export default function MapControlRight({ user, onLogin, onLogout, onDeleteAccount, onToggleTheme, onResetMap, theme }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

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
          onMouseEnter={() => setHoveredButton('profile')}
          onMouseLeave={() => setHoveredButton(null)}
        >
          👤
          {hoveredButton === 'profile' && <div className="tooltip">Profile</div>}
        </button>

        {isProfileOpen && user && (
          <div className="profile-dropdown">
            <div className="profile-card">
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
                  {user.role && (
                    <div className="profile-badge">
                      {user.role === 'admin'
                        ? 'Local Admin'
                        : user.role === 'administrator'
                          ? 'Administrator'
                          : (user.role && typeof user.role === 'string' ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : user.role)}
                    </div>
                  )}
                </div>
              </div>
              <div className="profile-subtitle">Secure access to your account and settings.</div>
            </div>

            <div className="profile-actions">
              <button type="button" className="logout-btn" onClick={handleLogoutClick}>
                Sign out
              </button>
            </div>

            <div className="profile-delete-section">
              <div className="profile-delete-copy">This action permanently removes your account data.</div>
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
        )}
      </div>

      <button
        type="button"
        className="pill-btn"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        onMouseEnter={() => setHoveredButton('theme')}
        onMouseLeave={() => setHoveredButton(null)}
      >
        {theme === 'dark' ? '🌙' : '☀️'}
        {hoveredButton === 'theme' && <div className="tooltip">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</div>}
      </button>

      <button
        type="button"
        className="pill-btn"
        aria-label="Reset map view"
        onClick={onResetMap}
        onMouseEnter={() => setHoveredButton('reset')}
        onMouseLeave={() => setHoveredButton(null)}
      >
        🧭
        {hoveredButton === 'reset' && <div className="tooltip">Reset View</div>}
      </button>
    </div>
  );
}
