import React, { useEffect, useState, useRef } from 'react';
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

  const getDistanceKmForSpot = (spot) => {
    if (spot?.distance_km != null) return spot.distance_km;
    if (currentSelectedLocation && spot?.lat != null && spot?.lng != null) {
      return calculateDistanceKm(currentSelectedLocation.lat, currentSelectedLocation.lng, spot.lat, spot.lng);
    }
    return undefined;
  };

  const sortByDistance = (list) => {
    if (!Array.isArray(list) || list.length === 0) return list;
    return [...list].sort((a, b) => {
      const aDist = getDistanceKmForSpot(a);
      const bDist = getDistanceKmForSpot(b);
      if (aDist == null && bDist == null) return 0;
      if (aDist == null) return 1;
      if (bDist == null) return -1;
      return aDist - bDist;
    });
  };

  const sortedNearest = sortByDistance(nearest);
  const sortedDestinations = sortByDistance(destinations);

  const renderDistance = (spot) => {
    const distance = getDistanceKmForSpot(spot);
    return distance != null ? <p className="distance">Approx. {distance} km away</p> : null;
  };

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
      setLocalNearest([]);
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

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedLocation(null);
    setAdvice('Showing all tourist spots. Click any spot to focus on it.');
    setLocalNearest([]);
    if (onClearSelection) onClearSelection();
  };

  const handleCenterClick = () => {
    const spot = getCenterSpot();
    if (!spot) return;
    // Use onZoomToSpot if available (panel mode - just zoom, don't change location)
    // Otherwise fall back to onCenterSpot (changes location)
    if (onZoomToSpot) {
      onZoomToSpot(spot);
    } else if (onCenterSpot) {
      onCenterSpot(spot);
    }
  };

  const getCenterSpot = () => {
    return destinations.find((spot) => String(spot.name).toUpperCase() === 'RIZAL PARK') || destinations[0] || null;
  };

  const list = (sortedNearest && sortedNearest.length) ? sortedNearest : sortedDestinations;
  const selectedDestination = selectedDestinationId ? list.find((d) => d.id === selectedDestinationId) : null;
  const selectedPanelRef = useRef(null);

  useEffect(() => {
    if (isPanel && selectedDestination && selectedPanelRef.current) {
      selectedPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isPanel, selectedDestination]);

  const panelDestinations = selectedDestination
    ? [selectedDestination, ...sortedDestinations.filter((d) => d.id !== selectedDestinationId)]
    : sortedDestinations;

  // Panel view for MapControlLeft - show the destination list only
  if (isPanel) {
    return (
      <div className="tourist-spots-list">
        {selectedDestination && (
          <section className="destination-detail-card selected-panel-detail" ref={selectedPanelRef}>
            <h3>{selectedDestination.name}</h3>
            <p className="destination-location">{selectedDestination.city}, {selectedDestination.province}</p>
            <p className="destination-meta">{selectedDestination.category} • {selectedDestination.opening_hours}</p>
            {renderDistance(selectedDestination)}
            <p className="destination-description">{selectedDestination.description}</p>
            <div className="destination-action-row">
              <button type="button" className="primary-btn" onClick={() => {
                if (onZoomToSpot) {
                  onZoomToSpot(selectedDestination);
                } else if (onCenterSpot) {
                  onCenterSpot(selectedDestination);
                }
              }}>
                Focus on {selectedDestination.name}
              </button>
              <button type="button" className="secondary-btn small-btn" onClick={clearSelection}>
                Clear Selection
              </button>
            </div>
          </section>
        )}

        {panelDestinations && panelDestinations.length > 0 ? (
          <div className="destination-list">
            {panelDestinations.map((d) => (
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
                {renderDistance(d)}
              </button>
            ))}
          </div>
        ) : (
          <div className="tourist-spot-card">
            <div className="card-header-row">
              <h4 className="spot-card-title">No tourist spots found</h4>
            </div>
            <p className="spot-card-location">Load destinations to display tourist spot cards.</p>
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
          {renderDistance(selectedDestination)}
          <p className="destination-description">{selectedDestination.description}</p>
          <div className="destination-action-row">
            <button type="button" className="primary-btn" onClick={() => handleSelectDestination(selectedDestination)}>
              Focus on {selectedDestination.name}
            </button>
          </div>
        </section>
      ) : (
        // Tourist spot card line: each destination renders as a card here //
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
              {renderDistance(d)}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return inline ? content : <aside className="side-panel"> {content} </aside>;
}
