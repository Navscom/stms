import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapView.css';
import L from 'leaflet';
import MapControlRight from './MapControlRight';
import { formatDuration, isPinInactive } from '../utils/pinHelpers';
import { API } from '../utils';
import {
  ICONS,
  LIGHT_TILE_URL,
  DARK_TILE_URL,
  DESTINATION_ICON,
  START_ICON,
  LOCATION2_ICON,
  LOCATION1_ICON,
  PERSON_ICON,
  getDangerIcon,
  getDestinationIcon,
  dangerStyles,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from './mapIcons';
import {
  phBounds,
  normalizeLatLng,
  centerMapWithOffset,
  loadStoredMapState,
  formatTimestamp,
} from './mapUtils';
import {
  MapClickHandler,
  MapResetHandler,
  MapAutoFocusHandler,
  PopupClearHandler,
  MapSyncHandler,
  MapResizeHandler,
  SafeTileLayer,
} from './mapHandlers';
import { DangerMarker } from './mapMarkers';

export default function MapView({
  onLocationClick = () => {},
  destinations = [],
  dangerPins = [],
  nearbyDangers = [],
  selectedLocation,
  pendingMarkerLocation,
  selectedMarkerType = 'Danger Area',
  selectedDestinationId,
  reportHighlight,
  onDestinationClick = () => {},
  onMapBackgroundClick = () => {},
  onSetAdvice = () => {},
  onSetRouteAdvice = () => {},
  isPinMode = false,
  user,
  onLogin,
  onLogout,
  onDeleteAccount,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onDeletePin,
  onToggleTheme,
  onResetMap,
  resetMapFlag,
  focusLocation,
  focusBounds = null,
  focusZoom = null,
  focusLoading = false,
  userLocation,
  locationMode = false,
  theme = 'light',
  mapRotation = 0,
  onUpdatePendingMarkerLocation = () => {},
}) {
  useEffect(() => {
    console.log('MapView Props Debug:', {
      destinations: destinations?.length || 0,
      dangerPins: dangerPins?.length || 0,
      nearbyDangers: nearbyDangers?.length || 0,
      pendingMarkerLocation,
      selectedMarkerType,
    });
  }, [destinations, dangerPins, nearbyDangers, pendingMarkerLocation, selectedMarkerType]);

  const nearbyIds = useMemo(() => new Set((nearbyDangers || []).map((d) => d.id)), [nearbyDangers]);
  const visibleDangerPins = useMemo(() => (dangerPins || []).filter((p) => !isPinInactive(p)), [dangerPins]);

  const destinationRiskColors = {
    Low: '#16a34a',
    Moderate: '#f59e0b',
    High: '#dc2626',
  };

  const getDestinationRiskStyle = (crowdLevel) => {
    const color = destinationRiskColors[crowdLevel] || destinationRiskColors.Low;
    return {
      color,
      fillColor: color,
      fillOpacity: 0.18,
      weight: 2,
    };
  };

  const [initialMapState] = useState(loadStoredMapState);
  const destinationMarkerRefs = useRef({});
  const tileLayerRef = useRef(null);
  const tileLayerUrl = theme === 'dark' ? DARK_TILE_URL : LIGHT_TILE_URL;
  const totalMarkers = useMemo(() => (destinations?.length || 0) + ((dangerPins || []).length || 0), [destinations, dangerPins]);
  const useCanvasMarkers = totalMarkers > 150;
  const mapWrapperStyle = {
    '--map-rotation': `${mapRotation}deg`,
  };

  const wrapperRef = useRef(null);
  const mapRef = useRef(null);
  const routeAbortController = useRef(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [routeTarget, setRouteTarget] = useState(null);
  const [routeStart, setRouteStart] = useState(null);
  const [routeStartLocked, setRouteStartLocked] = useState(false);
  const [routeHidePins, setRouteHidePins] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingSelecting, setRoutingSelecting] = useState(null);
  const [avoidDanger, setAvoidDanger] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [location2CooldownActive, setLocation2CooldownActive] = useState(false);
  const location2CooldownTimer = useRef(null);
  const hasUserLocation = userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number';
  const routeStartUsesUserLocation = routeStart && userLocation &&
    Math.abs(routeStart.lat - userLocation.lat) < 1e-6 &&
    Math.abs(routeStart.lng - userLocation.lng) < 1e-6;

  const startLocation2Cooldown = () => {
    setLocation2CooldownActive(true);
    if (location2CooldownTimer.current) window.clearTimeout(location2CooldownTimer.current);
    location2CooldownTimer.current = window.setTimeout(() => {
      setLocation2CooldownActive(false);
      location2CooldownTimer.current = null;
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (location2CooldownTimer.current) window.clearTimeout(location2CooldownTimer.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (routeAbortController.current) {
          routeAbortController.current.abort();
          routeAbortController.current = null;
        }
      } catch (e) { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (routeTarget) {
      startLocation2Cooldown();
    }
  }, [routeTarget]);

  useEffect(() => {
    const handler = (e) => {
      const mode = e?.detail?.mode;
      const useMyLocation = Boolean(e?.detail?.useMyLocation);
      if (mode === 'start') {
        if (useMyLocation) {
          if (userLocation && typeof userLocation.lat === 'number') {
            setRouteStart({ lat: userLocation.lat, lng: userLocation.lng });
            setRouteStartLocked(true);
            setRoutingSelecting('end');
            setRoutingOpen(true);
          } else {
            onSetRouteAdvice('Enable My Location first to use GPS as the route start.');
          }
        } else {
          setRouteStartLocked(false);
          setRoutingSelecting('start');
          setRoutingOpen(true);
        }
      } else if (mode === 'end') {
        setRoutingSelecting('end');
        setRoutingOpen(true);
      } else if (mode === 'clear') {
        setRouteStart(null);
        setRouteTarget(null);
        setRouteGeoJson(null);
        setRouteHidePins(false);
        setRoutingSelecting(null);
        setRouteStartLocked(false);
        setRoutingOpen(false);
      } else if (mode === 'open') {
        setRoutingOpen(Boolean(e.detail?.open));
        if (!e.detail?.open) setRoutingSelecting(null);
      }
    };
    window.addEventListener('stms:route-select', handler);
    return () => window.removeEventListener('stms:route-select', handler);
  }, [userLocation, onSetRouteAdvice]);

  useEffect(() => {
    try {
      const ev = new CustomEvent('stms:route-update', { detail: { routeStart, routeTarget, routingSelecting, routingOpen } });
      window.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }, [routeStart, routeTarget, routingSelecting, routingOpen]);

  useEffect(() => {
    const adjustHeight = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const controls = document.querySelector('.map-controls-wrapper') || document.querySelector('.map-controls-left');
      const controlsHeight = controls ? (controls.getBoundingClientRect && controls.getBoundingClientRect().height) || 0 : 0;

      const isPortrait = window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : window.innerHeight > window.innerWidth;
      const extraReserve = isPortrait ? 150 : 0;

      const newHeight = Math.max(200, window.innerHeight - controlsHeight - extraReserve);
      wrapper.style.height = `${newHeight}px`;
      wrapper.style.maxHeight = `${newHeight}px`;

      setTimeout(() => window.dispatchEvent(new Event('resize')), 180);
    };

    adjustHeight();
    window.addEventListener('resize', adjustHeight);
    window.addEventListener('orientationchange', adjustHeight);

    const observedTarget = document.querySelector('.map-controls-wrapper') || document.body;
    const mo = new MutationObserver(adjustHeight);
    mo.observe(observedTarget, { attributes: true, childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', adjustHeight);
      window.removeEventListener('orientationchange', adjustHeight);
      try { mo.disconnect(); } catch (e) { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (!selectedDestinationId) return;
    const marker = destinationMarkerRefs.current[selectedDestinationId];
    if (!marker) return;

    try {
      const map = marker._map || (marker.getPopup && marker._map);
      const latlng = (marker.getLatLng && marker.getLatLng()) || { lat: marker._latlng?.lat, lng: marker._latlng?.lng };
      if (map && latlng) {
        const focusLat = focusLocation && (focusLocation.lat ?? focusLocation[0]);
        const focusLng = focusLocation && (focusLocation.lng ?? focusLocation[1]);
        const markerLat = latlng.lat ?? latlng[0];
        const markerLng = latlng.lng ?? latlng[1];
        const sameFocus = (typeof focusLat === 'number' && typeof focusLng === 'number')
          && Math.abs(focusLat - markerLat) < 1e-6
          && Math.abs(focusLng - markerLng) < 1e-6;

        if (!focusLocation || sameFocus) {
          centerMapWithOffset(map, latlng);
        }
      }
    } catch (e) { /* ignore */ }

    const t = setTimeout(() => {
      try {
        if (typeof marker.openPopup === 'function') marker.openPopup();
        else if (marker.leafletElement && typeof marker.leafletElement.openPopup === 'function') marker.leafletElement.openPopup();
      } catch (e) { /* ignore */ }
    }, 450);

    return () => clearTimeout(t);
  }, [selectedDestinationId, focusLocation]);

  const fetchRoute = async (start, end) => {
    setRouteGeoJson(null);
    onSetRouteAdvice('Calculating route...');
    setRouteLoading(true);
    console.debug('Route request started', { start, end, avoidDanger });

    try {
      try {
        if (routeAbortController.current) {
          routeAbortController.current.abort();
          routeAbortController.current = null;
        }
      } catch (e) { /* ignore */ }
      routeAbortController.current = new AbortController();
      const signal = routeAbortController.current.signal;

      const routePath = `/route?start_lat=${encodeURIComponent(start.lat)}&start_lng=${encodeURIComponent(start.lng)}&end_lat=${encodeURIComponent(end.lat)}&end_lng=${encodeURIComponent(end.lng)}&avoid_danger=${avoidDanger ? '1' : '0'}`;
      const routeUrl = `${API}${routePath}`;
      let resp;
      try { resp = await fetch(routeUrl, { signal }); } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        const fallback = `http://localhost:8000${routePath}`;
        console.warn('API fetch failed, retrying to', fallback, err);
        resp = await fetch(fallback, { signal });
      }
      if (!resp.ok && avoidDanger) {
        const fallbackPath = `/route?start_lat=${encodeURIComponent(start.lat)}&start_lng=${encodeURIComponent(start.lng)}&end_lat=${encodeURIComponent(end.lat)}&end_lng=${encodeURIComponent(end.lng)}&avoid_danger=0`;
        const fallbackUrl = `${API}${fallbackPath}`;
        console.warn('Safe route failed, retrying normal route', resp.status, resp.statusText);
        try {
          resp = await fetch(fallbackUrl, { signal });
        } catch (err) {
          if (err && err.name === 'AbortError') throw err;
          const fallback = `http://localhost:8000${fallbackPath}`;
          console.warn('Retry normal route failed, retrying to', fallback, err);
          resp = await fetch(fallback, { signal });
        }
      }
      if (!resp.ok) {
        let errorMessage = `Routing failed (${resp.status})`;
        try {
          const errorBody = await resp.json();
          if (errorBody && (errorBody.detail || errorBody.message)) {
            errorMessage = errorBody.detail || errorBody.message;
          }
        } catch (_err) {
          // ignore JSON parsing errors
        }
        throw new Error(errorMessage);
      }
      const data = await resp.json();
      setRouteGeoJson(data);
      onSetRouteAdvice(data?.route_advice || '');

      try {
        if (mapRef.current && data && data.features && data.features.length) {
          const coords = data.features[0].geometry.coordinates.map((c) => [c[1], c[0]]);
          if (coords.length) {
            const snappedStart = { lat: coords[0][0], lng: coords[0][1] };
            const snappedEnd = { lat: coords[coords.length - 1][0], lng: coords[coords.length - 1][1] };
            setRouteStart(snappedStart);
            setRouteTarget(snappedEnd);
          }

          const bounds = L.latLngBounds(coords);
          try {
            const center = bounds.getCenter();
            centerMapWithOffset(mapRef.current, { lat: center.lat, lng: center.lng });
          } catch (e) {
            try {
              if (typeof bounds.pad === 'function') mapRef.current.fitBounds(bounds.pad(0.12));
              else mapRef.current.fitBounds(bounds);
            } catch (_) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore fit errors */ }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        console.debug('Route fetch aborted');
        return;
      }
      console.error('Route fetch failed', e);
      const message = e?.message || 'Failed to fetch route.';
      onSetRouteAdvice(message);
    } finally {
      try { if (routeAbortController.current) { routeAbortController.current = null; } } catch {}
      setRouteLoading(false);
      console.debug('Route request complete', { start, end, routeLoading: false });
    }
  };

  const selectedDestination = useMemo(
    () => (destinations || []).find((destinationItem) => destinationItem.id === selectedDestinationId) || null,
    [destinations, selectedDestinationId]
  );

  useEffect(() => {
    if (!selectedDestinationId) {
      setRouteGeoJson(null);
      setRouteTarget(null);
      setRouteStart(null);
      setRouteHidePins(false);
      return;
    }

    if (!userLocation || !selectedDestination) {
      return;
    }

    const start = { lat: userLocation.lat, lng: userLocation.lng };
    const target = { lat: selectedDestination.lat, lng: selectedDestination.lng };
    setRouteStart(start);
    setRouteTarget(target);
    setRouteHidePins(true);
    fetchRoute(start, target);
  }, [selectedDestinationId, userLocation, selectedDestination]);

  const handleMapClick = async (lat, lng) => {
    if (isPinMode) {
      onLocationClick(lat, lng);
      return;
    }

    if (locationMode && !routingSelecting) {
      onSetRouteAdvice('My Location is enabled. Use the routing controls to select start or destination, or turn My Location off.');
      return;
    }

    if (routingSelecting === 'start') {
      setRouteHidePins(false);
      setRouteStart({ lat, lng });
      setRouteTarget(null);
      setRouteGeoJson(null);
      setRoutingSelecting('end');
      return;
    }

    if (routingSelecting === 'end') {
      const start = routeStart || userLocation;
      if (!start) {
        onSetRouteAdvice('I need your location to provide route guidance. Enable My Location and select a destination.');
        return;
      }
      if (location2CooldownActive) {
        onSetRouteAdvice('Please wait 5 seconds before placing your destination again as we are calculating the route.');
        return;
      }
      setRouteHidePins(false);
      setRouteTarget({ lat, lng });
      await fetchRoute(start, { lat, lng });
      setRoutingSelecting(null);
      setRoutingOpen(false);
      return;
    }

    if (routeStart) {
      if (location2CooldownActive) {
        onSetRouteAdvice('Please wait 5 seconds before placing your destination again, as we are calculating the route.');
        return;
      }
      setRouteHidePins(false);
      setRouteTarget({ lat, lng });
      await fetchRoute(routeStart, { lat, lng });
      return;
    }

    if (userLocation && locationMode) {
      const start = userLocation;
      if (location2CooldownActive) {
        onSetRouteAdvice('Please wait 5 seconds before placing location 2 again.');
        return;
      }
      setRouteHidePins(false);
      setRouteStart(start);
      setRouteTarget({ lat, lng });
      await fetchRoute(start, { lat, lng });
      setRoutingOpen(false);
      return;
    }

    if (onMapBackgroundClick) onMapBackgroundClick();
  };

  const tileEventHandlers = {};
  return (
    <div ref={wrapperRef} className="map-container-wrapper" data-theme={theme} data-rotation={mapRotation} style={mapWrapperStyle}>
      <MapControlRight
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        onToggleTheme={onToggleTheme}
        onResetMap={onResetMap}
        theme={theme}
        avoidDanger={avoidDanger}
        onToggleAvoidDanger={() => setAvoidDanger((v) => !v)}
      />
      <MapContainer
        id="map"
        className="map-container"
        center={initialMapState.center}
        zoom={initialMapState.zoom}
        maxBounds={phBounds}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={18}
        zoomControl={false}
        zoomAnimation={true}
        zoomSnap={1}
        zoomDelta={1}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        preferCanvas={true}
        markerZoomAnimation={true}
        fadeAnimation={true}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(m) => { mapRef.current = m; }}
      >
        <TileLayer
          ref={tileLayerRef}
          url={tileLayerUrl}
          attribution="&copy; OpenStreetMap contributors"
          updateWhenZooming={false}
          updateWhenIdle={true}
          keepBuffer={2}
          detectRetina={false}
        />
        <MapClickHandler onLocationClick={handleMapClick} />
        <MapResetHandler
          defaultCenter={DEFAULT_MAP_CENTER}
          defaultZoom={DEFAULT_MAP_ZOOM}
          resetFlag={resetMapFlag}
        />
        <MapAutoFocusHandler
          focusLocation={focusLocation}
          focusBounds={focusBounds}
          focusZoom={focusZoom}
          loading={focusLoading}
          isPinMode={isPinMode}
          routeStart={routeStart}
          routeTarget={routeTarget}
          routeGeoJson={routeGeoJson}
        />
        <PopupClearHandler
          selectedDestinationId={selectedDestinationId}
          reportHighlight={reportHighlight}
          focusLocation={focusLocation}
          resetMapFlag={resetMapFlag}
        />
        <MapSyncHandler theme={theme} />
        <MapResizeHandler />

        {!routeHidePins && routeStart && !routeStartUsesUserLocation && (
          <Marker position={[routeStart.lat, routeStart.lng]} icon={LOCATION1_ICON}>
            <Popup>Route start (click again to set destination)</Popup>
          </Marker>
        )}

        {!routeHidePins && routeTarget && (
          <Marker position={[routeTarget.lat, routeTarget.lng]} icon={LOCATION2_ICON}>
            <Popup>Route destination</Popup>
          </Marker>
        )}

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={PERSON_ICON}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {routeGeoJson && (
          <GeoJSON data={routeGeoJson} style={{ color: '#2563eb', weight: 5, opacity: 0.95 }} />
        )}

        {destinations.map((d) => {
          const isSelected = selectedDestinationId === d.id;
          const isHighlighted = reportHighlight && reportHighlight.latitude === d.lat && reportHighlight.longitude === d.lng;
          return (
            <Marker
              key={d.id}
              ref={(el) => { destinationMarkerRefs.current[d.id] = el; }}
              position={[d.lat, d.lng]}
              icon={getDestinationIcon(isSelected || isHighlighted)}
              eventHandlers={{
                click: (event) => {
                  if (event.originalEvent) event.originalEvent.stopPropagation();
                  onDestinationClick(d);
                },
              }}
            >
              <Popup maxWidth={320}>
                <div onClick={(e) => e.stopPropagation()}>
                  <strong>{d.name}</strong><br />
                  Category: <b>{d.category}</b><br />
                  City: {d.city}, {d.province}<br />
                  Crowd Level: <b>{d.crowd_level}</b><br />
                  <small>{d.description}</small>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {visibleDangerPins.map((pin) => {
          const isNearby = nearbyIds.has(pin.id);
          const isHighlighted = reportHighlight && reportHighlight.id === pin.id && reportHighlight.isPin;
          const dangerType = pin?.danger_type || 'Danger Area';
          const icon = getDangerIcon(pin, isNearby, isHighlighted);
          const meta = dangerStyles[dangerType] || dangerStyles['Danger Area'];

          return (
            <DangerMarker
              key={pin.id}
              pin={pin}
              icon={icon}
              style={meta}
              highlighted={isHighlighted}
              isNearby={isNearby}
              user={user}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onDeletePin={onDeletePin}
              onLogin={onLogin}
            />
          );
        })}

        {pendingMarkerLocation && isPinMode && (
          <Marker
            position={[pendingMarkerLocation.lat, pendingMarkerLocation.lng]}
            icon={getDangerIcon({ danger_type: selectedMarkerType }, false, true)}
            draggable={true}
            eventHandlers={{
              dragend: (event) => {
                const latLng = event.target.getLatLng();
                onUpdatePendingMarkerLocation(latLng.lat, latLng.lng);
              },
            }}
          >
            <Popup>Drag to place your marker, then click "Submit"</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
