import { Fragment, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapView.css';
import MapControlRight from './MapControlRight';
import CommentBox from './Comments';
import L from 'leaflet';
import { formatDuration, isPinInactive } from '../utils/pinHelpers';

const phBounds = [[4.0, 116.0], [21.5, 127.0]];

const createIcon = (iconUrl) => new L.Icon({
  iconUrl,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const ICONS = {
  blue: createIcon('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png'),
  red: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'),
  orange: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png'),
  yellow: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'),
  violet: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png'),
  green: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'),
};

const dangerStyles = {
  'Danger Area': { color: '#dc2626', icon: ICONS.red },
  'Dark Area': { color: '#111827', icon: ICONS.violet },
  'Crowdy Area': { color: '#f59e0b', icon: ICONS.yellow },
  'Dangerous Animals': { color: '#f97316', icon: ICONS.orange },
  'Hazard on Area': { color: '#7c3aed', icon: ICONS.violet },
};

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const DESTINATION_ICON = new L.DivIcon({
  html: '<div class="destination-pin"><span>🏛️</span></div>',
  className: 'destination-pin-icon',
  iconSize: [52, 68],
  iconAnchor: [26, 68],
  popupAnchor: [0, -56],
});

const getDestinationIcon = (highlighted = false) => new L.DivIcon({
  html: `<div class="destination-pin${highlighted ? ' destination-pin--highlighted' : ''}"><span>🏛️</span></div>`,
  className: 'destination-pin-icon',
  iconSize: [52, 68],
  iconAnchor: [26, 68],
  popupAnchor: [0, -56],
});

const dangerMarkerMeta = {
  'Danger Area': { color: '#dc2626', emoji: '❗', extraClass: 'danger-area' },
  'Dark Area': { color: '#111827', emoji: '🌙', extraClass: 'dark-area' },
  'Crowdy Area': { color: '#f59e0b', emoji: '👥', extraClass: 'crowdy-area' },
  'Dangerous Animals': { color: '#f97316', emoji: '🐾', extraClass: 'dangerous-animals' },
  'Hazard on Area': { color: '#7c3aed', emoji: '⚠️', extraClass: 'hazard-area' },
};

const createDangerIcon = ({ color, emoji, extraClass, isNearby = false, highlighted = false }) => new L.DivIcon({
  html: `<div class="danger-pin danger-pin--${extraClass}${isNearby ? ' danger-pin--nearby' : ''}${highlighted ? ' danger-pin--highlighted' : ''}" style="background: ${color};">` +
    `<span>${emoji}</span></div>`,
  className: 'danger-pin-icon',
  iconSize: [44, 56],
  iconAnchor: [22, 56],
  popupAnchor: [0, -44],
});

const getDangerIcon = (pin, isNearby, highlighted = false) => {
  const meta = dangerMarkerMeta[pin.danger_type] || dangerMarkerMeta['Danger Area'];
  return createDangerIcon({ ...meta, isNearby, highlighted });
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const PERSON_ICON = new L.DivIcon({
  html: '<div class="person-pin"><span>YOU</span><div class="person-pin-tail"></div></div>',
  className: 'person-pin-icon',
  iconSize: [54, 74],
  iconAnchor: [27, 74],
  popupAnchor: [0, -60],
});

const DEFAULT_MAP_CENTER = [14.5994, 120.9842];
const DEFAULT_MAP_ZOOM = 12;
const MAP_STATE_KEY = 'stms_map_state';

// Shared canvas renderer for vector layers to reduce SVG overhead during zoom/pan
const SHARED_CANVAS_RENDERER = L.canvas({ padding: 0.5 });

const normalizeLatLng = (lat, lng) => [Number(lat) || 0, Number(lng) || 0];
const normalizeRadius = (radius) => Math.max(Number(radius) || 0, 0);

// How many pixels above the marker the map center should be (positive moves center up,
// which places the marker lower on the screen). Adjust this value to taste.
const DEFAULT_FOCUS_OFFSET_PX = 120;

const centerMapWithOffset = (map, latlng, zoom, offsetY = DEFAULT_FOCUS_OFFSET_PX) => {
  if (!map || !latlng) return;
  const targetZoom = typeof zoom === 'number' ? zoom : map.getZoom();
  try {
    const point = map.project(L.latLng(latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]), targetZoom);
    const targetPoint = L.point(point.x, point.y - offsetY);
    const targetLatLng = map.unproject(targetPoint, targetZoom);
    // Use a slightly quicker, smooth fly animation for focus changes
    map.flyTo(targetLatLng, targetZoom, { animate: true, duration: 0.45 });
  } catch (e) {
    // Fallback to simple setView if projection fails
    try {
      // Prefer animated setView/flyTo where possible for smooth zooming
      map.flyTo([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], targetZoom, { animate: true, duration: 0.45 });
    } catch {
      try { map.setView([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], targetZoom, { animate: true }); } catch { /* ignore */ }
    }
  }
};

const loadStoredMapState = () => {
  try {
    const stored = window.localStorage.getItem(MAP_STATE_KEY);
    if (!stored) return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
    const parsed = JSON.parse(stored);
    const center = Array.isArray(parsed?.center) && parsed.center.length === 2
      ? [Number(parsed.center[0]), Number(parsed.center[1])]
      : DEFAULT_MAP_CENTER;
    const zoom = Number(parsed?.zoom);
    if (Number.isNaN(zoom)) {
      return { center, zoom: DEFAULT_MAP_ZOOM };
    }
    return {
      center,
      zoom: Math.min(Math.max(zoom, 6), 18),
    };
  } catch {
    return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
  }
};

function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      try { window.dispatchEvent(new Event('ai:user-click')); } catch (e) { /* ignore */ }
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ZoomControlHandler() {
  const map = useMap();

  const controlRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const applyZoomTooltips = (zoomControl) => {
      const zoomInButton = zoomControl._zoomInButton || zoomControl._container?.querySelector('.leaflet-control-zoom-in');
      const zoomOutButton = zoomControl._zoomOutButton || zoomControl._container?.querySelector('.leaflet-control-zoom-out');

      if (zoomInButton) {
        zoomInButton.setAttribute('data-tooltip', 'Zoom in');
        zoomInButton.setAttribute('title', '');
        zoomInButton.setAttribute('aria-label', 'Zoom in');
      }
      if (zoomOutButton) {
        zoomOutButton.setAttribute('data-tooltip', 'Zoom out');
        zoomOutButton.setAttribute('title', '');
        zoomOutButton.setAttribute('aria-label', 'Zoom out');
      }
    };

    // If a zoom control already exists on the map (possibly added earlier), keep it.
    const existingZoom = (map._controls || []).find((c) => c && c instanceof L.Control.Zoom);
    if (existingZoom) {
      controlRef.current = existingZoom;
      // Ensure a convenient reference is available on the map object for legacy code
      if (!map.zoomControl) map.zoomControl = existingZoom;
      applyZoomTooltips(existingZoom);
      return undefined;
    }

    // Remove any previously-stored zoomControl reference (legacy) before adding ours
    if (map.zoomControl) {
      try { map.removeControl(map.zoomControl); } catch (e) { /* ignore */ }
      map.zoomControl = null;
    }

    // Add new zoom control to bottom-right and remember we added it
    const zoomCtrl = L.control.zoom({ position: 'bottomright' });
    zoomCtrl.addTo(map);
    applyZoomTooltips(zoomCtrl);
    controlRef.current = zoomCtrl;
    map.zoomControl = zoomCtrl;

    // Cleanup: remove the control we added when this component unmounts
    return () => {
      if (controlRef.current) {
        try { map.removeControl(controlRef.current); } catch (e) { /* ignore */ }
        if (map.zoomControl === controlRef.current) map.zoomControl = null;
        controlRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function MapStatePersistence() {
  const map = useMap();

  const saveMapState = () => {
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    try {
      window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
        center: [center.lat, center.lng],
        zoom,
      }));
    } catch {
      // ignore storage errors
    }
  };

  useMapEvents({
    moveend: saveMapState,
    zoomend: saveMapState,
  });

  return null;
}

function MapResetHandler({ defaultCenter, defaultZoom, resetFlag }) {
  const map = useMap();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!map || resetFlag == null) return;
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    map.setView(defaultCenter, defaultZoom, { animate: false });
    try {
      window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
        center: defaultCenter,
        zoom: defaultZoom,
      }));
    } catch {
      // ignore storage errors
    }
  }, [map, resetFlag, defaultCenter, defaultZoom]);

  return null;
}

function MapFocusHandler({ location, zoom, loading = false }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !location) return;
    console.debug('MapFocusHandler triggered', { location, zoom, loading });
    if (loading) return; // Wait until loading finishes before moving the map

    // Center the map with a vertical offset so the focused marker appears slightly
    // below the visual center of the map and fly to it so the user sees the zoom
    // and the selected destination's circle/radius.
    centerMapWithOffset(map, location, zoom);
  }, [map, location, zoom, loading]);

  return null;
}

// Closes any open popups when certain selection-related props change so that
// previously-selected marker popups don't interfere with new focus/zoom actions.
function PopupClearHandler({ selectedDestinationId, reportHighlight, focusLocation, resetMapFlag }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    try {
      // Close any open popup to ensure new focus/zoom isn't blocked by an existing popup
      map.closePopup();
    } catch (e) {
      // ignore
    }
    // Intentionally run when any of these change
  }, [map, selectedDestinationId, reportHighlight, resetMapFlag, focusLocation && focusLocation.lat, focusLocation && focusLocation.lng]);

  return null;
}

function MapSyncHandler({ theme }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
  }, [map, theme]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    const invalidate = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore invalidation errors during unmount
      }
    };

    const resizeObserver = new ResizeObserver(() => invalidate());
    const container = map.getContainer();
    if (container) {
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);

    const timeoutId = window.setTimeout(invalidate, 250);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
}

// Defer heavy tile redraws until the user finishes interacting (zooming/panning).
function TileLoadOnIdle({ tileLayerRef, idleDelay = 200 }) {
  const map = useMap();
  const idleTimer = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const scheduleIdle = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        try {
          if (tileLayerRef && tileLayerRef.current && typeof tileLayerRef.current.redraw === 'function') {
            tileLayerRef.current.redraw();
          }
        } catch (e) { /* ignore */ }
        try { map.invalidateSize(); } catch (e) { /* ignore */ }
      }, idleDelay);
    };

    const onInteractionStart = () => {
      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
    };

    map.on('zoomstart movestart', onInteractionStart);
    map.on('zoomend moveend', scheduleIdle);

    return () => {
      map.off('zoomstart movestart', onInteractionStart);
      map.off('zoomend moveend', scheduleIdle);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [map, tileLayerRef, idleDelay]);

  return null;
}

// Smooth, Apple-Maps-like wheel zoom: intercept wheel and animate fractional zoom
function SmoothWheelZoom({ sensitivity = 0.0015, easing = 0.18, tileLayerRef }) {
  const map = useMap();
  const rafRef = useRef(null);
  const targetZoomRef = useRef(null);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (!map) return undefined;

    // Disable built-in wheel zoom to implement custom smooth zoom
    try { map.scrollWheelZoom.disable(); } catch { /* ignore */ }

    const clamp = (z) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));

    const step = () => {
      rafRef.current = null;
      const target = targetZoomRef.current;
      if (target == null) return;
      const curr = map.getZoom();
      const delta = (target - curr) * easing;
      if (Math.abs(delta) < 0.0005) {
        map.setZoom(target, { animate: false });
        // Fire zoomend so other handlers (TileLoadOnIdle) react
        try { map.fire('zoomend'); } catch (e) { /* ignore */ }
        targetZoomRef.current = null;
        // Do not call tile redraw here — TileLoadOnIdle will handle redraw after idle.
        return;
      }
      map.setZoom(curr + delta, { animate: false });
      rafRef.current = window.requestAnimationFrame(step);
    };

    const onWheel = (ev) => {
      // only handle vertical wheel (pinch/scroll)
      ev.preventDefault();
      const delta = ev.deltaY || ev.wheelDelta || 0;
      const change = -delta * sensitivity; // invert so scroll-up zooms in
      const currTarget = targetZoomRef.current != null ? targetZoomRef.current : map.getZoom();
      targetZoomRef.current = clamp(currTarget + change);
      lastInteractionRef.current = Date.now();
      if (!rafRef.current) rafRef.current = window.requestAnimationFrame(step);
    };

    const container = map.getContainer();
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      try { map.scrollWheelZoom.enable(); } catch { /* ignore */ }
    };
  }, [map, sensitivity, easing, tileLayerRef]);

  return null;
}

// TileLayer wrapper that ensures integer zoom in tile URLs (prevents fractional z values)
function SafeTileLayer({ url, tileLayerRef, options = {}, eventHandlers = {} }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const SafeLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        // Round zoom to nearest integer to avoid requests like z=15.68 which OSM rejects
        const safeCoords = { x: coords.x, y: coords.y, z: Math.round(coords.z) };
        return L.TileLayer.prototype.getTileUrl.call(this, safeCoords);
      }
    });

    const layer = new SafeLayer(url, { ...options });
    layerRef.current = layer;
    if (tileLayerRef) tileLayerRef.current = layer;
    if (eventHandlers && typeof eventHandlers === 'object') layer.on(eventHandlers);
    layer.addTo(map);

    return () => {
      try { layer.off(); layer.remove(); } catch (e) { /* ignore */ }
      if (tileLayerRef) tileLayerRef.current = null;
      layerRef.current = null;
    };
  }, [map, url]);

  return null;
}

function DangerMarker({ pin, icon, style, highlighted, isNearby, user, onAddComment, onUpdateComment, onDeleteComment, onDeletePin, onLogin }) {
  const map = useMap();
  const center = normalizeLatLng(pin.lat, pin.lng);
  const radiusMeters = normalizeRadius(pin.radius_meters);

  return (
    <Fragment>
      <Circle
        center={center}
        renderer={SHARED_CANVAS_RENDERER}
        radius={radiusMeters}
        pathOptions={{
          color: style.color,
          fillColor: style.color,
          fillOpacity: isNearby ? 0.35 : 0.16,
        }}
      />
      <Marker
        position={[pin.lat, pin.lng]}
        icon={icon}
        eventHandlers={{
          click: (event) => {
            centerMapWithOffset(map, event.latlng || { lat: pin.lat, lng: pin.lng }, 18);
          },
        }}
      >
        <Popup maxWidth={320}>
          <div onClick={(e) => e.stopPropagation()}>
            <strong>{pin.danger_type}: {pin.title}</strong><br />
            Severity: <b>{pin.severity}</b><br />
            Radius: {pin.radius_meters}m<br />
            {formatDuration(pin) && <>Duration: {formatDuration(pin)}<br /></>}
            <small>Reported by: {pin.reported_by}</small><br />
            <small>Reported on: {formatTimestamp(pin.created_at)}</small>
            <p>{pin.description}</p>
            <CommentBox
              pin={pin}
              user={user}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onLogin={onLogin}
            />
            <DeletePinBox pin={pin} user={user} onDeletePin={onDeletePin} />
          </div>
        </Popup>
      </Marker>
    </Fragment>
  );
}

function DeletePinBox({ pin, user, onDeletePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = user?.id === pin.user_id || user?.role === 'administrator' || user?.role === 'admin';

  if (!canDelete) {
    return (
      <div className="delete-pin-note">
        <small>Only the reporting user or an administrator can delete this pin.</small>
      </div>
    );
  }

  return (
    <div className="delete-pin-box">
      <label>
        <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
        Confirm delete this pin
      </label>
      <button type="button" className="secondary-btn" disabled={!confirmDelete} onClick={() => onDeletePin(pin.id)}>
        Delete pin
      </button>
    </div>
  );
}

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
  focusZoom,
  focusLoading = false,
  userLocation,
  theme = 'light',
  mapRotation = 0,
}) {
  // Debug: Log received props
  useEffect(() => {
    console.log('MapView Props Debug:', {
      destinations: destinations?.length || 0,
      dangerPins: dangerPins?.length || 0,
      nearbyDangers: nearbyDangers?.length || 0,
      pendingMarkerLocation,
      selectedMarkerType,
    });
  }, [destinations, dangerPins, nearbyDangers, pendingMarkerLocation, selectedMarkerType]);

  

  const nearbyIds = new Set((nearbyDangers || []).map((d) => d.id));

  const visibleDangerPins = (dangerPins || []).filter((p) => !isPinInactive(p));

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
  const totalMarkers = (destinations?.length || 0) + ((dangerPins || []).length || 0);
  // When many markers are present, use canvas-based CircleMarker to reduce DOM nodes
  const useCanvasMarkers = totalMarkers > 150;
  const mapWrapperStyle = {
    '--map-rotation': `${mapRotation}deg`,
  };

  const wrapperRef = useRef(null);

  useEffect(() => {
    const adjustHeight = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const controls = document.querySelector('.map-controls-wrapper') || document.querySelector('.map-controls-left');
      const controlsHeight = controls ? (controls.getBoundingClientRect && controls.getBoundingClientRect().height) || 0 : 0;

      const isPortrait = window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : window.innerHeight > window.innerWidth;
      const extraReserve = isPortrait ? 150 : 0; // reserve ~150px from the top in portrait

      const newHeight = Math.max(200, window.innerHeight - controlsHeight - extraReserve);
      wrapper.style.height = `${newHeight}px`;
      wrapper.style.maxHeight = `${newHeight}px`;

      // Notify layout observers / leaflet resize handlers
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

  // Open the popup for the selected destination when selection changes.
  useEffect(() => {
    if (!selectedDestinationId) return;
    const marker = destinationMarkerRefs.current[selectedDestinationId];
    if (!marker) return;

    try {
      // Try to center the map on the marker first (if available).
      // However, if the parent already provided a `focusLocation` prop that
      // points somewhere else (for example the user's selected location),
      // avoid re-centering here to prevent an oscillation between the
      // destination and the user's location.
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

    // Slight delay to ensure map has moved before opening popup
    const t = setTimeout(() => {
      try {
        if (typeof marker.openPopup === 'function') marker.openPopup();
        else if (marker.leafletElement && typeof marker.leafletElement.openPopup === 'function') marker.leafletElement.openPopup();
      } catch (e) { /* ignore */ }
    }, 450);

    return () => clearTimeout(t);
  }, [selectedDestinationId, focusLocation]);

  // Intentionally not attaching tile loading handlers: let the tile server and
  // browser manage tile loading. This avoids toggling a full-screen overlay
  // during normal map interactions which can make the UI look white or flash.
  // Provide an empty handlers object so the TileLayer `eventHandlers` prop
  // can be safely passed without causing a ReferenceError.
  const tileEventHandlers = {};

  return (
    <div ref={wrapperRef} className="map-container-wrapper" data-theme={theme} data-rotation={mapRotation} style={mapWrapperStyle}>
      {/* Removed full-screen loading overlay to avoid white flashes during tile loads.
          Let the browser/OSM handle tile loading; consider a small non-blocking
          indicator elsewhere if needed. */}
      
      <MapControlRight
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        onToggleTheme={onToggleTheme}
        onResetMap={onResetMap}
        theme={theme}
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
        // Enable smoother zoom animations / interactions and prefer canvas for vectors
        zoomAnimation={true}
        // Use default integer zoom snapping so tiles load at integer z levels
        zoomSnap={1}
        zoomDelta={1}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        preferCanvas={true}
        markerZoomAnimation={true}
        fadeAnimation={true}
        style={{ height: '100%', width: '100%' }}
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
        <MapClickHandler onLocationClick={onLocationClick} />
        <ZoomControlHandler />
        <MapStatePersistence />
        <MapResetHandler
          defaultCenter={DEFAULT_MAP_CENTER}
          defaultZoom={DEFAULT_MAP_ZOOM}
          resetFlag={resetMapFlag}
        />
        <MapFocusHandler location={focusLocation} zoom={focusZoom} loading={focusLoading} />
        <PopupClearHandler
          selectedDestinationId={selectedDestinationId}
          reportHighlight={reportHighlight}
          focusLocation={focusLocation}
          resetMapFlag={resetMapFlag}
        />
        <MapSyncHandler theme={theme} />
        <MapResizeHandler />

        {destinations.map((d) => {
          const highlightAllDestinations = reportHighlight === 'all-destinations';
          const highlightHighCrowd = reportHighlight === 'high-crowd';
          const highlightHighDanger = reportHighlight === 'high-danger';
          // Only highlight all destinations or high-crowd destinations here.
          // High-danger should only affect danger pins, not every destination.
          const isHighlightedDestination = highlightAllDestinations || (highlightHighCrowd && d.crowd_level === 'High');
          const isSelected = selectedDestinationId === d.id;
          const circlePathOptions = isSelected ? getDestinationRiskStyle(d.crowd_level) : null;
          const destinationCenter = normalizeLatLng(d.lat, d.lng);

          return (
            <Fragment key={`dest-${d.id}`}>
              {isSelected && (
                <Circle
                  center={destinationCenter}
                  radius={500}
                  renderer={SHARED_CANVAS_RENDERER}
                  pathOptions={circlePathOptions}
                />
              )}
              {useCanvasMarkers ? (
                <CircleMarker
                  center={destinationCenter}
                  radius={8}
                  pathOptions={{ color: circlePathOptions?.color || '#2563eb', fillColor: circlePathOptions?.fillColor || '#2563eb', fillOpacity: 1 }}
                />
              ) : (
                <Marker
                  ref={(ref) => {
                    try {
                      if (ref) destinationMarkerRefs.current[d.id] = ref;
                      else if (destinationMarkerRefs.current[d.id]) delete destinationMarkerRefs.current[d.id];
                    } catch (e) { /* ignore */ }
                  }}
                  position={[d.lat, d.lng]}
                  icon={getDestinationIcon(isHighlightedDestination || isSelected)}
                  eventHandlers={{
                    click: (e) => {
                      try {
                        const map = e?.target?._map;
                        const latlng = e?.latlng || { lat: d.lat, lng: d.lng };
                        if (map) centerMapWithOffset(map, latlng);
                      } catch { /* ignore */ }
                      if (onDestinationClick) onDestinationClick(d);
                    }
                  }}
                >
                  <Popup>
                    <strong>{d.name}</strong><br />
                    {d.city}, {d.province}<br />
                    Crowd: <b>{d.crowd_level}</b><br />
                    {d.opening_hours}
                  </Popup>
                </Marker>
              )}
            </Fragment>
          );
        })}

        {visibleDangerPins.map((pin) => {
          const style = dangerStyles[pin.danger_type] || dangerStyles['Danger Area'];
          const highlightHighDanger = reportHighlight === 'high-danger' && pin.severity === 'High';
          const icon = getDangerIcon(pin, nearbyIds.has(pin.id), highlightHighDanger);
          return useCanvasMarkers ? (
            <Fragment key={`danger-${pin.id}`}>
              <Circle
                center={[pin.lat, pin.lng]}
                renderer={SHARED_CANVAS_RENDERER}
                radius={pin.radius_meters}
                pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: nearbyIds.has(pin.id) ? 0.35 : 0.16 }}
              />
              <CircleMarker center={[pin.lat, pin.lng]} radius={6} pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: 1 }} />
            </Fragment>
          ) : (
            <DangerMarker
              key={`danger-${pin.id}`}
              pin={pin}
              icon={icon}
              style={style}
              highlighted={highlightHighDanger}
              isNearby={nearbyIds.has(pin.id)}
              user={user}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onDeletePin={onDeletePin}
            />
          );
        })}

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={PERSON_ICON}>
            <Popup>Your selected location</Popup>
          </Marker>
        )}

        {pendingMarkerLocation && (
          <Marker
            position={[pendingMarkerLocation.lat, pendingMarkerLocation.lng]}
            icon={getDangerIcon({ danger_type: selectedMarkerType || 'Danger Area' }, false)}
          >
            <Popup>Pending {selectedMarkerType || 'Danger Area'} marker. Click anywhere else on the map to move it.</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
