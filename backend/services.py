import asyncio
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

if __package__ in (None, ''):
    from config import gemini_client, logger, supabase
    from crowd_markers import (
        create_auto_crowdy_area_markers as cm_create_auto_crowdy_area_markers,
        find_crowdy_marker_within as cm_find_crowdy_marker_within,
        extend_crowdy_marker_with_trend as cm_extend_crowdy_marker_with_trend,
        generate_crowdy_marker_description as cm_generate_crowdy_marker_description,
        generate_crowdy_marker_trend_description as cm_generate_crowdy_marker_trend_description,
        fetch_recent_crowd_reports as cm_fetch_recent_crowd_reports,
        predict_crowd_patterns as cm_predict_crowd_patterns,
    )
    from helpers import (
        filter_active_pins,
        haversine,
        now_iso,
        parse_timestamp,
        safe_data,
        _get_duration_hours,
        _pin_inactive,
        build_avoid_multipolygon_from_pins,
        route_intersects_zone,
    )
else:
    from .config import gemini_client, logger, supabase
    from .crowd_markers import (
        create_auto_crowdy_area_markers as cm_create_auto_crowdy_area_markers,
        find_crowdy_marker_within as cm_find_crowdy_marker_within,
        extend_crowdy_marker_with_trend as cm_extend_crowdy_marker_with_trend,
        generate_crowdy_marker_description as cm_generate_crowdy_marker_description,
        generate_crowdy_marker_trend_description as cm_generate_crowdy_marker_trend_description,
        fetch_recent_crowd_reports as cm_fetch_recent_crowd_reports,
        predict_crowd_patterns as cm_predict_crowd_patterns,
    )
    from .helpers import (
        filter_active_pins,
        haversine,
        now_iso,
        parse_timestamp,
        safe_data,
        _get_duration_hours,
        _pin_inactive,
        build_avoid_multipolygon_from_pins,
        route_intersects_zone,
    )

REPORT_SUMMARY_CACHE_KEY = "global_report_summary"
REPORT_SUMMARY_CACHE_TTL_SECONDS = 300


def _is_wildlife_alert(pin: Dict[str, Any]) -> bool:
    if not isinstance(pin, dict):
        return False
    danger_type = str(pin.get("danger_type", "")).lower()
    title = str(pin.get("title", "")).lower()
    description = str(pin.get("description", "")).lower()
    return any(keyword in danger_type for keyword in ["animal", "wildlife"]) or \
        any(keyword in title for keyword in ["animal", "wildlife"]) or \
        any(keyword in description for keyword in ["animal", "wildlife"])


def _fetch_recent_crowd_reports(hours: int = 1) -> List[Dict[str, Any]]:
    return cm_fetch_recent_crowd_reports(supabase, hours)


def _predict_crowd_patterns(destination_id: int, hours_ahead: int = 6) -> Dict[str, Any]:
    return cm_predict_crowd_patterns(supabase, destination_id, hours_ahead)


def _moderate_comment_on_insert(comment_text: str) -> Dict[str, Any]:
    if gemini_client is None:
        return {"flagged": False, "reason": "no_ai_available"}
    try:
        return gemini_client.moderate_comment(comment_text)
    except Exception:
        return {"flagged": False, "reason": "moderation_error"}


async def _moderate_comment_after_delay(comment_id: int, comment_text: str, delay_seconds: int = 300):
    await asyncio.sleep(delay_seconds)
    moderation_result = _moderate_comment_on_insert(comment_text)
    is_spam = moderation_result.get("is_spam", False)
    reason = moderation_result.get("reason", "approved")

    if is_spam:
        try:
            await asyncio.to_thread(lambda: supabase.table("marker_comments").update({
                "moderation_flagged": True,
                "moderation_reason": "deleted_by_moderation",
            }).eq("id", comment_id).execute())
            logger.info(f"[Backend] Marked spam comment id={comment_id} as deleted_by_moderation")
        except Exception:
            logger.exception(f"[Backend] Failed to mark spam comment id={comment_id}")
        return

    try:
        await asyncio.to_thread(lambda: supabase.table("marker_comments").update({
            "moderation_flagged": False,
            "moderation_reason": reason,
        }).eq("id", comment_id).execute())
    except Exception:
        logger.exception(f"[Backend] Failed to update moderated comment id={comment_id}")


def _translate_alert(text: str, language: str = "en") -> str:
    if gemini_client is None or not text:
        return text
    try:
        return gemini_client.translate_to_language(text, language)
    except Exception:
        return text


def _send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    logger.info(f"[Backend] Email disabled; skipping send to {to_email}")


def _fetch_destinations_map() -> Dict[int, Dict[str, Any]]:
    response = supabase.table("destinations").select("*").execute()
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
            pass
    return result


def _fetch_active_danger_pins() -> List[Dict[str, Any]]:
    try:
        response = supabase.table("danger_pins").select("*").is_("removed_at", None).execute()
        pins = safe_data(response)
    except Exception:
        response = supabase.table("danger_pins").select("*").execute()
        pins = safe_data(response)
    return filter_active_pins(pins)


def _fetch_active_danger_pin_metadata() -> List[Dict[str, Any]]:
    try:
        response = supabase.table("danger_pins").select(
            "id,title,danger_type,lat,lng,severity,radius_meters,duration_hours,description,user_id,created_at"
        ).is_("removed_at", None).execute()
        pins = safe_data(response) or []
    except Exception:
        response = supabase.table("danger_pins").select(
            "id,title,danger_type,lat,lng,severity,radius_meters,duration_hours,description,user_id,created_at"
        ).execute()
        pins = safe_data(response) or []

    pins = [pin for pin in pins if isinstance(pin, dict) and not _pin_inactive(pin)]
    referenced_user_ids = set()
    for pin in pins:
        user_id = pin.get("user_id")
        if user_id is not None:
            try:
                referenced_user_ids.add(int(user_id))
            except Exception:
                pass

    users_map: Dict[int, Dict[str, Any]] = {}
    if referenced_user_ids:
        try:
            users_resp = supabase.table("users").select("id,name,display_name").in_("id", list(referenced_user_ids)).execute()
            users_list = safe_data(users_resp) or []
            for u in users_list:
                if isinstance(u, dict) and u.get("id") is not None:
                    try:
                        users_map[int(u["id"])] = u
                    except Exception:
                        pass
        except Exception:
            users_map = {}

    for pin in pins:
        uid = pin.get("user_id")
        reporter = None
        if uid is not None:
            try:
                uid_key = int(uid)
            except Exception:
                uid_key = None
            else:
                if uid_key is not None and uid_key in users_map:
                    reporter = users_map[uid_key].get("display_name") or users_map[uid_key].get("displayName") or users_map[uid_key].get("name")
        pin["reported_by"] = reporter or pin.get("reported_by") or "Unknown"

    return pins


def _fetch_cached_report_summary() -> Optional[Dict[str, Any]]:
    try:
        response = supabase.table("report_summary_cache").select("*").eq("summary_key", "global_report_summary").limit(1).execute()
        cached = safe_data(response)
        if isinstance(cached, list) and cached:
            first = cached[0]
            if isinstance(first, dict):
                return first
    except Exception:
        return None
    return None


def _upsert_report_summary_cache(summary: Dict[str, Any]) -> bool:
    record = {
        "summary_key": "global_report_summary",
        "total_destinations": summary.get("total_destinations", 0),
        "total_users": summary.get("total_users", 0),
        "crowd_summary": summary.get("crowd_summary", {}),
        "danger_summary": summary.get("danger_summary", {}),
        "removed_comments": summary.get("removed_comments", 0),
        "ai_report": summary.get("ai_report", ""),
        "cached_at": now_iso(),
    }
    try:
        existing = supabase.table("report_summary_cache").select("id").eq("summary_key", "global_report_summary").limit(1).execute()
        if safe_data(existing):
            supabase.table("report_summary_cache").update(record).eq("summary_key", "global_report_summary").execute()
        else:
            supabase.table("report_summary_cache").insert(record).execute()
        return True
    except Exception:
        return False


def _build_report_summary() -> Dict[str, Any]:
    dest_response = supabase.table("destinations").select("crowd_level").execute()
    destinations: List[Dict[str, Any]] = safe_data(dest_response)
    total_destinations = len(destinations)

    user_response = supabase.table("users").select("id").execute()
    users: List[Dict[str, Any]] = safe_data(user_response)
    total_users = len(users)

    crowd_summary: Dict[str, int] = {}
    for d in destinations:
        if isinstance(d, dict):
            level = d.get("crowd_level", "Unknown")
            if isinstance(level, str):
                crowd_summary[level] = crowd_summary.get(level, 0) + 1

    danger_pins: List[Dict[str, Any]] = _fetch_active_danger_pins()
    danger_summary: Dict[str, int] = {}
    for p in danger_pins:
        if not isinstance(p, dict):
            continue
        severity = p.get("severity", "Unknown")
        if isinstance(severity, str):
            danger_summary[severity] = danger_summary.get(severity, 0) + 1

    removed_comments = 0
    try:
        removed_response = supabase.table("marker_comments").select("id").eq("moderation_reason", "deleted_by_moderation").execute()
        removed_comments = len(safe_data(removed_response))
    except Exception:
        removed_comments = 0

    return {
        "total_destinations": total_destinations,
        "total_users": total_users,
        "crowd_summary": crowd_summary,
        "danger_summary": danger_summary,
        "removed_comments": removed_comments,
        "ai_report": "System recommends less crowded destinations, warns users near danger, and suggests safer routes.",
    }


def _fetch_marker_comments(pin_id: int) -> List[Dict[str, Any]]:
    comments: List[Dict[str, Any]] = []
    try:
        response = supabase.table("marker_comments").select("*").eq("pin_id", pin_id).order("created_at", desc=True).execute()
        comments = safe_data(response) or []
    except Exception:
        return []

    filtered_comments: List[Dict[str, Any]] = []
    referenced_user_ids = set()
    for c in comments:
        if not isinstance(c, dict):
            continue
        if c.get("moderation_reason") == "deleted_by_moderation":
            continue
        user_id = c.get("user_id")
        if user_id is not None:
            try:
                referenced_user_ids.add(int(user_id))
            except Exception:
                pass
        filtered_comments.append(c)

    users_map: Dict[int, Dict[str, Any]] = {}
    if referenced_user_ids:
        try:
            users_resp = supabase.table("users").select("id,name,display_name").in_("id", list(referenced_user_ids)).execute()
            users_list = safe_data(users_resp) or []
            for u in users_list:
                if isinstance(u, dict) and u.get("id") is not None:
                    try:
                        users_map[int(u["id"])] = u
                    except Exception:
                        pass
        except Exception:
            users_map = {}

    for c in filtered_comments:
        commenter = None
        user_id = c.get("user_id")
        if user_id is not None:
            try:
                user_key = int(user_id)
            except Exception:
                user_key = None
            else:
                if user_key in users_map:
                    commenter = users_map[user_key].get("display_name") or users_map[user_key].get("displayName") or users_map[user_key].get("name")
        c["commented_by"] = commenter or c.get("commented_by") or "Unknown"

    return filtered_comments


def _existing_crowdy_marker_within(lat: float, lng: float, radius_meters: int = 500) -> bool:
    response = supabase.table("danger_pins").select("*").eq("danger_type", "Crowdy Area").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    closest_distance = float("inf")
    for pin in pins:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        distance_km = haversine(lat, lng, pin.get("lat", 0), pin.get("lng", 0))
        if distance_km <= radius_meters / 1000.0 and distance_km < closest_distance:
            return True
    return False


def _filter_relevant_route_pins(start_lat: float, start_lng: float, end_lat: float, end_lng: float, pins: List[Dict[str, Any]], route_buffer_km: float = 0.35) -> List[Dict[str, Any]]:
    relevant = []
    endpoint_fraction_tol = 0.05
    endpoint_buffer_km = 0.05

    def _proj_fraction_and_perp_dist_km(ax, ay, bx, by, px, py):
        R = 6371000.0
        ref_lat = (ax + bx) / 2.0
        def to_xy(lat, lng):
            x = math.radians(lng - ay) * math.cos(math.radians(ref_lat)) * R
            y = math.radians(lat - ref_lat) * R
            return x, y

        Ax, Ay = to_xy(ax, ay)
        Bx, By = to_xy(bx, by)
        Px, Py = to_xy(px, py)

        ABx = Bx - Ax
        ABy = By - Ay
        APx = Px - Ax
        APy = Py - Ay
        ab_len2 = ABx * ABx + ABy * ABy
        t = 0.0 if ab_len2 <= 0 else (APx * ABx + APy * ABy) / ab_len2
        t_clamped = max(0.0, min(1.0, t))
        closest_x = Ax + t_clamped * ABx
        closest_y = Ay + t_clamped * ABy
        dx = Px - closest_x
        dy = Py - closest_y
        perp_dist_m = math.hypot(dx, dy)
        return t, perp_dist_m / 1000.0

    for pin in pins or []:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        try:
            pin_lat = float(pin.get("lat", 0))
            pin_lng = float(pin.get("lng", 0))
            pin_radius_km = float(pin.get("radius_meters", 300)) / 1000.0
        except (TypeError, ValueError):
            continue

        start_dist = haversine(start_lat, start_lng, pin_lat, pin_lng)
        end_dist = haversine(end_lat, end_lng, pin_lat, pin_lng)
        min_dist = min(start_dist, end_dist)
        effective_radius = pin_radius_km if start_dist <= pin_radius_km or end_dist <= pin_radius_km else max(pin_radius_km, route_buffer_km)

        if not route_intersects_zone(start_lat, start_lng, end_lat, end_lng, pin_lat, pin_lng, effective_radius):
            continue

        if start_dist <= pin_radius_km or end_dist <= pin_radius_km:
            relevant.append((min_dist, pin))
            continue

        frac, perp_dist_km = _proj_fraction_and_perp_dist_km(start_lat, start_lng, end_lat, end_lng, pin_lat, pin_lng)
        if (frac < endpoint_fraction_tol or frac > (1.0 - endpoint_fraction_tol)) and perp_dist_km > effective_radius and min_dist > endpoint_buffer_km:
            continue

        relevant.append((min_dist, pin))

    relevant.sort(key=lambda item: item[0])
    return [pin for _, pin in relevant]


def _check_route_through_danger(route_geojson: Dict[str, Any], danger_pins: List[Dict[str, Any]], check_radius_m: int = 200) -> bool:
    if not route_geojson or not isinstance(route_geojson, dict):
        logger.info("[DANGER CHECK] No route geojson")
        return False

    features = route_geojson.get("features", [])
    if not features or not isinstance(features, list):
        logger.info("[DANGER CHECK] No features in route")
        return False

    route_coords = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        if not geometry or not isinstance(geometry, dict):
            continue
        geom_type = geometry.get("type", "")
        coords = geometry.get("coordinates", [])
        if geom_type == "LineString" and isinstance(coords, list):
            route_coords.extend(coords)
        elif geom_type == "MultiLineString" and isinstance(coords, list):
            for line in coords:
                if isinstance(line, list):
                    route_coords.extend(line)

    logger.info(f"[DANGER CHECK] Extracted {len(route_coords)} route coordinates from {len(features)} features, checking against {len(danger_pins)} danger pins")
    if not route_coords:
        logger.info("[DANGER CHECK] No coordinates in route")
        return False

    check_radius_km = check_radius_m / 1000.0
    found_danger = False
    for pin in danger_pins:
        if not isinstance(pin, dict):
            continue
        try:
            pin_lat = float(pin.get("lat", 0))
            pin_lng = float(pin.get("lng", 0))
            pin_title = pin.get("title", "Unknown")
            pin_id = pin.get("id", "?")
        except (TypeError, ValueError):
            continue

        min_dist_km = float("inf")
        for coord in route_coords:
            if isinstance(coord, (list, tuple)) and len(coord) >= 2:
                try:
                    coord_lng = float(coord[0])
                    coord_lat = float(coord[1])
                    dist_km = haversine(coord_lat, coord_lng, pin_lat, pin_lng)
                    if dist_km < min_dist_km:
                        min_dist_km = dist_km
                except (TypeError, ValueError):
                    continue

        logger.info(f"[DANGER CHECK] Pin #{pin_id} '{pin_title}' (lat={pin_lat}, lng={pin_lng}): min distance = {min_dist_km:.4f}km ({min_dist_km*1000:.1f}m)")
        if min_dist_km <= check_radius_km:
            logger.warning(f"[DANGER CHECK] ⚠️  Route passes within {min_dist_km*1000:.1f}m of '{pin_title}' (ID: {pin_id})")
            found_danger = True

    if not found_danger:
        logger.info("[DANGER CHECK] ✓ Route does not pass through danger zones")
    return found_danger


def _extract_route_summary(route_geojson: Dict[str, Any]) -> Dict[str, Any]:
    summary = ""
    distance_km = None
    duration_min = None
    if isinstance(route_geojson, dict):
        features = route_geojson.get("features")
        if isinstance(features, list) and features:
            first = features[0]
            if isinstance(first, dict):
                props = first.get("properties") or {}
                if isinstance(props, dict):
                    summary_obj = props.get("summary")
                    if isinstance(summary_obj, dict):
                        distance_m = summary_obj.get("distance")
                        duration_s = summary_obj.get("duration")
                        try:
                            distance_km = float(distance_m) / 1000.0 if distance_m is not None else None
                        except (TypeError, ValueError):
                            distance_km = None
                        try:
                            duration_min = float(duration_s) / 60.0 if duration_s is not None else None
                        except (TypeError, ValueError):
                            duration_min = None
                        if distance_km is not None and duration_min is not None:
                            summary = f"Approximately {distance_km:.2f} km and {duration_min:.0f} minutes."
                    elif isinstance(summary_obj, str):
                        summary = summary_obj
                if not summary:
                    distance_m = props.get("distance")
                    duration_s = props.get("duration")
                    try:
                        distance_km = float(distance_m) / 1000.0 if distance_m is not None else None
                    except (TypeError, ValueError):
                        distance_km = None
                    try:
                        duration_min = float(duration_s) / 60.0 if duration_s is not None else None
                    except (TypeError, ValueError):
                        duration_min = None
                    if distance_km is not None and duration_min is not None:
                        summary = f"Approximately {distance_km:.2f} km and {duration_min:.0f} minutes."
    return {
        "summary": summary,
        "distance_km": distance_km,
        "duration_min": duration_min,
    }


def _ors_routable_point_error(response_body: Any, short_body: str) -> Optional[str]:
    if isinstance(response_body, dict):
        error_info = response_body.get('error') or {}
        if isinstance(error_info, dict):
            message = str(error_info.get('message') or error_info.get('description') or '')
        else:
            message = str(error_info or '')
    else:
        message = ''

    if not message and isinstance(response_body, str):
        message = response_body
    if not message and 'Could not find routable point' in short_body:
        message = short_body
    if 'Could not find routable point' in message:
        return "The selected location is too far from any accessible roads or walking paths. Please choose a location on or near a road, street, or path to calculate a route."
    return None


def _generate_route_advice(
    route_geojson: Dict[str, Any],
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    danger_pins: List[Dict[str, Any]],
    avoid_danger: bool = False,
    endpoint_inside_danger: Union[bool, str] = False,
) -> str:
    if gemini_client is not None:
        try:
            route_info = _extract_route_summary(route_geojson)
            advice_result = gemini_client.generate_route_advice(
                route_summary=route_info.get("summary", ""),
                distance_km=route_info.get("distance_km") or 0.0,
                duration_min=route_info.get("duration_min") or 0.0,
                danger_nearby=danger_pins or [],
                avoid_danger=avoid_danger,
                endpoint_inside_danger=bool(endpoint_inside_danger),
            )
            if advice_result and isinstance(advice_result, dict):
                advice_text = advice_result.get("advice")
                if isinstance(advice_text, str) and advice_text.strip():
                    return advice_text.strip()
        except Exception:
            pass

    route_info = _extract_route_summary(route_geojson)
    summary = route_info.get("summary")
    if summary:
        advice = f"Route calculated. {summary}"
    else:
        advice = "Route calculated successfully."
    if avoid_danger:
        advice += " This route was calculated to avoid known danger areas."
    elif endpoint_inside_danger:
        if endpoint_inside_danger == 'both':
            advice += " The route endpoints are inside reported danger areas; the route is provided for reference — follow safety guidance for both nearby hazards."
        else:
            advice += " The route is being calculated while one of your endpoints is inside a reported danger area; stay alert and follow safety guidance for nearby hazards."
    if danger_pins:
        top = danger_pins[0]
        title = str(top.get("title", "a nearby hazard")).strip()
        if title:
            advice += f" Be aware of {title} near the path and use caution."
    else:
        advice += " No active danger pins are close to this route."
    return advice


def _find_crowdy_marker_within(lat: float, lng: float, radius_meters: int = 500) -> Optional[Dict[str, Any]]:
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


def _extend_crowdy_marker_with_trend(
    pin_id: int,
    destination: Dict[str, Any],
    report_count: int,
    unique_user_count: int,
    crowd_level: str,
) -> bool:
    trend_description = _generate_crowdy_marker_trend_description(destination, report_count, unique_user_count, crowd_level)
    try:
        response = supabase.table("danger_pins").update({
            "duration_hours": 168,
            "description": trend_description,
            "updated_at": now_iso(),
        }).eq("id", pin_id).execute()
        return bool(safe_data(response))
    except Exception:
        return False


def _generate_crowdy_marker_trend_description(
    destination: Dict[str, Any],
    report_count: int,
    unique_user_count: int,
    crowd_level: str,
) -> str:
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


def _generate_crowdy_marker_description(
    destination: Dict[str, Any],
    report_count: int,
    unique_user_count: int,
    crowd_level: str,
) -> str:
    name = str(destination.get("name", "This area"))
    city = str(destination.get("city", "nearby"))
    province = str(destination.get("province", ""))
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


def _create_auto_crowdy_area_markers(
    threshold: int = 10,
    window_hours: int = 1,
    duplicate_radius_m: int = 500,
) -> List[Dict[str, Any]]:
    return cm_create_auto_crowdy_area_markers(supabase, gemini_client, threshold, window_hours, duplicate_radius_m)
