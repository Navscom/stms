from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import sqlite3
import hashlib
import math
from datetime import datetime
from typing import Optional

DB_NAME = "tourism.db"

app = FastAPI(title="Smart Tourism Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "tourist"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class DestinationRequest(BaseModel):
    name: str
    category: str
    city: str
    province: str
    lat: float
    lng: float
    description: str
    opening_hours: str = "8:00 AM - 5:00 PM"
    crowd_level: str = "Low"

class CrowdUpdateRequest(BaseModel):
    crowd_level: str

class DangerPinRequest(BaseModel):
    title: str
    danger_type: str = "Danger Area"
    lat: float
    lng: float
    severity: str = "Moderate"
    radius_meters: int = 300
    description: str
    reported_by: str = "Anonymous"

class MarkerCommentRequest(BaseModel):
    comment: str
    commented_by: str = "Anonymous"

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    night_mode: bool = False


def db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


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
    # Simple route risk check: sample points on straight line route.
    for i in range(21):
        t = i / 20
        lat = start_lat + (end_lat - start_lat) * t
        lng = start_lng + (end_lng - start_lng) * t
        if haversine(lat, lng, zone_lat, zone_lng) <= radius_km:
            return True
    return False


def make_detour(start_lat, start_lng, end_lat, end_lng, danger_lat, danger_lng):
    # Create a simple visual detour waypoint away from the danger center.
    mid_lat = (start_lat + end_lat) / 2
    mid_lng = (start_lng + end_lng) / 2
    offset_lat = 0.015 if mid_lat <= danger_lat else -0.015
    offset_lng = 0.015 if mid_lng <= danger_lng else -0.015
    return [[start_lat, start_lng], [mid_lat + offset_lat, mid_lng + offset_lng], [end_lat, end_lng]]


def init_db():
    conn = db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'tourist',
            created_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS destinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            city TEXT NOT NULL,
            province TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            description TEXT NOT NULL,
            opening_hours TEXT NOT NULL,
            crowd_level TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS crowd_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            destination_id INTEGER NOT NULL,
            crowd_level TEXT NOT NULL,
            reported_at TEXT NOT NULL,
            FOREIGN KEY(destination_id) REFERENCES destinations(id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS danger_pins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            danger_type TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            severity TEXT NOT NULL,
            radius_meters INTEGER NOT NULL,
            description TEXT NOT NULL,
            reported_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS marker_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pin_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            commented_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(pin_id) REFERENCES danger_pins(id) ON DELETE CASCADE
        )
    """)
    conn.commit()

    admin_email = "admin@stms.com"
    cur.execute("SELECT id FROM users WHERE email=?", (admin_email,))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO users (name,email,password,role,created_at) VALUES (?,?,?,?,?)",
            ("Administrator", admin_email, hash_password("admin123"), "admin", datetime.now().isoformat())
        )

    cur.execute("SELECT COUNT(*) AS total FROM destinations")
    if cur.fetchone()["total"] == 0:
        sample_destinations = [
            ("Burnham Park", "Park", "Baguio", "Benguet", 16.4114, 120.5931, "A popular urban park known for boating, biking, gardens, and family activities.", "6:00 AM - 9:00 PM", "Moderate"),
            ("Mines View Park", "View Deck", "Baguio", "Benguet", 16.4214, 120.6270, "A scenic viewpoint where tourists can see mountain ranges and buy local souvenirs.", "7:00 AM - 8:00 PM", "High"),
            ("Rizal Park", "Historical Site", "Manila", "Metro Manila", 14.5826, 120.9780, "A historical landmark dedicated to Dr. Jose Rizal and a major public park in Manila.", "5:00 AM - 10:00 PM", "Moderate"),
            ("Chocolate Hills", "Natural Attraction", "Carmen", "Bohol", 9.9167, 124.1667, "A famous geological formation with hundreds of cone-shaped hills.", "8:00 AM - 5:00 PM", "Low"),
            ("White Beach", "Beach", "Boracay", "Aklan", 11.9674, 121.9248, "A world-famous beach destination known for white sand, water activities, and sunset views.", "Open 24 hours", "High"),
            ("Mayon Volcano View", "Natural Attraction", "Legazpi", "Albay", 13.2577, 123.6859, "A scenic location for viewing the perfectly cone-shaped Mayon Volcano.", "6:00 AM - 6:00 PM", "Low")
        ]
        cur.executemany(
            """INSERT INTO destinations
            (name,category,city,province,lat,lng,description,opening_hours,crowd_level,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            [d + (datetime.now().isoformat(),) for d in sample_destinations]
        )

    cur.execute("SELECT COUNT(*) AS total FROM danger_pins")
    if cur.fetchone()["total"] == 0:
        sample_pins = [
            ("Low-light walkway", "Dark Area", 16.4126, 120.5953, "Moderate", 350, "Reported dark path. Use a brighter route or travel with a group.", "System"),
            ("Stray dogs reported", "Dangerous Animals", 14.5810, 120.9805, "High", 250, "Users reported aggressive stray dogs nearby. Avoid the area and notify local authorities.", "System"),
            ("Slippery trail section", "Hazard on Area", 13.2589, 123.6871, "Moderate", 400, "Possible slippery path during rain. Wear proper footwear and avoid steep areas.", "System"),
            ("Snake sighting", "Dangerous Animals", 9.9178, 124.1650, "High", 300, "Possible snake/wildlife sighting. Stay on marked paths and avoid tall grass.", "System"),
            ("Crowded entrance", "Crowdy Area", 11.9674, 121.9248, "Moderate", 300, "Heavy crowd near the entrance. Keep belongings secure and consider another route.", "System")
        ]
        cur.executemany(
            """INSERT INTO danger_pins
            (title,danger_type,lat,lng,severity,radius_meters,description,reported_by,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            [p + (datetime.now().isoformat(),) for p in sample_pins]
        )
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()

@app.get("/")
def home():
    return {"status": "Smart Tourism Management System backend is running"}

@app.post("/register")
def register(data: RegisterRequest):
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if data.role not in ["tourist", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role.")
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (name,email,password,role,created_at) VALUES (?,?,?,?,?)",
            (data.name, data.email, hash_password(data.password), data.role, datetime.now().isoformat())
        )
        conn.commit()
        return {"message": "Registration successful", "user": {"name": data.name, "email": data.email, "role": data.role}}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Email already exists.")
    finally:
        conn.close()

@app.post("/login")
def login(data: LoginRequest):
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id,name,email,role FROM users WHERE email=? AND password=?", (data.email, hash_password(data.password)))
    user = cur.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"message": "Login successful", "user": dict(user)}

@app.get("/destinations")
def get_destinations():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM destinations ORDER BY name")
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows

@app.post("/destinations")
def add_destination(data: DestinationRequest):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO destinations
        (name,category,city,province,lat,lng,description,opening_hours,crowd_level,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (data.name, data.category, data.city, data.province, data.lat, data.lng, data.description, data.opening_hours, data.crowd_level, datetime.now().isoformat())
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"message": "Destination added", "id": new_id}

@app.put("/destinations/{destination_id}/crowd")
def update_crowd(destination_id: int, data: CrowdUpdateRequest):
    allowed = ["Low", "Moderate", "High"]
    if data.crowd_level not in allowed:
        raise HTTPException(status_code=400, detail="Crowd level must be Low, Moderate, or High.")
    conn = db()
    cur = conn.cursor()
    cur.execute("UPDATE destinations SET crowd_level=?, updated_at=? WHERE id=?", (data.crowd_level, datetime.now().isoformat(), destination_id))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Destination not found.")
    cur.execute("INSERT INTO crowd_reports (destination_id,crowd_level,reported_at) VALUES (?,?,?)", (destination_id, data.crowd_level, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return {"message": "Crowd status updated"}

@app.get("/danger-pins")
def get_danger_pins():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM danger_pins ORDER BY created_at DESC")
    rows = [dict(row) for row in cur.fetchall()]
    for row in rows:
        cur.execute("SELECT * FROM marker_comments WHERE pin_id=? ORDER BY created_at DESC", (row["id"],))
        row["comments"] = [dict(comment) for comment in cur.fetchall()]
    conn.close()
    return rows

@app.post("/danger-pins")
def add_danger_pin(data: DangerPinRequest):
    allowed_severity = ["Low", "Moderate", "High"]
    if data.severity not in allowed_severity:
        raise HTTPException(status_code=400, detail="Severity must be Low, Moderate, or High.")
    allowed_types = ["Danger Area", "Dark Area", "Crowdy Area", "Dangerous Animals", "Hazard on Area"]
    if data.danger_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid marker type.")
    if not data.description or len(data.description.strip()) < 10:
        raise HTTPException(status_code=400, detail="Description is required and must explain why you put the marker.")
    if data.radius_meters < 50 or data.radius_meters > 5000:
        raise HTTPException(status_code=400, detail="Radius must be between 50 and 5000 meters.")
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO danger_pins
        (title,danger_type,lat,lng,severity,radius_meters,description,reported_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)""",
        (data.title, data.danger_type, data.lat, data.lng, data.severity, data.radius_meters, data.description, data.reported_by, datetime.now().isoformat())
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"message": "Danger pin added", "id": new_id}


@app.post("/danger-pins/{pin_id}/comments")
def add_marker_comment(pin_id: int, data: MarkerCommentRequest):
    if not data.comment or len(data.comment.strip()) < 3:
        raise HTTPException(status_code=400, detail="Comment is required.")
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM danger_pins WHERE id=?", (pin_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Marker not found.")
    cur.execute(
        "INSERT INTO marker_comments (pin_id,comment,commented_by,created_at) VALUES (?,?,?,?)",
        (pin_id, data.comment.strip(), data.commented_by, datetime.now().isoformat())
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"message": "Comment added", "id": new_id}

@app.delete("/danger-pins/{pin_id}")
def delete_danger_pin(pin_id: int):
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM marker_comments WHERE pin_id=?", (pin_id,))
    cur.execute("DELETE FROM danger_pins WHERE id=?", (pin_id,))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Danger pin not found.")
    conn.commit()
    conn.close()
    return {"message": "Danger pin deleted"}

@app.get("/safety-check")
def safety_check(lat: float, lng: float):
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM danger_pins")
    pins = [dict(row) for row in cur.fetchall()]
    conn.close()

    nearby = []
    for pin in pins:
        distance_km = haversine(lat, lng, pin["lat"], pin["lng"])
        pin["distance_km"] = round(distance_km, 2)
        pin["inside_zone"] = distance_km <= (pin["radius_meters"] / 1000)
        if distance_km <= 1.5 or pin["inside_zone"]:
            nearby.append(pin)

    nearby.sort(key=lambda p: p["distance_km"])
    alerts = []
    for pin in nearby:
        if pin["danger_type"] == "Dangerous Animals":
            alerts.append(f"Dangerous animal alert: {pin['title']} is {pin['distance_km']} km away. Stay on marked paths and do not approach animals.")
        elif pin["danger_type"] == "Dark Area":
            alerts.append(f"Dark-area report: {pin['title']} is near your location. Use a brighter path or travel with a companion.")
        elif pin["danger_type"] == "Crowdy Area":
            alerts.append(f"Crowd alert: {pin['title']} is {pin['distance_km']} km away. Expect congestion and secure your belongings.")
        else:
            alerts.append(f"Warning: {pin['title']} is {pin['distance_km']} km away. {pin['description']}")

    risk_level = "Low"
    if any(p["severity"] == "High" and p["distance_km"] <= 1.0 for p in nearby):
        risk_level = "High"
    elif nearby:
        risk_level = "Moderate"

    return {
        "risk_level": risk_level,
        "alerts": alerts if alerts else ["No nearby danger report found. Continue following local safety rules."],
        "nearby_dangers": nearby[:8]
    }

@app.post("/recommend-route")
def recommend_route(data: RouteRequest):
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM danger_pins")
    pins = [dict(row) for row in cur.fetchall()]
    conn.close()

    hazards = []
    for pin in pins:
        radius_km = max(pin["radius_meters"] / 1000, 0.25)
        if route_intersects_zone(data.start_lat, data.start_lng, data.end_lat, data.end_lng, pin["lat"], pin["lng"], radius_km):
            hazards.append(pin)

    if hazards:
        main = hazards[0]
        route_points = make_detour(data.start_lat, data.start_lng, data.end_lat, data.end_lng, main["lat"], main["lng"])
        recommendation = f"Safer route recommended. The direct path may pass near {main['title']} ({main['danger_type']}). Follow the detour line and avoid the marked warning circle."
    else:
        route_points = [[data.start_lat, data.start_lng], [data.end_lat, data.end_lng]]
        recommendation = "Direct route looks clear based on current user reports. Still stay alert and follow official signs."

    return {
        "route_points": route_points,
        "hazards_ahead": hazards,
        "recommendation": recommendation
    }

@app.get("/ai-advice")
def get_ai_advice(lat: float, lng: float, location_type: str = "general"):
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM destinations")
    destinations = [dict(row) for row in cur.fetchall()]
    cur.execute("SELECT * FROM danger_pins")
    pins = [dict(row) for row in cur.fetchall()]
    conn.close()

    ranked = []
    for d in destinations:
        distance = haversine(lat, lng, d["lat"], d["lng"])
        d["distance_km"] = round(distance, 2)
        ranked.append(d)
    ranked.sort(key=lambda item: item["distance_km"])
    nearest = ranked[:3]

    danger_nearby = []
    for p in pins:
        dist = haversine(lat, lng, p["lat"], p["lng"])
        p["distance_km"] = round(dist, 2)
        p["inside_zone"] = dist <= (p["radius_meters"] / 1000)
        if dist <= 1.5 or p["inside_zone"]:
            danger_nearby.append(p)
    danger_nearby.sort(key=lambda x: x["distance_km"])

    if nearest:
        top = nearest[0]
        crowd_note = {
            "Low": "Crowd level is low, so it is a good time to visit.",
            "Moderate": "Crowd level is moderate. Expect some waiting time.",
            "High": "Crowd level is high. Consider visiting later or choosing a nearby alternative."
        }.get(top["crowd_level"], "Crowd status is unavailable.")
        advice = f"Nearest spot: {top['name']} in {top['city']}, {top['province']} ({top['distance_km']} km away). {crowd_note}"
    else:
        advice = "No tourist destination found in the database yet."

    if danger_nearby:
        first = danger_nearby[0]
        advice += f" Safety alert: {first['title']} ({first['danger_type']}) is {first['distance_km']} km away. {first['description']}"

    return {
        "latitude": lat,
        "longitude": lng,
        "advice": advice,
        "nearest_destinations": nearest,
        "nearby_dangers": danger_nearby[:8]
    }

@app.get("/reports/summary")
def reports_summary():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS total FROM destinations")
    total_destinations = cur.fetchone()["total"]
    cur.execute("SELECT crowd_level, COUNT(*) AS total FROM destinations GROUP BY crowd_level")
    crowd = {row["crowd_level"]: row["total"] for row in cur.fetchall()}
    cur.execute("SELECT COUNT(*) AS total FROM users")
    total_users = cur.fetchone()["total"]
    cur.execute("SELECT severity, COUNT(*) AS total FROM danger_pins GROUP BY severity")
    danger = {row["severity"]: row["total"] for row in cur.fetchall()}
    conn.close()
    return {
        "total_destinations": total_destinations,
        "total_users": total_users,
        "crowd_summary": crowd,
        "danger_summary": danger,
        "ai_report": "The system recommends less crowded destinations, warns users near danger, crowd, animal, hazard, and dark-area reports, and suggests safer routes when hazards are detected ahead."
    }
