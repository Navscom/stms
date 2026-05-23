import { Fragment, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapView.css';
import MapControlRight from './MapControlRight';
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
  html: '<div class="destination-pin"><span>🧭</span></div>',
  className: 'destination-pin-icon',
  iconSize: [44, 58],
  iconAnchor: [22, 58],
  popupAnchor: [0, -48],
});

const dangerMarkerMeta = {
  'Danger Area': { color: '#dc2626', emoji: '❗', extraClass: 'danger-area' },
  'Dark Area': { color: '#111827', emoji: '🌙', extraClass: 'dark-area' },
  'Crowdy Area': { color: '#f59e0b', emoji: '👥', extraClass: 'crowdy-area' },
  'Dangerous Animals': { color: '#f97316', emoji: '🐾', extraClass: 'dangerous-animals' },
  'Hazard on Area': { color: '#7c3aed', emoji: '⚠️', extraClass: 'hazard-area' },
};

const createDangerIcon = ({ color, emoji, extraClass, isNearby = false }) => new L.DivIcon({
  html: `<div class="danger-pin danger-pin--${extraClass}${isNearby ? ' danger-pin--nearby' : ''}" style="background: ${color};">` +
    `<span>${emoji}</span></div>`,
  className: 'danger-pin-icon',
  iconSize: [38, 46],
  iconAnchor: [19, 46],
  popupAnchor: [0, -38],
});

const getDangerIcon = (pin, isNearby) => {
  const meta = dangerMarkerMeta[pin.danger_type] || dangerMarkerMeta['Danger Area'];
  return createDangerIcon({ ...meta, isNearby });
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
  iconSize: [48, 64],
  iconAnchor: [24, 64],
  popupAnchor: [0, -52],
});

const DEFAULT_MAP_CENTER = [14.5994, 120.9842];
const DEFAULT_MAP_ZOOM = 12;
const MAP_STATE_KEY = 'stms_map_state';

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
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ZoomControlHandler() {
  const map = useMap();

  useEffect(() => {
    // Remove default top-left zoom control if it exists
    if (map.zoomControl) {
      map.removeControl(map.zoomControl);
    }

    // Add new zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);
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

function MapSyncHandler({ theme }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
  }, [map, theme]);

  return null;
}

function CommentBox({ pin, onAddComment }) {
  const [comment, setComment] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!comment.trim()) {
      alert('Please type a comment first.');
      return;
    }
    onAddComment(pin.id, comment.trim());
    setComment('');
  };

  return (
    <div className="popup-comments">
      <strong>Comments</strong>
      <div className="comment-list">
        {pin.comments?.length ? pin.comments.map((c) => (
          <div key={c.id} className="comment-item">
            <p>{c.comment}</p>
            <small>— {c.commented_by}</small>
          </div>
        )) : <small>No comments yet.</small>}
      </div>
      <form onSubmit={submit} className="comment-form">
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
        <button type="submit">Comment</button>
      </form>
    </div>
  );
}

function DeletePinBox({ pin, user, onDeletePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = user?.role === 'admin' || pin.reported_by === user?.name;

  if (!canDelete) {
    return (
      <div className="delete-pin-note">
        <small>Only the user who added this pin can delete it.</small>
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
  onLocationClick,
  destinations,
  dangerPins,
  nearbyDangers,
  selectedLocation,
  pendingMarkerLocation,
  selectedMarkerType,
  user,
  onLogin,
  onLogout,
  onDeleteAccount,
  onAddComment,
  onDeletePin,
  onToggleTheme,
  onResetMap,
  resetMapFlag,
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

  const renderDuration = (pin) => formatDuration(pin);

  const [initialMapState] = useState(loadStoredMapState);
  const tileLayerUrl = theme === 'dark' ? DARK_TILE_URL : LIGHT_TILE_URL;
  const mapWrapperStyle = {
    '--map-rotation': `${mapRotation}deg`,
  };

  return (
    <div className="map-container-wrapper" data-theme={theme} data-rotation={mapRotation} style={mapWrapperStyle}>
      
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
        center={initialMapState.center}
        zoom={initialMapState.zoom}
        maxBounds={phBounds}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={18}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url={tileLayerUrl}
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapClickHandler onLocationClick={onLocationClick} />
        <ZoomControlHandler />
        <MapStatePersistence />
        <MapResetHandler
          defaultCenter={DEFAULT_MAP_CENTER}
          defaultZoom={DEFAULT_MAP_ZOOM}
          resetFlag={resetMapFlag}
        />
        <MapSyncHandler theme={theme} />

        {destinations.map((d) => (
          <Marker key={`dest-${d.id}`} position={[d.lat, d.lng]} icon={DESTINATION_ICON}>
            <Popup>
              <strong>{d.name}</strong><br />
              {d.city}, {d.province}<br />
              Crowd: <b>{d.crowd_level}</b><br />
              {d.opening_hours}
            </Popup>
          </Marker>
        ))}

        {visibleDangerPins.map((pin) => {
          const style = dangerStyles[pin.danger_type] || dangerStyles['Danger Area'];
          const icon = getDangerIcon(pin, nearbyIds.has(pin.id));
          return (
            <Fragment key={`danger-${pin.id}`}>
              <Circle
                center={[pin.lat, pin.lng]}
                radius={pin.radius_meters}
                pathOptions={{
                  color: style.color,
                  fillColor: style.color,
                  fillOpacity: nearbyIds.has(pin.id) ? 0.35 : 0.16,
                }}
              />
              <Marker position={[pin.lat, pin.lng]} icon={icon}>
                <Popup maxWidth={320}>
                  <strong>{pin.danger_type}: {pin.title}</strong><br />
                  Severity: <b>{pin.severity}</b><br />
                  Radius: {pin.radius_meters}m<br />
                  {renderDuration(pin) && <>Duration: {renderDuration(pin)}<br /></>}
                  <small>Reported by: {pin.reported_by}</small><br />
                  <small>Reported on: {formatTimestamp(pin.created_at)}</small>
                  <p>{pin.description}</p>
                  <CommentBox pin={pin} onAddComment={onAddComment} />
                  <DeletePinBox pin={pin} user={user} onDeletePin={onDeletePin} />
                </Popup>
              </Marker>
            </Fragment>
          );
        })}

        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={PERSON_ICON}>
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
