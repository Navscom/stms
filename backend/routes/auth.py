from ..app import app
from ..db_validation import (
    RegisterRequest,
    LoginRequest,
    DeleteAccountRequest,
)
from ..helpers import hash_password, now_iso, safe_data
from ..config import supabase
from fastapi import HTTPException


@app.post("/register")
def register(data: RegisterRequest):
    from ..db_validation import validate_register
    validate_register(data)

    hashed_pw = hash_password(data.password)
    response = supabase.table("users").insert({
        "name": data.name,
        "display_name": getattr(data, "displayName", None),
        "email": data.email,
        "password": hashed_pw,
        "role": data.role,
        "created_at": now_iso(),
    }).execute()

    if getattr(response, "error", None):
        raise HTTPException(status_code=400, detail="Email already exists.")
    return {
        "message": "Registration successful",
        "user": {
            "name": data.name,
            "display_name": getattr(data, "displayName", None),
            "email": data.email,
            "role": data.role,
        },
    }


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
    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail="Failed to delete account.")
    deleted_rows = safe_data(response)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "Account deleted successfully."}
