import L from 'leaflet';

const createIcon = (iconUrl) => new L.Icon({
  iconUrl,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export const ICONS = {
  blue: createIcon('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png'),
  red: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'),
  orange: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png'),
  yellow: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'),
  violet: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png'),
  green: createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'),
};

export const dangerStyles = {
  'Danger Area': { color: '#dc2626', icon: ICONS.red },
  'Dark Area': { color: '#111827', icon: ICONS.violet },
  'Crowdy Area': { color: '#f59e0b', icon: ICONS.yellow },
  'Dangerous Animals': { color: '#f97316', icon: ICONS.orange },
  'Hazard on Area': { color: '#7c3aed', icon: ICONS.violet },
};

export const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DARK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const DESTINATION_ICON = new L.DivIcon({
  html: '<div class="destination-pin"><span>🏛️</span></div>',
  className: 'destination-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

export const START_ICON = new L.DivIcon({
  html: '<div class="destination-pin"><span>1</span></div>',
  className: 'destination-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

export const LOCATION2_ICON = new L.DivIcon({
  html: '<div class="location2-pin"><span>2</span></div>',
  className: 'location2-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

export const LOCATION1_ICON = new L.DivIcon({
  html: '<div class="location1-pin"><span>1</span></div>',
  className: 'location1-pin-icon',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -52],
});

export const PERSON_ICON = new L.DivIcon({
  html: '<div class="person-pin"><span>YOU</span><div class="person-pin-tail"></div></div>',
  className: 'person-pin-icon',
  iconSize: [48, 60],
  iconAnchor: [24, 60],
  popupAnchor: [0, -48],
});

export const dangerMarkerMeta = {
  'Danger Area': { color: '#dc2626', emoji: '❗', extraClass: 'danger-area' },
  'Dark Area': { color: '#111827', emoji: '🌙', extraClass: 'dark-area' },
  'Crowdy Area': { color: '#f59e0b', emoji: '👥', extraClass: 'crowdy-area' },
  'Dangerous Animals': { color: '#f97316', emoji: '🐾', extraClass: 'dangerous-animals' },
  'Hazard on Area': { color: '#7c3aed', emoji: '⚠️', extraClass: 'hazard-area' },
};

// Icon caches to avoid recreating icons
const destinationIconCache = new Map();
const dangerIconCache = new Map();

export const getDestinationIcon = (highlighted = false) => {
  const key = highlighted ? 'highlighted' : 'normal';
  if (destinationIconCache.has(key)) return destinationIconCache.get(key);
  const icon = new L.DivIcon({
    html: `<div class="destination-pin${highlighted ? ' destination-pin--highlighted' : ''}"><span>🏛️</span></div>`,
    className: 'destination-pin-icon',
    iconSize: [52, 64],
    iconAnchor: [26, 64],
    popupAnchor: [0, -52],
  });
  destinationIconCache.set(key, icon);
  return icon;
};

const createDangerIcon = ({ color, emoji, extraClass, isNearby = false, highlighted = false }) => new L.DivIcon({
  html: `<div class="danger-pin danger-pin--${extraClass}${isNearby ? ' danger-pin--nearby' : ''}${highlighted ? ' danger-pin--highlighted' : ''}" style="background: ${color};">` +
    `<span>${emoji}</span></div>`,
  className: 'danger-pin-icon',
  iconSize: [48, 62],
  iconAnchor: [24, 62],
  popupAnchor: [0, -48],
});

export const getDangerIcon = (pin, isNearby, highlighted = false) => {
  const dangerType = pin?.danger_type || 'Danger Area';
  const meta = dangerMarkerMeta[dangerType] || dangerMarkerMeta['Danger Area'];
  const cacheKey = `${dangerType}|${isNearby ? '1' : '0'}|${highlighted ? '1' : '0'}`;
  if (dangerIconCache.has(cacheKey)) return dangerIconCache.get(cacheKey);
  const icon = createDangerIcon({ ...meta, isNearby, highlighted });
  dangerIconCache.set(cacheKey, icon);
  return icon;
};

export const DEFAULT_MAP_CENTER = [14.5994, 120.9842];
export const DEFAULT_MAP_ZOOM = 12;
export const MAP_STATE_KEY = 'stms_map_state';
export const DEFAULT_FOCUS_OFFSET_PX = 120;
