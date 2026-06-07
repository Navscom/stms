import { useEffect, useRef } from 'react';
import { useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_STATE_KEY } from './mapIcons';
import { centerMapWithOffset } from './mapUtils';

export function MapClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      try { window.dispatchEvent(new Event('ai:user-click')); } catch (e) { /* ignore */ }
      // Only pass map background clicks into the map handler. The handler
      // decides when selection should be cleared versus when route placement
      // should proceed.
      if (e.layer) {
        return;
      }
      onLocationClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function MapResetHandler({ defaultCenter, defaultZoom, resetFlag }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    try {
      map.setView(defaultCenter, defaultZoom, { animate: true });
      try { window.localStorage.setItem(MAP_STATE_KEY, JSON.stringify({ center: defaultCenter, zoom: defaultZoom })); } catch {}
    } catch (e) { /* ignore */ }
  }, [map, resetFlag, defaultCenter, defaultZoom]);
  return null;
}

export function MapAutoFocusHandler({ focusLocation, focusBounds, focusZoom = null, loading = false, isPinMode = false, routeStart, routeTarget, routeGeoJson }) {
  const map = useMap();
  const savedMapStateRef = useRef(null);
  const hadRouteRef = useRef(false);

  useEffect(() => {
    if (!map || loading || isPinMode) return;
    try {
      const hasRoute = routeStart && routeTarget;
      const hadRoute = hadRouteRef.current;

      // If routing just became inactive (route was cleared), restore the saved map state
      if (hadRoute && !hasRoute && savedMapStateRef.current) {
        const { center, zoom } = savedMapStateRef.current;
        try {
          map.setView(center, zoom, { animate: false });
        } catch (e) {
          // ignore restore errors
        }
        savedMapStateRef.current = null;
        hadRouteRef.current = false;
        return;
      }

      // If a route is active, save the current map state and then fit the route
      if (hasRoute) {
        // Save current map state for later restoration
        try {
          savedMapStateRef.current = {
            center: map.getCenter(),
            zoom: map.getZoom(),
          };
        } catch (e) {
          // ignore save errors
        }
        hadRouteRef.current = true;

        let coords = null;
        if (routeGeoJson && Array.isArray(routeGeoJson.features) && routeGeoJson.features.length > 0) {
          coords = routeGeoJson.features[0].geometry.coordinates.map((c) => [c[1], c[0]]);
        }
        if (!coords || !coords.length) {
          coords = [[routeStart.lat, routeStart.lng], [routeTarget.lat, routeTarget.lng]];
        }
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.45 });
          return;
        }
      }

      // If the user has placed only the route start (location 1), focus to it
      if (routeStart && !routeTarget) {
        const lat = routeStart.lat ?? routeStart[0];
        const lng = routeStart.lng ?? routeStart[1];
        centerMapWithOffset(map, { lat, lng });
        return;
      }

      if (focusBounds && Array.isArray(focusBounds.coords) && focusBounds.coords.length > 0) {
        const coords = focusBounds.coords.map((c) => [Number(c[0]), Number(c[1])]);
        const bounds = L.latLngBounds(coords);
        if (!bounds.isValid()) return;

        if (coords.length === 1) {
          const [lat, lng] = coords[0];
          if (typeof focusZoom === 'number') {
            map.setView([lat, lng], focusZoom, { animate: true });
          } else {
            centerMapWithOffset(map, { lat, lng });
          }
        } else {
          map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.45 });
        }
        return;
      }

      if (focusLocation) {
        const lat = focusLocation.lat ?? focusLocation[0];
        const lng = focusLocation.lng ?? focusLocation[1];
        if (typeof focusZoom === 'number') {
          map.setView([lat, lng], focusZoom, { animate: true });
        } else {
          centerMapWithOffset(map, { lat, lng });
        }
      }
    } catch (e) {
      // ignore focus errors
    }
  }, [map, loading, isPinMode, routeStart, routeTarget, routeGeoJson, focusBounds ? JSON.stringify(focusBounds.coords) : null, focusLocation && focusLocation.lat, focusLocation && focusLocation.lng, focusZoom]);

  return null;
}

export function PopupClearHandler({ selectedDestinationId, reportHighlight, focusLocation, resetMapFlag }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    try {
      map.closePopup();
    } catch (e) {
      // ignore
    }
  }, [map, selectedDestinationId, reportHighlight, resetMapFlag, focusLocation && focusLocation.lat, focusLocation && focusLocation.lng]);

  return null;
}

export function MapSyncHandler({ theme }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
  }, [map, theme]);

  return null;
}

export function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    const invalidate = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore invalidation errors during unmount
      }
    };

    const resizeObserver = new ResizeObserver(() => invalidate());
    const container = map.getContainer();
    if (container) {
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);

    const timeoutId = window.setTimeout(invalidate, 250);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
}

export function SafeTileLayer({ url, tileLayerRef, options = {}, eventHandlers = {} }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const SafeLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        // Round zoom to nearest integer to avoid requests like z=15.68 which OSM rejects
        const safeCoords = { x: coords.x, y: coords.y, z: Math.round(coords.z) };
        return L.TileLayer.prototype.getTileUrl.call(this, safeCoords);
      }
    });

    const layer = new SafeLayer(url, { ...options });
    layerRef.current = layer;
    if (tileLayerRef) tileLayerRef.current = layer;
    if (eventHandlers && typeof eventHandlers === 'object') layer.on(eventHandlers);
    layer.addTo(map);

    return () => {
      try { layer.off(); layer.remove(); } catch (e) { /* ignore */ }
      if (tileLayerRef) tileLayerRef.current = null;
      layerRef.current = null;
    };
  }, [map, url]);

  return null;
}
