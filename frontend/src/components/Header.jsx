import React from 'react';
import '../css/Header.css';

export default function Header({ advice, onLogout, onDeleteAccount, user }) {
  

  return (
    <header className="header">
      <div className="status-row">
        <div className="status-pill status-live">Live</div>
        <div className="status-actions">
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
