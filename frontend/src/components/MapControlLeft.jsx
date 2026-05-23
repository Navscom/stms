import React, { useState } from 'react';
import '../css/MapControlLeft.css';

const MapControlLeft = ({
  onMyLocation,
  onHazardSubmit,
  touristSpots = [],
  isBoxExpanded = false,
  setIsBoxExpanded = () => {},
}) => {
  const [isAddingMarkerOpen, setIsAddingMarkerOpen] = useState(false);
  const [isDestinationsOpen, setIsDestinationsOpen] = useState(false);

  // Handlers for collapsed primary icon buttons
  const handleCollapsedMyLocation = () => {
    setIsBoxExpanded(true);
    if (onMyLocation) onMyLocation();
  };

  const handleCollapsedAddMarker = () => {
    setIsBoxExpanded(true);
    setIsAddingMarkerOpen(true);
    setIsDestinationsOpen(false);
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
                  className={`tool-btn ${isAddingMarkerOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsAddingMarkerOpen(!isAddingMarkerOpen);
                    if (isDestinationsOpen) setIsDestinationsOpen(false);
                  }}
                >
                  <span className="btn-icon">📌</span>
                  <span className="btn-text">Add Marker</span>
                </button>
                
                <div className={`dropdown-panel add-marker-dropdown ${isAddingMarkerOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Add Safety Marker</h3>
                    <p className="panel-subtitle">
                      Choose a marker type and click the map to place it. Then submit the marker with the details below.
                    </p>

                    <form onSubmit={onHazardSubmit} className="integrated-form">
                      <label className="form-label">Marker type</label>
                      <select className="form-select" defaultValue="Danger Area">
                        <option value="Danger Area">Danger Area</option>
                        <option value="Wildlife Sighting">Wildlife Sighting</option>
                        <option value="Environmental Hazard">Environmental Hazard</option>
                      </select>

                      <label className="form-label">Marker title</label>
                      <input type="text" className="form-input" placeholder="Optional title" />

                      <label className="form-label">Severity</label>
                      <select className="form-select" defaultValue="Moderate">
                        <option value="Low">Low</option>
                        <option value="Moderate">Moderate</option>
                        <option value="High">High</option>
                      </select>

                      <label className="form-label">Radius / area affected (meters)</label>
                      <input type="text" className="form-input" placeholder="20 - 5000" />

                      <div className="form-row-split">
                        <div>
                          <label className="form-label">Days</label>
                          <input type="text" className="form-input" placeholder="Days" />
                        </div>
                        <div>
                          <label className="form-label">Hours</label>
                          <input type="text" className="form-input" placeholder="Hours" />
                        </div>
                      </div>

                      <label className="form-label">Description</label>
                      <textarea 
                        className="form-textarea" 
                        placeholder="Describe why this marker is needed"
                        rows="3"
                      />

                      {/* Authority Disclaimer Checkbox Block */}
                      <div className="disclaimer-box">
                        <input type="checkbox" id="authority-check" className="form-checkbox" required />
                        <label htmlFor="authority-check" className="disclaimer-text">
                          Please note: the information given is being used by authority. Check the box if you understand and confirm the information is true.
                        </label>
                      </div>

                      <div className="location-status-msg">
                        <strong>Selected location:</strong>
                        <p>Click the map to place your marker.</p>
                      </div>

                      <button type="submit" className="form-submit-btn">
                        Submit Marker
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* 3. DESTINATIONS CONTROL + PREMIUM RECOMMENDED SPOTS PANELS */}
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
                  <span className="btn-text">Destinations</span>
                </button>
                
                <div className={`dropdown-panel destinations-dropdown ${isDestinationsOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Nearest Recommended Spots</h3>
                    
                    <div className="tourist-spots-list">
                      <div className="tourist-spot-card">
                        <div className="card-header-row">
                          <h4 className="spot-card-title">RIZAL PARK</h4>
                          <span className="severity-badge-high">High</span>
                        </div>
                        <p className="spot-card-location">MANILA CITY, MANILA</p>
                        <p className="spot-card-meta">TOURIST DESTINATION • 8:00 AM - 5:00 PM</p>
                        <p className="spot-card-distance">Approx. 131.61 km away</p>
                      </div>

                      {/* Loops additional card dynamic data if array gets populated from your DB backend */}
                      {touristSpots.map((spot, idx) => (
                        <div key={spot.id || idx} className="tourist-spot-card">
                          <div className="card-header-row">
                            <h4 className="spot-card-title">{spot.title}</h4>
                            {spot.priority && <span className="severity-badge-high">{spot.priority}</span>}
                          </div>
                          <p className="spot-card-location">{spot.location}</p>
                          <p className="spot-card-meta">{spot.metaText}</p>
                          <p className="spot-card-distance">{spot.distance}</p>
                        </div>
                      ))}
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
