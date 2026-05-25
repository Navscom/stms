import React, { useEffect, useState } from 'react';
import '../css/DestinationList.css';
import { getDestinations } from '../utils';
import { fetchAdvice as fetchAdviceHelper } from '../utils/LoadData';

// Helper function to calculate distance
const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const radiusKm = 6371;
  return Number((radiusKm * c).toFixed(2));
};

function crowdClass(level) {
  return `crowd-badge ${level?.toLowerCase() || 'low'}`;
}

export default function DestinationList({ 
  destinations: propDestinations, 
  nearest: propNearest, 
  selectedDestinationId: propSelectedId, 
  onSelectDestination, 
  onClearSelection, 
  onCenterSpot,
  onZoomToSpot,
  selectedLocation = null,
  inline = false,
  isPanel = false 
}) {
  const [localDestinations, setLocalDestinations] = useState([]);
  const [localNearest, setLocalNearest] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [advice, setAdvice] = useState('');
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocationState, setSelectedLocation] = useState(null);

  // Prefer props when provided, otherwise use local state
  const destinations = (Array.isArray(propDestinations) && propDestinations.length) ? propDestinations : localDestinations;
  const nearest = (Array.isArray(propNearest) && propNearest.length) ? propNearest : localNearest;
  const selectedDestinationId = propSelectedId ?? selectedId;
  const currentSelectedLocation = selectedLocation || selectedLocationState;

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getDestinations();
        if (!mounted) return;
        setLocalDestinations(data || []);
      } catch (err) {
        console.error('Failed to load destinations (DestinationList):', err);
        setLocalDestinations([]);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function handleSelectDestination(destination) {
    if (!destination) return;

    // Toggle selection if already selected
    if (selectedDestinationId === destination.id) {
      setSelectedId(null);
      setSelectedLocation(null);
      setAdvice('Showing all tourist spots. Click any spot to focus on it.');
      if (onClearSelection) onClearSelection();
      return;
    }

    setSelectedId(destination.id);
    setSelectedLocation({ lat: destination.lat, lng: destination.lng });
    
    // attempt to fetch advice and nearest spots for this location
    try {
      await fetchAdviceHelper(destination.lat, destination.lng, setSelectedLocation, setAdvice, setLocalNearest, setNearbyDangers);
    } catch (err) {
      console.error('Failed to fetch advice for destination:', err);
    }

    if (onSelectDestination) onSelectDestination(destination);
  }

  const handleCenterClick = () => {
    const spot = getCenterSpot();
    // Use onZoomToSpot if available (panel mode - just zoom, don't change location)
    // Otherwise fall back to onCenterSpot (changes location)
    if (onZoomToSpot) {
      onZoomToSpot(spot);
    } else if (onCenterSpot) {
      onCenterSpot(spot);
    }
  };

  const getCenterSpot = () => {
    return destinations.find((spot) => String(spot.name).toUpperCase() === 'RIZAL PARK') || {
      id: 'rizal-park',
      name: 'RIZAL PARK',
      lat: 14.5825,
      lng: 120.9781,
      city: 'Manila City',
      province: 'Manila',
      crowd_level: 'High',
      category: 'Tourist Destination',
      opening_hours: '8:00 AM - 5:00 PM',
    };
  };

  const list = (nearest && nearest.length) ? nearest : destinations;
  const selectedDestination = selectedDestinationId ? list.find((d) => d.id === selectedDestinationId) : null;

  // Panel view for MapControlLeft - show the destination list only
  if (isPanel) {
    return (
      <div className="tourist-spots-list">
        {destinations && destinations.length > 0 ? (
          <div className="destination-list">
            {destinations.map((d) => (
              <button
                key={d.id}
                type="button"
                className="destination-card destination-button"
                onClick={() => {
                  // Use onZoomToSpot if available (panel mode - just zoom, don't change location)
                  // Otherwise fall back to onCenterSpot
                  if (onZoomToSpot) {
                    onZoomToSpot(d);
                  } else if (onCenterSpot) {
                    onCenterSpot(d);
                  }
                }}
              >
                <div className="destination-top">
                  <h3>{d.name}</h3>
                  <span className={crowdClass(d.crowd_level)}>{d.crowd_level}</span>
                </div>
                <p>{d.city}, {d.province}</p>
                <small>{d.category} • {d.opening_hours}</small>
                {currentSelectedLocation && <p className="distance">Approx. {calculateDistanceKm(currentSelectedLocation.lat, currentSelectedLocation.lng, d.lat, d.lng)} km away</p>}
              </button>
            ))}
          </div>
        ) : (
          <div className="tourist-spot-card">
            <div className="card-header-row">
              <h4 className="spot-card-title">RIZAL PARK</h4>
              <span className="severity-badge-high">High</span>
            </div>
            <p className="spot-card-location">MANILA CITY, MANILA</p>
            <p className="spot-card-meta">TOURIST DESTINATION • 8:00 AM - 5:00 PM</p>
            <p className="spot-card-distance">
              {currentSelectedLocation 
                ? `Approx. ${calculateDistanceKm(currentSelectedLocation.lat, currentSelectedLocation.lng, 14.5825, 120.9781)} km away`
                : 'Distance unknown'}
            </p>
            <button type="button" className="primary-btn spot-center-btn" onClick={handleCenterClick}>
              Center on RIZAL PARK
            </button>
          </div>
        )}
      </div>
    );
  }

  const content = (
    <div className="destination-panel">
      <div className="destination-header">
        <h2>{(nearest && nearest.length) ? 'Nearest Recommended Spots' : 'Tourist Spots'}</h2>
        {(selectedDestinationId) && <button type="button" className="secondary-btn small-btn" onClick={clearSelection}>Show All</button>}
      </div>

      {selectedDestination ? (
        <section className="destination-detail-card">
          <h3>{selectedDestination.name}</h3>
          <p className="destination-location">{selectedDestination.city}, {selectedDestination.province}</p>
          <p className="destination-meta">{selectedDestination.category} • {selectedDestination.opening_hours}</p>
          {selectedDestination.distance_km !== undefined && <p className="distance">Approx. {selectedDestination.distance_km} km away</p>}
          <p className="destination-description">{selectedDestination.description}</p>
          <div className="destination-action-row">
            <button type="button" className="primary-btn" onClick={() => handleSelectDestination(selectedDestination)}>
              Focus on {selectedDestination.name}
            </button>
          </div>
        </section>
      ) : (
        <div className="destination-list">
          {list.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`destination-card destination-button ${selectedDestinationId === d.id ? 'selected' : ''}`}
              onClick={() => handleSelectDestination(d)}
            >
              <div className="destination-top">
                <h3>{d.name}</h3>
                <span className={crowdClass(d.crowd_level)}>{d.crowd_level}</span>
              </div>
              <p>{d.city}, {d.province}</p>
              <small>{d.category} • {d.opening_hours}</small>
              {d.distance_km !== undefined && <p className="distance">Approx. {d.distance_km} km away</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return inline ? content : <aside className="side-panel"> {content} </aside>;
}
