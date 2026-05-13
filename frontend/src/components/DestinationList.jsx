function crowdClass(level) {
  return `crowd-badge ${level?.toLowerCase() || 'low'}`;
}

export default function DestinationList({ destinations, nearest, selectedDestinationId, onSelectDestination, onClearSelection, inline = false }) {
  const list = nearest.length ? nearest : destinations;
  const selectedDestination = selectedDestinationId ? list.find((d) => d.id === selectedDestinationId) : null;

  const content = (
    <div className="destination-panel">
      <div className="destination-header">
        <h2>{nearest.length ? 'Nearest Recommended Spots' : 'Tourist Destinations'}</h2>
        {selectedDestinationId && <button type="button" className="secondary-btn small-btn" onClick={onClearSelection}>Show All</button>}
      </div>

      {selectedDestination ? (
        <section className="destination-detail-card">
          <h3>{selectedDestination.name}</h3>
          <p className="destination-location">{selectedDestination.city}, {selectedDestination.province}</p>
          <p className="destination-meta">{selectedDestination.category} • {selectedDestination.opening_hours}</p>
          {selectedDestination.distance_km !== undefined && <p className="distance">Approx. {selectedDestination.distance_km} km away</p>}
          <p className="destination-description">{selectedDestination.description}</p>
          <div className="destination-action-row">
            <button type="button" className="primary-btn" onClick={() => onSelectDestination?.(selectedDestination)}>
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
              onClick={() => onSelectDestination?.(d)}
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
