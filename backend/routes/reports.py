from datetime import datetime, timezone
from typing import Dict

from ..app import app
from ..helpers import parse_timestamp
from ..services import _fetch_cached_report_summary, _build_report_summary, _upsert_report_summary_cache, REPORT_SUMMARY_CACHE_TTL_SECONDS
from fastapi import HTTPException


@app.get("/reports/summary")
def reports_summary():
    try:
        cached = _fetch_cached_report_summary()
        if cached is not None:
            cached_at = cached.get("cached_at")
            if isinstance(cached_at, str):
                try:
                    cached_dt = parse_timestamp(cached_at)
                    if cached_dt is not None:
                        age_seconds = (datetime.now(timezone.utc) - cached_dt).total_seconds()
                        if age_seconds <= REPORT_SUMMARY_CACHE_TTL_SECONDS:
                            return {
                                "total_destinations": cached.get("total_destinations", 0),
                                "total_users": cached.get("total_users", 0),
                                "crowd_summary": cached.get("crowd_summary", {}),
                                "danger_summary": cached.get("danger_summary", {}),
                                "removed_comments": cached.get("removed_comments", 0),
                                "ai_report": cached.get("ai_report", "System recommends less crowded destinations, warns users near danger, and suggests safer routes."),
                            }
                except Exception:
                    pass

        summary = _build_report_summary()
        _upsert_report_summary_cache(summary)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")
