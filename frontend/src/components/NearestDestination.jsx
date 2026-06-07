import React from 'react';
import '../css/DestinationList.css';

const crowdClass = (level) => `crowd-badge ${String(level || 'low').toLowerCase()}`;

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const radiusKm = 6371;
  return Number((radiusKm * c).toFixed(2));
};

const NearestDestination = ({
  nearest = [],
  selectedDestinationId = null,
  selectedLocation = null,
  onSelectNearest = () => {},
  onClearNearest = () => {},
}) => {
  const list = Array.isArray(nearest) ? nearest : [];

  const getDistanceKm = (spot) => {
    if (selectedLocation && spot?.lat != null && spot?.lng != null) {
      return calculateDistanceKm(selectedLocation.lat, selectedLocation.lng, spot.lat, spot.lng);
    }
    return spot.distance_km;
  };

  const renderDistance = (spot) => {
    const distance = getDistanceKm(spot);
    return distance != null ? <p className="distance">Approx. {distance} km away</p> : null;
  };

  return (
    <div className="destination-panel">
      <div className="destination-header">
        <h2>Nearest Destinations</h2>
        {selectedDestinationId && (
          <button type="button" className="secondary-btn small-btn" onClick={onClearNearest}>
            Clear selection
          </button>
        )}
      </div>

      {list.length > 0 ? (
        <div className="destination-list">
          {list.map((spot) => (
            <button
              key={spot.id || `${spot.lat}-${spot.lng}`}
              type="button"
              className={`destination-card destination-button ${selectedDestinationId === spot.id ? 'selected' : ''}`}
              onClick={() => onSelectNearest(spot)}
            >
              <div className="destination-top">
                <h3>{spot.name}</h3>
                <span className={crowdClass(spot.crowd_level)}>{spot.crowd_level || 'Low'}</span>
              </div>
              <p>{spot.city}, {spot.province}</p>
              <small>{spot.category || 'Recommended spot'}</small>
              {renderDistance(spot)}
            </button>
          ))}
        </div>
      ) : (
        <div className="tourist-spot-card">
          <div className="card-header-row">
            <h4 className="spot-card-title">No nearest spots available</h4>
          </div>
          <p className="spot-card-location">Tap the map or use location mode to load nearby destination suggestions.</p>
        </div>
      )}
    </div>
  );
};

export default NearestDestination;
 