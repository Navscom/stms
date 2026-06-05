import hashlib
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from supabase import Client


def _circle_polygon_coords(lat_deg: float, lon_deg: float, radius_m: float, points: int = 24):
    """Return a list of [lng, lat] pairs approximating a circle around a point.

    Uses haversine-style great-circle offsets to compute points on the circle.
    The returned ring is closed (first point == last point).
    """
    try:
        radius_m = float(radius_m or 0)
    except Exception:
        radius_m = 0.0

    R = 6371000.0
    lat1 = math.radians(float(lat_deg or 0.0))
    lon1 = math.radians(float(lon_deg or 0.0))
    coords = []
    for i in range(points):
        bearing = 2 * math.pi * float(i) / float(points)
        d = radius_m
        lat2 = math.asin(math.sin(lat1) * math.cos(d / R) + math.cos(lat1) * math.sin(d / R) * math.cos(bearing))
        lon2 = lon1 + math.atan2(
            math.sin(bearing) * math.sin(d / R) * math.cos(lat1),
            math.cos(d / R) - math.sin(lat1) * math.sin(lat2)
        )
        coords.append([math.degrees(lon2), math.degrees(lat2)])
    if coords:
        coords.append(coords[0])
    return coords


def build_avoid_multipolygon_from_pins(pins: List[Dict[str, Any]], points_per_circle: int = 24):
    """Build a GeoJSON MultiPolygon suitable for ORS `avoid_polygons` from danger pins.

    Each pin is approximated as a small polygon (circle approximation).
    Returns None if no valid pins are provided.
    """
    polygons = []
    for p in pins or []:
        try:
            if not isinstance(p, dict):
                continue
            if _pin_inactive(p):
                continue
            lat = float(p.get("lat") or 0)
            lng = float(p.get("lng") or 0)
            radius = float(p.get("radius_meters") or 300)
            ring = _circle_polygon_coords(lat, lng, radius, points_per_circle)
            if ring and len(ring) >= 4:
                polygons.append([ring])
        except Exception:
            continue
    if not polygons:
        return None
    return {"type": "MultiPolygon", "coordinates": polygons}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def haversine(lat1, lon1, lat2, lon2):
    try:
        lat1 = float(lat1 or 0)
        lon1 = float(lon1 or 0)
        lat2 = float(lat2 or 0)
        lon2 = float(lon2 or 0)
    except Exception:
        return float("inf")
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def route_intersects_zone(start_lat, start_lng, end_lat, end_lng, zone_lat, zone_lng, radius_km):
    for i in range(21):
        t = i / 20
        lat = start_lat + (end_lat - start_lat) * t
        lng = start_lng + (end_lng - start_lng) * t
        if haversine(lat, lng, zone_lat, zone_lng) <= radius_km:
            return True
    return False


def make_detour(start_lat, start_lng, end_lat, end_lng, danger_lat, danger_lng):
    mid_lat = (start_lat + end_lat) / 2
    mid_lng = (start_lng + end_lng) / 2
    offset_lat = 0.015 if mid_lat <= danger_lat else -0.015
    offset_lng = 0.015 if mid_lng <= danger_lng else -0.015
    return [[start_lat, start_lng], [mid_lat + offset_lat, mid_lng + offset_lng], [end_lat, end_lng]]


def is_within_pin_warning_zone(distance_km: float, radius_meters: Any, allowance_meters: int = 70, min_notify_km: float = 0.3) -> bool:
    """Return True if `distance_km` is within the pin's warning zone.

    The zone is computed from the pin `radius_meters` plus an `allowance_meters`.
    To ensure users are notified earlier, a minimum notification radius
    (`min_notify_km`) is enforced (default 1.0 km).
    """
    try:
        radius = float(radius_meters)
    except (TypeError, ValueError):
        radius = 0.0
    zone_km = max((radius + allowance_meters) / 1000.0, float(min_notify_km))
    return distance_km <= zone_km


def safe_data(response: Any) -> List[Dict[str, Any]]:
    if not response:
        return []
    # If the response is already a list, return it
    if isinstance(response, list):
        return response
    # If the response is a plain dict, try common keys
    if isinstance(response, dict):
        return response.get('data') or response.get('body') or []
    # Fallback to attribute access used by some clients
    return getattr(response, 'data', []) or []


def now_iso() -> str:
    return datetime.now().isoformat()


def filter_active_pins(pins: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [pin for pin in pins if not _pin_inactive(pin)]


def parse_timestamp(value: Any) -> Any:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
    else:
        return None

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_duration_hours(pin: Dict[str, Any]) -> float:
    if not isinstance(pin, dict):
        return 0.0
    try:
        if pin.get("duration_hours") is not None:
            return float(pin.get("duration_hours") or 0)
        if pin.get("minutes") is not None:
            return float(pin.get("minutes") or 0) / 60.0
        if pin.get("duration_minutes") is not None:
            return float(pin.get("duration_minutes") or 0) / 60.0
        if pin.get("duration") is not None:
            return float(pin.get("duration") or 0) / 60.0
    except Exception:
        return 0.0
    return 0.0


def _pin_inactive(pin: Dict[str, Any]) -> bool:
    if not isinstance(pin, dict):
        return True
    if pin.get("removed_at"):
        return True
    duration = _get_duration_hours(pin)
    if duration:
        created = parse_timestamp(pin.get("created_at"))
        now = datetime.now(timezone.utc)
        if created and now > (created + timedelta(hours=duration)):
            return True
    return False


def _is_duration_expired(pin: Dict[str, Any]) -> bool:
    if not isinstance(pin, dict):
        return False
    duration = _get_duration_hours(pin)
    if not duration:
        return False
    created = parse_timestamp(pin.get("created_at"))
    if not created:
        return False
    return datetime.now(timezone.utc) > (created + timedelta(hours=duration))


def move_expired_pins(supabase: Client) -> int:
    resp = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(resp)
    expired = [p for p in pins if _is_duration_expired(p)]
    if not expired:
        return 0

    insert_rows = []
    expired_ids = []
    for p in expired:
        pin_id = p.get("id")
        if pin_id is None:
            continue
        insert_rows.append({
            "pin_id": pin_id,
            "moved_at": now_iso(),
            "status": "expired"
        })
        expired_ids.append(pin_id)

    try:
        supabase.table("pin_history").insert(insert_rows).execute()
    except Exception:
        return 0

    for pin_id in expired_ids:
        try:
            supabase.table("danger_pins").update({"removed_at": now_iso()}).eq("id", pin_id).execute()
        except Exception:
            pass

    return len(expired_ids)
