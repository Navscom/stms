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
  const [advice, setAdvice] = useState('');

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
  const [focusZoom, setFocusZoom] = useState(undefined);
  const [focusLoading, setFocusLoading] = useState(false);
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
      await loadDangerPins(setDangerPins);
      setAdviceWithNotify('Comment added to marker.');
    } catch (err) {
      alert(err.message);
    }
  };

  const updateMarkerComment = async (pinId, commentId, comment) => {
    try {
      await updatePinComment(pinId, commentId, { comment }, {
        requesting_user_id: user?.id,
        requesting_role: user?.role,
      });
      await loadDangerPins(setDangerPins);
      setAdviceWithNotify('Comment updated successfully.');
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteMarkerComment = async (pinId, commentId) => {
    try {
      await deletePinComment(pinId, commentId, {
        requesting_user_id: user?.id,
        requesting_role: user?.role,
      });
      await loadDangerPins(setDangerPins);
      setAdviceWithNotify('Comment deleted.');
    } catch (err) {
      alert(err.message);
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
    if (pinMode) return startMarkerPlacement(lat, lng);
    if (locationMode) {
      setAdviceWithNotify('My Location ON. Turn it off to select another spot.');
      return;
    }
    const clickedLocation = { lat, lng };
    setLastClickLocation(clickedLocation);
    setUserLocation(clickedLocation);
    setSelectedLocation(clickedLocation);
    // Zoom in slightly when the user explicitly selects a location on the map
    // so behavior matches the My Location flow and gives a closer view.
    setFocusZoom(15);
    setSelectedDestinationId(null);
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
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
        // Zoom in when using My Location to provide a closer view of the surroundings
        setFocusZoom(15);
        await fetchAdvice(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setAdviceWithNotify('Location permission denied. You can still click on the map.');
        try { window.localStorage.setItem('stms_location_mode', 'false'); } catch {}
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
        const currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLocation);
        setSelectedLocation(currentLocation);
        setFocusZoom(15);
        await fetchAdvice(pos.coords.latitude, pos.coords.longitude);
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
      setAdviceWithNotify('Showing all tourist destinations. Click any destination to focus on it.');
      return;
    }

    // Show loading overlay on the map while we fetch details
    setFocusLoading(true);
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

    // After loading finished, set the selected location (if not preserved) and stop loading overlay
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

  const zoomToDestination = async (destination) => {
    if (!destination) return;
    // When zooming to a destination from the UI, we should focus the
    // destination itself (do not preserve the previous user-selected
    // location) to avoid the map snapping back to the user's marker.
    await handleDestinationSelection(destination, false);
  };

  const clearSelectedDestination = () => {
    console.debug('clearSelectedDestination called', { userLocation, selectedDestinationId });
    setSelectedDestinationId(null);
    // Restore selection to the user's current location (if available) and zoom in.
    if (userLocation) {
      setSelectedLocation(userLocation);
      setFocusZoom(15);
    } else {
      setSelectedLocation(null);
      setFocusZoom(undefined);
    }
    setAdviceWithNotify('Showing all tourist destinations. Click any destination to focus on it.');
  };

  const handleReportHover = (type) => setHoverReportHighlight(type);
  const handleReportHoverEnd = () => setHoverReportHighlight(null);
  const computeCenterAndZoom = (coords) => {
    if (!coords || !coords.length) {
      return { center: null, zoom: undefined };
    }
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    coords.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    const center = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);
    let zoom;
    if (maxDiff < 0.01) zoom = 15;
    else if (maxDiff < 0.05) zoom = 13;
    else if (maxDiff < 0.2) zoom = 11;
    else if (maxDiff < 1) zoom = 9;
    else zoom = 6;
    return { center, zoom };
  };

  const handleReportSelect = (type) => {
    // Clear hover highlight immediately so active highlight updates predictably
    setHoverReportHighlight(null);

    // If selecting the same type again, deselect and clear focus
    if (reportHighlight === type) {
      setReportHighlight(null);
      setSelectedLocation(null);
      setFocusZoom(undefined);
      return;
    }

    // Otherwise set the new highlight and compute focus
    setReportHighlight(type);

    // Determine which coordinates to focus based on the report type
    let coords = [];
    if (!type) {
      setSelectedLocation(null);
      setFocusZoom(undefined);
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

    const { center, zoom } = computeCenterAndZoom(coords);
    if (center) {
      setSelectedLocation({ lat: center[0], lng: center[1] });
      // If there are multiple coordinates, zoom out slightly to ensure all highlighted markers are visible.
      if ((coords || []).length > 1) {
        const targetZoom = Math.max(6, (typeof zoom === 'number' ? zoom : 8) - 1);
        setFocusZoom(targetZoom);
      } else {
        // Single item: focus closer for detail
        setFocusZoom(15);
      }
    } else {
      // fallback: don't change zoom, just clear selection
      setSelectedLocation(null);
    }
  };
  const activeReportHighlight = hoverReportHighlight || reportHighlight;

  const resetMapView = () => {
    setResetMapFlag((prev) => prev + 1);
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
            <AIGuidance advice={advice} nearest={nearest} />
            <div className="floating-side-nav-wrapper">
              <MapControlLeft
                onMyLocation={toggleLocationMode}
                onHazardSubmit={submitMarker}
                onCenterTouristSpot={toggleDestinationFocus}
                onZoomToSpot={zoomToDestination}
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
              onAddComment={addMarkerComment}
              onUpdateComment={updateMarkerComment}
              onDeleteComment={deleteMarkerComment}
              onDeletePin={deletePin}
              focusLocation={selectedLocation || lastClickLocation}
              focusZoom={focusZoom ?? (selectedDestinationId ? 15 : undefined)}
              userLocation={userLocation}
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
