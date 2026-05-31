import os
import sys
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client
from datetime import datetime, timedelta, timezone
import asyncio
from typing import Any, Dict, List, Optional

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
)

#Load .env
load_dotenv()

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
def safety_check(lat: float, lng: float):
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
    return {"risk_level": risk_level, "nearby_dangers": nearby[:8], "alerts": alerts}

@app.get("/ai-advice")
def get_ai_advice(lat: float, lng: float, location_type: str = "general"):
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
    nearby_tourist_spots = [d for d in ranked if isinstance(d, dict) and d.get("distance_km", 0) <= 10]
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

    if nearest:
        top = nearest[0] if isinstance(nearest[0], dict) else {}
        crowd_level = top.get("crowd_level")
        crowd_note = {
            "Low": "Crowd level is low, good time to visit.",
            "Moderate": "Crowd level is moderate, expect some waiting.",
            "High": "Crowd level is high, consider alternatives."
        }.get(crowd_level, "Crowd status unavailable.") if isinstance(crowd_level, str) else "Crowd status unavailable."
        advice = f"Nearest tourist spot: {top.get('name', 'Unknown')} in {top.get('city', 'Unknown')} ({top.get('distance_km', 0)} km away). {crowd_note}"
    else:
        advice = "No tourist spots are nearby."

    if danger_nearby:
        first = danger_nearby[0] if isinstance(danger_nearby[0], dict) else {}
        advice += f" Safety alert: {first.get('title', 'Danger area')} ({first.get('danger_type', 'danger')}) is {first.get('distance_km', 0)} km away. {first.get('description', '')}"

    return {
        "latitude": lat,
        "longitude": lng,
        "advice": advice,
        "nearest_destinations": nearby_tourist_spots,
        "nearby_dangers": danger_nearby[:8]
    }

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

        return {
            "total_destinations": total_destinations,
            "total_users": total_users,
            "crowd_summary": crowd_summary,
            "danger_summary": danger_summary,
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
            comments = safe_data(comments_response)
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
def add_marker_comment(pin_id: int, data: MarkerCommentRequest):
    if data.user_id is None:
        raise HTTPException(status_code=400, detail="user_id is required for marker comments.")

    response = supabase.table("marker_comments").insert({
        "pin_id": pin_id,
        "comment": data.comment.strip(),
        "user_id": data.user_id,
        "created_at": now_iso()
    }).execute()
    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add comment")
    return {"message": "Comment added", "id": data_list[0]["id"]}

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