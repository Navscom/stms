import { Fragment, useState } from 'react';
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
  user,
  onAddComment,
  onDeletePin,
}) {
  const nearbyIds = new Set((nearbyDangers || []).map((d) => d.id));

  return (
    <div className="map-container-wrapper">
      <MapContainer
        center={[12.8797, 121.7740]}
        zoom={6}
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
          <Marker key={`dest-${d.id}`} position={[d.lat, d.lng]} icon={ICONS.blue}>
            <Popup>
              <strong>{d.name}</strong><br />
              {d.city}, {d.province}<br />
              Crowd: <b>{d.crowd_level}</b><br />
              {d.opening_hours}
            </Popup>
          </Marker>
        ))}

        {dangerPins.map((pin) => {
          const style = dangerStyles[pin.danger_type] || dangerStyles['Danger Area'];
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
              <Marker position={[pin.lat, pin.lng]} icon={style.icon}>
                <Popup maxWidth={320}>
                  <strong>{pin.danger_type}: {pin.title}</strong><br />
                  Severity: <b>{pin.severity}</b><br />
                  Radius: {pin.radius_meters}m<br />
                  <p>{pin.description}</p>
                  <small>Reported by: {pin.reported_by}</small>
                  <CommentBox pin={pin} onAddComment={onAddComment} />
                  <DeletePinBox pin={pin} user={user} onDeletePin={onDeletePin} />
                </Popup>
              </Marker>
            </Fragment>
          );
        })}

        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={ICONS.green}>
            <Popup>Your selected location</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
