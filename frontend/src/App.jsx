import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import AdminPanel from './components/AdminPanel.jsx';
import MapControlLeft from './components/MapControlLeft';
import MarkerPanel from './components/MarkerPanel';
import SafetyAlerts from './components/SafetyAlerts';
import ReportGrid from './components/ReportGrid';
import AIGuidance from './components/AIGuidance';
import { useUserSession } from './utils/useUserSession';
import { API, deleteAccount, postPinComment, updatePinComment, deletePinComment, deleteDangerPin } from './utils';
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
  const [userLocation, setUserLocation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('stms_theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const [pinMode, setPinMode] = useState(false);
  const [locationMode, setLocationMode] = useState(false);
  const [showDestinations, setShowDestinations] = useState(true);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [resetMapFlag, setResetMapFlag] = useState(0);
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
    try {
      window.localStorage.setItem('stms_theme', theme);
    } catch {
      // ignore storage errors in unsupported environments
    }
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

  const updateMarkerComment = async (pinId, commentId, comment) => {
    try {
      await updatePinComment(pinId, commentId, { comment });
      await loadDangerPins(setDangerPins);
      setAdvice('Comment updated successfully.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteMarkerComment = async (pinId, commentId) => {
    try {
      await deletePinComment(pinId, commentId);
      await loadDangerPins(setDangerPins);
      setAdvice('Comment deleted.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deletePin = async (pinId) => {
    if (user?.role !== 'administrator') {
      alert('Only administrators are allowed to delete pins.');
      return;
    }
    try {
      await deleteDangerPin(pinId);
      await loadDangerPins(setDangerPins);
      setAdvice('Marker deleted successfully.');
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
    const clickedLocation = { lat, lng };
    setLastClickLocation(clickedLocation);
    setUserLocation(clickedLocation);
    setSelectedLocation(clickedLocation);
    setSelectedDestinationId(null);
    return fetchAdvice(lat, lng);
  };

  const togglePinMode = () => {
    if (!user) {
      setIsModalOpen(true);
      return;
    }

    setPinMode((prev) => {
      const next = !prev;
      if (next) {
        setShowDestinations(false);
        setPendingMarkerLocation(null);
        const targetLocation = (locationMode && selectedLocation) ? selectedLocation : lastClickLocation;
        if (targetLocation) {
          startMarkerPlacement(targetLocation.lat, targetLocation.lng);
        }
      } else {
        setPendingMarkerLocation(null);
        setSelectedMarkerType('Danger Area');
        setMarkerForm(DEFAULT_MARKER_FORM);
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
        setSelectedDestinationId(null);
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
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

  const toggleDestinationFocus = async (destination) => {
    if (!destination) return;
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

  const zoomToDestination = async (destination) => {
    if (!destination) return;
    
    // Only zoom/focus on the destination without changing the current location reference
    setSelectedDestinationId(destination.id);
    setLastClickLocation({ lat: destination.lat, lng: destination.lng });
    
    // Don't change selectedLocation - keep user's current location
    // Just update advice based on the destination
    await fetchAdvice(destination.lat, destination.lng);
  };

  const clearSelectedDestination = () => {
    setSelectedDestinationId(null);
    setSelectedLocation(null);
    setAdvice('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const resetMapView = () => {
    setResetMapFlag((prev) => prev + 1);
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
    <div className={`app-shell ${isNavExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
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
                onCenterTouristSpot={toggleDestinationFocus}
                onZoomToSpot={zoomToDestination}
                onClearSelection={clearSelectedDestination}
                touristSpots={destinations}
                nearest={nearest}
                selectedDestinationId={selectedDestinationId}
                selectedLocation={userLocation}
                isBoxExpanded={isNavExpanded}
                setIsBoxExpanded={setIsNavExpanded}
                isPinMode={pinMode}
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
              destinations={destinations}
              selectedDestinationId={selectedDestinationId}
              onDestinationClick={handleSelectDestination}
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
              onResetMap={() => setResetMapFlag((prev) => prev + 1)}
              resetMapFlag={resetMapFlag}
              onLocationClick={handleMapClick}
              onAddComment={addMarkerComment}
              onUpdateComment={updateMarkerComment}
              onDeleteComment={deleteMarkerComment}
              onDeletePin={deletePin}
              focusLocation={selectedLocation || lastClickLocation}
              focusZoom={selectedDestinationId ? 15 : undefined}
              userLocation={userLocation}
            />
          </div>
        </div>
      </section>

      <SafetyAlerts nearbyDangers={nearbyDangers} />

      {report && <ReportGrid report={report} />}

      {(user?.role === 'admin' || user?.role === 'administrator') && (
        <AdminPanel
          api={API}
          user={user}
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
