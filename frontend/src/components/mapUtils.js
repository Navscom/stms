import L from 'leaflet';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_STATE_KEY, DEFAULT_FOCUS_OFFSET_PX } from './mapIcons';

export const normalizeLatLng = (lat, lng) => [Number(lat) || 0, Number(lng) || 0];

export const normalizeRadius = (radius) => Math.max(Number(radius) || 0, 0);

export const computeDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

export const centerMapWithOffset = (map, latlng, offsetY = DEFAULT_FOCUS_OFFSET_PX) => {
  if (!map || !latlng) return;
  const currentZoom = map.getZoom();
  try {
    const point = map.project(L.latLng(latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]), currentZoom);
    const targetPoint = L.point(point.x, point.y - offsetY);
    const targetLatLng = map.unproject(targetPoint, currentZoom);
    map.flyTo(targetLatLng, currentZoom, { animate: true, duration: 0.45 });
  } catch (e) {
    try {
      map.flyTo([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], currentZoom, { animate: true, duration: 0.45 });
    } catch {
      try { map.setView([latlng.lat ?? latlng[0], latlng.lng ?? latlng[1]], currentZoom, { animate: true }); } catch { /* ignore */ }
    }
  }
};

export const loadStoredMapState = () => {
  try {
    const stored = window.localStorage.getItem(MAP_STATE_KEY);
    if (!stored) return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
    const parsed = JSON.parse(stored);
    const center = Array.isArray(parsed?.center) && parsed.center.length === 2
      ? [Number(parsed.center[0]), Number(parsed.center[1])]
      : DEFAULT_MAP_CENTER;
    return { center, zoom: DEFAULT_MAP_ZOOM };
  } catch {
    return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
  }
};

export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const SHARED_CANVAS_RENDERER = L.canvas({ padding: 0.5 });

export const phBounds = [[4.0, 116.0], [21.5, 127.0]];
