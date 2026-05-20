import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';

const API = 'http://127.0.0.1:8000';
const MARKER_TYPES = ['Danger Area', 'Dark Area', 'Crowdy Area', 'Dangerous Animals', 'Hazard on Area'];

/* Navigation items — only map-related actions, no theme/location duplicates */
const NAV_ITEMS = [
  { id: 'map',    icon: '🗺️', label: 'Map View'       },
  { id: 'alerts', icon: '⚠️', label: 'Safety Alerts'  },
  { id: 'crowd',  icon: '👥', label: 'Crowd Analysis' },
  { id: 'marker', icon: '📍', label: 'Add Marker'     },
];

function App() {
  /* ── original state — untouched ── */
  const [advice, setAdvice] = useState('Click anywhere in the Philippines for AI geolocation guidance.');
  const [nearest, setNearest] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [dangerPins, setDangerPins] = useState([]);
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [routeEnd, setRouteEnd] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [routeNote, setRouteNote] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [pinMode, setPinMode] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [user, setUser] = useState(null);
  const [report, setReport] = useState(null);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [selectedMarkerType, setSelectedMarkerType] = useState('Danger Area');
  const [pendingMarkerLocation, setPendingMarkerLocation] = useState(null);
  const [markerForm, setMarkerForm] = useState({
    title: '', severity: 'Moderate', radius_meters: 300, description: '',
  });

  /* sidebar: one click opens all labels, click active item collapses */
  const [activeNav, setActiveNav] = useState('map');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /* ── data loaders — untouched ── */
  const loadDestinations = async () => {
    const res = await fetch(`${API}/destinations`);
    setDestinations(await res.json());
  };
  const loadDangerPins = async () => {
    const res = await fetch(`${API}/danger-pins`);
    setDangerPins(await res.json());
  };
  const loadReport = async () => {
    const res = await fetch(`${API}/reports/summary`);
    setReport(await res.json());
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
    setRoutePoints([]); setRouteEnd(null); setRouteNote('');
    try {
      const res    = await fetch(`${API}/ai-advice?lat=${lat}&lng=${lng}`);
      const data   = await res.json();
      const safety = await checkSafety(lat, lng);
      setAdvice(`${data.advice} ${safety.alerts?.join(' ') || ''}`);
      setNearest(data.nearest_destinations || []);
      setNearbyDangers(data.nearby_dangers || []);
    } catch {
      setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
    }
  };

  const startMarkerPlacement = (lat, lng) => {
    if (!captchaChecked) { alert('Please check the CAPTCHA box first before placing a marker.'); return; }
    if (!selectedMarkerType) { alert('Please choose a marker type first.'); return; }
    setPendingMarkerLocation({ lat, lng });
    setMarkerForm({ title: selectedMarkerType, severity: 'Moderate', radius_meters: 300, description: '' });
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
    } catch (err) { alert(err.message); }
  };

  const addMarkerComment = async (pinId, comment) => {
    try {
      const res = await fetch(`${API}/danger-pins/${pinId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, commented_by: user?.name || 'Anonymous Tourist' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Unable to add comment.');
      await loadDangerPins();
      setAdvice('Comment added to marker.');
    } catch (err) { alert(err.message); }
  };

  const recommendRoute = async (endLat, endLng) => {
    if (!selectedLocation) { setAdvice('Select your starting location first before using route mode.'); return; }
    setRouteEnd({ lat: endLat, lng: endLng });
    try {
      const res = await fetch(`${API}/recommend-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: selectedLocation.lat, start_lng: selectedLocation.lng,
          end_lat: endLat, end_lng: endLng,
        }),
      });
      const data = await res.json();
      setRoutePoints(data.route_points || []);
      setRouteNote(data.recommendation || 'Route generated.');
      setAdvice(data.recommendation || 'Route generated.');
      setNearbyDangers(data.hazards_ahead || []);
    } catch { setAdvice('Unable to recommend route. Check backend connection.'); }
  };

  const handleMapClick = (lat, lng) => {
    if (pinMode)   return startMarkerPlacement(lat, lng);
    if (routeMode) return recommendRoute(lat, lng);
    return fetchAdvice(lat, lng);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setAdvice('Geolocation is not supported by your browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchAdvice(pos.coords.latitude, pos.coords.longitude),
      () => setAdvice('Location permission denied. You can still click on the map.')
    );
  };

  const handleLoginSuccess = (loggedInUser) => { setUser(loggedInUser); setIsModalOpen(false); };

  /* Sidebar: clicking any item opens the whole sidebar (all labels visible).
     Clicking the already-active item while open collapses it back to icons. */
  const handleNavClick = (id) => {
    if (activeNav === id && sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    setActiveNav(id);
    setSidebarOpen(true);

    if (id === 'marker') { setPinMode(true);  setRouteMode(false); setPendingMarkerLocation(null); }
    else                 { setPinMode(false);  setRouteMode(false); }
  };

  const handleLoginBtnClick = () => {
    if (user) setUser(null);
    else setIsModalOpen(true);
  };

  return (
    <div className="app-shell">

      {/* original header — untouched */}
      <Header
        advice={advice}
        theme={theme}
        user={user}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onLogin={() => setIsModalOpen(true)}
        onLogout={() => setUser(null)}
        onUseLocation={useMyLocation}
      />

      <div className="app-body">

        {/* ── SIDEBAR ── */}
        <aside className={`apx-sidebar${sidebarOpen ? ' apx-sidebar--open' : ''}`}>

          {/* top nav items */}
          <div className="apx-nav-top">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`apx-nav-btn${activeNav === item.id ? ' apx-nav-btn--active' : ''}`}
                onClick={() => handleNavClick(item.id)}
                title={item.label}
              >
                <span className="apx-nav-icon">{item.icon}</span>
                <span className="apx-nav-label">{item.label}</span>
              </button>
            ))}
          </div>

          {/* login pinned to bottom */}
          <div className="apx-nav-bottom">
            <button
              className="apx-nav-btn apx-nav-btn--login"
              onClick={handleLoginBtnClick}
              title={user ? `Logout ${user.name ?? ''}` : 'Login / Register'}
            >
              <span className="apx-nav-icon">{user ? '🔓' : '👤'}</span>
              <span className="apx-nav-label">
                {user ? `Logout ${user.name ?? ''}` : 'Login / Register'}
              </span>
            </button>
          </div>

        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className="apx-main">

          {/* toolbar — only Add Marker, route button removed */}
          <section className="safety-toolbar">
            <button
              className={pinMode ? 'primary-btn active' : 'secondary-btn'}
              onClick={() => { setPinMode(!pinMode); setRouteMode(false); setPendingMarkerLocation(null); }}
            >
              📍 {pinMode ? 'Add Marker ON' : 'Add Marker'}
            </button>
          </section>

          {/* marker panel — always visible when Add Marker is active */}
          {pinMode && (
            <section className="marker-panel">
              <div className="marker-panel-header">
                <h2>📍 Add Safety Marker</h2>
                <button
                  className="marker-panel-close"
                  onClick={() => { setPinMode(false); setPendingMarkerLocation(null); setCaptchaChecked(false); }}
                  title="Cancel"
                >✕</button>
              </div>

              <p>1. Choose a marker type &nbsp;→&nbsp; 2. Check the box below &nbsp;→&nbsp; 3. Click the map</p>

              {/* step 1 — type selector */}
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

              {/* step 2 — CAPTCHA */}
              <label className="captcha-box">
                <input
                  type="checkbox"
                  checked={captchaChecked}
                  onChange={(e) => setCaptchaChecked(e.target.checked)}
                />
                <span>
                  ✅ I am not a robot and I understand that fake reports are not allowed.
                </span>
              </label>

              {/* ready hint */}
              {captchaChecked && !pendingMarkerLocation && (
                <div className="marker-ready-hint">
                  👆 Now click anywhere on the map to place your <strong>{selectedMarkerType}</strong> marker.
                </div>
              )}

              {/* step 3 — form after location selected */}
              {pendingMarkerLocation && (
                <form className="marker-form" onSubmit={submitMarker}>
                  <strong>📍 Selected: {pendingMarkerLocation.lat.toFixed(5)}, {pendingMarkerLocation.lng.toFixed(5)}</strong>
                  <input
                    placeholder="Marker title"
                    value={markerForm.title}
                    onChange={(e) => setMarkerForm({ ...markerForm, title: e.target.value })}
                  />
                  <select
                    value={markerForm.severity}
                    onChange={(e) => setMarkerForm({ ...markerForm, severity: e.target.value })}
                  >
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

          {/* map + destinations */}
          <section className="dashboard-grid">
            <div className="map-card">
              <MapView
                destinations={destinations}
                dangerPins={dangerPins}
                nearbyDangers={nearbyDangers}
                selectedLocation={selectedLocation}
                routeEnd={routeEnd}
                routePoints={routePoints}
                onLocationClick={handleMapClick}
                onAddComment={addMarkerComment}
              />
              {routeNote && <div className="route-note">🧭 {routeNote}</div>}
            </div>
            <DestinationList
              destinations={destinations}
              nearest={nearest}
              dangerPins={dangerPins}
            />
          </section>

          {/* safety alerts */}
          <section className="warning-panel">
            <h2>Safety Alerts</h2>
            {nearbyDangers.length === 0
              ? <p>No nearby marker report detected.</p>
              : nearbyDangers.map((d) => (
                <div key={d.id} className={`warning-card ${d.severity?.toLowerCase()}`}>
                  <strong>{d.danger_type}: {d.title}</strong>
                  <p>{d.description}</p>
                  <small>Severity: {d.severity} | Radius: {d.radius_meters}m {d.distance_km !== undefined && `| Distance: ${d.distance_km} km`}</small>
                </div>
              ))
            }
          </section>

          {/* stats */}
          {report && (
            <section className="report-grid">
              <div className="stat-card"><h3>{report.total_destinations}</h3><p>Total Destinations</p></div>
              <div className="stat-card"><h3>{report.total_users}</h3><p>Registered Users</p></div>
              <div className="stat-card"><h3>{report.crowd_summary.High || 0}</h3><p>High Crowd Areas</p></div>
              <div className="stat-card"><h3>{report.danger_summary?.High || 0}</h3><p>High Danger Reports</p></div>
            </section>
          )}

          {/* admin */}
          {user?.role === 'admin' && (
            <AdminPanel api={API} destinations={destinations} onRefresh={() => { loadDestinations(); loadDangerPins(); loadReport(); }} />
          )}

        </div>
      </div>

      <LoginModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onLoginSuccess={handleLoginSuccess} api={API} />
    </div>
  );
}

export default App;
