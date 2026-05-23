import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import DestinationList from './components/DestinationList';
import AdminPanel from './components/AdminPanel';
import MapControlLeft from './components/MapControlLeft';
import MarkerPanel from './components/MarkerPanel';
import SafetyAlerts from './components/SafetyAlerts';
import ReportGrid from './components/ReportGrid';
import AIGuidance from './components/AIGuidance';
import { useUserSession } from './utils/useUserSession';
import { API, deleteAccount, postPinComment, deleteDangerPin } from './utils';
import { loadAppData, loadDestinations, loadDangerPins, loadReport, fetchAdvice as fetchAdviceHelper } from './utils/LoadData';
import { submitMarker as submitMarkerAction, addMarkerComment as addMarkerCommentAction, deletePin as deletePinAction } from './utils/markerActions';
import { DEFAULT_MARKER_FORM } from './utils/markerConstants';

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
  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
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
    const loadData = async () => {
      await loadAppData(setDestinations, setDangerPins, setReport);
    };
    loadData();
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

  const fetchAdvice = async (lat, lng) => {
    await fetchAdviceHelper(lat, lng, setSelectedLocation, setAdvice, setNearest, setNearbyDangers);
  };

  const startMarkerPlacement = (lat, lng) => {
    if (!user) {
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

    await submitMarkerAction({
      user,
      captchaChecked,
      pendingMarkerLocation,
      markerForm,
      selectedMarkerType,
      setIsModalOpen,
      setCaptchaWarning,
      setMarkerWarning,
      setPendingMarkerLocation,
      setMarkerForm,
      setShowNotification,
      setAdvice,
      loadDangerPins: () => loadDangerPins(setDangerPins),
      loadReport: () => loadReport(setReport),
    });
  };

  const addMarkerComment = async (pinId, comment) => {
    try {
      await postPinComment(pinId, {
        comment,
        commented_by: user?.name || 'Anonymous Tourist',
      });
      await loadDangerPins(setDangerPins);
      setAdvice('Comment added to marker.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deletePin = async (pinId) => {
    try {
      await deleteDangerPin(pinId);
      await loadDangerPins(setDangerPins);
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
      },
      () => setAdvice('Location permission denied. You can still click on the map.')
    );
  };

  const handleSelectDestination = async (destination) => {
    if (selectedDestinationId === destination.id) {
      setSelectedDestinationId(null);
      setSelectedLocation(null);
      setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
      return;
    }

    setSelectedDestinationId(destination.id);
    setSelectedLocation({ lat: destination.lat, lng: destination.lng });
    await fetchAdvice(destination.lat, destination.lng);
  };

  const clearSelectedDestination = () => {
    setSelectedDestinationId(null);
    setSelectedLocation(null);
    setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsModalOpen(false);
  };

  const handleLogout = () => {
    setUser(null);
    setIsModalOpen(false);
    setPinMode(false);
    setPendingMarkerLocation(null);
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
      setAdvice('Your account has been deleted. Login or register again to continue.');
    } catch (error) {
      setAdvice(error.message || 'Failed to delete account.');
    }
  };

  const closeLoginModal = () => {
    setIsModalOpen(false);
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
        user={user}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />

      <AIGuidance advice={advice} nearest={nearest} />

      <section className="dashboard-grid">

        <div className="map-panel">
          <div className="map-card">
            <div className="floating-side-nav-wrapper">
              <MapControlLeft
                onMyLocation={toggleLocationMode}
                onHazardSubmit={submitMarker}
                touristSpots={destinations}
                onAddMarker={togglePinMode}
                onDestinations={toggleShowDestinations}
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
            </div>

            <MapView
              destinations={destinations.filter((d) => !selectedDestinationId || d.id === selectedDestinationId)}
              dangerPins={dangerPins}
              nearbyDangers={nearbyDangers}
              selectedLocation={selectedLocation}
              pendingMarkerLocation={pendingMarkerLocation}
              selectedMarkerType={selectedMarkerType}
              user={user}
              theme={theme}
              onLogin={() => setIsModalOpen(true)}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              onToggleTheme={toggleTheme}
              onLocationClick={handleMapClick}
              onAddComment={addMarkerComment}
              onDeletePin={deletePin}
            />
          </div>
        </div>
      </section>

      <SafetyAlerts nearbyDangers={nearbyDangers} />

      {report && <ReportGrid report={report} />}

      {user?.role === 'admin' && (
        <AdminPanel
          api={API}
          destinations={destinations}
          setAppDestinations={setDestinations}
          setAppDangerPins={setDangerPins}
          setAppReport={setReport}
        />
      )}

      <LoginModal
        isOpen={isModalOpen}
        onClose={closeLoginModal}
        onLoginSuccess={handleLoginSuccess}
        api={API}
      />
    </div>
  );
}

export default App;
