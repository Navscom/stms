import React from 'react';
import '../css/DestinationList.css';

const crowdClass = (level) => `crowd-badge ${String(level || 'low').toLowerCase()}`;

const NearestDestination = ({
  nearest = [],
  selectedDestinationId = null,
  selectedLocation = null,
  onSelectNearest = () => {},
  onClearNearest = () => {},
}) => {
  const list = Array.isArray(nearest) ? nearest : [];

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
              {spot.distance_km !== undefined && <p className="distance">Approx. {spot.distance_km} km away</p>}
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
 