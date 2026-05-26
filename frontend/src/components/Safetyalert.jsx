import '../css/Safetyalert.css';

export default function Safetyalert({ nearbyDangers }) {
  return (
    <section className="warning-panel">
      <h2>Safety Alerts</h2>
      {nearbyDangers.length === 0 ? (
        <p>No nearby marker report detected.</p>
      ) : (
        nearbyDangers.map((d) => (
          <div key={d.id} className={`warning-card ${d.severity?.toLowerCase()}`}>
            <strong>{d.danger_type}: {d.title}</strong>
            <p>{d.description}</p>
            <small>
              Severity: {d.severity} | Radius: {d.radius_meters}m {d.distance_km !== undefined && `| Distance: ${d.distance_km} km`}
            </small>
          </div>
        ))
      )}
    </section>
  );
}
