import React, { useState, useEffect } from 'react';
import '../css/MapControlLeft.css';

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const radiusKm = 6371;
  return Number((radiusKm * c).toFixed(2));
};

const MapControlLeft = ({
  onMyLocation,
  onHazardSubmit,
  onAddMarker,
  touristSpots = [],
  nearest = [],
  selectedLocation = null,
  isBoxExpanded = false,
  setIsBoxExpanded = () => {},
  isPinMode = false,
  markerForm,
  setMarkerForm,
  selectedMarkerType,
  setSelectedMarkerType,
  pendingMarkerLocation,
  captchaChecked,
  setCaptchaChecked,
  captchaWarning,
  markerWarning,
}) => {
  const [isAddingMarkerOpen, setIsAddingMarkerOpen] = useState(false);
  const [isDestinationsOpen, setIsDestinationsOpen] = useState(false);

  useEffect(() => {
    if (!isBoxExpanded) {
      setIsAddingMarkerOpen(false);
      return;
    }
    setIsAddingMarkerOpen(isPinMode);
  }, [isBoxExpanded, isPinMode]);

  // Handlers for collapsed primary icon buttons
  const handleCollapsedMyLocation = () => {
    setIsBoxExpanded(true);
    if (onMyLocation) onMyLocation();
  };

  const handleCollapsedAddMarker = () => {
    setIsBoxExpanded(true);
    setIsAddingMarkerOpen(true);
    setIsDestinationsOpen(false);
    if (onAddMarker) onAddMarker();
  };

  const handleCollapsedDestinations = () => {
    setIsBoxExpanded(true);
    setIsDestinationsOpen(true);
    setIsAddingMarkerOpen(false);
  };

  return (
    <div className="map-controls-wrapper">
      
      {/* FLOATING LEFT ACTION STACK */}
      <div className="map-controls-left">
        {/* CONTROLLERS BOX */}
        <div className={`controllers-box ${isBoxExpanded ? 'expanded' : 'collapsed'}`}>
          {/* HEADER TITLE AND SUBTITLE */}
          <div className="controllers-header">
            <div className="header-top">
              {isBoxExpanded && <div className="status-pill status-live">Live</div>}
              <div className="tooltip-container button-tooltip">
                <button 
                  type="button"
                  className="expand-btn"
                  onClick={() => setIsBoxExpanded(!isBoxExpanded)}
                >
                  {isBoxExpanded ? '−' : '+'}
                </button>
                <div className="tooltip-text">
                  {isBoxExpanded ? 'Collapse' : 'Expand'}
                </div>
              </div>
            </div>
            {isBoxExpanded && (
              <>
                <div className="tooltip-container">
                  <h1>STMS</h1>
                  <div className="tooltip-text">Smart Tourism Management System</div>
                </div>
                <p className="subtitle">AI-Based Geolocation Guidance & Crowd Monitoring</p>
              </>
            )}
          </div>
        
          {!isBoxExpanded ? (
            <div className="collapsed-menu">
              <div className="tooltip-container button-tooltip">
                <button
                  type="button"
                  className="collapsed-icon-btn"
                  onClick={handleCollapsedMyLocation}
                >
                  <span className="btn-icon">📍</span>
                </button>
                <div className="tooltip-text">My Location</div>
              </div>

              <div className="tooltip-container button-tooltip">
                <button
                  type="button"
                  className="collapsed-icon-btn"
                  onClick={handleCollapsedAddMarker}
                >
                  <span className="btn-icon">📌</span>
                </button>
                <div className="tooltip-text">Add Marker</div>
              </div>

              <div className="tooltip-container button-tooltip">
                <button
                  type="button"
                  className="collapsed-icon-btn"
                  onClick={handleCollapsedDestinations}
                >
                  <span className="btn-icon">🗺️</span>
                </button>
                <div className="tooltip-text">Destinations</div>
              </div>
            </div>
          ) : (
            <>
              {/* 1. MY LOCATION CONTROL */}
              <div className="control-card-wrapper">
                <button type="button" className="tool-btn" onClick={onMyLocation}>
                  <span className="btn-icon">📍</span>
                  <span className="btn-text">My Location</span>
                </button>
              </div>

              {/* 2. ADD MARKER CONTROL + FULL ADVANCED SAFETY FORM */}
              <div className="control-card-wrapper">
                <button 
                  type="button" 
                  className={`tool-btn ${(isAddingMarkerOpen || isPinMode) ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsAddingMarkerOpen(!isAddingMarkerOpen);
                    if (isDestinationsOpen) setIsDestinationsOpen(false);
                    if (onAddMarker) onAddMarker();
                  }}
                >
                  <span className="btn-icon">📌</span>
                  <span className="btn-text">Add Marker{isPinMode ? `: ${selectedMarkerType}` : ''}</span>
                </button>

                <div className={`dropdown-panel add-marker-dropdown ${isAddingMarkerOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Add Safety Marker</h3>
                    <p className="panel-subtitle">
                      Choose a marker type and click the map to place it. Then submit the marker with the details below.
                    </p>

                    <form onSubmit={onHazardSubmit} className="integrated-form">
                      <label className="form-label">Marker type</label>
                      <select
                        className="form-select"
                        value={selectedMarkerType}
                        onChange={(e) => setSelectedMarkerType(e.target.value)}
                      >
                        <option value="Danger Area">Danger Area</option>
                        <option value="Dark Area">Dark Area</option>
                        <option value="Crowdy Area">Crowdy Area</option>
                        <option value="Dangerous Animals">Dangerous Animals</option>
                        <option value="Hazard on Area">Hazard on Area</option>
                      </select>

                      <label className="form-label">Marker title</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Optional title"
                        value={markerForm.title}
                        onChange={(e) => setMarkerForm({ ...markerForm, title: e.target.value })}
                      />

                      <label className="form-label">Severity</label>
                      <select
                        className="form-select"
                        value={markerForm.severity}
                        onChange={(e) => setMarkerForm({ ...markerForm, severity: e.target.value })}
                      >
                        <option value="Low">Low</option>
                        <option value="Moderate">Moderate</option>
                        <option value="High">High</option>
                      </select>

                      <label className="form-label">Radius / area affected (meters)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="20 - 5000"
                        value={markerForm.radius_meters}
                        onChange={(e) => setMarkerForm({ ...markerForm, radius_meters: e.target.value })}
                      />

                      <div className="form-row-split">
                        <div>
                          <label className="form-label">Days</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Days"
                            value={markerForm.duration_days}
                            onChange={(e) => setMarkerForm({ ...markerForm, duration_days: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="form-label">Hours</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Hours"
                            value={markerForm.duration_hours}
                            onChange={(e) => setMarkerForm({ ...markerForm, duration_hours: e.target.value })}
                          />
                        </div>
                      </div>

                      <label className="form-label">Description</label>
                      <textarea
                        className="form-textarea"
                        placeholder="Describe why this marker is needed"
                        rows="3"
                        value={markerForm.description}
                        onChange={(e) => setMarkerForm({ ...markerForm, description: e.target.value })}
                      />

                      <div className="captcha-box">
                        <label className="captcha-label">
                          <input
                            type="checkbox"
                            checked={captchaChecked}
                            onChange={(e) => setCaptchaChecked(e.target.checked)}
                          />
                           Please Note: The information given is being used by authority. Check the box if you confirm that the information is true
                        </label>
                      </div>

                      {markerWarning && <div className="warning-card high">{markerWarning}</div>}
                      {captchaWarning && <div className="warning-card moderate">{captchaWarning}</div>}

                      <div className="location-status-msg">
                        <strong>Selected location:</strong>
                        <p>{pendingMarkerLocation ? `${pendingMarkerLocation.lat.toFixed(4)}, ${pendingMarkerLocation.lng.toFixed(4)}` : 'Click the map to place your marker.'}</p>
                      </div>

                      <button type="submit" className="form-submit-btn">
                        Submit Marker
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* 3. TOURIST SPOTS CONTROL + PREMIUM RECOMMENDED SPOTS PANELS */}
              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isDestinationsOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsDestinationsOpen(!isDestinationsOpen);
                    if (isAddingMarkerOpen) setIsAddingMarkerOpen(false);
                  }}
                >
                  <span className="btn-icon">🗺️</span>
                  <span className="btn-text">Tourist Spots</span>
                </button>

                <div className={`dropdown-panel destinations-dropdown ${isDestinationsOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Nearest Tourist Spots</h3>

                    <div className="tourist-spots-list">
                      {nearest?.length > 0 ? (
                        <div className="tourist-spot-card">
                          <div className="card-header-row">
                            <h4 className="spot-card-title">{nearest[0].name || 'Nearest Tourist Spot'}</h4>
                            <span className="severity-badge-high">{nearest[0].crowd_level || 'High'}</span>
                          </div>
                          <p className="spot-card-location">
                            {nearest[0].city || nearest[0].location || 'Unknown Location'}, {nearest[0].province || ''}
                          </p>
                          <p className="spot-card-meta">
                            {nearest[0].category || 'Tourist Destination'} • {nearest[0].opening_hours || 'Hours unavailable'}
                          </p>
                          <p className="spot-card-distance">
                            {nearest[0].distance_km != null ? `Approx. ${nearest[0].distance_km} km away` : 'Distance unknown'}
                          </p>
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
                            {selectedLocation ? `Approx. ${calculateDistanceKm(selectedLocation.lat, selectedLocation.lng, 14.5825, 120.9781)} km away` : 'Approx. 131.61 km away'}
                          </p>
                        </div>
                      )}

                      {/* Loops additional card dynamic data if array gets populated from your DB backend */}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

    </div>
  );
};

export default MapControlLeft;
