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

const warningIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
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

function dangerColor(pin) {
  if (pin.danger_type === 'Dark Area') return '#111827';
  if (pin.danger_type === 'Wildlife / Animal') return '#f97316';
  if (pin.severity === 'High') return '#dc2626';
  if (pin.severity === 'Moderate') return '#f59e0b';
  return '#22c55e';
}

export default function MapView({
  onLocationClick,
  destinations,
  dangerPins,
  nearbyDangers,
  selectedLocation,
  routeEnd,
  routePoints,
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

        {dangerPins.map((pin) => (
          <>
            <Circle
              center={[pin.lat, pin.lng]}
              radius={pin.radius_meters}
              pathOptions={{ color: dangerColor(pin), fillColor: dangerColor(pin), fillOpacity: nearbyIds.has(pin.id) ? 0.35 : 0.16 }}
            />
            <Marker key={`danger-${pin.id}`} position={[pin.lat, pin.lng]} icon={warningIcon}>
              <Popup>
                <strong>{pin.danger_type}: {pin.title}</strong><br />
                Severity: <b>{pin.severity}</b><br />
                Radius: {pin.radius_meters}m<br />
                {pin.description}<br />
                <small>Reported by: {pin.reported_by}</small>
              </Popup>
            </Marker>
          </>
        ))}

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
