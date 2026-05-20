/* ── helpers ── */
function crowdClass(level) {
  return `crowd-badge ${level?.toLowerCase() || 'low'}`;
}

/* rough distance in km between two lat/lng points */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* safety guidance text per danger type */
const GUIDANCE = {
  'Danger Area':        'Avoid this zone. Stay on well-lit, populated paths and do not enter restricted areas.',
  'Dark Area':          'This area has poor lighting at night. Visit only during daylight hours and stay with a group.',
  'Crowdy Area':        'High crowd density detected. Keep your belongings secure and maintain awareness of your surroundings.',
  'Dangerous Animals':  'Wildlife hazard nearby. Do not approach or feed animals. Follow park ranger instructions.',
  'Hazard on Area':     'Environmental hazard reported. Follow local authority guidelines and avoid unmarked trails.',
};

/* find danger pins within a given km radius of a destination */
function getNearbyPins(dest, dangerPins, radiusKm = 1.5) {
  if (!dangerPins?.length) return [];
  return dangerPins.filter(pin => haversine(dest.lat, dest.lng, pin.lat, pin.lng) <= radiusKm);
}

export default function DestinationList({ destinations, nearest, dangerPins = [] }) {
  const list = nearest.length ? nearest : destinations;

  return (
    <aside className="side-panel">
      <h2>{nearest.length ? 'Nearest Recommended Spots' : 'Tourist Destinations'}</h2>
      <div className="destination-list">
        {list.map((d) => {
          const nearbyPins = getNearbyPins(d, dangerPins);
          const hasRisk    = nearbyPins.length > 0;
          /* pick the highest severity pin for guidance */
          const worstPin   = nearbyPins.sort((a, b) => {
            const rank = { High: 3, Moderate: 2, Low: 1 };
            return (rank[b.severity] || 0) - (rank[a.severity] || 0);
          })[0];

          return (
            <article className="destination-card" key={d.id}>
              <div className="destination-top">
                <h3>{d.name}</h3>
                <span className={crowdClass(d.crowd_level)}>{d.crowd_level}</span>
              </div>
              <p>{d.city}, {d.province}</p>
              <small>{d.category} • {d.opening_hours}</small>
              {d.distance_km !== undefined && (
                <p className="distance">Approx. {d.distance_km} km away</p>
              )}
              {d.description && <p>{d.description}</p>}

              {/* ── safety guidance block ── */}
              {hasRisk && (
                <div className={`dest-safety-block dest-safety-block--${worstPin.severity?.toLowerCase() || 'moderate'}`}>
                  <div className="dest-safety-title">
                    <span className="dest-safety-icon">
                      {worstPin.severity === 'High' ? '🔴' : worstPin.severity === 'Moderate' ? '🟡' : '🟢'}
                    </span>
                    <strong>
                      {worstPin.severity} Risk Nearby — {worstPin.danger_type}
                    </strong>
                  </div>
                  <p className="dest-safety-guidance">
                    {GUIDANCE[worstPin.danger_type] || 'Exercise caution in this area.'}
                  </p>
                  {nearbyPins.length > 1 && (
                    <small className="dest-safety-more">
                      +{nearbyPins.length - 1} more marker{nearbyPins.length - 1 > 1 ? 's' : ''} within 1.5 km
                    </small>
                  )}
                </div>
              )}

              {!hasRisk && (
                <div className="dest-safety-block dest-safety-block--safe">
                  <span className="dest-safety-icon">✅</span>
                  <strong>No danger markers nearby.</strong>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
