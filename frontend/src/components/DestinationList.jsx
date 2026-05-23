import React, { useEffect, useState } from 'react';
import '../css/DestinationList.css';
import { getDestinations } from '../utils';
import { fetchAdvice as fetchAdviceHelper } from '../utils/LoadData';

function crowdClass(level) {
  return `crowd-badge ${level?.toLowerCase() || 'low'}`;
}

export default function DestinationList({ destinations: propDestinations, nearest: propNearest, selectedDestinationId: propSelectedId, onSelectDestination, onClearSelection, inline = false }) {
  const [localDestinations, setLocalDestinations] = useState([]);
  const [localNearest, setLocalNearest] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [advice, setAdvice] = useState('');
  const [nearbyDangers, setNearbyDangers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

  // Prefer props when provided, otherwise use local state
  const destinations = (Array.isArray(propDestinations) && propDestinations.length) ? propDestinations : localDestinations;
  const nearest = (Array.isArray(propNearest) && propNearest.length) ? propNearest : localNearest;
  const selectedDestinationId = propSelectedId ?? selectedId;

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

  function clearSelection() {
    setSelectedId(null);
    setSelectedLocation(null);
    setAdvice('Showing all tourist spots. Click any spot to focus on it.');
    if (onClearSelection) onClearSelection();
  }

  const list = (nearest && nearest.length) ? nearest : destinations;
  const selectedDestination = selectedDestinationId ? list.find((d) => d.id === selectedDestinationId) : null;

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
