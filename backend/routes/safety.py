from ..app import app
from ..config import supabase
from ..services import _fetch_active_danger_pins, _translate_alert, _is_wildlife_alert
from ..helpers import haversine, is_within_pin_warning_zone
from fastapi import HTTPException
from typing import Dict, Any, List


@app.get("/safety-check")
def safety_check(lat: float, lng: float, language: str = "en"):
    pins: List[Dict[str, Any]] = _fetch_active_danger_pins()
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
        "language": language,
    }
