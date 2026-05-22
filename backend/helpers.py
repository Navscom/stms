import hashlib
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from supabase import Client


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def haversine(lat1, lon1, lat2, lon2):
    radius = 6371
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


def is_within_pin_warning_zone(distance_km: float, radius_meters: Any, allowance_meters: int = 70) -> bool:
    try:
        radius = float(radius_meters)
    except (TypeError, ValueError):
        radius = 0.0
    return distance_km <= (radius + allowance_meters) / 1000


def safe_data(response: Any) -> List[Dict[str, Any]]:
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
    return datetime.now() > (created + timedelta(hours=duration))


def move_expired_pins(supabase: Client) -> int:
    resp = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(resp)
    expired = [p for p in pins if _is_duration_expired(p)]
    if not expired:
        return 0

    insert_rows = []
    ids_to_delete = []
    for p in expired:
        row = dict(p)
        row["moved_at"] = datetime.now().isoformat()
        insert_rows.append(row)
        if p.get("id") is not None:
            ids_to_delete.append(p.get("id"))

    try:
        supabase.table("expired_pins").upsert(insert_rows).execute()
    except Exception:
        return 0

    try:
        supabase.table("danger_pins").delete().in_("id", ids_to_delete).execute()
    except Exception:
        pass

    return len(ids_to_delete)
