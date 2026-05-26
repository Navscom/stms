from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, root_validator
from typing import Any, Dict, List, Optional

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "tourist"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class DeleteAccountRequest(BaseModel):
    email: EmailStr

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
    duration_hours: float = 0
    reported_by: str = "Anonymous"

    @root_validator(pre=True)
    def normalize_duration(cls, values):
        if values.get("duration_hours") is None:
            minutes = values.get("duration")
            if minutes is not None:
                try:
                    values["duration_hours"] = float(minutes) / 60.0
                except Exception:
                    values["duration_hours"] = 0
        return values

class MarkerCommentRequest(BaseModel):
    comment: str
    commented_by: str = "Anonymous"
    requesting_by: Optional[str] = None
    requesting_role: Optional[str] = None

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    night_mode: bool = False


def validate_register(data: RegisterRequest) -> None:
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if data.role not in ["tourist", "admin", "administrator"]:
        raise HTTPException(status_code=400, detail="Invalid role.")


def validate_crowd_level(data: CrowdUpdateRequest) -> None:
    allowed = ["Low", "Moderate", "High"]
    if data.crowd_level not in allowed:
        raise HTTPException(status_code=400, detail="Crowd level must be Low, Moderate, or High.")
