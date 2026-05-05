import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const phBounds = [[4.0, 116.0], [21.5, 127.0]];

const blueIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const yellowIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const violetIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function markerStyle(pin) {
  switch (pin.danger_type) {
    case 'Danger Area':
      return { color: '#dc2626', icon: redIcon };
    case 'Dark Area':
      return { color: '#111827', icon: violetIcon };
    case 'Crowdy Area':
      return { color: '#f59e0b', icon: yellowIcon };
    case 'Dangerous Animals':
      return { color: '#f97316', icon: orangeIcon };
    case 'Hazard on Area':
      return { color: '#7c3aed', icon: violetIcon };
    default:
      return { color: '#dc2626', icon: redIcon };
  }
}

function CommentBox({ pin, onAddComment }) {
  const [comment, setComment] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!comment.trim()) return alert('Please type a comment first.');
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

export default function MapView({
  onLocationClick,
  destinations,
  dangerPins,
  nearbyDangers,
  selectedLocation,
  routeEnd,
  routePoints,
  onAddComment,
}) {
  const nearbyIds = new Set((nearbyDangers || []).map((d) => d.id));

  return (
    <div className="map-container-wrapper">
      <MapContainer center={[12.8797, 121.7740]} zoom={6} maxBounds={phBounds} maxBoundsViscosity={1.0} minZoom={6} maxZoom={18} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <MapClickHandler onLocationClick={onLocationClick} />

        {destinations.map((d) => (
          <Marker key={`dest-${d.id}`} position={[d.lat, d.lng]} icon={blueIcon}>
            <Popup>
              <strong>{d.name}</strong><br />
              {d.city}, {d.province}<br />
              Crowd: <b>{d.crowd_level}</b><br />
              {d.opening_hours}
            </Popup>
          </Marker>
        ))}

        {dangerPins.map((pin) => {
          const style = markerStyle(pin);
          return (
            <>
              <Circle
                center={[pin.lat, pin.lng]}
                radius={pin.radius_meters}
                pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: nearbyIds.has(pin.id) ? 0.35 : 0.16 }}
              />
              <Marker key={`danger-${pin.id}`} position={[pin.lat, pin.lng]} icon={style.icon}>
                <Popup maxWidth={320}>
                  <strong>{pin.danger_type}: {pin.title}</strong><br />
                  Severity: <b>{pin.severity}</b><br />
                  Radius: {pin.radius_meters}m<br />
                  <p>{pin.description}</p>
                  <small>Reported by: {pin.reported_by}</small>
                  <CommentBox pin={pin} onAddComment={onAddComment} />
                </Popup>
              </Marker>
            </>
          );
        })}

        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={greenIcon}>
            <Popup>Your starting / selected location</Popup>
          </Marker>
        )}

        {routeEnd && (
          <Marker position={[routeEnd.lat, routeEnd.lng]} icon={greenIcon}>
            <Popup>Route destination</Popup>
          </Marker>
        )}

        {routePoints?.length > 1 && (
          <Polyline positions={routePoints} pathOptions={{ color: '#2563eb', weight: 5, dashArray: '8 8' }} />
        )}
      </MapContainer>
    </div>
  );
}
