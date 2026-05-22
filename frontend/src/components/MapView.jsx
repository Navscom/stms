import { Fragment, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
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
  onAddComment,
  onDeletePin,
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

  const getDurationHours = (pin) => {
    const hoursValue = Number(pin?.duration_hours ?? NaN);
    if (!Number.isNaN(hoursValue) && hoursValue > 0) {
      return hoursValue;
    }
    const minutes = Number(pin?.duration_minutes ?? pin?.duration ?? 0);
    if (minutes > 0) {
      return minutes / 60;
    }
    return 0;
  };

  const renderDuration = (pin) => {
    const totalHours = getDurationHours(pin);
    if (!totalHours) return null;
    const days = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    if (days) {
      return `${days} day${days !== 1 ? 's' : ''}${hours ? ` ${hours} hour${hours !== 1 ? 's' : ''}` : ''}`;
    }
    if (totalHours >= 1) {
      return `${Math.round(totalHours)} hour${Math.round(totalHours) !== 1 ? 's' : ''}`;
    }
    return `${Math.round(totalHours * 60)} minute${Math.round(totalHours * 60) !== 1 ? 's' : ''}`;
  };

  const isPinExpired = (pin) => {
    try {
      const durationHours = getDurationHours(pin);
      if (!durationHours || !pin?.created_at) return false;
      const created = new Date(pin.created_at);
      if (Number.isNaN(created.getTime())) return false;
      const expireTime = created.getTime() + durationHours * 60 * 60 * 1000;
      return Date.now() > expireTime;
    } catch (e) {
      return false;
    }
  };

  const visibleDangerPins = (dangerPins || []).filter((p) => !isPinExpired(p));

  return (
    <div className="map-container-wrapper">
      <MapContainer
        center={[14.5994, 120.9842]}
        zoom={12}
        maxBounds={phBounds}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={18}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapClickHandler onLocationClick={onLocationClick} />

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
