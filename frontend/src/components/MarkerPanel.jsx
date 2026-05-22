import { MARKER_TYPES } from '../constants/markerConstants';

export default function MarkerPanel({
  markerForm,
  setMarkerForm,
  selectedMarkerType,
  setSelectedMarkerType,
  pendingMarkerLocation,
  captchaChecked,
  setCaptchaChecked,
  captchaWarning,
  markerWarning,
  submitMarker,
}) {
  return (
    <div className="marker-panel">
      <h2>Add Safety Marker</h2>
      <p>Choose a marker type and click the map to place it. Then submit the marker with the details below.</p>

      <form className="marker-form" onSubmit={submitMarker}>
        <label>
          <strong>Marker type</strong>
          <select value={selectedMarkerType} onChange={(e) => setSelectedMarkerType(e.target.value)}>
            {MARKER_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label>
          <strong>Marker title</strong>
          <input
            type="text"
            value={markerForm.title}
            onChange={(e) => setMarkerForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Optional title"
          />
        </label>

        <label>
          <strong>Severity</strong>
          <select
            value={markerForm.severity}
            onChange={(e) => setMarkerForm((prev) => ({ ...prev, severity: e.target.value }))}
          >
            <option value="Low">Low</option>
            <option value="Moderate">Moderate</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </label>

        <label>
          <strong>Radius / area affected (meters)</strong>
          <input
            type="number"
            min="20"
            max="5000"
            value={markerForm.radius_meters}
            onChange={(e) => setMarkerForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
            placeholder="20 - 5000"
          />
        </label>

        <div className="marker-form marker-form-grid">
          <label>
            <strong>Days</strong>
            <input
              type="number"
              min="0"
              value={markerForm.duration_days}
              onChange={(e) => setMarkerForm((prev) => ({ ...prev, duration_days: e.target.value }))}
              placeholder="Days"
            />
          </label>
          <label>
            <strong>Hours</strong>
            <input
              type="number"
              min="0"
              max="23"
              value={markerForm.duration_hours}
              onChange={(e) => setMarkerForm((prev) => ({ ...prev, duration_hours: e.target.value }))}
              placeholder="Hours"
            />
          </label>
        </div>

        <label>
          <strong>Description</strong>
          <textarea
            value={markerForm.description}
            onChange={(e) => setMarkerForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Describe why this marker is needed"
          />
        </label>

        <div className="captcha-box">
          <input
            id="marker-captcha"
            type="checkbox"
            checked={captchaChecked}
            onChange={(e) => setCaptchaChecked(e.target.checked)}
          />
          <label htmlFor="marker-captcha" className="captcha-label">
            Please note: the information given is being used by authority. Check the box if you understand and confirm the information is true.
          </label>
        </div>

        {markerWarning && <div className="captcha-warning">{markerWarning}</div>}
        {captchaWarning && <div className="captcha-warning">{captchaWarning}</div>}

        <div>
          <p>
            <strong>Selected location:</strong> {pendingMarkerLocation ? `${pendingMarkerLocation.lat.toFixed(6)}, ${pendingMarkerLocation.lng.toFixed(6)}` : 'Click the map to place your marker.'}
          </p>
        </div>

        <button className="primary-btn" type="submit" disabled={!pendingMarkerLocation}>
          Submit Marker
        </button>
      </form>
    </div>
  );
}
