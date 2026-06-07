from ..app import app
from ..db_validation import DestinationRequest, CrowdUpdateRequest
from ..helpers import now_iso, safe_data
from ..config import supabase
from fastapi import HTTPException
from typing import Any, Dict, List


@app.post("/destinations")
def add_destination(data: DestinationRequest):
    from ..db_validation import validate_crowd_level
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
        "updated_at": now_iso(),
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
    from ..db_validation import validate_crowd_level
    validate_crowd_level(data)
    if data.user_id is None:
        raise HTTPException(status_code=400, detail="user_id is required for crowd reports.")

    response = supabase.table("destinations").update({
        "crowd_level": data.crowd_level,
        "updated_at": now_iso(),
    }).eq("id", destination_id).execute()

    if not safe_data(response):
        raise HTTPException(status_code=404, detail="Destination not found.")

    supabase.table("crowd_reports").insert({
        "destination_id": destination_id,
        "crowd_level": data.crowd_level,
        "user_id": data.user_id,
        "reported_at": now_iso(),
    }).execute()

    return {"message": "Crowd level updated", "destination_id": destination_id, "crowd_level": data.crowd_level}


@app.delete("/destinations/{destination_id}")
def delete_destination(destination_id: int):
    response = supabase.table("destinations").delete().eq("id", destination_id).execute()
    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail="Failed to delete destination.")
    deleted_rows = safe_data(response)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="Destination not found.")
    return {"message": "Destination deleted", "id": destination_id}
