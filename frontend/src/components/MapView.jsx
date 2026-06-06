import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMapEvents, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapView.css';
import MapControlRight from './MapControlRight';
import CommentBox from './Comments';
import L from 'leaflet';
import { formatDuration, isPinInactive } from '../utils/pinHelpers';
import { getDangerPinComments } from '../utils';

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
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

const START_ICON = new L.DivIcon({
  html: '<div class="destination-pin"><span>1</span></div>',
  className: 'destination-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

// Separate icon for the second/route destination pin (location2) so it does
// not collide visually or semantically with regular destination pins.
const LOCATION2_ICON = new L.DivIcon({
  html: '<div class="location2-pin"><span>2</span></div>',
  className: 'location2-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

// Icon for the first route pin (location 1). Keep design consistent with
// the 'location2' pin so both routing pins share the same visual language.
const LOCATION1_ICON = new L.DivIcon({
  html: '<div class="location1-pin"><span>1</span></div>',
  className: 'location1-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

const getDestinationIcon = (highlighted = false) => new L.DivIcon({
  html: `<div class="destination-pin${highlighted ? ' destination-pin--highlighted' : ''}"><span>🏛️</span></div>`,
  className: 'destination-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
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
  iconSize: [48, 62],
  iconAnchor: [24, 62],
  popupAnchor: [0, -48],
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
  iconSize: [48, 60],
  iconAnchor: [24, 60],
  popupAnchor: [0, -48],
});

const DEFAULT_MAP_CENTER = [14.5994, 120.9842];
const DEFAULT_MAP_ZOOM = 12;
const MAP_STATE_KEY = 'stms_map_state';

// Shared canvas renderer for vector layers to reduce SVG overhead during map interactions
const SHARED_CANVAS_RENDERER = L.canvas({ padding: 0.5 });

const normalizeLatLng = (lat, lng) => [Number(lat) || 0, Number(lng) || 0];
const normalizeRadius = (radius) => Math.max(Number(radius) || 0, 0);

const computeDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

// How many pixels above the marker the map center should be (positive moves center up,
// which places the marker lower on the screen). Adjust this value to taste.
const DEFAULT_FOCUS_OFFSET_PX = 120;

const centerMapWithOffset = (map, latlng, offsetY = DEFAULT_FOCUS_OFFSET_PX) => {
  if (!map || !latlng) return;
  const currentZoom = map.getZoom();
  try {
    const point = map.project(L.latLng(latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]), currentZoom);
    const targetPoint = L.point(point.x, point.y - offsetY);
    const targetLatLng = map.unproject(targetPoint, currentZoom);
    map.flyTo(targetLatLng, currentZoom, { animate: true, duration: 0.45 });
  } catch (e) {
    try {
      map.flyTo([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], currentZoom, { animate: true, duration: 0.45 });
    } catch {
      try { map.setView([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], currentZoom, { animate: true }); } catch { /* ignore */ }
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
    return { center, zoom: DEFAULT_MAP_ZOOM };
  } catch {
    return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
  }
};

function MapClickHandler({ onLocationClick, onMapBackgroundClick }) {
  useMapEvents({
    click(e) {
      try { window.dispatchEvent(new Event('ai:user-click')); } catch (e) { /* ignore */ }
      // Check if click was on a marker (has a layer)
      if (e.layer) {
        // Click was on a marker, don't call onMapBackgroundClick
        return;
      }
      onLocationClick(e.latlng.lat, e.latlng.lng);
      if (onMapBackgroundClick) onMapBackgroundClick();
    },
  });
  return null;
}


function MapStatePersistence() {
  const map = useMap();

  const saveMapState = () => {
    if (!map) return;
    const center = map.getCenter();
    try {
      window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
        center: [center.lat, center.lng],
      }));
    } catch {
      // ignore storage errors
    }
  };

  useMapEvents({
    moveend: saveMapState,
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
      }));
    } catch {
      // ignore storage errors
    }
  }, [map, resetFlag, defaultCenter, defaultZoom]);

  return null;
}

function MapAutoFocusHandler({ focusLocation, focusBounds, focusZoom = null, loading = false, isPinMode = false, routeStart, routeTarget, routeGeoJson }) {
  const map = useMap();

  useEffect(() => {
    if (!map || loading || isPinMode) return;
    try {
      // If a route is active, keep the route visible and zoom to its endpoints/path.
      if (routeStart && routeTarget) {
        let coords = null;
        if (routeGeoJson && Array.isArray(routeGeoJson.features) && routeGeoJson.features.length > 0) {
          coords = routeGeoJson.features[0].geometry.coordinates.map((c) => [c[1], c[0]]);
        }
        if (!coords || !coords.length) {
          coords = [[routeStart.lat, routeStart.lng], [routeTarget.lat, routeTarget.lng]];
        }
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.45 });
          return;
        }
      }

      if (focusBounds && Array.isArray(focusBounds.coords) && focusBounds.coords.length > 0) {
        const coords = focusBounds.coords.map((c) => [Number(c[0]), Number(c[1])]);
        const bounds = L.latLngBounds(coords);
        if (!bounds.isValid()) return;

        if (coords.length === 1) {
          const [lat, lng] = coords[0];
          if (typeof focusZoom === 'number') {
            map.setView([lat, lng], focusZoom, { animate: true });
          } else {
            centerMapWithOffset(map, { lat, lng });
          }
        } else {
          map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.45 });
        }
        return;
      }

      if (focusLocation) {
        const lat = focusLocation.lat ?? focusLocation[0];
        const lng = focusLocation.lng ?? focusLocation[1];
        if (typeof focusZoom === 'number') {
          map.setView([lat, lng], focusZoom, { animate: true });
        } else {
          centerMapWithOffset(map, { lat, lng });
        }
      }
    } catch (e) {
      // ignore focus errors
    }
  }, [map, loading, isPinMode, routeStart, routeTarget, routeGeoJson, focusBounds ? JSON.stringify(focusBounds.coords) : null, focusLocation && focusLocation.lat, focusLocation && focusLocation.lng, focusZoom]);

  return null;
}

// Closes any open popups when certain selection-related props change so that
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
  const [comments, setComments] = useState(pin.comments || []);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [commentsLoaded, setCommentsLoaded] = useState(Array.isArray(pin.comments));

  useEffect(() => {
    setComments(pin.comments || []);
    setCommentsLoaded(Array.isArray(pin.comments));
    setCommentsError('');
  }, [pin.id]);

  const loadComments = async () => {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError('');
    try {
      const data = await getDangerPinComments(pin.id);
      setComments(Array.isArray(data) ? data : []);
      setCommentsLoaded(true);
    } catch (error) {
      setCommentsError('Unable to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async (pinId, comment) => {
    await onAddComment(pinId, comment);
    await loadComments();
  };

  const handleUpdateComment = async (pinId, commentId, comment) => {
    await onUpdateComment(pinId, commentId, comment);
    await loadComments();
  };

  const handleDeleteComment = async (pinId, commentId) => {
    await onDeleteComment(pinId, commentId);
    await loadComments();
  };

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
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event.originalEvent && typeof event.originalEvent.stopPropagation === 'function') {
              event.originalEvent.stopPropagation();
            }
            centerMapWithOffset(map, event.latlng || { lat: pin.lat, lng: pin.lng }, 18);
          },
        }}
      >
        <Popup
          maxWidth={320}
          eventHandlers={{
            popupopen: () => {
              loadComments();
            },
          }}
        >
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
              comments={comments}
              commentsLoading={commentsLoading}
              commentError={commentsError}
              user={user}
              onAddComment={handleAddComment}
              onUpdateComment={handleUpdateComment}
              onDeleteComment={handleDeleteComment}
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
  const mapRef = useRef(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [routeTarget, setRouteTarget] = useState(null);
  const [routeStart, setRouteStart] = useState(null);
  const [routeHidePins, setRouteHidePins] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingSelecting, setRoutingSelecting] = useState(null); // 'start' | 'end' | null
  const [avoidDanger, setAvoidDanger] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const hasUserLocation = userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number';
  const routeStartUsesUserLocation = routeStart && userLocation &&
    Math.abs(routeStart.lat - userLocation.lat) < 1e-6 &&
    Math.abs(routeStart.lng - userLocation.lng) < 1e-6;

  // Listen for external routing selection commands dispatched by the left control
  useEffect(() => {
    const handler = (e) => {
      const mode = e?.detail?.mode;
      if (mode === 'start') {
        setRoutingSelecting('start');
        setRoutingOpen(true);
      } else if (mode === 'end') {
        setRoutingSelecting('end');
        setRoutingOpen(true);
      } else if (mode === 'clear') {
        setRouteStart(null);
        setRouteTarget(null);
        setRouteGeoJson(null);
        setRouteHidePins(false);
        setRoutingSelecting(null);
        setRoutingOpen(false);
      } else if (mode === 'open') {
        setRoutingOpen(Boolean(e.detail?.open));
        if (!e.detail?.open) setRoutingSelecting(null);
      }
    };
    window.addEventListener('stms:route-select', handler);
    return () => window.removeEventListener('stms:route-select', handler);
  }, []);

  // Notify external controls (left panel) when routing state changes
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

  // Helper to fetch route between two points (lat/lng objects)
  const fetchRoute = async (start, end) => {
    setRouteGeoJson(null);
    onSetRouteAdvice('');
    setRouteLoading(true);
    console.debug('Route request started', { start, end, avoidDanger });

    try {
      // Request routes while asking the backend to avoid known danger pin areas
      const routeUrlPath = `/route?start_lat=${encodeURIComponent(start.lat)}&start_lng=${encodeURIComponent(start.lng)}&end_lat=${encodeURIComponent(end.lat)}&end_lng=${encodeURIComponent(end.lng)}&avoid_danger=${avoidDanger ? '1' : '0'}`;
      let resp;
      try { resp = await fetch(routeUrlPath); } catch (err) {
        const fallback = `http://localhost:8000${routeUrlPath}`;
        console.warn('Relative fetch failed, retrying to', fallback, err);
        resp = await fetch(fallback);
      }
      if (!resp.ok && avoidDanger) {
        const fallbackUrl = `/route?start_lat=${encodeURIComponent(start.lat)}&start_lng=${encodeURIComponent(start.lng)}&end_lat=${encodeURIComponent(end.lat)}&end_lng=${encodeURIComponent(end.lng)}&avoid_danger=0`;
        console.warn('Safe route failed, retrying normal route', resp.status, resp.statusText);
        try {
          resp = await fetch(fallbackUrl);
        } catch (err) {
          const fallback = `http://localhost:8000${fallbackUrl}`;
          console.warn('Retry normal route failed, retrying to', fallback, err);
          resp = await fetch(fallback);
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
          const bounds = L.latLngBounds(coords);
          if (typeof bounds.pad === 'function') mapRef.current.fitBounds(bounds.pad(0.12));
          else mapRef.current.fitBounds(bounds);
        }
      } catch (e) { /* ignore fit errors */ }
    } catch (e) {
      console.error('Route fetch failed', e);
      const message = e?.message || 'Failed to fetch route.';
      onSetRouteAdvice(message);
    } finally {
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

  // Handle map clicks: treat click as destination (location 2) and compute route
  const handleMapClick = async (lat, lng) => {
    if (isPinMode) {
      onLocationClick(lat, lng);
      return;
    }

    // If user explicitly opened routing and is selecting start/destination, handle accordingly
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
      setRouteHidePins(false);
      setRouteTarget({ lat, lng });
      // perform routing
      await fetchRoute(start, { lat, lng });
      setRoutingSelecting(null);
      setRoutingOpen(false);
      return;
    }

    // If a route is already in progress, update only the destination (location 2)
    // and preserve the existing start location (location 1)
    if (routeStart) {
      setRouteHidePins(false);
      setRouteTarget({ lat, lng });
      await fetchRoute(routeStart, { lat, lng });
      return;
    }

    if (userLocation) {
      const start = userLocation;
      setRouteHidePins(false);
      setRouteStart(start);
      setRouteTarget({ lat, lng });
      await fetchRoute(start, { lat, lng });
      setRoutingOpen(false);
      return;
    }

    // No routing selection is active; map background was clicked, clear selection
    if (onMapBackgroundClick) onMapBackgroundClick();
  };

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
        <MapClickHandler onLocationClick={handleMapClick} onMapBackgroundClick={onMapBackgroundClick} />
        <MapStatePersistence />
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
                      if (typeof e.stopPropagation === 'function') e.stopPropagation();
                      if (e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
                        e.originalEvent.stopPropagation();
                      }
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
