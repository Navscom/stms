import React, { useState } from 'react';
import '../css/MapControlRight.css';

export default function MapControlRight({ user, onLogin, onLogout, onDeleteAccount, onToggleTheme, onResetMap, theme, avoidDanger = true, onToggleAvoidDanger = () => {} }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isAccountDeletionOpen, setIsAccountDeletionOpen] = useState(false);
  const [isAccountDeletionInfoOpen, setIsAccountDeletionInfoOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

  const toggleProfileMenu = () => {
    setIsProfileOpen((prev) => {
      if (prev) {
        setConfirmDelete(false);
        setIsAccountDeletionInfoOpen(false);
      }
      return !prev;
    });
  };

  const handleLogoutClick = () => {
    setIsProfileOpen(false);
    setConfirmDelete(false);
    setIsAccountSettingsOpen(false);
    setIsAccountDeletionOpen(false);
    setIsAccountDeletionInfoOpen(false);
    onLogout?.();
  };

  const handleDeleteAccountClick = () => {
    setIsProfileOpen(false);
    setConfirmDelete(false);
    setIsAccountSettingsOpen(false);
    setIsAccountDeletionOpen(false);
    setIsAccountDeletionInfoOpen(false);
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
          <svg
            className="profile-icon"
            viewBox="0 0 24 24"
            role="img"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="currentColor"
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
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
            </div>

            <div className="profile-actions">
              <button type="button" className="logout-btn" onClick={handleLogoutClick}>
                Sign out
              </button>
            </div>
            <div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setIsAccountSettingsOpen((s) => {
                    const next = !s;
                    if (!next) {
                      setIsAccountDeletionOpen(false);
                      setIsAccountDeletionInfoOpen(false);
                    }
                    return next;
                  });
                }}
                aria-expanded={isAccountSettingsOpen}
              >
                <span>Account Settings</span>
                <span className="caret">{isAccountSettingsOpen ? '▾' : '▸'}</span>
              </button>

              {isAccountSettingsOpen && (
                <div className="account-settings-dropdown">
                  <div className="account-item">
                    <button
                      type="button"
                      className="account-item-button info-toggle-btn"
                      onClick={() => setIsAccountDeletionInfoOpen((s) => !s)}
                      aria-expanded={isAccountDeletionInfoOpen}
                    >
                      <span>Info</span>
                      <span className="caret">{isAccountDeletionInfoOpen ? '▾' : '▸'}</span>
                    </button>
                    {isAccountDeletionInfoOpen && (
                      <div className="account-item-panel info-panel">
                        <div className="panel-title">Account Info</div>
                        <div className="panel-description">The email associated with your current account.</div>
                        <div className="info-row">
                          <span className="info-label">Email:</span>
                          <span className="info-value">{user.email || 'No email provided'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="account-item">
                    <button
                      type="button"
                      className="account-item-button"
                      onClick={() => {
                        setIsAccountDeletionOpen((s) => {
                          const next = !s;
                          return next;
                        });
                      }}
                      aria-expanded={isAccountDeletionOpen}
                    >
                      <span>Account Deletion</span>
                      <span className="caret">{isAccountDeletionOpen ? '▾' : '▸'}</span>
                    </button>

                    {isAccountDeletionOpen && (
                      <div className="account-item-panel deletion-panel">
                        <div className="panel-title">Account Deletion</div>
                        <div className="panel-description">Deleting your account permanently removes your profile and all stored data.</div>
                        <div className="profile-delete-copy">Please be sure you want to proceed before confirming.</div>
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
                    )}
                  </div>
                </div>
              )}
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
        onClick={onToggleAvoidDanger}
        aria-pressed={Boolean(avoidDanger)}
        aria-label={avoidDanger ? 'Avoid danger enabled' : 'Avoid danger disabled'}
        onMouseEnter={() => setHoveredButton('avoid')}
        onMouseLeave={() => setHoveredButton(null)}
      >
        {avoidDanger ? '🛡️' : '⚠️'}
        {hoveredButton === 'avoid' && <div className="tooltip">{avoidDanger ? 'Avoid danger: ON' : 'Avoid danger: OFF'}</div>}
      </button>

      {/* Routing UI moved to left panel */}

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
