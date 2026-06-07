import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import LoginModal from './components/LoginModal';
import AdminPanel from './components/AdminPanel.jsx';
import MapControlLeft from './components/MapControlLeft';

import AIGuidance from './components/AIGuidance';
import { useUserSession } from './utils/useUserSession';
import { API, deleteAccount, postPinComment, updatePinComment, deletePinComment, deleteDangerPin } from './utils';
import { loadAppData, loadDestinations, loadDangerPins, loadReport, fetchAdvice as fetchAdviceHelper, fetchNearbyInfo, fetchDestinationDescription } from './utils/LoadData';
import { submitMarker as submitMarkerAction, addMarkerComment as addMarkerCommentAction, deletePin as deletePinAction } from './utils/markerActions';
import { DEFAULT_MARKER_FORM } from './utils/markerConstants';

function App() {
  const [advice, setAdvice] = useState('Turn on My Location to get your current position and receive the best safety and tourist advice.');
  const [routeAdvice, setRouteAdvice] = useState('');

  // Wrapper for setAdvice that also notifies the AI guidance to show
  const setAdviceWithNotify = (val) => {
    try {
      setAdvice(val);
      // dispatch notification so AIGuidance can reset its idle timer
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ai:notify'));
      }
    } catch (e) {
      setAdvice(val);
    }
  };

  const setRouteAdviceWithNotify = (val) => {
    try {
      setRouteAdvice(val);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ai:notify'));
      }
    } catch (e) {
      setRouteAdvice(val);
    }
  };

  const [nearest, setNearest] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [dangerPins, setDangerPins] = useState([]);
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [lastClickLocation, setLastClickLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loginPromptMessage, setLoginPromptMessage] = useState('');

  // Expose a global helper and event listener so components can open the login modal
  // even if they don't receive the `onLogin` prop (robust fallback for older usages).
  useEffect(() => {
    const opener = (msg) => {
      const text = (typeof msg === 'string') ? msg : '';
      setLoginPromptMessage(text);
      setIsModalOpen(true);
    };
    // attach helper
    try {
      window.__stms_open_login = opener;
    } catch {
      // ignore in non-browser contexts
    }

    const handler = (e) => opener(e?.detail?.message || '');
    window.addEventListener('stms:require-login', handler);
    return () => {
      try { delete window.__stms_open_login; } catch {}
      window.removeEventListener('stms:require-login', handler);
    };
  }, []);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('stms_theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const [pinMode, setPinMode] = useState(false);
  const [locationMode, setLocationMode] = useState(() => {
    try {
      return window.localStorage.getItem('stms_location_mode') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [reportHighlight, setReportHighlight] = useState(null);
  const [hoverReportHighlight, setHoverReportHighlight] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusBounds, setFocusBounds] = useState(null);
  const [focusZoom, setFocusZoom] = useState(null);
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
      const hadBackendError = await loadAppData(setDestinations, setDangerPins, setReport);
      if (hadBackendError) {
        setAdviceWithNotify('There was an error loading the data from the backend. Please refresh the site to fix this.');
      }
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
    await fetchAdviceHelper(lat, lng, setSelectedLocation, setAdviceWithNotify, setNearest, setNearbyDangers);
  };

  const startMarkerPlacement = (lat, lng) => {
    if (!user) {
      setLoginPromptMessage('');
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
      setAdvice: setAdviceWithNotify,
      loadDangerPins: () => loadDangerPins(setDangerPins),
      loadReport: () => loadReport(setReport),
    });
  };

  const addMarkerComment = async (pinId, comment) => {
    try {
      await postPinComment(pinId, {
        comment,
        user_id: user?.id ?? null,
      });
      setAdviceWithNotify('Comment added to marker.');
      return true;
    } catch (err) {
      alert(err.message);
      throw err;
    }
  };

  const updateMarkerComment = async (pinId, commentId, comment) => {
    try {
      await updatePinComment(pinId, commentId, { comment }, {
        requesting_user_id: user?.id,
        requesting_role: user?.role,
      });
      setAdviceWithNotify('Comment updated successfully.');
      return true;
    } catch (err) {
      alert(err.message);
      throw err;
    }
  };

  const deleteMarkerComment = async (pinId, commentId) => {
    try {
      await deletePinComment(pinId, commentId, {
        requesting_user_id: user?.id,
        requesting_role: user?.role,
      });
      setAdviceWithNotify('Comment deleted.');
      return true;
    } catch (err) {
      alert(err.message);
      throw err;
    }
  };

  const deletePin = async (pinId) => {
    const pin = dangerPins.find((p) => p.id === pinId);
    const isPinOwner = pin && user?.id && pin.user_id === user.id;
    const isAdmin = user?.role === 'administrator' || user?.role === 'admin';

    if (!isPinOwner && !isAdmin) {
      alert('Only the user who reported the pin or an administrator can delete it.');
      return;
    }

    try {
      await deleteDangerPin(pinId, {
        requesting_user_id: user?.id,
        requesting_role: user?.role,
      });
      await loadDangerPins(setDangerPins);
      setAdviceWithNotify('Marker deleted successfully.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMapClick = (lat, lng) => {
    if (pinMode) {
      if (locationMode) {
        setAdviceWithNotify('My Location is on — turn it off to add markers.');
        return;
      }
      return startMarkerPlacement(lat, lng);
    }
    if (!locationMode) {
      // Normal map clicks are disabled for location selection until the user enables My Location.
      return;
    }
    setAdviceWithNotify('My Location ON. Turn it off to select another spot.');
    const clickedLocation = { lat, lng };
    setLastClickLocation(clickedLocation);
    setSelectedDestinationId(null);
    // Do not overwrite the GPS user location marker. Keep userLocation tied to
    // geolocation, and let the routing layer place the second pin instead.
    return fetchAdvice(lat, lng);
  };

  const togglePinMode = () => {
    if (!user) {
      setLoginPromptMessage('');
      setIsModalOpen(true);
      return;
    }

    setPinMode((prev) => {
      const next = !prev;
      if (next) {
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

  const toggleLocationMode = () => {
    if (locationMode) {
      setLocationMode(false);
      try { window.localStorage.setItem('stms_location_mode', 'false'); } catch {}
      setAdviceWithNotify('Location mode is off. Click the map to select another spot.');
      return;
    }

    if (!navigator.geolocation) {
      setAdviceWithNotify('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationMode(true);
        try { window.localStorage.setItem('stms_location_mode', 'true'); } catch {}
        setSelectedDestinationId(null);
        setFocusBounds(null);
        setFocusZoom(15);
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
        await fetchAdvice(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setAdviceWithNotify('Location permission denied. You can still click on the map.');
        try { window.localStorage.setItem('stms_location_mode', 'false'); } catch {}
      }
    );
  };

  const activateCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAdviceWithNotify('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationMode(true);
        try { window.localStorage.setItem('stms_location_mode', 'true'); } catch {}
        setSelectedDestinationId(null);
        setFocusBounds(null);
        setFocusZoom(15);
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
        // Dispatch the routing "start using my location" event on the next tick
        // so MapView has time to receive the updated `userLocation` prop.
        try {
          setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent('stms:route-select', { detail: { mode: 'start', useMyLocation: true } })); } catch (e) { /* ignore */ }
          }, 0);
        } catch (e) {
          // ignore
        }
      },
      () => {
        setAdviceWithNotify('Location permission denied. You can still click on the map.');
      }
    );
  };

  // If location mode was persisted as enabled, attempt to re-acquire position on load
  useEffect(() => {
    if (!locationMode) return;
    if (!navigator.geolocation) {
      setAdviceWithNotify('Geolocation is not supported by your browser.');
      setLocationMode(false);
      try { window.localStorage.setItem('stms_location_mode', 'false'); } catch {}
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationMode(true);
        try { window.localStorage.setItem('stms_location_mode', 'true'); } catch {}
        setSelectedDestinationId(null);
        setFocusBounds(null);
        setFocusZoom(15);
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
      },
      () => {
        setAdviceWithNotify('Location permission denied. You can still click on the map.');
        setLocationMode(false);
        try { window.localStorage.setItem('stms_location_mode', 'false'); } catch {}
      }
    );
  }, []);

  const handleDestinationSelection = async (destination, preserveLocation = false) => {
    if (!destination) return;
    // Clear any active report/highlight markers so map focus is deterministic
    setReportHighlight(null);
    setHoverReportHighlight(null);

    if (selectedDestinationId === destination.id) {
      setSelectedDestinationId(null);
      setSelectedLocation(null);
      setFocusBounds(null);
      setFocusZoom(locationMode ? 15 : null);
      setAdviceWithNotify('Showing all tourist destinations. Click any destination to focus on it.');
      return;
    }

    // Show loading overlay on the map while we fetch details
    setFocusLoading(true);
    setFocusBounds(null);
    setFocusZoom(null);
    setSelectedDestinationId(destination.id);
    setLastClickLocation({ lat: destination.lat, lng: destination.lng });
    setAdviceWithNotify(`Loading details for ${destination.name}...`);

    await fetchNearbyInfo(
      destination.lat,
      destination.lng,
      preserveLocation ? () => {} : setSelectedLocation,
      setNearest,
      setNearbyDangers
    );
    await fetchDestinationDescription(destination, setAdviceWithNotify);

    // After loading finished set the selected location (if not preserved) and stop loading overlay
    if (!preserveLocation) {
      setSelectedLocation({ lat: destination.lat, lng: destination.lng });
    }
    setFocusLoading(false);
  };

  const handleSelectDestination = async (destination) => {
    await handleDestinationSelection(destination);
  };

  const toggleDestinationFocus = async (destination) => {
    await handleDestinationSelection(destination);
  };

  const clearSelectedDestination = () => {
    console.debug('clearSelectedDestination called', { userLocation, selectedDestinationId });
    setSelectedDestinationId(null);
    setFocusBounds(null);
    setFocusZoom(locationMode ? 15 : null);
    if (userLocation) {
      setSelectedLocation(userLocation);
    } else {
      setSelectedLocation(null);
    }
    setAdviceWithNotify('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const handleReportHover = (type) => setHoverReportHighlight(type);
  const handleReportHoverEnd = () => setHoverReportHighlight(null);
  const handleReportSelect = (type) => {
    // Clear hover highlight immediately so active highlight updates predictably
    setHoverReportHighlight(null);

    // If selecting the same type again, deselect and clear focus
    if (reportHighlight === type) {
      setReportHighlight(null);
      setSelectedLocation(null);
      setFocusBounds(null);
      setFocusZoom(locationMode ? 15 : null);
      return;
    }

    // Otherwise set the new highlight and compute focus
    setReportHighlight(type);
    setFocusZoom(null);

    // Determine which coordinates to focus based on the report type
    let coords = [];
    if (!type) {
      setSelectedLocation(null);
      return;
    }

    if (type === 'all-destinations') {
      coords = destinations.map((d) => [Number(d.lat), Number(d.lng)]).filter((c) => c[0] && c[1]);
    } else if (type === 'high-crowd') {
      coords = destinations.filter((d) => d.crowd_level === 'High').map((d) => [Number(d.lat), Number(d.lng)]).filter((c) => c[0] && c[1]);
    } else if (type === 'high-danger') {
      coords = dangerPins.filter((p) => p.severity === 'High').map((p) => [Number(p.lat), Number(p.lng)]).filter((c) => c[0] && c[1]);
    } else if (type && type.startsWith('marker-')) {
      const matchType = type.replace('marker-', '').replace(/-/g, ' ');
      coords = dangerPins.filter((p) => (p.danger_type || '').toLowerCase() === matchType.toLowerCase()).map((p) => [Number(p.lat), Number(p.lng)]).filter((c) => c[0] && c[1]);
    } else if (type && type.startsWith('recent-')) {
      // recent report selection: try to find by id
      const id = type.replace('recent-', '');
      const found = (report?.recent_reports || []).find((r) => String(r.id) === String(id));
      if (found && found.coords) {
        const parts = String(found.coords).split(',').map((s) => Number(s.trim()));
        if (parts.length >= 2) coords = [[parts[0], parts[1]]];
      }
    }

    if (coords.length > 1) {
      setSelectedLocation(null);
      setFocusBounds({ coords });
    } else if (coords.length === 1) {
      setFocusBounds(null);
      const [lat, lng] = coords[0];
      setSelectedLocation({ lat, lng });
    } else {
      setSelectedLocation(null);
      setFocusBounds(null);
    }
  };
  const activeReportHighlight = hoverReportHighlight || reportHighlight;

  const resetMapView = () => {
    setResetMapFlag((prev) => prev + 1);
    setFocusBounds(null);
    setFocusZoom(null);
  };

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setIsModalOpen(false);
    setLoginPromptMessage('');
  };

  const handleLogout = () => {
    setUser(null);
    setIsModalOpen(false);
    setLoginPromptMessage('');
    setPinMode(false);
    setPendingMarkerLocation(null);
  };

  const handleDeleteAccount = async () => {
    if (!user?.email) {
      setAdviceWithNotify('Unable to delete account: no logged in user.');
      return;
    }

    try {
      await deleteAccount(user.email);
      window.localStorage.removeItem('stms_remembered_login');
      setUser(null);
      setIsModalOpen(false);
      setPinMode(false);
      setPendingMarkerLocation(null);
      setAdviceWithNotify('Your account has been deleted. Login or register again to continue.');
    } catch (error) {
      setAdviceWithNotify(error.message || 'Failed to delete account.');
    }
  };

  const closeLoginModal = () => {
    setIsModalOpen(false);
    setLoginPromptMessage('');
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

      <section className="dashboard-grid">

        <div className="map-panel">
          <div className="map-card">
            <AIGuidance advice={advice} routeAdvice={routeAdvice} nearest={nearest} />
            <div className="floating-side-nav-wrapper">
              <MapControlLeft
                onMyLocation={toggleLocationMode}
                onCurrentLocation={activateCurrentLocation}
                onHazardSubmit={submitMarker}
                onCenterTouristSpot={toggleDestinationFocus}
                onSelectDestination={handleSelectDestination}
                onClearSelection={clearSelectedDestination}
                onReportHover={handleReportHover}
                onReportHoverEnd={handleReportHoverEnd}
                onReportSelect={handleReportSelect}
                reportHighlight={activeReportHighlight}
                touristSpots={destinations}
                nearest={nearest}
                nearbyDangers={nearbyDangers}
                report={report}
                selectedDestinationId={selectedDestinationId}
                selectedLocation={userLocation}
                userLocation={userLocation}
                locationMode={locationMode}
                isBoxExpanded={isNavExpanded}
                setIsBoxExpanded={setIsNavExpanded}
                isPinMode={pinMode}
                onAddMarker={togglePinMode}
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
              focusLoading={focusLoading}
              pendingMarkerLocation={pendingMarkerLocation}
              selectedMarkerType={selectedMarkerType}
              reportHighlight={activeReportHighlight}
              user={user}
              theme={theme}
              onLogin={(msg) => { const text = (typeof msg === 'string') ? msg : ''; if (text) setLoginPromptMessage(text); setIsModalOpen(true); }}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              onToggleTheme={toggleTheme}
              onResetMap={() => setResetMapFlag((prev) => prev + 1)}
              resetMapFlag={resetMapFlag}
              onLocationClick={handleMapClick}
              onMapBackgroundClick={clearSelectedDestination}
              onSetAdvice={setAdviceWithNotify}
              onSetRouteAdvice={setRouteAdviceWithNotify}
              isPinMode={pinMode}
              onAddComment={addMarkerComment}
              onUpdateComment={updateMarkerComment}
              onDeleteComment={deleteMarkerComment}
              onDeletePin={deletePin}
              focusBounds={focusBounds}
              focusZoom={focusZoom}
              focusLocation={selectedLocation || lastClickLocation}
              userLocation={userLocation}
              locationMode={locationMode}
            />
          </div>
        </div>
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
      </section>

      <LoginModal
        isOpen={isModalOpen}
        onClose={closeLoginModal}
        onLoginSuccess={handleLoginSuccess}
        api={API}
        promptMessage={loginPromptMessage}
      />
    </div>
  );
}

export default App;
