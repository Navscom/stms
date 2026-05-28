import React, { useState, useEffect, useMemo } from 'react';
import '../css/MapControlLeft.css';
import DestinationList from './DestinationList';
import NearestDestination from './NearestDestination';
import ReportGrid from './ReportGrid';
import Safetyalert from './Safetyalert';

const MapControlLeft = ({
  onMyLocation,
  onHazardSubmit,
  onAddMarker,
  onCenterTouristSpot,
  onZoomToSpot,
  onClearSelection,
  onReportHover = () => {},
  onReportHoverEnd = () => {},
  onReportSelect = () => {},
  reportHighlight = null,
  touristSpots = [],
  nearest = [],
  nearbyDangers = [],
  report = null,
  selectedDestinationId = null,
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
  const [isNearestOpen, setIsNearestOpen] = useState(false);
  const [isSafetyAlertOpen, setIsSafetyAlertOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState('');

  const filteredDestinations = useMemo(() => {
    const search = destinationSearch.trim().toLowerCase();
    if (!search) return touristSpots;
    return touristSpots.filter((spot) => spot.name?.toLowerCase().includes(search));
  }, [touristSpots, destinationSearch]);

  useEffect(() => {
    if (!isBoxExpanded) {
      setIsAddingMarkerOpen(false);
      return;
    }
    setIsAddingMarkerOpen(isPinMode);
  }, [isBoxExpanded, isPinMode]);

  useEffect(() => {
    if (!isBoxExpanded) {
      setIsNearestOpen(false);
      setIsDestinationsOpen(false);
      setIsSafetyAlertOpen(false);
      setIsReportOpen(false);
    }
  }, [isBoxExpanded]);

  // Handlers for collapsed primary icon buttons
  const handleCollapsedMyLocation = () => {
    setIsBoxExpanded(true);
    if (onMyLocation) onMyLocation();
  };

  const handleCollapsedAddMarker = () => {
    setIsBoxExpanded(true);
    setIsAddingMarkerOpen(true);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    if (onAddMarker) onAddMarker();
  };

  const handleCollapsedDestinations = () => {
    setIsBoxExpanded(true);
    setIsDestinationsOpen(true);
    setIsAddingMarkerOpen(false);
    setIsNearestOpen(false);
    setIsSafetyAlertOpen(false);
  };

  // Auto-close menu when a destination is selected in portrait mode
  const handleDestinationSelected = () => {
    const isPortraitMode = window.matchMedia('(max-height: 900px) and (max-width: 768px)').matches;
    if (isPortraitMode) {
      setIsBoxExpanded(false);
      setIsDestinationsOpen(false);
    }
  };

  const handleCollapsedNearest = () => {
    setIsBoxExpanded(true);
    setIsNearestOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsSafetyAlertOpen(false);
    setIsReportOpen(false);
  };

  const handleCollapsedSafetyAlert = () => {
    setIsBoxExpanded(true);
    setIsSafetyAlertOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    setIsReportOpen(false);
  };

  const handleCollapsedReport = () => {
    setIsBoxExpanded(true);
    setIsReportOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    setIsSafetyAlertOpen(false);
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
              {!isBoxExpanded && (
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
              )}
            </div>
            {isBoxExpanded && (
              <>
                <div className="header-title-row">
                  <div className="tooltip-container">
                    <h1>STMS</h1>
                    <div className="tooltip-text">Smart Tourism Management System</div>
                  </div>
                  <span className="status-pill status-live">Live</span>
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
                <p className="subtitle">AI-Based Geolocation Guidance</p>
                <p className="subtitle">& Crowd Monitoring</p>
              </>
            )}
          </div>
        
          {!isBoxExpanded ? (
            <>
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
                    onClick={handleCollapsedSafetyAlert}
                  >
                    <span className="btn-icon">⚠️</span>
                  </button>
                  <div className="tooltip-text">Safety Alerts</div>
                </div>

                <div className="tooltip-container button-tooltip">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedReport}
                  >
                    <span className="btn-icon">📊</span>
                  </button>
                  <div className="tooltip-text">Report Grid</div>
                </div>

                <div className="tooltip-container button-tooltip">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedNearest}
                  >
                    <span className="btn-icon">🧭</span>
                  </button>
                  <div className="tooltip-text">Nearest Attractions</div>
                </div>

                <div className="tooltip-container button-tooltip">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedDestinations}
                  >
                    <span className="btn-icon">🗺️</span>
                  </button>
                  <div className="tooltip-text">Tourist Attractions</div>
                </div>
              </div>
            </>
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
                    setIsSafetyAlertOpen(false);
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

              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isSafetyAlertOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsSafetyAlertOpen(!isSafetyAlertOpen);
                    setIsAddingMarkerOpen(false);
                    setIsNearestOpen(false);
                    setIsDestinationsOpen(false);
                    setIsReportOpen(false);
                  }}
                >
                  <span className="btn-icon">⚠️</span>
                  <span className="btn-text">Safety Alerts</span>
                </button>

                <div className={`dropdown-panel safety-alert-dropdown ${isSafetyAlertOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Safety Alerts</h3>
                    <p className="panel-subtitle">View nearby hazard reports and warnings on the map.</p>
                    <Safetyalert nearbyDangers={nearbyDangers} />
                  </div>
                </div>
              </div>

              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isReportOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsReportOpen(!isReportOpen);
                    setIsAddingMarkerOpen(false);
                    setIsNearestOpen(false);
                    setIsDestinationsOpen(false);
                    setIsSafetyAlertOpen(false);
                  }}
                >
                  <span className="btn-icon">📊</span>
                  <span className="btn-text">Report Grid</span>
                </button>

                {isReportOpen && (
                  <div className="report-modal-backdrop" onClick={() => setIsReportOpen(false)} />
                )}

                <div className={`dropdown-panel report-dropdown ${isReportOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Report Grid</h3>
                    <p className="panel-subtitle">Review destination, crowd, and danger summaries.</p>
                    {report ? (
                      <ReportGrid
                        report={report}
                        reportHighlight={reportHighlight}
                        onReportHover={onReportHover}
                        onReportHoverEnd={onReportHoverEnd}
                        onReportSelect={onReportSelect}
                      />
                    ) : (
                      <p className="panel-subtitle">Report data is not available yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isNearestOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsNearestOpen(!isNearestOpen);
                    if (isAddingMarkerOpen) setIsAddingMarkerOpen(false);
                    if (isDestinationsOpen) setIsDestinationsOpen(false);
                    setIsSafetyAlertOpen(false);
                    setIsReportOpen(false);
                  }}
                >
                  <span className="btn-icon">🧭</span>
                  <span className="btn-text">Nearest Attraction</span>
                </button>

                <div className={`dropdown-panel nearest-dropdown ${isNearestOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">Nearest Destinations</h3>
                    <p className="panel-subtitle">These spots are closest to the currently selected location or your last map click.</p>
                    <NearestDestination
                      nearest={nearest}
                      selectedDestinationId={selectedDestinationId}
                      selectedLocation={selectedLocation}
                      onSelectNearest={onCenterTouristSpot}
                      onClearNearest={onClearSelection}
                    />
                  </div>
                </div>
              </div>

              {/* 3. TOURIST SPOTS CONTROL PREMIUM RECOMMENDED SPOTS PANELS */}
              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isDestinationsOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsDestinationsOpen(!isDestinationsOpen);
                    if (isAddingMarkerOpen) setIsAddingMarkerOpen(false);
                    if (isNearestOpen) setIsNearestOpen(false);
                    setIsSafetyAlertOpen(false);
                  }}
                >
                  <span className="btn-icon">🗺️</span>
                  <span className="btn-text">Tourist Attractions</span>
                </button>

                <div className={`dropdown-panel destinations-dropdown ${isDestinationsOpen ? 'open' : ''}`}>
                  <div className="inner-panel-content">
                    <h3 className="panel-main-title">
                      Tourist Attractions
                    </h3>
                    <div className="destination-search-box">
                      <input
                        type="text"
                        className="form-input destination-search-input"
                        placeholder="Search tourist spot by name"
                        value={destinationSearch}
                        onChange={(e) => setDestinationSearch(e.target.value)}
                      />
                    </div>
                    <DestinationList
                      destinations={filteredDestinations}
                      selectedLocation={selectedLocation}
                      onCenterSpot={onCenterTouristSpot}
                      onZoomToSpot={onZoomToSpot}
                      isPanel={true}
                      inline={true}
                      onSelectDestination={handleDestinationSelected}
                    />
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
