import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client
from datetime import datetime, timedelta, timezone
import asyncio
from typing import Any, Dict, List
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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
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
        "email": data.email,
        "password": hashed_pw,
        "role": data.role,
        "created_at": datetime.now().isoformat()
    }).execute()

    if getattr(response, 'error', None):  # type: ignore
        raise HTTPException(status_code=400, detail="Email already exists.")
    return {"message": "Registration successful", "user": {"name": data.name, "email": data.email, "role": data.role}}

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
        "updated_at": datetime.now().isoformat()
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

    response = supabase.table("destinations").update({
        "crowd_level": data.crowd_level,
        "updated_at": datetime.now().isoformat()
    }).eq("id", destination_id).execute()

    if not safe_data(response):
        raise HTTPException(status_code=404, detail="Destination not found.")

    supabase.table("crowd_reports").insert({
        "destination_id": destination_id,
        "crowd_level": data.crowd_level,
        "reported_at": datetime.now().isoformat()
    }).execute()

    return {"message": "Crowd status updated"}

@app.get("/safety-check")
def safety_check(lat: float, lng: float):
    response = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = safe_data(response)
    # filter out expired or removed pins
    pins = [p for p in pins if not _pin_inactive(p)]
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
    destinations: List[Dict[str, Any]] = dest_response.data if dest_response.data else []  # type: ignore
    pin_response = supabase.table("danger_pins").select("*").execute()
    pins: List[Dict[str, Any]] = pin_response.data if pin_response.data else []  # type: ignore
    pins = [p for p in pins if not _pin_inactive(p)]

    ranked = []
    for d in destinations:
        if not isinstance(d, dict):
            continue
        distance = haversine(lat, lng, d.get("lat", 0), d.get("lng", 0))
        d["distance_km"] = round(distance, 2)
        ranked.append(d)
    ranked.sort(key=lambda item: item.get("distance_km", 0))
    nearest = ranked[:3]

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
        advice = f"Nearest spot: {top.get('name', 'Unknown')} in {top.get('city', 'Unknown')} ({top.get('distance_km', 0)} km away). {crowd_note}"
    else:
        advice = "No tourist destination found."

    if danger_nearby:
        first = danger_nearby[0] if isinstance(danger_nearby[0], dict) else {}
        advice += f" Safety alert: {first.get('title', 'Danger area')} ({first.get('danger_type', 'danger')}) is {first.get('distance_km', 0)} km away. {first.get('description', '')}"

    return {
        "latitude": lat,
        "longitude": lng,
        "advice": advice,
        "nearest_destinations": nearest,
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
        for p in danger_pins:
            if not isinstance(p, dict):
                continue
            # skip expired
            duration = _get_duration_hours(p)
            if duration:
                created = parse_timestamp(p.get("created_at"))
                now = datetime.now(timezone.utc)
                if created and now > (created + timedelta(hours=duration)):
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
    for pin in pins:
        if _pin_inactive(pin):
            continue
        pin_id = pin.get("id")
        if pin_id is not None:
            comments_response = supabase.table("marker_comments").select("*").eq("pin_id", pin_id).order("created_at", desc=True).execute()
            comments = safe_data(comments_response)
            pin["comments"] = comments
        visible.append(pin)
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
        "duration_minutes": int(data.duration_hours * 60),  # ✅ match schema
        "description": data.description,
        "reported_by": data.reported_by,
        "removed_at": None,                                # ✅ optional column
        "created_at": datetime.now().isoformat()
    }).execute()

    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add danger pin")

    return {"message": "Danger pin added", "id": data_list[0]["id"]}

@app.post("/danger-pins/{pin_id}/comments")
def add_marker_comment(pin_id: int, data: MarkerCommentRequest):
    response = supabase.table("marker_comments").insert({
        "pin_id": pin_id,
        "comment": data.comment.strip(),
        "commented_by": data.commented_by,
        "created_at": datetime.now().isoformat()
    }).execute()
    data_list: List[Dict[str, Any]] = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=500, detail="Failed to add comment")
    return {"message": "Comment added", "id": data_list[0]["id"]}

@app.post("/danger-pins/move-expired")
def move_expired_endpoint():
    count = move_expired_pins(supabase)
    return {"moved": count}

@app.delete("/danger-pins/{pin_id}")
def delete_danger_pin(pin_id: int):
    # soft-delete: mark removed_at so we keep record
    response = supabase.table("danger_pins").update({"removed_at": datetime.now().isoformat()}).eq("id", pin_id).execute()
    data_list = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=404, detail="Danger pin not found.")
    return {"message": "Danger pin removed", "id": pin_id}