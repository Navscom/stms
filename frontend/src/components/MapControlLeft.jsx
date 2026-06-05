import React, { useState, useEffect, useMemo } from 'react';
import '../css/MapControlLeft.css';
import TooltipPortal from './TooltipPortal';
import DestinationList from './DestinationList';
import NearestDestination from './NearestDestination';
import ReportGrid from './ReportGrid';
import Safetyalert from './Safetyalert';

const MapControlLeft = ({
  onMyLocation,
  onHazardSubmit,
  onAddMarker,
  onCenterTouristSpot,
  onSelectDestination,
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
  locationMode = false,
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
  const [routeStartLocal, setRouteStartLocal] = useState(null);
  const [routeTargetLocal, setRouteTargetLocal] = useState(null);
  const [routingSelectingLocal, setRoutingSelectingLocal] = useState(null);
  const [routingOpenLocal, setRoutingOpenLocal] = useState(false);
  const [isRoutingOpen, setIsRoutingOpen] = useState(false);

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
  useEffect(() => {
    if (!isBoxExpanded) closeRoutingPanel();
  }, [isBoxExpanded]);

  // Listen for route updates from the map component
  useEffect(() => {
    const handler = (e) => {
      const d = e?.detail || {};
      setRouteStartLocal(d.routeStart || null);
      setRouteTargetLocal(d.routeTarget || null);
      setRoutingSelectingLocal(d.routingSelecting || null);
      setRoutingOpenLocal(Boolean(d.routingOpen));
    };
    window.addEventListener('stms:route-update', handler);
    return () => window.removeEventListener('stms:route-update', handler);
  }, []);

  const dispatchSelect = (mode, extra = {}) => {
    try { window.dispatchEvent(new CustomEvent('stms:route-select', { detail: { mode, ...extra } })); } catch (e) { /* ignore */ }
  };

  const closeRoutingPanel = () => {
    setIsRoutingOpen(false);
    dispatchSelect('clear');
  };

  // Handlers for collapsed primary icon buttons
  const handleCollapsedMyLocation = () => {
    setIsBoxExpanded(true);
    if (onMyLocation) onMyLocation();
  };

  const openRoutingPanel = () => {
    setIsBoxExpanded(true);
    setIsRoutingOpen(true);
    dispatchSelect('clear');
    dispatchSelect('start');
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    setIsSafetyAlertOpen(false);
    setIsReportOpen(false);
    try { if (isPinMode && onAddMarker) onAddMarker(); } catch (e) { /* ignore */ }
  };

  const handleCollapsedRouting = () => {
    openRoutingPanel();
  };

  const handleCollapsedAddMarker = () => {
    setIsBoxExpanded(true);
    setIsAddingMarkerOpen(true);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    closeRoutingPanel();
    if (onAddMarker) onAddMarker();
  };

  const handleCollapsedDestinations = () => {
    setIsBoxExpanded(true);
    setIsDestinationsOpen(true);
    setIsAddingMarkerOpen(false);
    setIsNearestOpen(false);
    setIsSafetyAlertOpen(false);
    closeRoutingPanel();
  };

  // Keep destination panel open after selection so the user can manually click Focus
  const handleDestinationSelected = () => {
    // intentionally preserve current panel state for mobile users
  };

  const handleDestinationFocus = () => {
    setIsBoxExpanded(false);
    setIsDestinationsOpen(false);
  };

  const handleCollapsedNearest = () => {
    setIsBoxExpanded(true);
    setIsNearestOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsSafetyAlertOpen(false);
    setIsReportOpen(false);
    closeRoutingPanel();
  };

  const handleCollapsedSafetyAlert = () => {
    setIsBoxExpanded(true);
    setIsSafetyAlertOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    setIsReportOpen(false);
    closeRoutingPanel();
  };

  const handleCollapsedReport = () => {
    setIsBoxExpanded(true);
    setIsReportOpen(true);
    setIsAddingMarkerOpen(false);
    setIsDestinationsOpen(false);
    setIsNearestOpen(false);
    setIsSafetyAlertOpen(false);
    closeRoutingPanel();
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
                <TooltipPortal content={isBoxExpanded ? 'Collapse' : 'Expand'}>
                  <button 
                    type="button"
                    className="expand-btn"
                    onClick={() => setIsBoxExpanded(!isBoxExpanded)}
                  >
                    {isBoxExpanded ? '−' : '+'}
                  </button>
                </TooltipPortal>
              )}
            </div>
            {isBoxExpanded && (
              <>
                <div className="header-title-row">
                  <TooltipPortal content={<><strong>Smart Tourism Management System</strong></>}>
                    <h1>STMS</h1>
                  </TooltipPortal>
                  <span className="status-pill status-live">Live</span>
                  <TooltipPortal content={isBoxExpanded ? 'Collapse' : 'Expand'}>
                    <button 
                      type="button"
                      className="expand-btn"
                      onClick={() => setIsBoxExpanded(!isBoxExpanded)}
                    >
                      {isBoxExpanded ? '−' : '+'}
                    </button>
                  </TooltipPortal>
                </div>
                <p className="subtitle">AI-Based Geolocation Guidance</p>
                <p className="subtitle">& Crowd Monitoring</p>
              </>
            )}
          </div>
        
          {!isBoxExpanded ? (
            <>
              <div className="collapsed-menu">
                <TooltipPortal content={`My Location${locationMode ? ' : On' : ''}`}>
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedMyLocation}
                  >
                    <span className="btn-icon">📍</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Map Routing">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedRouting}
                  >
                    <span className="btn-icon">🗺️</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Add Marker">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedAddMarker}
                  >
                    <span className="btn-icon">📌</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Safety Alerts">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedSafetyAlert}
                  >
                    <span className="btn-icon">⚠️</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Report Grid">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedReport}
                  >
                    <span className="btn-icon">📊</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Nearest Attractions">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedNearest}
                  >
                    <span className="btn-icon">🧭</span>
                  </button>
                </TooltipPortal>

                <TooltipPortal content="Tourist Attractions">
                  <button
                    type="button"
                    className="collapsed-icon-btn"
                    onClick={handleCollapsedDestinations}
                  >
                    <span className="btn-icon">🗺️</span>
                  </button>
                </TooltipPortal>
              </div>
            </>
          ) : (
            <>
              {/* 1. MY LOCATION CONTROL */}
              <div className="control-card-wrapper">
                <button type="button" className="tool-btn" onClick={onMyLocation}>
                  <span className="btn-icon">📍</span>
                  <span className="btn-text">{`My Location${locationMode ? ' : On' : ''}`}</span>
                </button>
              </div>

              {/* 2. MAP ROUTING CONTROL */}
              <div className="control-card-wrapper">
                <button
                  type="button"
                  className={`tool-btn ${isRoutingOpen ? 'active-toggle' : ''}`}
                  onClick={() => {
                    const willOpen = !isRoutingOpen;
                    if (willOpen) {
                      openRoutingPanel();
                    } else {
                      closeRoutingPanel();
                    }
                  }}
                >
                  <span className="btn-icon">🗺️</span>
                  <span className="btn-text">{
                    routingSelectingLocal
                      ? `Map Routing: selecting ${routingSelectingLocal}`
                      : routeStartLocal && routeTargetLocal
                        ? `Map Routing: 2 pins`
                        : routeStartLocal
                          ? `Map Routing: start set`
                          : 'Map Routing'
                  }</span>
                </button>

                {isRoutingOpen && (
                  <div className="routing-content-panel">
                    <h3 className="panel-main-title">Map Routing</h3>
                    <p className="panel-subtitle">Choose start and destination by clicking on the map, or use GPS.</p>
                    <div className="routing-panel">
                      <label className="form-label">Choose starting point</label>
                      <div className="routing-input">
                        <button type="button" className="input-left-icon" aria-hidden>📍</button>
                        <input
                          type="text"
                          placeholder="Choose starting point"
                          value={routeStartLocal ? `${routeStartLocal.lat.toFixed(4)}, ${routeStartLocal.lng.toFixed(4)}` : ''}
                          readOnly
                          onFocus={() => dispatchSelect('start')}
                        />
                        <button type="button" className="input-clear" onClick={() => dispatchSelect('clear')} aria-label="Clear start">✖</button>
                      </div>

                      <label className="form-label">Choose destination</label>
                      <div className="routing-input">
                        <button type="button" className="input-left-icon" aria-hidden>🔍</button>
                        <input
                          type="text"
                          placeholder="Choose destination..."
                          value={routeTargetLocal ? `${routeTargetLocal.lat.toFixed(4)}, ${routeTargetLocal.lng.toFixed(4)}` : ''}
                          readOnly
                          onFocus={() => dispatchSelect('end')}
                        />
                      </div>

                      <div className="routing-hint">{routingSelectingLocal ? `Click on the map to set ${routingSelectingLocal}` : 'Click an input then click the map to place a pin.'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. ADD MARKER CONTROL + FULL ADVANCED SAFETY FORM */}
              <div className="control-card-wrapper">

                <button 
                  type="button" 
                  className={`tool-btn ${(isAddingMarkerOpen || isPinMode) ? 'active-toggle' : ''}`}
                  onClick={() => {
                    setIsAddingMarkerOpen(!isAddingMarkerOpen);
                    setIsSafetyAlertOpen(false);
                    if (isDestinationsOpen) setIsDestinationsOpen(false);
                    closeRoutingPanel();
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
                    closeRoutingPanel();
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
                    closeRoutingPanel();
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
                        onReportSelect={(type) => {
                          try { if (onReportSelect) onReportSelect(type); } catch (e) { /* ignore */ }
                          // Close the report panel and collapse the left controls to reveal the map
                          setIsReportOpen(false);
                          setIsBoxExpanded(false);
                        }}
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
                    closeRoutingPanel();
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
                    closeRoutingPanel();
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
                      selectedDestinationId={selectedDestinationId}
                      selectedLocation={selectedLocation}
                      onClearSelection={onClearSelection}
                      onCenterSpot={onCenterTouristSpot}
                      onFocusDestination={handleDestinationFocus}
                      autoFocusOnSelect={false}
                      isPanel={true}
                      inline={true}
                      onSelectDestination={onSelectDestination || handleDestinationSelected}
                    />
                  </div>
                </div>
              </div>            </>
          )}

        </div>
      </div>

    </div>
  );
};

export default MapControlLeft;
