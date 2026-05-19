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
        onLogin={() => setIsModalOpen(true)}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />

      <section className="dashboard-grid">
        <div className="map-side-panel">
          <div className="control-card">
            <div className="safety-toolbar">
              <button className={pinMode ? 'primary-btn active' : 'secondary-btn'} onClick={togglePinMode}>
                📍 {pinMode ? 'Add Marker ON' : 'Add Marker'}
              </button>
              <button className={locationMode ? 'primary-btn active' : 'secondary-btn'} onClick={toggleLocationMode}>
                📍 {locationMode ? 'My Location ON' : 'Use My Location'}
              </button>
              <button className={showDestinations ? 'primary-btn active' : 'secondary-btn'} onClick={toggleShowDestinations}>
                🧳 {showDestinations ? 'Destinations ON' : 'Tourist Destinations'}
              </button>
            </div>

            {pinMode && (
              <section className="marker-panel">
                <h2>Add Safety Marker</h2>
                <p>Choose one marker type, then click the map location and check the CAPTCHA confirmation box before submitting.</p>
                <div className="marker-type-buttons">
                  {MARKER_TYPES.map((type) => (
                    <button
                      key={type}
                      className={selectedMarkerType === type ? 'primary-btn active' : 'secondary-btn'}
                      onClick={() => setSelectedMarkerType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <label className="captcha-box">
                  <input
                    type="checkbox"
                    checked={captchaChecked}
                    onChange={(e) => {
                      setCaptchaChecked(e.target.checked);
                      if (e.target.checked) setCaptchaWarning('');
                    }}
                  />
                  <div className="captcha-label">
                    <strong>Please note:</strong> the information given is being used by authority. Check the box if you understand and confirm the information is true.
                  </div>
                </label>
                {captchaWarning && <div className="captcha-warning">{captchaWarning}</div>}
                {markerWarning && <div className="captcha-warning">{markerWarning}</div>}
                {pendingMarkerLocation && (
                  <form className="marker-form" onSubmit={submitMarker} noValidate>
                    <strong>Selected location:</strong> {pendingMarkerLocation.lat.toFixed(5)}, {pendingMarkerLocation.lng.toFixed(5)}
                    <input
                      placeholder="Marker title"
                      value={markerForm.title}
                      onChange={(e) => setMarkerForm({ ...markerForm, title: e.target.value })}
                    />
                    <select value={markerForm.severity} onChange={(e) => setMarkerForm({ ...markerForm, severity: e.target.value })}>
                      <option>Low</option>
                      <option>Moderate</option>
                      <option>High</option>
                    </select>
                    <input
                      type="number"
                      min="20"
                      max="5000"
                      placeholder="Radius/Area affected (20-5000 meters)"
                      value={markerForm.radius_meters}
                      onChange={(e) => setMarkerForm({ ...markerForm, radius_meters: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        placeholder="Days"
                        value={markerForm.duration_days}
                        onChange={(e) => setMarkerForm({ ...markerForm, duration_days: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="23"
                        placeholder="Hours"
                        value={markerForm.duration_hours}
                        onChange={(e) => setMarkerForm({ ...markerForm, duration_hours: e.target.value })}
                        style={{ flex: 1 }}
                      />
                    </div>
                    <textarea
                      placeholder="Required: describe why you put this marker"
                      value={markerForm.description}
                      onChange={(e) => {
                        setMarkerForm({ ...markerForm, description: e.target.value });
                        if (markerWarning) setMarkerWarning('');
                      }}
                    />
                    <button className="primary-btn" type="submit">Submit Marker</button>
                  </form>
                )}
              </section>
            )}
          </div>

          {showDestinations && (
            <DestinationList
              destinations={destinations}
              nearest={nearest}
              selectedDestinationId={selectedDestinationId}
              onSelectDestination={handleSelectDestination}
              onClearSelection={clearSelectedDestination}
              inline
            />
          )}
        </div>

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
