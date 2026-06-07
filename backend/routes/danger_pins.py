import asyncio
from typing import Any, Dict, List, Optional

from ..app import app
from ..config import supabase
from ..helpers import move_expired_pins, now_iso, safe_data
from ..services import (
    _fetch_active_danger_pin_metadata,
    _fetch_active_danger_pins,
    _fetch_marker_comments,
    _moderate_comment_after_delay,
)
from ..db_validation import DangerPinRequest, MarkerCommentRequest
from fastapi import Body, HTTPException


@app.get("/danger-pins/metadata")
def get_danger_pin_metadata():
    return _fetch_active_danger_pin_metadata()


@app.get("/danger-pins")
def get_danger_pins():
    pins: List[Dict[str, Any]] = _fetch_active_danger_pins()
    visible = []
    pin_ids = []
    referenced_user_ids = set()

    for pin in pins:
        if pin is None or not isinstance(pin, dict):
            continue
        pin_id = pin.get("id")
        if pin_id is not None:
            try:
                pin_ids.append(int(pin_id))
            except Exception:
                pass

        uid_val = pin.get("user_id")
        if uid_val is not None:
            try:
                referenced_user_ids.add(int(uid_val))
            except Exception:
                pass

        visible.append(pin)

    comments_map: Dict[int, List[Dict[str, Any]]] = {}
    if pin_ids:
        try:
            comments_response = supabase.table("marker_comments").select("*").in_("pin_id", pin_ids).order("created_at", desc=True).execute()
            comments = safe_data(comments_response) or []
            for c in comments:
                if not isinstance(c, dict):
                    continue
                if c.get("moderation_reason") == "deleted_by_moderation":
                    continue
                pin_id = c.get("pin_id")
                if pin_id is None:
                    continue
                try:
                    pin_key = int(pin_id)
                except Exception:
                    continue
                comments_map.setdefault(pin_key, []).append(c)
                cuid_val = c.get("user_id")
                if cuid_val is not None:
                    try:
                        referenced_user_ids.add(int(cuid_val))
                    except Exception:
                        pass
        except Exception:
            comments_map = {}

    users_map: Dict[int, Dict[str, Any]] = {}
    if referenced_user_ids:
        try:
            users_resp = supabase.table("users").select("id,name,display_name").in_("id", list(referenced_user_ids)).execute()
            users_list = safe_data(users_resp) or []
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

    for pin in visible:
        pin_id = pin.get("id")
        if pin_id is not None:
            try:
                pin_comments = comments_map.get(int(pin_id), [])
            except Exception:
                pin_comments = []
        else:
            pin_comments = []
        pin["comments"] = pin_comments

        uid = pin.get("user_id")
        reporter = None
        uid_key = None
        try:
            if uid is not None:
                uid_key = int(uid)
        except Exception:
            uid_key = None
        if uid_key is not None and uid_key in users_map:
            reporter = users_map[uid_key].get("display_name") or users_map[uid_key].get("displayName") or users_map[uid_key].get("name")
        pin["reported_by"] = reporter or pin.get("reported_by") or "Unknown"

        for c in pin_comments:
            cuid = c.get("user_id")
            commenter = None
            cuid_key = None
            try:
                if cuid is not None:
                    cuid_key = int(cuid)
            except Exception:
                cuid_key = None
            if cuid_key is not None and cuid_key in users_map:
                commenter = users_map[cuid_key].get("display_name") or users_map[cuid_key].get("displayName") or users_map[cuid_key].get("name")
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
        "created_at": now_iso(),
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
        "moderation_reason": "pending",
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
        "moderation_reason": "pending",
    }


@app.get("/danger-pins/{pin_id}/comments")
def get_marker_comments(pin_id: int):
    return _fetch_marker_comments(pin_id)


@app.put("/danger-pins/{pin_id}/comments/{comment_id}")
def update_marker_comment(pin_id: int, comment_id: int, data: Any):
    requestor_user_id = data.requesting_user_id
    requestor_role = (data.requesting_role or "tourist").lower()

    comment_response = supabase.table("marker_comments").select("*").eq("id", comment_id).eq("pin_id", pin_id).execute()
    comments = safe_data(comment_response)
    if not comments:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment_item = comments[0]

    if requestor_user_id != comment_item.get("user_id") and requestor_role != "administrator":
        raise HTTPException(status_code=403, detail="Not authorized to edit this comment.")

    response = supabase.table("marker_comments").update({"comment": data.comment.strip()}).eq("id", comment_id).eq("pin_id", pin_id).execute()
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
        "status": "removed",
    }
    supabase.table("pin_history").insert(history_row).execute()

    response = supabase.table("danger_pins").update({"removed_at": now_iso()}).eq("id", pin_id).execute()
    data_list = safe_data(response)
    if not data_list:
        raise HTTPException(status_code=404, detail="Danger pin not found.")
    return {"message": "Danger pin removed", "id": pin_id}
