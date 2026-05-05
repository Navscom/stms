import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';

const API = 'http://127.0.0.1:8000';

function App() {
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
  const [nightMode, setNightMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [user, setUser] = useState(null);
  const [report, setReport] = useState(null);

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
    const res = await fetch(`${API}/safety-check?lat=${lat}&lng=${lng}&night_mode=${nightMode}`);
    const data = await res.json();
    setNearbyDangers(data.nearby_dangers || []);
    return data;
  };

  const fetchAdvice = async (lat, lng) => {
    setSelectedLocation({ lat, lng });
    setAdvice('Analyzing location, nearby spots, crowd condition, and safety warnings...');
    setRoutePoints([]);
    setRouteEnd(null);
    setRouteNote('');
    try {
      const res = await fetch(`${API}/ai-advice?lat=${lat}&lng=${lng}&night_mode=${nightMode}`);
      const data = await res.json();
      const safety = await checkSafety(lat, lng);
      setAdvice(`${data.advice} ${safety.alerts?.join(' ') || ''}`);
      setNearest(data.nearest_destinations || []);
      setNearbyDangers(data.nearby_dangers || []);
    } catch (e) {
      setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
    }
  };

  const addDangerPin = async (lat, lng) => {
    const title = prompt('Warning title:', 'Danger / Warning Area');
    if (!title) return;
    const danger_type = prompt('Type: Danger Zone, Wildlife / Animal, Dark Area, General Warning', 'Danger Zone') || 'Danger Zone';
    const severity = prompt('Severity: Low, Moderate, High', 'Moderate') || 'Moderate';
    const radius_meters = Number(prompt('Radius in meters:', '300') || 300);
    const description = prompt('Description:', 'User reported warning area. Please avoid this area.') || 'User reported warning area.';

    try {
      const res = await fetch(`${API}/danger-pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          danger_type,
          lat,
          lng,
          severity,
          radius_meters,
          description,
          reported_by: user?.name || 'Anonymous Tourist'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Unable to add danger pin.');
      await loadDangerPins();
      await loadReport();
      setAdvice('Danger/warning pin added successfully. It will now appear on the map as a warning zone.');
    } catch (err) {
      alert(err.message);
    }
  };

  const recommendRoute = async (endLat, endLng) => {
    if (!selectedLocation) {
      setAdvice('Select your starting location first before using route mode.');
      return;
    }
    setRouteEnd({ lat: endLat, lng: endLng });
    try {
      const res = await fetch(`${API}/recommend-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: selectedLocation.lat,
          start_lng: selectedLocation.lng,
          end_lat: endLat,
          end_lng: endLng,
          night_mode: nightMode
        })
      });
      const data = await res.json();
      setRoutePoints(data.route_points || []);
      setRouteNote(data.recommendation || 'Route generated.');
      setAdvice(data.recommendation || 'Route generated.');
      setNearbyDangers(data.hazards_ahead || []);
    } catch (err) {
      setAdvice('Unable to recommend route. Check backend connection.');
    }
  };

  const handleMapClick = (lat, lng) => {
    if (pinMode) return addDangerPin(lat, lng);
    if (routeMode) return recommendRoute(lat, lng);
    return fetchAdvice(lat, lng);
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

      <section className="safety-toolbar">
        <button className={pinMode ? 'primary-btn active' : 'secondary-btn'} onClick={() => { setPinMode(!pinMode); setRouteMode(false); }}>
          📍 {pinMode ? 'Pin Mode ON' : 'Add Danger Pin'}
        </button>
        <button className={routeMode ? 'primary-btn active' : 'secondary-btn'} onClick={() => { setRouteMode(!routeMode); setPinMode(false); }}>
          🧭 {routeMode ? 'Route Mode ON' : 'Recommend Safer Route'}
        </button>
        <button className={nightMode ? 'primary-btn active' : 'secondary-btn'} onClick={() => setNightMode(!nightMode)}>
          🌙 {nightMode ? 'Night Warnings ON' : 'Night Mode / Dark Areas'}
        </button>
      </section>

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
          />
          {routeNote && <div className="route-note">🧭 {routeNote}</div>}
        </div>
        <DestinationList destinations={destinations} nearest={nearest} />
      </section>

      <section className="warning-panel">
        <h2>Safety Alerts</h2>
        {nearbyDangers.length === 0 ? <p>No nearby danger, wildlife, or dark-area report detected.</p> : nearbyDangers.map((d) => (
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
          <div className="stat-card"><h3>{report.total_users}</h3><p>Registered Users</p></div>
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
