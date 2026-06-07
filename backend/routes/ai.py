from typing import Any, Dict, List, Optional

from ..app import app
from ..config import gemini_client, supabase
from ..helpers import haversine, is_within_pin_warning_zone, safe_data
from ..services import (
    _fetch_active_danger_pins,
    _is_wildlife_alert,
    _translate_alert,
    _moderate_comment_on_insert,
    _create_auto_crowdy_area_markers,
    _predict_crowd_patterns,
)
from fastapi import Body, HTTPException


@app.get("/ai-advice")
def get_ai_advice(lat: float, lng: float, location_type: str = "general", language: str = "en"):
    dest_response = supabase.table("destinations").select("id,name,city,lat,lng,crowd_level").execute()
    destinations: List[Dict[str, Any]] = safe_data(dest_response)
    pins: List[Dict[str, Any]] = _fetch_active_danger_pins()

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

    if not advice:
        if nearest:
            top = nearest[0] if isinstance(nearest[0], dict) else {}
            distance_km = top.get('distance_km', 0)
            cl = top.get("crowd_level")
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
        "language": language,
    }


@app.post("/ai/generate")
def generate_ai(payload: Dict[str, Any] = Body(...)):
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
    try:
        predictions = _predict_crowd_patterns(destination_id, hours_ahead)
        return predictions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to predict crowd patterns: {str(e)}")


@app.post("/ai/moderate-comment")
def moderate_comment(payload: Dict[str, Any] = Body(...)):
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
