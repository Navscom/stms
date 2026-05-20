import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents, useMap } from 'react-leaflet';
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
    case 'Danger Area':        return { color: '#ef5350', icon: redIcon };
    case 'Dark Area':          return { color: '#5c35a8', icon: violetIcon };
    case 'Crowdy Area':        return { color: '#ffa726', icon: yellowIcon };
    case 'Dangerous Animals':  return { color: '#f97316', icon: orangeIcon };
    case 'Hazard on Area':     return { color: '#7c3aed', icon: violetIcon };
    default:                   return { color: '#ef5350', icon: redIcon };
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
        {pin.comments?.length
          ? pin.comments.map((c) => (
              <div key={c.id} className="comment-item">
                <p>{c.comment}</p>
                <small>— {c.commented_by}</small>
              </div>
            ))
          : <small style={{ color: 'var(--text3)' }}>No comments yet.</small>}
      </div>
      <form onSubmit={submit} className="comment-form">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
        />
        <button type="submit">Post</button>
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
      <MapContainer
        center={[12.8797, 121.7740]}
        zoom={6}
        maxBounds={phBounds}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={18}
        zoomControl={false}          /* disable default top-left zoom */
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Zoom control — bottom right */}
        <ZoomBottomRight />

        <MapClickHandler onLocationClick={onLocationClick} />

        {/* Destination markers */}
        {destinations.map((d) => (
          <Marker key={`dest-${d.id}`} position={[d.lat, d.lng]} icon={blueIcon}>
            <Popup>
              <strong style={{ color: 'var(--blue)', display: 'block', marginBottom: 4 }}>{d.name}</strong>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{d.city}, {d.province}</span><br />
              Crowd: <strong>{d.crowd_level}</strong><br />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{d.opening_hours}</span>
            </Popup>
          </Marker>
        ))}

        {/* Danger pins */}
        {dangerPins.map((pin) => {
          const style = markerStyle(pin);
          return (
            <div key={`danger-group-${pin.id}`}>
              <Circle
                center={[pin.lat, pin.lng]}
                radius={pin.radius_meters}
                pathOptions={{
                  color: style.color,
                  fillColor: style.color,
                  fillOpacity: nearbyIds.has(pin.id) ? 0.32 : 0.14,
                  weight: nearbyIds.has(pin.id) ? 2.5 : 1.5,
                }}
              />
              <Marker position={[pin.lat, pin.lng]} icon={style.icon}>
                <Popup maxWidth={320}>
                  <strong style={{ color: style.color, display: 'block', marginBottom: 4 }}>
                    {pin.danger_type}: {pin.title}
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Severity: <strong>{pin.severity}</strong> · Radius: {pin.radius_meters}m
                  </span>
                  <p style={{ margin: '6px 0', fontSize: 13, color: 'var(--text)' }}>{pin.description}</p>
                  <small style={{ color: 'var(--text3)' }}>Reported by: {pin.reported_by}</small>
                  <CommentBox pin={pin} onAddComment={onAddComment} />
                </Popup>
              </Marker>
            </div>
          );
        })}

        {/* Selected / route markers */}
        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={greenIcon}>
            <Popup>
              <strong style={{ color: 'var(--green)' }}>📍 Your location</strong>
            </Popup>
          </Marker>
        )}

        {routeEnd && (
          <Marker position={[routeEnd.lat, routeEnd.lng]} icon={greenIcon}>
            <Popup>
              <strong style={{ color: 'var(--green)' }}>🏁 Route destination</strong>
            </Popup>
          </Marker>
        )}

        {routePoints?.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: '#1565c0', weight: 5, dashArray: '10 8', opacity: 0.85 }}
          />
        )}
      </MapContainer>
    </div>
  );
}

function ZoomBottomRight() {
  const map = useMap();
  useEffect(() => {
    L.control.zoom({ position: 'bottomright' }).addTo(map);
  }, [map]);
  return null;
}
