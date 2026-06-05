import os
import sys
from dotenv import load_dotenv
import logging
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client
from datetime import datetime, timedelta, timezone
import asyncio
from typing import Any, Dict, List, Optional
import requests
import secrets
 

# Allow running as a top-level script from the backend directory.
if __package__ is None:
    sys.path.append(os.path.dirname(__file__))

from db_validation import (
    RegisterRequest,
    LoginRequest,
    DeleteAccountRequest,
    DestinationRequest,
    CrowdUpdateRequest,
    DangerPinRequest,
    MarkerCommentRequest,
    RouteRequest,
    validate_register,
    validate_crowd_level,
)
from helpers import (
    hash_password,
    haversine,
    route_intersects_zone,
    make_detour,
    is_within_pin_warning_zone,
    safe_data,
    parse_timestamp,
    _get_duration_hours,
    _pin_inactive,
    filter_active_pins,
    now_iso,
    move_expired_pins,
    build_avoid_multipolygon_from_pins,
)
# Email utilities removed (email functionality disabled in this deployment)
from crowd_markers import (
    create_auto_crowdy_area_markers as cm_create_auto_crowdy_area_markers,
    fetch_destinations_map as cm_fetch_destinations_map,
    existing_crowdy_marker_within as cm_existing_crowdy_marker_within,
    find_crowdy_marker_within as cm_find_crowdy_marker_within,
    extend_crowdy_marker_with_trend as cm_extend_crowdy_marker_with_trend,
    generate_crowdy_marker_description as cm_generate_crowdy_marker_description,
    generate_crowdy_marker_trend_description as cm_generate_crowdy_marker_trend_description,
    fetch_recent_crowd_reports as cm_fetch_recent_crowd_reports,
    predict_crowd_patterns as cm_predict_crowd_patterns,
)
#Load .env from the backend folder so keys in backend/.env are loaded when running from project root
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Configure basic logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)
MAX_ROUTE_AVOID_PINS = 10
MAX_ROUTE_AVOID_DISTANCE_KM = 5.0
MAX_ROUTE_AVOID_POLYGON_POINTS = 16
MAX_ROUTE_REQUEST_TIMEOUT_SECONDS = 60
MAX_ROUTE_SNAP_RADIUS_METERS = 2000


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required for backend startup.")
    return value

#Supabase connection
SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_KEY = _require_env("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Smart Tourism Management System API")


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
    """Check if a comment should be flagged before insertion."""
    if gemini_client is None:
        return {"flagged": False, "reason": "no_ai_available"}
    try:
        result = gemini_client.moderate_comment(comment_text)
        return result
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
    """Translate a safety alert to the user's preferred language."""
    if gemini_client is None or not text:
        return text

    try:
        return gemini_client.translate_to_language(text, language)
    except Exception:
        return text


def _send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    # Emailing is disabled. Keep function as a safe no-op to avoid breaking callers.
    logger.info(f"[Backend] Email disabled; skipping send to {to_email}")
    return


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
            continue
    return result


def _existing_crowdy_marker_within(lat: float, lng: float, radius_meters: int = 500) -> bool:
    response = supabase.table("danger_pins").select("*").eq("danger_type", "Crowdy Area").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    for pin in pins:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        distance_km = haversine(lat, lng, pin.get("lat", 0), pin.get("lng", 0))
        if distance_km <= radius_meters / 1000.0:
            return True
    return False


def _filter_relevant_route_pins(start_lat: float, start_lng: float, end_lat: float, end_lng: float, pins: List[Dict[str, Any]], route_buffer_km: float = 0.35) -> List[Dict[str, Any]]:
    """Return only danger pins that are actually along or very near the planned route.

    Avoid sending all pins to OpenRouteService, which can cause avoid_polygons to
    over-constrain or break nearby routes. Keep only pins that are likely to be on
    the user's path instead of those only near the start or finish point.
    """
    relevant = []
    for pin in pins or []:
        if not isinstance(pin, dict) or _pin_inactive(pin):
            continue
        try:
            pin_lat = float(pin.get("lat", 0))
            pin_lng = float(pin.get("lng", 0))
            pin_radius_km = float(pin.get("radius_meters", 300)) / 1000.0
        except (TypeError, ValueError):
            continue

        # Exclude pins that are essentially at the destination itself.
        # The destination may have a crowdy area marker but it should not be
        # treated as a route hazard for avoidance or route advice generation.
        if haversine(end_lat, end_lng, pin_lat, pin_lng) <= max(pin_radius_km, 0.35):
            continue

        # Use the pin radius plus a small buffer to decide whether the pin is on/near the route.
        effective_radius = max(pin_radius_km, route_buffer_km)
        if not route_intersects_zone(start_lat, start_lng, end_lat, end_lng, pin_lat, pin_lng, effective_radius):
            continue

        start_dist = haversine(start_lat, start_lng, pin_lat, pin_lng)
        end_dist = haversine(end_lat, end_lng, pin_lat, pin_lng)
        min_dist = min(start_dist, end_dist)
        relevant.append((min_dist, pin))

    relevant.sort(key=lambda item: item[0])
    return [pin for _, pin in relevant]


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
    if danger_pins:
        top = danger_pins[0]
        title = str(top.get("title", "a nearby hazard")).strip()
        if title:
            advice += f" Be aware of {title} near the path and use caution."
    else:
        advice += " No active danger pins are close to this route."
    return advice


def _find_crowdy_marker_within(lat: float, lng: float, radius_meters: int = 500) -> Optional[Dict[str, Any]]:
    """Find the closest active Crowdy Area marker within radius. Returns the marker or None."""
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
    """Extend an existing Crowdy Area marker duration to 7 days and update description with trend."""
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
    """Generate a description for a trending crowdy area (existing marker being extended)."""
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

# Optional Gemini client (uses GEMINI_API_KEY or GOOGLE_API_KEY env var)
try:
    from gemini_client import GeminiClient
    try:
        gemini_client = GeminiClient()
        logger.info("[Backend] GeminiClient initialized successfully")
    except Exception as e:
        logger.exception("[Backend] Failed to init GeminiClient")
        gemini_client = None
except Exception as e:
    logger.exception("[Backend] Failed to import GeminiClient")
    gemini_client = None


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ENDPOINTS
#handler for rechecking expired pins every minute
@app.on_event("startup")
async def start_periodic_expiry_move():
    async def _periodic():
        while True:
            try:
                # run blocking move in threadpool
                await asyncio.to_thread(move_expired_pins, supabase)
            except Exception:
                pass
            await asyncio.sleep(60)
    asyncio.create_task(_periodic())


@app.on_event("startup")
async def start_periodic_crowd_marker_scan():
    async def _crowd_scan():
        while True:
            try:
                created = await asyncio.to_thread(_create_auto_crowdy_area_markers, 10, 1, 500)
                if created:
                    logger.info(f"[Backend] Created {len(created)} auto crowdy area marker(s)")
            except Exception:
                logger.exception("[Backend] Crowd scan failed")
            await asyncio.sleep(300)
    asyncio.create_task(_crowd_scan())


@app.get("/")
def home():
    return {"status": "Smart Tourism Management System backend is running"}

@app.post("/register")
def register(data: RegisterRequest):
    validate_register(data)

    hashed_pw = hash_password(data.password)
    response = supabase.table("users").insert({
        "name": data.name,
        "display_name": getattr(data, 'displayName', None),
        "email": data.email,
        "password": hashed_pw,
        "role": data.role,
        "created_at": now_iso()
    }).execute()

    if getattr(response, 'error', None):  # type: ignore
        raise HTTPException(status_code=400, detail="Email already exists.")
    return {"message": "Registration successful", "user": {"name": data.name, "display_name": getattr(data, 'displayName', None), "email": data.email, "role": data.role}}

@app.post("/login")
def login(data: LoginRequest):
    hashed_pw = hash_password(data.password)
    response = supabase.table("users").select("*").eq("email", data.email).eq("password", hashed_pw).execute()
    users = safe_data(response)
    if not users:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"message": "Login successful", "user": users[0]}

@app.post("/delete-account")
def delete_account(data: DeleteAccountRequest):
    response = supabase.table("users").delete().eq("email", data.email).execute()
    if getattr(response, 'error', None):
        raise HTTPException(status_code=500, detail="Failed to delete account.")
    deleted_rows = safe_data(response)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "Account deleted successfully."}

@app.post("/destinations")
def add_destination(data: DestinationRequest):
    # ensure crowd_level is valid
    try:
        validate_crowd_level(CrowdUpdateRequest(crowd_level=data.crowd_level))
    except Exception:
        raise
    response = supabase.table("destinations").insert({
        "name": data.name,
        "category": data.category,
        "city": data.city,
        "province": data.province,
        "lat": data.lat,
        "lng": data.lng,
        "description": data.description,
        "opening_hours": data.opening_hours,
        "crowd_level": data.crowd_level,
        "updated_at": now_iso()
    }).execute()
    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add destination")
    return {"message": "Destination added", "id": data_list[0]["id"]}

@app.get("/destinations")
def get_destinations():
    response = supabase.table("destinations").select("*").execute()
    destinations: List[Dict[str, Any]] = safe_data(response)
    return destinations

@app.put("/destinations/{destination_id}/crowd")
def update_crowd(destination_id: int, data: CrowdUpdateRequest):
    validate_crowd_level(data)
    if data.user_id is None:
        raise HTTPException(status_code=400, detail="user_id is required for crowd reports.")

    response = supabase.table("destinations").update({
        "crowd_level": data.crowd_level,
        "updated_at": now_iso()
    }).eq("id", destination_id).execute()

    if not safe_data(response):
        raise HTTPException(status_code=404, detail="Destination not found.")

    supabase.table("crowd_reports").insert({
        "destination_id": destination_id,
        "crowd_level": data.crowd_level,
        "user_id": data.user_id,
        "reported_at": now_iso()
    }).execute()

    return {"message": "Crowd level updated", "destination_id": destination_id, "crowd_level": data.crowd_level}

@app.get("/safety-check")
def safety_check(lat: float, lng: float, language: str = "en"):
    response = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    # filter out expired or removed pins
    pins = filter_active_pins(pins)
    nearby = []
    for pin in pins:
        if not isinstance(pin, dict):
            continue
        distance_km = haversine(lat, lng, pin.get("lat", 0), pin.get("lng", 0))
        pin["distance_km"] = round(distance_km, 2)
        radius = pin.get("radius_meters", 300)
        pin["inside_zone"] = is_within_pin_warning_zone(distance_km, radius)
        if pin["inside_zone"]:
            nearby.append(pin)
    nearby.sort(key=lambda p: p.get("distance_km", 0))
    risk_level = "Low"
    if any(p.get("severity") == "High" and p.get("distance_km", 0) <= 1.0 for p in nearby if isinstance(p, dict)):
        risk_level = "High"
    elif nearby:
        risk_level = "Moderate"

    alerts = [
        f"Safety alert: {pin.get('title', 'Danger area')} ({pin.get('danger_type', 'danger')}) is {pin.get('distance_km', 0)} km away."
        for pin in nearby if isinstance(pin, dict)
    ]
    
    if language.lower() not in ["en", "english"]:
        alerts = [_translate_alert(alert, language) for alert in alerts]
    
    wildlife_alerts = [pin for pin in nearby if _is_wildlife_alert(pin)]
    return {
        "risk_level": risk_level,
        "nearby_dangers": nearby[:8],
        "alerts": alerts,
        "wildlife_alerts": wildlife_alerts[:8],
        "language": language
    }


@app.get("/route")
def get_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, profile: str = "foot-walking", avoid_danger: bool = False):
    """Proxy endpoint to OpenRouteService directions API.

    Returns the ORS geojson directions response so the frontend can render the route.
    Requires `ORS_API_KEY` environment variable to be set.
    """
    ors_key = os.getenv("ORS_API_KEY")
    if not ors_key:
        logger.error("ORS_API_KEY not found in environment")
        raise HTTPException(status_code=500, detail="ORS_API_KEY environment variable is not configured on the server. Ensure backend/.env contains ORS_API_KEY and restart the server.")

    try:
        url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
        payload: Dict[str, Any] = {
            "coordinates": [[float(start_lng), float(start_lat)], [float(end_lng), float(end_lat)]],
            "radiuses": [MAX_ROUTE_SNAP_RADIUS_METERS, MAX_ROUTE_SNAP_RADIUS_METERS]
        }
        relevant_pins: List[Dict[str, Any]] = []
        try:
            pins_resp = supabase.table("danger_pins").select("*").execute()
            pins = safe_data(pins_resp) or []
            pins = filter_active_pins(pins)
            relevant_pins = _filter_relevant_route_pins(start_lat, start_lng, end_lat, end_lng, pins)
            if avoid_danger:
                logger.info(f"Route avoidance: {len(relevant_pins)} relevant danger pin(s) out of {len(pins)} active pin(s)")
                if len(relevant_pins) > MAX_ROUTE_AVOID_PINS:
                    logger.warning(
                        f"Too many route-relevant danger pins ({len(relevant_pins)}) for avoidance; limiting to {MAX_ROUTE_AVOID_PINS}"
                    )
                    relevant_pins = relevant_pins[:MAX_ROUTE_AVOID_PINS]
                # build multipolygon (returns None if no valid pins)
                avoid_geo = build_avoid_multipolygon_from_pins(relevant_pins, points_per_circle=MAX_ROUTE_AVOID_POLYGON_POINTS)
                if avoid_geo:
                    # Wrap the geometry in a GeoJSON FeatureCollection. OpenRouteService
                    # accepts GeoJSON geometries but wrapping as a FeatureCollection
                    # improves compatibility across API versions.
                    payload["options"] = {
                        "avoid_polygons": {
                            "type": "FeatureCollection",
                            "features": [
                                {"type": "Feature", "properties": {}, "geometry": avoid_geo}
                            ]
                        }
                    }
        except Exception:
            logger.exception("Failed to fetch or filter danger pins for route advice")
        headers = {
            "Authorization": ors_key,
            "Content-Type": "application/json",
        }
        route_error_message = "Route unavailable: the requested route could not be calculated. Please try a different location or try again later."
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=MAX_ROUTE_REQUEST_TIMEOUT_SECONDS)
        except Exception as re:
            logger.exception("HTTP request to OpenRouteService failed")
            raise HTTPException(status_code=400, detail=route_error_message)

        if resp.status_code != 200:
            try:
                response_body = resp.json()
            except Exception:
                response_body = resp.text or ""
            short_body = str(response_body)[:400]
            logger.error("OpenRouteService returned non-200", extra={"status": resp.status_code, "text": short_body})
            routable_error_message = _ors_routable_point_error(response_body, short_body)
            if routable_error_message:
                raise HTTPException(status_code=400, detail=routable_error_message)

            if resp.status_code == 404:
                error_message = None
                if isinstance(response_body, dict):
                    error_info = response_body.get('error') or {}
                    if isinstance(error_info, dict) and 'message' in error_info:
                        error_message = str(error_info.get('message'))
                if not error_message and 'Could not find routable point' in short_body:
                    error_message = short_body
                if error_message:
                    logger.warning("ORS route failed due to unreachable start/end point; retrying with unlimited snap radius")
                    payload["radiuses"] = [-1, -1]
                    try:
                        resp = requests.post(url, json=payload, headers=headers, timeout=MAX_ROUTE_REQUEST_TIMEOUT_SECONDS)
                    except Exception:
                        logger.exception("HTTP retry request to OpenRouteService with unlimited snap radius failed")
                        raise HTTPException(status_code=400, detail=route_error_message)

                    if resp.status_code == 200:
                        try:
                            data = resp.json()
                            data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger)
                            return data
                        except Exception:
                            logger.exception("Failed to decode OpenRouteService JSON response on unlimited snap radius retry")
                            raise HTTPException(status_code=400, detail=route_error_message)

                    try:
                        response_body = resp.json()
                    except Exception:
                        response_body = resp.text or ""
                    short_body = str(response_body)[:400]
                    logger.error("OpenRouteService unlimited snap radius retry returned non-200", extra={"status": resp.status_code, "text": short_body})
                    routable_error_message = _ors_routable_point_error(response_body, short_body)
                    if routable_error_message:
                        raise HTTPException(status_code=400, detail=routable_error_message)
                    if avoid_danger and payload.get("options", {}).get("avoid_polygons"):
                        logger.warning("OpenRouteService avoid_danger route failed, retrying without avoid_polygons")
                        payload.pop("options", None)
                        try:
                            resp = requests.post(url, json=payload, headers=headers, timeout=MAX_ROUTE_REQUEST_TIMEOUT_SECONDS)
                        except Exception:
                            logger.exception("HTTP retry request to OpenRouteService without avoid_polygons failed")
                            raise HTTPException(status_code=400, detail=f"{route_error_message} ORS error: {short_body}")
                        if resp.status_code == 200:
                            try:
                                data = resp.json()
                                data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger)
                                return data
                            except Exception:
                                logger.exception("Failed to decode OpenRouteService JSON response on retry")
                                raise HTTPException(status_code=400, detail=f"{route_error_message} ORS response invalid: {short_body}")
                        try:
                            response_body = resp.json()
                        except Exception:
                            response_body = resp.text or ""
                        short_body = str(response_body)[:400]
                        logger.error("OpenRouteService retry without avoid_polygons returned non-200", extra={"status": resp.status_code, "text": short_body})
                        routable_error_message = _ors_routable_point_error(response_body, short_body)
                        if routable_error_message:
                            raise HTTPException(status_code=400, detail=routable_error_message)
                    raise HTTPException(status_code=400, detail=f"{route_error_message} ORS status {resp.status_code}: {short_body}")
                raise HTTPException(
                    status_code=400,
                    detail="The selected location is too far from any accessible roads or walking paths. Please choose a location on or near a road, street, or path to calculate a route."
                )
            if avoid_danger and payload.get("options", {}).get("avoid_polygons"):
                logger.warning("OpenRouteService avoid_danger route failed, retrying without avoid_polygons")
                payload.pop("options", None)
                try:
                    resp = requests.post(url, json=payload, headers=headers, timeout=MAX_ROUTE_REQUEST_TIMEOUT_SECONDS)
                except Exception as re:
                    logger.exception("HTTP retry request to OpenRouteService without avoid_polygons failed")
                    raise HTTPException(status_code=400, detail=f"{route_error_message} ORS error: {short_body}")
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger)
                        return data
                    except Exception:
                        logger.exception("Failed to decode OpenRouteService JSON response on retry")
                        raise HTTPException(status_code=400, detail=f"{route_error_message} ORS response invalid: {short_body}")
                try:
                    response_body = resp.json()
                except Exception:
                    response_body = resp.text or ""
                short_body = str(response_body)[:400]
                logger.error("OpenRouteService retry without avoid_polygons returned non-200", extra={"status": resp.status_code, "text": short_body})
                routable_error_message = _ors_routable_point_error(response_body, short_body)
                if routable_error_message:
                    raise HTTPException(status_code=400, detail=routable_error_message)
            raise HTTPException(status_code=400, detail=f"{route_error_message} ORS status {resp.status_code}: {short_body}")
        try:
            data = resp.json()
            data["route_advice"] = _generate_route_advice(data, start_lat, start_lng, end_lat, end_lng, relevant_pins, avoid_danger)
            return data
        except Exception:
            logger.exception("Failed to decode OpenRouteService JSON response")
            raise HTTPException(status_code=400, detail=route_error_message)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fetch route from OpenRouteService")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ai-advice")
def get_ai_advice(lat: float, lng: float, location_type: str = "general", language: str = "en"):
    dest_response = supabase.table("destinations").select("*").execute()
    destinations: List[Dict[str, Any]] = safe_data(dest_response)
    pin_response = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(pin_response)
    pins = filter_active_pins(pins)

    ranked = []
    for d in destinations:
        if not isinstance(d, dict):
            continue
        distance = haversine(lat, lng, d.get("lat", 0), d.get("lng", 0))
        d["distance_km"] = round(distance, 2)
        ranked.append(d)
    ranked.sort(key=lambda item: item.get("distance_km", 0))
    max_recommend_distance_km = 2.0
    nearby_tourist_spots = [d for d in ranked if isinstance(d, dict) and d.get("distance_km", 0) <= max_recommend_distance_km]
    nearest = nearby_tourist_spots[:1]

    danger_nearby = []
    for p in pins:
        if not isinstance(p, dict):
            continue
        dist = haversine(lat, lng, p.get("lat", 0), p.get("lng", 0))
        p["distance_km"] = round(dist, 2)
        radius = p.get("radius_meters", 300)
        p["inside_zone"] = is_within_pin_warning_zone(dist, radius)
        if p["inside_zone"]:
            danger_nearby.append(p)
    danger_nearby.sort(key=lambda x: x.get("distance_km", 0))
    wildlife_alerts = [p for p in danger_nearby if _is_wildlife_alert(p)]

    # Delegate AI generation and fallback to GeminiClient
    ai_used = False
    ai_raw = None
    advice = None
    if gemini_client is not None:
        try:
            ai_result = gemini_client.generate_advice(nearest, danger_nearby, wildlife_alerts, lat, lng)
            advice = ai_result.get("advice")
            ai_used = bool(ai_result.get("ai_used"))
            ai_raw = ai_result.get("ai_raw")
        except Exception:
            advice = None

    # final fallback if AI unavailable or failed
    if not advice:
        if nearest:
            top = nearest[0] if isinstance(nearest[0], dict) else {}
            distance_km = top.get('distance_km', 0)
            cl = top.get("crowd_level")
            # Only include crowd warning if within 1.0km
            if distance_km <= 1.0:
                crowd_note = {
                    "Low": "It is a quiet time, so this spot should be a good choice.",
                    "Moderate": "It is a bit busy right now, so expect some waiting.",
                    "High": "It is crowded at the moment, so you may want to consider a different spot or wait."
                }.get(cl, "Crowd status is unavailable.") if isinstance(cl, str) else "Crowd status is unavailable."
                advice = f"The nearest tourist spot is {top.get('name', 'an unknown place')} in {top.get('city', 'an unknown city')}, about {distance_km} km away. {crowd_note}"
            else:
                advice = f"The nearest tourist spot is {top.get('name', 'an unknown place')} in {top.get('city', 'an unknown city')}, about {distance_km} km away."
        else:
            advice = "There are no tourist spots within 2 km nearby right now."
        if danger_nearby:
            first = danger_nearby[0] if isinstance(danger_nearby[0], dict) else {}
            advice += f" Also, there is a safety concern: {first.get('title', 'a danger area')} ({first.get('danger_type', 'danger')}) about {first.get('distance_km', 0)} km away. {first.get('description', '')}"

    if language.lower() not in ["en", "english"]:
        advice = _translate_alert(advice, language)

    return {
        "latitude": lat,
        "longitude": lng,
        "advice": advice,
        "ai_used": ai_used,
        "ai_raw": ai_raw,
        "nearest_destinations": nearby_tourist_spots,
        "nearby_dangers": danger_nearby[:8],
        "wildlife_alerts": wildlife_alerts[:8],
        "language": language
    }


@app.post("/ai/generate")
def generate_ai(payload: Dict[str, Any] = Body(...)):
    """Generate text using Gemini/Generative Language API.

    Expects JSON body: { "prompt": "..." }. The model is taken from GEMINI_MODEL in .env
    unless an explicit model override is provided.
    """
    prompt = payload.get("prompt")
    model = payload.get("model")
    if not prompt or not isinstance(prompt, str):
        raise HTTPException(status_code=400, detail="'prompt' (string) is required in request body.")
    if gemini_client is None:
        raise HTTPException(status_code=500, detail="Gemini client not configured. Set GEMINI_API_KEY environment variable.")
    try:
        res = gemini_client.generate_text(prompt=prompt, model=model)
        text = None
        if isinstance(res, dict):
            if "candidates" in res and isinstance(res["candidates"], list) and res["candidates"]:
                first = res["candidates"][0]
                text = first.get("output") or first.get("content") or first.get("text")
            elif "output" in res:
                text = res.get("output")
        return {"ok": True, "text": text, "raw": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/crowd-pins/scan")
def scan_crowdy_area_markers(window_hours: int = 1, user_threshold: int = 10, duplicate_radius_m: int = 500):
    """Scan recent crowd reports and automatically create Crowdy Area markers."""
    try:
        created = _create_auto_crowdy_area_markers(user_threshold, window_hours, duplicate_radius_m)
        return {
            "created_count": len(created),
            "created_markers": created,
            "window_hours": window_hours,
            "user_threshold": user_threshold,
            "duplicate_radius_m": duplicate_radius_m,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create crowdy area markers: {str(e)}")

@app.get("/ai/crowd-patterns/{destination_id}")
def get_crowd_patterns(destination_id: int, hours_ahead: int = 6):
    """Predict crowd patterns for a destination."""
    try:
        predictions = _predict_crowd_patterns(destination_id, hours_ahead)
        return predictions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to predict crowd patterns: {str(e)}")

@app.post("/ai/moderate-comment")
def moderate_comment(payload: Dict[str, Any] = Body(...)):
    """Check if a comment is spam/inappropriate before posting."""
    comment_text = payload.get("comment", "")
    if not isinstance(comment_text, str):
        raise HTTPException(status_code=400, detail="comment must be a string")
    try:
        result = _moderate_comment_on_insert(comment_text)
        return {
            "comment": comment_text[:100],
            "is_spam": result.get("is_spam", False),
            "reason": result.get("reason", "unknown"),
            "confidence": result.get("confidence", 0.0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to moderate comment: {str(e)}")

@app.post("/ai/translate-alert")
def translate_alert_endpoint(payload: Dict[str, Any] = Body(...)):
    """Translate a safety alert to a different language."""
    text = payload.get("text", "")
    language = payload.get("language", "en")
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail="text must be a string")
    try:
        translated = _translate_alert(text, language)
        return {
            "original_text": text,
            "translated_text": translated,
            "language": language,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to translate alert: {str(e)}")

@app.get("/reports/summary")
def reports_summary():
    try:
        # Count destinations
        dest_response = supabase.table("destinations").select("crowd_level").execute()
        destinations: List[Dict[str, Any]] = safe_data(dest_response)
        total_destinations = len(destinations)

        # Count users
        user_response = supabase.table("users").select("id").execute()
        users: List[Dict[str, Any]] = safe_data(user_response)
        total_users = len(users)

        # Crowd summary
        crowd_summary = {}
        for d in destinations:
            if isinstance(d, dict):
                level = d.get("crowd_level", "Unknown")
                if isinstance(level, str):
                    crowd_summary[level] = crowd_summary.get(level, 0) + 1

        # Danger summary
        try:
            danger_response = supabase.table("danger_pins").select("*").execute()
            danger_pins: List[Dict[str, Any]] = safe_data(danger_response)
        except Exception:
            danger_pins = []
        
        danger_summary = {}
        for p in filter_active_pins(danger_pins):
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
            "ai_report": "System recommends less crowded destinations, warns users near danger, and suggests safer routes."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

# DANGER PIN AND COMMENTS
@app.get("/danger-pins")
def get_danger_pins():
    response = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    visible = []
    # collect user ids referenced by pins and comments so we can fetch user display names in one go
    referenced_user_ids = set()
    for pin in pins:
        if _pin_inactive(pin):
            continue
        pin_id = pin.get("id")
        uid_val = pin.get("user_id")
        if uid_val is not None:
            try:
                referenced_user_ids.add(int(uid_val))
            except Exception:
                pass
        if pin_id is not None:
            comments_response = supabase.table("marker_comments").select("*").eq("pin_id", pin_id).order("created_at", desc=True).execute()
            comments = safe_data(comments_response) or []
            comments = [
                c for c in comments
                if isinstance(c, dict) and c.get("moderation_reason") != "deleted_by_moderation"
            ]
            for c in comments:
                if c and c.get("user_id") is not None:
                    cuid_val = c.get("user_id")
                    try:
                        if cuid_val is not None:
                            referenced_user_ids.add(int(cuid_val))
                    except Exception:
                        pass
            pin["comments"] = comments
        visible.append(pin)

    # fetch users once
    users_map: Dict[int, Dict[str, Any]] = {}
    if referenced_user_ids:
        try:
            users_resp = supabase.table("users").select("id, name, display_name").in_("id", list(referenced_user_ids)).execute()
            users_list = safe_data(users_resp)
            for u in users_list:
                if isinstance(u, dict):
                    try:
                        uid_val = u.get("id")
                        if uid_val is not None:
                            users_map[int(uid_val)] = u
                    except Exception:
                        pass
        except Exception:
            users_map = {}

    # attach display names
    for pin in visible:
        uid = pin.get("user_id")
        reporter = None
        uid_key = None
        try:
            if uid is not None:
                uid_key = int(uid)
        except Exception:
            uid_key = None
        if uid_key is not None and uid_key in users_map:
            reporter = users_map[uid_key].get("display_name") or users_map[uid_key].get("name")
        pin["reported_by"] = reporter or pin.get("reported_by") or "Unknown"
        # attach commented_by for each comment
        comments = pin.get("comments") or []
        for c in comments:
            cuid = c.get("user_id")
            commenter = None
            cuid_key = None
            try:
                if cuid is not None:
                    cuid_key = int(cuid)
            except Exception:
                cuid_key = None
            if cuid_key is not None and cuid_key in users_map:
                commenter = users_map[cuid_key].get("display_name") or users_map[cuid_key].get("name")
            c["commented_by"] = commenter or c.get("commented_by") or "Unknown"

    return visible

@app.post("/danger-pins")
def add_danger_pin(data: DangerPinRequest):
    response = supabase.table("danger_pins").insert({
        "title": data.title,
        "danger_type": data.danger_type,
        "lat": data.lat,
        "lng": data.lng,
        "severity": data.severity,
        "radius_meters": data.radius_meters,
        "duration_hours": data.duration_hours,
        "description": data.description,
        "user_id": data.user_id,
        "removed_at": None,
        "created_at": now_iso()
    }).execute()

    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add danger pin")

    return {"message": "Danger pin added", "id": data_list[0]["id"]}

@app.post("/danger-pins/{pin_id}/comments")
async def add_marker_comment(pin_id: int, data: MarkerCommentRequest):
    if data.user_id is None:
        raise HTTPException(status_code=400, detail="user_id is required for marker comments.")

    insert_data = {
        "pin_id": pin_id,
        "comment": data.comment.strip(),
        "user_id": data.user_id,
        "created_at": now_iso(),
        "moderation_flagged": False,
        "moderation_reason": "pending"
    }

    response = await asyncio.to_thread(lambda: supabase.table("marker_comments").insert(insert_data).execute())
    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add comment")

    comment_id_raw = data_list[0].get("id")
    if comment_id_raw is None:
        raise HTTPException(status_code=500, detail="Failed to determine new comment id")

    comment_id = int(comment_id_raw)
    comment_text = data.comment.strip()
    asyncio.create_task(_moderate_comment_after_delay(comment_id, comment_text, delay_seconds=300))

    return {
        "message": "Comment added and pending moderation",
        "id": comment_id,
        "moderation_flagged": False,
        "moderation_reason": "pending"
    }

@app.put("/danger-pins/{pin_id}/comments/{comment_id}")
def update_marker_comment(pin_id: int, comment_id: int, data: MarkerCommentRequest):
    requestor_user_id = data.requesting_user_id
    requestor_role = (data.requesting_role or "tourist").lower()

    comment_response = supabase.table("marker_comments").select("*").eq("id", comment_id).eq("pin_id", pin_id).execute()
    comments = safe_data(comment_response)
    if not comments:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment_item = comments[0]

    if requestor_user_id != comment_item.get("user_id") and requestor_role != "administrator":
        raise HTTPException(status_code=403, detail="Not authorized to edit this comment.")

    response = supabase.table("marker_comments").update({
        "comment": data.comment.strip(),
    }).eq("id", comment_id).eq("pin_id", pin_id).execute()
    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"message": "Comment updated"}

@app.delete("/danger-pins/{pin_id}/comments/{comment_id}")
def delete_marker_comment(pin_id: int, comment_id: int, requesting_user_id: Optional[int] = None, requesting_role: str = "tourist"):
    comment_response = supabase.table("marker_comments").select("*").eq("id", comment_id).eq("pin_id", pin_id).execute()
    comments = safe_data(comment_response)
    if not comments:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment_item = comments[0]

    pin_response = supabase.table("danger_pins").select("*").eq("id", pin_id).execute()
    pins = safe_data(pin_response)
    if not pins:
        raise HTTPException(status_code=404, detail="Marker not found")
    pin_item = pins[0]

    requestor_role_lower = requesting_role.lower()
    if requesting_user_id != comment_item.get("user_id") and requesting_user_id != pin_item.get("user_id") and requestor_role_lower not in {"administrator", "admin"}:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment.")

    response = supabase.table("marker_comments").delete().eq("id", comment_id).eq("pin_id", pin_id).execute()
    deleted_rows = safe_data(response)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"message": "Comment deleted"}

@app.post("/danger-pins/move-expired")
def move_expired_endpoint():
    count = move_expired_pins(supabase)
    return {"moved": count}

@app.delete("/destinations/{destination_id}")
def delete_destination(destination_id: int):
    response = supabase.table("destinations").delete().eq("id", destination_id).execute()
    if getattr(response, 'error', None):  # type: ignore
        raise HTTPException(status_code=500, detail="Failed to delete destination.")
    deleted_rows = safe_data(response)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="Destination not found.")
    return {"message": "Destination deleted", "id": destination_id}

@app.delete("/danger-pins/{pin_id}")
def delete_danger_pin(
    pin_id: int,
    requesting_user_id: Optional[int] = None,
    requesting_role: str = "tourist",
):
    pin_response = supabase.table("danger_pins").select("*").eq("id", pin_id).execute()
    pin_items = safe_data(pin_response)
    if not pin_items:
        raise HTTPException(status_code=404, detail="Danger pin not found.")

    pin_item = pin_items[0]
    requestor_role_lower = (requesting_role or "").lower()
    if requesting_user_id != pin_item.get("user_id") and requestor_role_lower not in {"administrator", "admin"}:
        raise HTTPException(status_code=403, detail="Not allowed to delete this pin.")

    history_row = {
        "pin_id": pin_id,
        "moved_at": now_iso(),
        "status": "removed"
    }
    supabase.table("pin_history").insert(history_row).execute()

    response = supabase.table("danger_pins").update({"removed_at": now_iso()}).eq("id", pin_id).execute()
    data_list = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=404, detail="Danger pin not found.")
    return {"message": "Danger pin removed", "id": pin_id}