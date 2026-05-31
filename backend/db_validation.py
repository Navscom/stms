from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, root_validator
from typing import Any, Dict, List, Optional
import re

class RegisterRequest(BaseModel):
    name: str
    displayName: str
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
    user_id: Optional[int] = None

class DangerPinRequest(BaseModel):
    title: str
    danger_type: str = "Danger Area"
    lat: float
    lng: float
    severity: str = "Moderate"
    radius_meters: int = 300
    description: str
    duration_hours: float = 0
    duration_minutes: Optional[int] = None
    user_id: int

    @root_validator(pre=True)
    def normalize_duration(cls, values):
        if values.get("duration_hours") is None:
            duration_minutes = values.get("duration_minutes")
            duration = values.get("duration")
            if duration_minutes is not None:
                try:
                    values["duration_hours"] = float(duration_minutes) / 60.0
                except Exception:
                    values["duration_hours"] = 0
            elif duration is not None:
                try:
                    values["duration_hours"] = float(duration)
                except Exception:
                    values["duration_hours"] = 0
            else:
                values["duration_hours"] = 0
        return values

class MarkerCommentRequest(BaseModel):
    comment: str
    user_id: Optional[int] = None
    requesting_user_id: Optional[int] = None
    requesting_role: Optional[str] = None

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    night_mode: bool = False


def is_valid_email(email: str) -> bool:
    if not email or any(char.isspace() for char in email):
        return False
    parts = email.split('@')
    if len(parts) != 2:
        return False
    local, domain = parts
    if not re.fullmatch(r'[A-Za-z0-9._+-]+', local):
        return False
    if not re.fullmatch(r'[A-Za-z0-9.-]+\.[A-Za-z]{2,}', domain):
        return False
    return True


def validate_register(data: RegisterRequest) -> None:
    if not is_valid_email(data.email):
        raise HTTPException(status_code=400, detail="Invalid email address. Use a supported provider and no special characters.")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if data.role not in ["tourist", "admin", "administrator"]:
        raise HTTPException(status_code=400, detail="Invalid role.")
    if not getattr(data, 'displayName', None) or not str(data.displayName).strip():
        raise HTTPException(status_code=400, detail="Display name is required.")


def validate_crowd_level(data: CrowdUpdateRequest) -> None:
    allowed = ["Low", "Moderate", "High"]
    if data.crowd_level not in allowed:
        raise HTTPException(status_code=400, detail="Crowd level must be Low, Moderate, or High.")
