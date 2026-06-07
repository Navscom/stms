import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if __package__ in (None, ''):
    from config import logger, supabase
    from helpers import move_expired_pins
    from services import _create_auto_crowdy_area_markers
else:
    from .config import logger, supabase
    from .helpers import move_expired_pins
    from .services import _create_auto_crowdy_area_markers

app = FastAPI(title="Smart Tourism Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def add_cors_response_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    response.headers.setdefault("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept")
    response.headers.setdefault("Access-Control-Expose-Headers", "Content-Length,Content-Type")
    return response

@app.on_event("startup")
async def start_periodic_expiry_move():
    async def _periodic():
        while True:
            try:
                await asyncio.to_thread(move_expired_pins, supabase)
            except Exception:
                pass
            await asyncio.sleep(60)
    asyncio.create_task(_periodic())

@app.on_event("startup")
async def start_periodic_crowd_marker_scan():
    async def _crowd_scan():
        while True:
            try:
                created = await asyncio.to_thread(_create_auto_crowdy_area_markers, 10, 1, 500)
                if created:
                    logger.info(f"[Backend] Created {len(created)} auto crowdy area marker(s)")
            except Exception:
                logger.exception("[Backend] Crowd scan failed")
            await asyncio.sleep(300)
    asyncio.create_task(_crowd_scan())
