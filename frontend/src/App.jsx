import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';

const API = 'http://127.0.0.1:8000';
const MARKER_TYPES = ['Danger Area', 'Dark Area', 'Crowdy Area', 'Dangerous Animals', 'Hazard on Area'];
const DEFAULT_MARKER_FORM = { title: '', severity: 'Moderate', radius_meters: '', description: '', duration_days: '', duration_hours: '' };

async function fetchJson(path, options) {
  const response = await fetch(`${API}${path}`, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || 'Server error.');
  }
  return payload;
}

function App() {
  const [advice, setAdvice] = useState('Click anywhere in the Philippines for AI geolocation guidance.');
  const [nearest, setNearest] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [dangerPins, setDangerPins] = useState([]);
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [lastClickLocation, setLastClickLocation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [pinMode, setPinMode] = useState(false);
  const [locationMode, setLocationMode] = useState(false);
  const [showDestinations, setShowDestinations] = useState(true);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem('stms_user')) || null;
    } catch {
      return null;
    }
  });
  const [report, setReport] = useState(null);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [captchaWarning, setCaptchaWarning] = useState('');
  const [markerWarning, setMarkerWarning] = useState('');
  const [selectedMarkerType, setSelectedMarkerType] = useState('Danger Area');
  const [pendingMarkerLocation, setPendingMarkerLocation] = useState(null);
  const [markerForm, setMarkerForm] = useState(DEFAULT_MARKER_FORM);
  const [loginPromptMessage, setLoginPromptMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => setShowNotification(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  useEffect(() => {
    if (user) {
      window.sessionStorage.setItem('stms_user', JSON.stringify(user));
    } else {
      window.sessionStorage.removeItem('stms_user');
    }
  }, [user]);

  const loadDestinations = async () => {
    setDestinations((await fetchJson('/destinations')) || []);
  };

  const loadDangerPins = async () => {
    setDangerPins((await fetchJson('/danger-pins')) || []);
  };

  const loadReport = async () => {
    setReport((await fetchJson('/reports/summary')) || null);
  };

  useEffect(() => {
    loadDestinations();
    loadDangerPins();
    loadReport();
  }, []);

  const checkSafety = async (lat, lng) => {
    const data = await fetchJson(`/safety-check?lat=${lat}&lng=${lng}`);
    setNearbyDangers(data.nearby_dangers || []);
    return data;
  };

  const fetchAdvice = async (lat, lng) => {
    setSelectedLocation({ lat, lng });
    setAdvice('Analyzing location, nearby spots, crowd condition, and safety warnings...');

    try {
      const adviceData = await fetchJson(`/ai-advice?lat=${lat}&lng=${lng}`);
      const safety = await checkSafety(lat, lng);
      setAdvice(`${adviceData.advice} ${safety.alerts?.join(' ') || ''}`);
      setNearest(adviceData.nearest_destinations || []);
      setNearbyDangers(adviceData.nearby_dangers || []);
    } catch (error) {
      setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
    }
  };

  const startMarkerPlacement = (lat, lng) => {
    if (!user) {
      setLoginPromptMessage('You need to login first before adding a new marker.');
      setIsModalOpen(true);
      setPinMode(false);
      return;
    }
    if (!selectedMarkerType) {
      alert('Please choose a marker type first.');
      return;
    }
    setPendingMarkerLocation({ lat, lng });
    setMarkerForm(DEFAULT_MARKER_FORM);
  };

  const submitMarker = async (e) => {
    e.preventDefault();
    if (!user) {
      setLoginPromptMessage('You need to login first before adding a new marker.');
      setIsModalOpen(true);
      return;
    }
    if (!captchaChecked) {
      setCaptchaWarning('Check the CAPTCHA box before submitting your marker.');
      return;
    }
    setCaptchaWarning('');
    if (!pendingMarkerLocation) {
      alert('Click the map location first.');
      return;
    }
    if (!markerForm.description.trim()) {
      setMarkerWarning('Description is required. Explain why you put this marker.');
      return;
    }

    // Calculate total duration in hours from days and hours
    const days = Number(markerForm.duration_days || 0);
    const hours = Number(markerForm.duration_hours || 0);
    const totalHours = days * 24 + hours;

    if (totalHours < 1) {
      setMarkerWarning('Please specify at least 1 hour of duration.');
      return;
    }

    setMarkerWarning('');
    try {
      await fetchJson('/danger-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: markerForm.title || selectedMarkerType,
          danger_type: selectedMarkerType,
          lat: pendingMarkerLocation.lat,
          lng: pendingMarkerLocation.lng,
          severity: markerForm.severity,
          radius_meters: Number(markerForm.radius_meters || 300),
          duration_hours: totalHours,
          description: markerForm.description,
          reported_by: user?.name || 'Anonymous Tourist',
        }),
      });

      await loadDangerPins();
      await loadReport();
      setPendingMarkerLocation(null);
      setMarkerForm(DEFAULT_MARKER_FORM);
      setShowNotification(true);
      setAdvice(`${selectedMarkerType} marker added successfully. Other users can now see and comment on it.`);
    } catch (error) {
      alert(error.message);
    }
  };

  const addMarkerComment = async (pinId, comment) => {
    try {
      const res = await fetch(`${API}/danger-pins/${pinId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment,
          commented_by: user?.name || 'Anonymous Tourist',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Unable to add comment.');
      await loadDangerPins();
      setAdvice('Comment added to marker.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deletePin = async (pinId) => {
    try {
      const res = await fetch(`${API}/danger-pins/${pinId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Unable to delete marker.');
      await loadDangerPins();
      setAdvice('Your marker was deleted successfully.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMapClick = (lat, lng) => {
    if (pinMode) return startMarkerPlacement(lat, lng);
    if (locationMode) {
      setAdvice('My Location ON. Turn it off to select another spot.');
      return;
    }
    setLastClickLocation({ lat, lng });
    return fetchAdvice(lat, lng);
  };

  const togglePinMode = () => {
    if (!user) {
      setLoginPromptMessage('You need to login first before adding a new marker.');
      setIsModalOpen(true);
      return;
    }
    setPendingMarkerLocation(null);
    setPinMode((prev) => {
      const next = !prev;
      if (next) {
        setShowDestinations(false);
        if (lastClickLocation) {
          startMarkerPlacement(lastClickLocation.lat, lastClickLocation.lng);
        }
      }
      return next;
    });
  };

  const toggleShowDestinations = () => {
    setPinMode(false);
    setShowDestinations((prev) => !prev);
  };

  const toggleLocationMode = () => {
    if (locationMode) {
      setLocationMode(false);
      setAdvice('Location mode is off. Click the map to select another spot.');
      return;
    }

    if (!navigator.geolocation) {
      setAdvice('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationMode(true);
        setShowDestinations(false);
        await fetchAdvice(pos.coords.latitude, pos.coords.longitude);
        setAdvice('My Location ON');
      },
      () => setAdvice('Location permission denied. You can still click on the map.')
    );
  };

  const handleSelectDestination = (destination) => {
    if (selectedDestinationId === destination.id) {
      setSelectedDestinationId(null);
      setSelectedLocation(null);
      setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
      return;
    }

    setSelectedDestinationId(destination.id);
    setSelectedLocation({ lat: destination.lat, lng: destination.lng });
    setAdvice(`Showing ${destination.name} on the map. Click the map for AI safety advice.`);
  };

  const clearSelectedDestination = () => {
    setSelectedDestinationId(null);
    setSelectedLocation(null);
    setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsModalOpen(false);
    setLoginPromptMessage('');
  };

  const handleLogout = () => {
    setUser(null);
    setIsModalOpen(false);
    setPinMode(false);
    setPendingMarkerLocation(null);
    setLoginPromptMessage('');
  };

  const handleDeleteAccount = async () => {
    if (!user?.email) {
      setAdvice('Unable to delete account: no logged in user.');
      return;
    }

    try {
      await fetchJson('/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      window.localStorage.removeItem('stms_remembered_login');
      setUser(null);
      setIsModalOpen(false);
      setPinMode(false);
      setPendingMarkerLocation(null);
      setLoginPromptMessage('Your account has been deleted.');
      setAdvice('Your account has been deleted. Login or register again to continue.');
    } catch (error) {
      setAdvice(error.message || 'Failed to delete account.');
    }
  };

  const closeLoginModal = () => {
    setIsModalOpen(false);
    setLoginPromptMessage('');
  };

  return (
    <div className="app-shell">
      {showNotification && (
        <div className="notification-overlay">
          <div className="notification-success">
            <span className="notification-icon">✓</span>
            <span className="notification-text">Marker Successfully Added</span>
          </div>
        </div>
      )}
      <Header
        advice={advice}
        theme={theme}
        user={user}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onRequestLocation={toggleLocationMode}
        locationMode={locationMode}
        onLogin={() => setIsModalOpen(true)}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />

      <section className="dashboard-grid">
        <aside className="side-nav">
          <button
            className={pinMode ? 'nav-action nav-action-icon active' : 'nav-action nav-action-icon'}
            onClick={togglePinMode}
            type="button"
            title="Add Marker"
            aria-label="Add Marker"
          >
            📌
          </button>
          <button
            className={locationMode ? 'nav-action nav-action-icon active' : 'nav-action nav-action-icon'}
            onClick={toggleLocationMode}
            type="button"
            title="My Location"
            aria-label="My Location"
          >
            📍
          </button>
          <button
            className={showDestinations ? 'nav-action nav-action-icon active' : 'nav-action nav-action-icon'}
            onClick={toggleShowDestinations}
            type="button"
            title="Destinations"
            aria-label="Destinations"
          >
            🧭
          </button>
        </aside>

        <div className="map-panel">
          <div className="map-card">
            <MapView
              destinations={destinations.filter((d) => !selectedDestinationId || d.id === selectedDestinationId)}
              dangerPins={dangerPins}
              nearbyDangers={nearbyDangers}
              selectedLocation={selectedLocation}
              pendingMarkerLocation={pendingMarkerLocation}
              selectedMarkerType={selectedMarkerType}
              user={user}
              onLocationClick={handleMapClick}
              onAddComment={addMarkerComment}
              onDeletePin={deletePin}
            />
          </div>
        </div>

        <aside className="destination-panel-wrapper">
          {pinMode ? (
            <div className="marker-panel">
              <h2>Add Safety Marker</h2>
              <p>Choose a marker type and click the map to place it. Then submit the marker with the details below.</p>

              <form className="marker-form" onSubmit={submitMarker}>
                <label>
                  <strong>Marker type</strong>
                  <select value={selectedMarkerType} onChange={(e) => setSelectedMarkerType(e.target.value)}>
                    {MARKER_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <strong>Marker title</strong>
                  <input
                    type="text"
                    value={markerForm.title}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Optional title"
                  />
                </label>

                <label>
                  <strong>Severity</strong>
                  <select
                    value={markerForm.severity}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, severity: e.target.value }))}
                  >
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </label>

                <label>
                  <strong>Radius / area affected (meters)</strong>
                  <input
                    type="number"
                    min="20"
                    max="5000"
                    value={markerForm.radius_meters}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
                    placeholder="20 - 5000"
                  />
                </label>

                <div className="marker-form" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label>
                    <strong>Days</strong>
                    <input
                      type="number"
                      min="0"
                      value={markerForm.duration_days}
                      onChange={(e) => setMarkerForm((prev) => ({ ...prev, duration_days: e.target.value }))}
                      placeholder="Days"
                    />
                  </label>
                  <label>
                    <strong>Hours</strong>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={markerForm.duration_hours}
                      onChange={(e) => setMarkerForm((prev) => ({ ...prev, duration_hours: e.target.value }))}
                      placeholder="Hours"
                    />
                  </label>
                </div>

                <label>
                  <strong>Description</strong>
                  <textarea
                    value={markerForm.description}
                    onChange={(e) => setMarkerForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe why this marker is needed"
                  />
                </label>

                <div className="captcha-box">
                  <input
                    id="marker-captcha"
                    type="checkbox"
                    checked={captchaChecked}
                    onChange={(e) => setCaptchaChecked(e.target.checked)}
                  />
                  <label htmlFor="marker-captcha" className="captcha-label">
                    Please note: the information given is being used by authority. Check the box if you understand and confirm the information is true.
                  </label>
                </div>
                {captchaWarning && <div className="captcha-warning">{captchaWarning}</div>}

                <div>
                  <p><strong>Selected location:</strong> {pendingMarkerLocation ? `${pendingMarkerLocation.lat.toFixed(6)}, ${pendingMarkerLocation.lng.toFixed(6)}` : 'Click the map to place your marker.'}</p>
                </div>

                <button className="primary-btn" type="submit" disabled={!pendingMarkerLocation}>
                  Submit Marker
                </button>
              </form>
            </div>
          ) : showDestinations ? (
            <DestinationList
              destinations={destinations}
              nearest={nearest}
              selectedDestinationId={selectedDestinationId}
              onSelectDestination={handleSelectDestination}
              onClearSelection={clearSelectedDestination}
              inline
            />
          ) : (
            <div className="destination-hidden-card">
              <h2>Tourist Destinations</h2>
              <p>Turn on destinations to view local attractions and crowd levels.</p>
            </div>
          )}
          {selectedDestinationId && nearbyDangers.length === 0 && (
            <div className="destination-safety-note success">No danger markers nearby.</div>
          )}
          {selectedDestinationId && nearbyDangers.length > 0 && (
            <div className="destination-safety-note warning">Danger markers detected nearby.</div>
          )}
        </aside>
      </section>

      <section className="warning-panel">
        <h2>Safety Alerts</h2>
        {nearbyDangers.length === 0 ? <p>No nearby marker report detected.</p> : nearbyDangers.map((d) => (
          <div key={d.id} className={`warning-card ${d.severity?.toLowerCase()}`}>
            <strong>{d.danger_type}: {d.title}</strong>
            <p>{d.description}</p>
            <small>Severity: {d.severity} | Radius: {d.radius_meters}m {d.distance_km !== undefined && `| Distance: ${d.distance_km} km`}</small>
          </div>
        ))}
      </section>

      {report && (
        <section className="report-grid">
          <div className="stat-card"><h3>{report.total_destinations}</h3><p>Total Destinations</p></div>
          <div className="stat-card"><h3>{report.crowd_summary.High || 0}</h3><p>High Crowd Areas</p></div>
          <div className="stat-card"><h3>{report.danger_summary?.High || 0}</h3><p>High Danger Reports</p></div>
        </section>
      )}

      {user?.role === 'admin' && (
        <AdminPanel api={API} destinations={destinations} onRefresh={() => { loadDestinations(); loadDangerPins(); loadReport(); }} />
      )}

      <LoginModal
        isOpen={isModalOpen}
        onClose={closeLoginModal}
        onLoginSuccess={handleLoginSuccess}
        api={API}
        infoMessage={loginPromptMessage}
      />
    </div>
  );
}

export default App;
