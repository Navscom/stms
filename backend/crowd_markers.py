import time
import logging
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime, timedelta, timezone

from helpers import safe_data, parse_timestamp, haversine, now_iso, _pin_inactive

logger = logging.getLogger(__name__)


def _execute_supabase_query_with_retries(query_func: Callable[[], Any], retries: int = 3, initial_delay: float = 1.0) -> Any:
    delay = initial_delay
    for attempt in range(1, retries + 1):
        try:
            return query_func()
        except Exception as exc:
            if attempt == retries:
                logger.exception("[Backend] Supabase query failed after retries")
                raise
            logger.warning(
                "[Backend] Supabase query failed, retrying %s/%s: %s",
                attempt,
                retries,
                str(exc),
            )
            time.sleep(delay)
            delay *= 2


def fetch_recent_crowd_reports(supabase, hours: int = 1) -> List[Dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    response = supabase.table("crowd_reports").select("*").gte("reported_at", cutoff.isoformat()).execute()
    return safe_data(response)


def predict_crowd_patterns(supabase, destination_id: int, hours_ahead: int = 6) -> Dict[str, Any]:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        response = supabase.table("crowd_reports").select("*").eq("destination_id", destination_id).gte("reported_at", cutoff.isoformat()).execute()
        reports: List[Dict[str, Any]] = safe_data(response)
        if not reports:
            return {"prediction": "Insufficient data", "confidence": 0.0}

        hourly_counts: Dict[int, Dict[str, int]] = {}
        for report in reports:
            if not isinstance(report, dict):
                continue
            reported_at = report.get("reported_at")
            if not reported_at:
                continue
            try:
                dt = parse_timestamp(reported_at)
                if dt:
                    hour = dt.hour
                    if hour not in hourly_counts:
                        hourly_counts[hour] = {"Low": 0, "Moderate": 0, "High": 0}
                    level = str(report.get("crowd_level", "Low"))
                    if level in hourly_counts[hour]:
                        hourly_counts[hour][level] += 1
            except Exception:
                continue

        if not hourly_counts:
            return {"prediction": "Insufficient data", "confidence": 0.0}

        now_hour = datetime.now(timezone.utc).hour
        predictions = []
        for i in range(1, min(hours_ahead + 1, 7)):
            pred_hour = (now_hour + i) % 24
            if pred_hour in hourly_counts:
                counts = hourly_counts[pred_hour]
                total = sum(counts.values())
                high_ratio = counts["High"] / total if total > 0 else 0
                moderate_ratio = counts["Moderate"] / total if total > 0 else 0
                if high_ratio > 0.5:
                    pred_level = "High"
                elif moderate_ratio > 0.4:
                    pred_level = "Moderate"
                else:
                    pred_level = "Low"
                predictions.append({"hour": pred_hour, "predicted_level": pred_level, "confidence": min(0.95, 0.5 + (total / 50))})

        if predictions:
            return {
                "destination_id": destination_id,
                "predictions": predictions,
                "confidence": min(0.95, len(reports) / 50),
                "based_on_reports": len(reports),
            }
        return {"prediction": "Insufficient data", "confidence": 0.0}
    except Exception:
        return {"prediction": "Error analyzing patterns", "confidence": 0.0}


def fetch_destinations_map(supabase) -> Dict[int, Dict[str, Any]]:
    try:
        response = _execute_supabase_query_with_retries(
            lambda: supabase.table("destinations").select("*").execute()
        )
    except Exception:
        logger.exception("[Backend] Failed to fetch destinations map from Supabase; skipping crowd marker creation")
        return {}

    destinations: List[Dict[str, Any]] = safe_data(response)
    result: Dict[int, Dict[str, Any]] = {}
    for destination in destinations:
        if not isinstance(destination, dict):
            continue
        dest_id = destination.get("id")
        try:
            if dest_id is not None:
                result[int(dest_id)] = destination
        except Exception:
            continue
    return result


def existing_crowdy_marker_within(supabase, lat: float, lng: float, radius_meters: int = 500) -> bool:
    response = supabase.table("danger_pins").select("*").eq("danger_type", "Crowdy Area").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    for pin in pins:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        distance_km = haversine(lat, lng, pin.get("lat", 0), pin.get("lng", 0))
        if distance_km <= radius_meters / 1000.0:
            return True
    return False


def find_crowdy_marker_within(supabase, lat: float, lng: float, radius_meters: int = 500) -> Optional[Dict[str, Any]]:
    response = supabase.table("danger_pins").select("*").eq("danger_type", "Crowdy Area").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    closest = None
    closest_distance = float("inf")
    for pin in pins:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        distance_km = haversine(lat, lng, pin.get("lat", 0), pin.get("lng", 0))
        if distance_km <= radius_meters / 1000.0 and distance_km < closest_distance:
            closest = pin
            closest_distance = distance_km
    return closest


def extend_crowdy_marker_with_trend(supabase, pin_id: int, destination: Dict[str, Any], report_count: int, unique_user_count: int, crowd_level: str, gemini_client=None) -> bool:
    trend_description = generate_crowdy_marker_trend_description(gemini_client, destination, report_count, unique_user_count, crowd_level)
    try:
        response = supabase.table("danger_pins").update({
            "duration_hours": 168,
            "description": trend_description,
            "updated_at": now_iso(),
        }).eq("id", pin_id).execute()
        return bool(safe_data(response))
    except Exception:
        return False


def generate_crowdy_marker_trend_description(gemini_client, destination: Dict[str, Any], report_count: int, unique_user_count: int, crowd_level: str) -> str:
    name = str(destination.get("name", "This area"))
    city = str(destination.get("city", "nearby"))
    province = str(destination.get("province", ""))
    if gemini_client is not None:
        try:
            prompt = (
                "You are writing an update to a crowded area marker that is showing a strong trend. "
                f"Location: {name}, {city}, {province}. "
                f"Multiple reports (unique {unique_user_count} users, {report_count} total) confirm sustained crowds. "
                f"The crowd level is {crowd_level}. "
                "Write one concise sentence warning that this is an ongoing trend, without mentioning AI or data fields. "
                "Use a human tone."
            )
            ai_raw = gemini_client.generate_text(prompt=prompt, temperature=0.4, max_output_tokens=100)
            description = gemini_client._extract_text(ai_raw)
            if description:
                return description
        except Exception:
            pass

    return (
        f"{name} is showing sustained crowd levels with {unique_user_count} users reporting in the last hour. "
        "This is an ongoing trend. Expect continued congestion for the next few hours."
    )


def generate_crowdy_marker_description(gemini_client, location_name: str, city: str, province: str, report_count: int, unique_user_count: int, crowd_level: str, model: Optional[str] = None) -> str:
    name = str(location_name)
    city = str(city or 'nearby')
    province = str(province or '')
    if gemini_client is not None:
        try:
            return gemini_client.generate_crowdy_marker_description(
                location_name=name,
                city=city,
                province=province,
                report_count=report_count,
                unique_user_count=unique_user_count,
                crowd_level=crowd_level,
            )
        except Exception:
            pass

    return (
        f"{name} is busy right now with {unique_user_count} user reports in the last hour. "
        "Use caution and consider a quieter route if possible."
    )


def create_auto_crowdy_area_markers(supabase, gemini_client, threshold: int = 10, window_hours: int = 1, duplicate_radius_m: int = 500) -> List[Dict[str, Any]]:
    reports = fetch_recent_crowd_reports(supabase, window_hours)
    destinations = fetch_destinations_map(supabase)
    if not reports or not destinations:
        return []

    grouped: Dict[int, Dict[str, Any]] = {}
    for report in reports:
        if not isinstance(report, dict):
            continue
        destination_id = report.get("destination_id")
        if destination_id is None:
            continue
        try:
            destination_id = int(destination_id)
        except Exception:
            continue
        if destination_id not in destinations:
            continue
        bucket = grouped.setdefault(destination_id, {"reports": [], "users": set()})
        bucket["reports"].append(report)
        user_id = report.get("user_id")
        if user_id is not None:
            try:
                bucket["users"].add(int(user_id))
            except Exception:
                pass

    created_markers: List[Dict[str, Any]] = []
    for destination_id, bucket in grouped.items():
        unique_users = bucket["users"]
        report_count = len(bucket["reports"])

        destination = destinations[destination_id]
        crowd_levels = [str(r.get("crowd_level", "Low")) for r in bucket["reports"] if isinstance(r.get("crowd_level", "Low"), str)]

        dest_crowd_level = str(destination.get("crowd_level", "Low"))
        if dest_crowd_level not in {"Low", "Moderate", "High"}:
            high_count = sum(1 for level in crowd_levels if level == "High")
            moderate_count = sum(1 for level in crowd_levels if level == "Moderate")
            if high_count >= moderate_count and high_count > 0:
                dest_crowd_level = "High"
            elif moderate_count > 0:
                dest_crowd_level = "Moderate"
            else:
                dest_crowd_level = "Low"

        level_thresholds = {
            "Low": 4,
            "Moderate": 10,
            "High": 20,
        }
        required_users = level_thresholds.get(dest_crowd_level, 4)
        if len(unique_users) < required_users:
            continue

        destination = destinations[destination_id]
        lat = destination.get("lat")
        lng = destination.get("lng")
        if lat is None or lng is None:
            continue
        try:
            lat = float(lat)
            lng = float(lng)
        except Exception:
            continue

        if existing_crowdy_marker_within(supabase, lat, lng, duplicate_radius_m):
            existing_marker = find_crowdy_marker_within(supabase, lat, lng, duplicate_radius_m)
            if existing_marker:
                marker_id = existing_marker.get("id")
                try:
                    marker_id = int(marker_id) if marker_id is not None else None
                except Exception:
                    marker_id = None
                if marker_id is not None:
                    crowd_level = dest_crowd_level
                    if extend_crowdy_marker_with_trend(supabase, marker_id, destination, report_count, len(unique_users), crowd_level, gemini_client):
                        created_markers.append({
                            "destination_id": destination_id,
                            "title": existing_marker.get("title", "Crowdy Area"),
                            "lat": lat,
                            "lng": lng,
                            "user_count": len(unique_users),
                            "report_count": report_count,
                            "action": "extended_7days_trend",
                        })
            continue

        crowd_level = dest_crowd_level
        description = generate_crowdy_marker_description(gemini_client, destination.get('name', 'This area'), destination.get('city', 'nearby'), destination.get('province', ''), report_count, len(unique_users), crowd_level)
        title = f"Crowdy Area - {destination.get('name', 'Busy spot')}"
        insert_data = {
            "title": title,
            "danger_type": "Crowdy Area",
            "lat": lat,
            "lng": lng,
            "severity": "High",
            "radius_meters": 300,
            "duration_hours": 4,
            "description": description,
            "user_id": None,
            "reported_by": "Crowd AI",
            "removed_at": None,
            "created_at": now_iso(),
        }
        response = supabase.table("danger_pins").insert(insert_data).execute()
        if safe_data(response):
            created_markers.append({
                "destination_id": destination_id,
                "title": title,
                "lat": lat,
                "lng": lng,
                "user_count": len(unique_users),
                "report_count": report_count,
            })

    return created_markers
