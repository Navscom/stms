from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI( )

# This part is CRITICAL: It allows your React frontend to talk to this Python backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In a real project, you'd put your website URL here
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "Backend is running!"}

@app.get("/ai-advice")
def get_map_advice(lat: float, lng: float, location_type: str = "general"):
    # Later, we will put the AI logic here. 
    # For now, it just returns a "mock" response.
    return {
        "latitude": lat,
        "longitude": lng,
        "advice": f"AI Advice: You are at a {location_type} spot. Always carry water!"
    }
