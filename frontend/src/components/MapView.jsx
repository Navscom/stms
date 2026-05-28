import { Fragment, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../css/MapView.css';
import MapControlRight from './MapControlRight';
import CommentBox from './Comments';
import L from 'leaflet';
import { formatDuration, isPinInactive } from '../utils/pinHelpers';

const phBounds = [[4.0, 116.0], [21.5, 127.0]];

const createIcon = (iconUrl) => new L.Icon({
  iconUrl,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const ICONS = {
  blue: createIcon('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png'),
  red: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'),
  orange: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png'),
  yellow: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'),
  violet: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png'),
  green: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'),
};

const dangerStyles = {
  'Danger Area': { color: '#dc2626', icon: ICONS.red },
  'Dark Area': { color: '#111827', icon: ICONS.violet },
  'Crowdy Area': { color: '#f59e0b', icon: ICONS.yellow },
  'Dangerous Animals': { color: '#f97316', icon: ICONS.orange },
  'Hazard on Area': { color: '#7c3aed', icon: ICONS.violet },
};

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const DESTINATION_ICON = new L.DivIcon({
  html: '<div class="destination-pin"><span>🏛️</span></div>',
  className: 'destination-pin-icon',
  iconSize: [52, 68],
  iconAnchor: [26, 68],
  popupAnchor: [0, -56],
});

const dangerMarkerMeta = {
  'Danger Area': { color: '#dc2626', emoji: '❗', extraClass: 'danger-area' },
  'Dark Area': { color: '#111827', emoji: '🌙', extraClass: 'dark-area' },
  'Crowdy Area': { color: '#f59e0b', emoji: '👥', extraClass: 'crowdy-area' },
  'Dangerous Animals': { color: '#f97316', emoji: '🐾', extraClass: 'dangerous-animals' },
  'Hazard on Area': { color: '#7c3aed', emoji: '⚠️', extraClass: 'hazard-area' },
};

const createDangerIcon = ({ color, emoji, extraClass, isNearby = false }) => new L.DivIcon({
  html: `<div class="danger-pin danger-pin--${extraClass}${isNearby ? ' danger-pin--nearby' : ''}" style="background: ${color};">` +
    `<span>${emoji}</span></div>`,
  className: 'danger-pin-icon',
  iconSize: [44, 56],
  iconAnchor: [22, 56],
  popupAnchor: [0, -44],
});

const getDangerIcon = (pin, isNearby) => {
  const meta = dangerMarkerMeta[pin.danger_type] || dangerMarkerMeta['Danger Area'];
  return createDangerIcon({ ...meta, isNearby });
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const PERSON_ICON = new L.DivIcon({
  html: '<div class="person-pin"><span>YOU</span><div class="person-pin-tail"></div></div>',
  className: 'person-pin-icon',
  iconSize: [54, 74],
  iconAnchor: [27, 74],
  popupAnchor: [0, -60],
});

const DEFAULT_MAP_CENTER = [14.5994, 120.9842];
const DEFAULT_MAP_ZOOM = 12;
const MAP_STATE_KEY = 'stms_map_state';

const loadStoredMapState = () => {
  try {
    const stored = window.localStorage.getItem(MAP_STATE_KEY);
    if (!stored) return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
    const parsed = JSON.parse(stored);
    const center = Array.isArray(parsed?.center) && parsed.center.length === 2
      ? [Number(parsed.center[0]), Number(parsed.center[1])]
      : DEFAULT_MAP_CENTER;
    const zoom = Number(parsed?.zoom);
    if (Number.isNaN(zoom)) {
      return { center, zoom: DEFAULT_MAP_ZOOM };
    }
    return {
      center,
      zoom: Math.min(Math.max(zoom, 6), 18),
    };
  } catch {
    return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
  }
};

function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ZoomControlHandler() {
  const map = useMap();

  const controlRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const applyZoomTooltips = (zoomControl) => {
      const zoomInButton = zoomControl._zoomInButton || zoomControl._container?.querySelector('.leaflet-control-zoom-in');
      const zoomOutButton = zoomControl._zoomOutButton || zoomControl._container?.querySelector('.leaflet-control-zoom-out');

      if (zoomInButton) {
        zoomInButton.setAttribute('data-tooltip', 'Zoom in');
        zoomInButton.setAttribute('title', '');
        zoomInButton.setAttribute('aria-label', 'Zoom in');
      }
      if (zoomOutButton) {
        zoomOutButton.setAttribute('data-tooltip', 'Zoom out');
        zoomOutButton.setAttribute('title', '');
        zoomOutButton.setAttribute('aria-label', 'Zoom out');
      }
    };

    // If a zoom control already exists on the map (possibly added earlier), keep it.
    const existingZoom = (map._controls || []).find((c) => c && c instanceof L.Control.Zoom);
    if (existingZoom) {
      controlRef.current = existingZoom;
      // Ensure a convenient reference is available on the map object for legacy code
      if (!map.zoomControl) map.zoomControl = existingZoom;
      applyZoomTooltips(existingZoom);
      return undefined;
    }

    // Remove any previously-stored zoomControl reference (legacy) before adding ours
    if (map.zoomControl) {
      try { map.removeControl(map.zoomControl); } catch (e) { /* ignore */ }
      map.zoomControl = null;
    }

    // Add new zoom control to bottom-right and remember we added it
    const zoomCtrl = L.control.zoom({ position: 'bottomright' });
    zoomCtrl.addTo(map);
    applyZoomTooltips(zoomCtrl);
    controlRef.current = zoomCtrl;
    map.zoomControl = zoomCtrl;

    // Cleanup: remove the control we added when this component unmounts
    return () => {
      if (controlRef.current) {
        try { map.removeControl(controlRef.current); } catch (e) { /* ignore */ }
        if (map.zoomControl === controlRef.current) map.zoomControl = null;
        controlRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function MapStatePersistence() {
  const map = useMap();

  const saveMapState = () => {
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    try {
      window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
        center: [center.lat, center.lng],
        zoom,
      }));
    } catch {
      // ignore storage errors
    }
  };

  useMapEvents({
    moveend: saveMapState,
    zoomend: saveMapState,
  });

  return null;
}

function MapResetHandler({ defaultCenter, defaultZoom, resetFlag }) {
  const map = useMap();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!map || resetFlag == null) return;
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    map.setView(defaultCenter, defaultZoom, { animate: false });
    try {
      window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
        center: defaultCenter,
        zoom: defaultZoom,
      }));
    } catch {
      // ignore storage errors
    }
  }, [map, resetFlag, defaultCenter, defaultZoom]);

  return null;
}

function MapFocusHandler({ location, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !location) return;
    map.setView([location.lat, location.lng], zoom || map.getZoom(), { animate: true });
  }, [map, location, zoom]);

  return null;
}

function MapSyncHandler({ theme }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
  }, [map, theme]);

  return null;
}

function DangerMarker({ pin, icon, style, highlighted, isNearby, user, onAddComment, onUpdateComment, onDeleteComment, onDeletePin }) {
  const map = useMap();

  return (
    <Fragment>
      {highlighted && (
        <Circle
          center={[pin.lat, pin.lng]}
          radius={Math.max(pin.radius_meters + 40, 140)}
          pathOptions={{
            color: '#7c3aed',
            weight: 3,
            dashArray: '6 5',
            fillOpacity: 0,
          }}
        />
      )}
      <Circle
        center={[pin.lat, pin.lng]}
        radius={pin.radius_meters}
        pathOptions={{
          color: style.color,
          fillColor: style.color,
          fillOpacity: isNearby ? 0.35 : 0.16,
        }}
      />
      <Marker
        position={[pin.lat, pin.lng]}
        icon={icon}
        eventHandlers={{
          click: (event) => {
            map.flyTo(event.latlng || [pin.lat, pin.lng], 18, {
              animate: true,
              duration: 0.6,
            });
          },
        }}
      >
        <Popup maxWidth={320}>
          <div onClick={(e) => e.stopPropagation()}>
            <strong>{pin.danger_type}: {pin.title}</strong><br />
            Severity: <b>{pin.severity}</b><br />
            Radius: {pin.radius_meters}m<br />
            {formatDuration(pin) && <>Duration: {formatDuration(pin)}<br /></>}
            <small>Reported by: {pin.reported_by}</small><br />
            <small>Reported on: {formatTimestamp(pin.created_at)}</small>
            <p>{pin.description}</p>
            <CommentBox
              pin={pin}
              user={user}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
            />
            <DeletePinBox pin={pin} user={user} onDeletePin={onDeletePin} />
          </div>
        </Popup>
      </Marker>
    </Fragment>
  );
}

function DeletePinBox({ pin, user, onDeletePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = user?.name === pin.reported_by || user?.role === 'administrator' || user?.role === 'admin';

  if (!canDelete) {
    return (
      <div className="delete-pin-note">
        <small>Only the reporting user or an administrator can delete this pin.</small>
      </div>
    );
  }

  return (
    <div className="delete-pin-box">
      <label>
        <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
        Confirm delete this pin
      </label>
      <button type="button" className="secondary-btn" disabled={!confirmDelete} onClick={() => onDeletePin(pin.id)}>
        Delete pin
      </button>
    </div>
  );
}

export default function MapView({
  onLocationClick,
  destinations,
  dangerPins,
  nearbyDangers,
  selectedLocation,
  pendingMarkerLocation,
  selectedMarkerType,
  selectedDestinationId,
  reportHighlight,
  onDestinationClick,
  user,
  onLogin,
  onLogout,
  onDeleteAccount,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onDeletePin,
  onToggleTheme,
  onResetMap,
  resetMapFlag,
  focusLocation,
  focusZoom,
  userLocation,
  theme = 'light',
  mapRotation = 0,
}) {
  // Debug: Log received props
  useEffect(() => {
    console.log('MapView Props Debug:', {
      destinations: destinations?.length || 0,
      dangerPins: dangerPins?.length || 0,
      nearbyDangers: nearbyDangers?.length || 0,
      pendingMarkerLocation,
      selectedMarkerType,
    });
  }, [destinations, dangerPins, nearbyDangers, pendingMarkerLocation, selectedMarkerType]);

  

  const nearbyIds = new Set((nearbyDangers || []).map((d) => d.id));

  const visibleDangerPins = (dangerPins || []).filter((p) => !isPinInactive(p));

  const renderDuration = (pin) => formatDuration(pin);

  const destinationRiskColors = {
    Low: '#16a34a',
    Moderate: '#f59e0b',
    High: '#dc2626',
  };

  const getDestinationRiskStyle = (crowdLevel) => {
    const color = destinationRiskColors[crowdLevel] || destinationRiskColors.Low;
    return {
      color,
      fillColor: color,
      fillOpacity: 0.18,
      weight: 2,
    };
  };

  const [initialMapState] = useState(loadStoredMapState);
  const tileLayerUrl = theme === 'dark' ? DARK_TILE_URL : LIGHT_TILE_URL;
  const mapWrapperStyle = {
    '--map-rotation': `${mapRotation}deg`,
  };

  return (
    <div className="map-container-wrapper" data-theme={theme} data-rotation={mapRotation} style={mapWrapperStyle}>
      
      <MapControlRight
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        onToggleTheme={onToggleTheme}
        onResetMap={onResetMap}
        theme={theme}
      />

      <MapContainer
        id="map"
        center={initialMapState.center}
        zoom={initialMapState.zoom}
        maxBounds={phBounds}
        maxBoundsViscosity={1.0}
        minZoom={6}
        maxZoom={18}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url={tileLayerUrl}
          attribution="&copy; OpenStreetMap contributors"
          updateWhenIdle={false}
          updateWhenZooming={true}
          keepBuffer={2}
        />
        <MapClickHandler onLocationClick={onLocationClick} />
        <ZoomControlHandler />
        <MapStatePersistence />
        <MapResetHandler
          defaultCenter={DEFAULT_MAP_CENTER}
          defaultZoom={DEFAULT_MAP_ZOOM}
          resetFlag={resetMapFlag}
        />
        <MapFocusHandler location={focusLocation} zoom={focusZoom} />
        <MapSyncHandler theme={theme} />

        {destinations.map((d) => {
          const highlightAllDestinations = reportHighlight === 'all-destinations';
          const highlightHighCrowd = reportHighlight === 'high-crowd';
          const isHighlightedDestination = highlightAllDestinations || (highlightHighCrowd && d.crowd_level === 'High');
          const isSelected = selectedDestinationId === d.id;
          const circlePathOptions = isSelected
            ? getDestinationRiskStyle(d.crowd_level)
            : isHighlightedDestination
              ? { color: '#2563eb', fillColor: '#bfdbfe', fillOpacity: 0.18, weight: 2 }
              : null;

          return (
            <Fragment key={`dest-${d.id}`}>
              {(isSelected || isHighlightedDestination) && (
                <Circle
                  center={[d.lat, d.lng]}
                  radius={isSelected ? 500 : 320}
                  pathOptions={circlePathOptions}
                />
              )}
              <Marker
                position={[d.lat, d.lng]}
                icon={DESTINATION_ICON}
                eventHandlers={onDestinationClick ? { click: () => onDestinationClick(d) } : undefined}
              >
                <Popup>
                  <strong>{d.name}</strong><br />
                  {d.city}, {d.province}<br />
                  Crowd: <b>{d.crowd_level}</b><br />
                  {d.opening_hours}
                </Popup>
              </Marker>
            </Fragment>
          );
        })}

        {visibleDangerPins.map((pin) => {
          const style = dangerStyles[pin.danger_type] || dangerStyles['Danger Area'];
          const icon = getDangerIcon(pin, nearbyIds.has(pin.id));
          const highlightHighDanger = reportHighlight === 'high-danger' && pin.severity === 'High';
          return (
            <DangerMarker
              key={`danger-${pin.id}`}
              pin={pin}
              icon={icon}
              style={style}
              highlighted={highlightHighDanger}
              isNearby={nearbyIds.has(pin.id)}
              user={user}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onDeletePin={onDeletePin}
            />
          );
        })}

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={PERSON_ICON}>
            <Popup>Your selected location</Popup>
          </Marker>
        )}

        {pendingMarkerLocation && (
          <Marker
            position={[pendingMarkerLocation.lat, pendingMarkerLocation.lng]}
            icon={getDangerIcon({ danger_type: selectedMarkerType || 'Danger Area' }, false)}
          >
            <Popup>Pending {selectedMarkerType || 'Danger Area'} marker. Click anywhere else on the map to move it.</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
