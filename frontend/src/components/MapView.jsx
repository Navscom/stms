import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Limit within Philippine boundaries sakto lng
const phBounds = [
  [4.0, 116.0],  // Southwest (Below Tawi-Tawi)
  [21.5, 127.0]  // Northeast (Above Batanes)
];

function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({ onLocationClick }) {
  return (
    <div className="map-container-wrapper">
      <MapContainer 
        center={[12.8797, 121.7740]} 
        zoom={6} 
        // --- Boundary Logic Starts Here ---
        maxBounds={phBounds} 
        maxBoundsViscosity={1.0} // 1.0 makes the boundary "hard" (user can't pull past it)
        minZoom={6}              // Prevents zooming out to see the whole world
        maxZoom={18}
        // --- Boundary Logic Ends Here ---
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          attribution='&copy; OpenStreetMap contributors'
        />
        <MapClickHandler onLocationClick={onLocationClick} />
      </MapContainer>
    </div>
  );
}