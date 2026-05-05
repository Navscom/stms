function crowdClass(level) {
  return `crowd-badge ${level?.toLowerCase() || 'low'}`;
}

export default function DestinationList({ destinations, nearest }) {
  const list = nearest.length ? nearest : destinations;
  return (
    <aside className="side-panel">
      <h2>{nearest.length ? 'Nearest Recommended Spots' : 'Tourist Destinations'}</h2>
      <div className="destination-list">
        {list.map((d) => (
          <article className="destination-card" key={d.id}>
            <div className="destination-top">
              <h3>{d.name}</h3>
              <span className={crowdClass(d.crowd_level)}>{d.crowd_level}</span>
            </div>
            <p>{d.city}, {d.province}</p>
            <small>{d.category} • {d.opening_hours}</small>
            {d.distance_km !== undefined && <p className="distance">Approx. {d.distance_km} km away</p>}
            <p>{d.description}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
