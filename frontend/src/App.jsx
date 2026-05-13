import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';

const API = 'http://127.0.0.1:8000';

const MARKER_TYPES = ['Danger Area', 'Dark Area', 'Crowdy Area', 'Dangerous Animals', 'Hazard on Area'];

function App() {
  const [advice, setAdvice] = useState('Click anywhere in the Philippines for AI geolocation guidance.');
  const [nearest, setNearest] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [dangerPins, setDangerPins] = useState([]);
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [routeEnd, setRouteEnd] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [pinMode, setPinMode] = useState(false);
  const [showDestinations, setShowDestinations] = useState(true);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [user, setUser] = useState(null);
  const [report, setReport] = useState(null);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [selectedMarkerType, setSelectedMarkerType] = useState('Danger Area');
  const [pendingMarkerLocation, setPendingMarkerLocation] = useState(null);
  const [markerForm, setMarkerForm] = useState({
    title: '',
    severity: 'Moderate',
    radius_meters: 300,
    description: '',
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadDestinations = async () => {
    const res = await fetch(`${API}/destinations`);
    const data = await res.json();
    setDestinations(data);
  };

  const loadDangerPins = async () => {
    const res = await fetch(`${API}/danger-pins`);
    const data = await res.json();
    setDangerPins(data);
  };

  const loadReport = async () => {
    const res = await fetch(`${API}/reports/summary`);
    const data = await res.json();
    setReport(data);
  };

  useEffect(() => {
    loadDestinations();
    loadDangerPins();
    loadReport();
  }, []);

  const checkSafety = async (lat, lng) => {
    const res = await fetch(`${API}/safety-check?lat=${lat}&lng=${lng}`);
    const data = await res.json();
    setNearbyDangers(data.nearby_dangers || []);
    return data;
  };

  const fetchAdvice = async (lat, lng) => {
    setSelectedLocation({ lat, lng });
    setAdvice('Analyzing location, nearby spots, crowd condition, and safety warnings...');
    setRoutePoints([]);
    setRouteEnd(null);
    try {
      const res = await fetch(`${API}/ai-advice?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      const safety = await checkSafety(lat, lng);
      setAdvice(`${data.advice} ${safety.alerts?.join(' ') || ''}`);
      setNearest(data.nearest_destinations || []);
      setNearbyDangers(data.nearby_dangers || []);
    } catch (e) {
      setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
    }
  };

  const startMarkerPlacement = (lat, lng) => {
    if (!captchaChecked) {
      alert('Please check the CAPTCHA box first before placing a marker.');
      return;
    }
    if (!selectedMarkerType) {
      alert('Please choose a marker type first.');
      return;
    }
    setPendingMarkerLocation({ lat, lng });
    setMarkerForm({
      title: selectedMarkerType,
      severity: 'Moderate',
      radius_meters: 300,
      description: '',
    });
  };

  const submitMarker = async (e) => {
    e.preventDefault();
    if (!captchaChecked) return alert('Please check the CAPTCHA box.');
    if (!pendingMarkerLocation) return alert('Click the map location first.');
    if (!markerForm.description.trim()) return alert('Description is required. Explain why you put this marker.');

    try {
      const res = await fetch(`${API}/danger-pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: markerForm.title || selectedMarkerType,
          danger_type: selectedMarkerType,
          lat: pendingMarkerLocation.lat,
          lng: pendingMarkerLocation.lng,
          severity: markerForm.severity,
          radius_meters: Number(markerForm.radius_meters),
          description: markerForm.description,
          reported_by: user?.name || 'Anonymous Tourist',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Unable to add marker.');
      await loadDangerPins();
      await loadReport();
      setPendingMarkerLocation(null);
      setMarkerForm({ title: '', severity: 'Moderate', radius_meters: 300, description: '' });
      setAdvice(`${selectedMarkerType} marker added successfully. Other users can now see and comment on it.`);
    } catch (err) {
      alert(err.message);
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

  const handleMapClick = (lat, lng) => {
    if (pinMode) return startMarkerPlacement(lat, lng);
    return fetchAdvice(lat, lng);
  };

  const togglePinMode = () => {
    setPendingMarkerLocation(null);
    setPinMode((prev) => {
      const next = !prev;
      if (next) setShowDestinations(false);
      return next;
    });
  };

  const toggleShowDestinations = () => {
    setPinMode(false);
    setShowDestinations((prev) => !prev);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setAdvice('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchAdvice(pos.coords.latitude, pos.coords.longitude),
      () => setAdvice('Location permission denied. You can still click on the map.')
    );
  };

  const handleSelectDestination = (destination) => {
    setSelectedDestinationId(destination.id);
    setSelectedLocation({ lat: destination.lat, lng: destination.lng });
    setAdvice(`Showing ${destination.name} on the map. Click the map for AI safety advice.`);
    setRoutePoints([]);
    setRouteEnd(null);
  };

  const clearSelectedDestination = () => {
    setSelectedDestinationId(null);
    setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsModalOpen(false);
  };

  return (
    <div className="app-shell">
      <Header
        advice={advice}
        theme={theme}
        user={user}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onLogin={() => setIsModalOpen(true)}
        onLogout={() => setUser(null)}
        onUseLocation={useMyLocation}
      />

      <section className="dashboard-grid">
        <div className="map-side-panel">
          <div className="control-card">
            <div className="safety-toolbar">
              <button className={pinMode ? 'primary-btn active' : 'secondary-btn'} onClick={togglePinMode}>
                📍 {pinMode ? 'Add Marker ON' : 'Add Marker'}
              </button>
              <button className={showDestinations ? 'primary-btn active' : 'secondary-btn'} onClick={toggleShowDestinations}>
                🧳 {showDestinations ? 'Destinations ON' : 'Tourist Destinations'}
              </button>
            </div>

            {pinMode && (
              <section className="marker-panel">
                <h2>Add Safety Marker</h2>
                <p>Choose one marker type, check the CAPTCHA, then click the map location.</p>
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
                  <input type="checkbox" checked={captchaChecked} onChange={(e) => setCaptchaChecked(e.target.checked)} />
                  I am not a robot and I understand that fake reports are not allowed.
                </label>
                {pendingMarkerLocation && (
                  <form className="marker-form" onSubmit={submitMarker}>
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
                      min="50"
                      max="5000"
                      placeholder="Radius in meters"
                      value={markerForm.radius_meters}
                      onChange={(e) => setMarkerForm({ ...markerForm, radius_meters: e.target.value })}
                    />
                    <textarea
                      required
                      placeholder="Required: describe why you put this marker"
                      value={markerForm.description}
                      onChange={(e) => setMarkerForm({ ...markerForm, description: e.target.value })}
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
            routeEnd={routeEnd}
            routePoints={routePoints}
            onLocationClick={handleMapClick}
            onAddComment={addMarkerComment}
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

      <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onLoginSuccess={handleLoginSuccess} api={API} />
    </div>
  );
}

export default App;
