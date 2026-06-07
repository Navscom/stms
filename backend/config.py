import os
import logging
from dotenv import load_dotenv
from supabase import Client, create_client

# Load .env from backend directory so keys in backend/.env are loaded when backend is imported.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

MAX_ROUTE_AVOID_PINS = 10
MAX_ROUTE_AVOID_DISTANCE_KM = 5.0
MAX_ROUTE_AVOID_POLYGON_POINTS = 16
MAX_ROUTE_REQUEST_TIMEOUT_SECONDS = 60
MAX_ROUTE_SNAP_RADIUS_METERS = 2000


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required for backend startup.")
    return value


SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_KEY = _require_env("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


gemini_client = None
try:
    if __package__ in (None, ''):
        from gemini_client import GeminiClient
    else:
        from .gemini_client import GeminiClient
    try:
        gemini_client = GeminiClient()
        logger.info("[Backend] GeminiClient initialized successfully")
    except Exception:
        logger.exception("[Backend] Failed to init GeminiClient")
        gemini_client = None
except Exception:
    logger.exception("[Backend] Failed to import GeminiClient")
    gemini_client = None
