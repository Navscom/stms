# Wrapper to expose the FastAPI ASGI app from the backend to Vercel
# Vercel's Python runtime will import the module and look for an `app` variable.
from backend.main import app as app
