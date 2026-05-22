import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';
import MapControls from './components/MapControls';
import MarkerPanel from './components/MarkerPanel';
import SafetyAlerts from './components/SafetyAlerts';
import ReportGrid from './components/ReportGrid';
import { validateMarkerSubmission } from './utils/validation';
import { useUserSession } from './utils/useUserSession';
import {
  API,
  getDestinations,
  getDangerPins,
  getReportSummary,
  getSafetyCheck,
  getAiAdvice,
  postDangerPin,
  postPinComment,
  deleteDangerPin,
  deleteAccount,
} from './utils';
import { DEFAULT_MARKER_FORM } from './constants/markerConstants';

function App() {
  const [advice, setAdvice] = useState('');
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
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [user, setUser] = useUserSession();
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

  const loadDestinations = async () => {
    try {
      const data = await getDestinations();
      setDestinations(data || []);
    } catch (error) {
      console.error('Failed to load destinations:', error);
      setDestinations([]);
    }
  };

  const loadDangerPins = async () => {
    try {
      const data = await getDangerPins();
      setDangerPins(data || []);
    } catch (error) {
      console.error('Failed to load danger pins:', error);
      setDangerPins([]);
    }
  };

  const loadReport = async () => {
    try {
      const data = await getReportSummary();
      setReport(data || null);
    } catch (error) {
      console.error('Failed to load report:', error);
      setReport(null);
    }
  };

  const loadAppData = async () => {
    await Promise.all([loadDestinations(), loadDangerPins(), loadReport()]);
  };

  useEffect(() => {
    loadAppData();
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('App State Debug:', {
      destinationsCount: destinations.length,
      dangerPinsCount: dangerPins.length,
      selectedDestinationId,
      user: user?.name,
    });
  }, [destinations, dangerPins, selectedDestinationId, user]);

  const checkSafety = async (lat, lng) => {
    const data = await getSafetyCheck(lat, lng);
    setNearbyDangers(data.nearby_dangers || []);
    return data;
  };

  const fetchAdvice = async (lat, lng) => {
    setSelectedLocation({ lat, lng });
    setAdvice('Analyzing location, nearby spots, crowd condition, and safety warnings...');

    try {
      const adviceData = await getAiAdvice(lat, lng);
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
    const validation = validateMarkerSubmission({ user, captchaChecked, pendingMarkerLocation, markerForm });
    if (!validation.valid) {
      if (validation.reason === 'login') {
        setLoginPromptMessage(validation.message);
        setIsModalOpen(true);
      } else if (validation.reason === 'captcha') {
        setCaptchaWarning(validation.message);
      } else {
        setMarkerWarning(validation.message);
      }
      return;
    }

    setCaptchaWarning('');
    setMarkerWarning('');
    const totalHours = validation.totalHours;
    try {
      await postDangerPin({
        title: markerForm.title || selectedMarkerType,
        danger_type: selectedMarkerType,
        lat: pendingMarkerLocation.lat,
        lng: pendingMarkerLocation.lng,
        severity: markerForm.severity,
        radius_meters: Number(markerForm.radius_meters || 300),
        duration_hours: totalHours,
        description: markerForm.description,
        reported_by: user?.name || 'Anonymous Tourist',
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
      await postPinComment(pinId, {
        comment,
        commented_by: user?.name || 'Anonymous Tourist',
      });
      await loadDangerPins();
      setAdvice('Comment added to marker.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deletePin = async (pinId) => {
    try {
      await deleteDangerPin(pinId);
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
      await deleteAccount(user.email);
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
        <MapControls
          isNavExpanded={isNavExpanded}
          setIsNavExpanded={setIsNavExpanded}
          pinMode={pinMode}
          locationMode={locationMode}
          showDestinations={showDestinations}
          togglePinMode={togglePinMode}
          toggleLocationMode={toggleLocationMode}
          toggleShowDestinations={toggleShowDestinations}
        />

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
            <MarkerPanel
              markerForm={markerForm}
              setMarkerForm={setMarkerForm}
              selectedMarkerType={selectedMarkerType}
              setSelectedMarkerType={setSelectedMarkerType}
              pendingMarkerLocation={pendingMarkerLocation}
              captchaChecked={captchaChecked}
              setCaptchaChecked={setCaptchaChecked}
              captchaWarning={captchaWarning}
              markerWarning={markerWarning}
              submitMarker={submitMarker}
            />
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

      <SafetyAlerts nearbyDangers={nearbyDangers} />

      {report && <ReportGrid report={report} />}

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
