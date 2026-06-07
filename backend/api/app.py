"""Vercel Python entrypoint for the backend project.

Vercel imports this module and expects an `app` ASGI application variable.
This file re-exports the `app` defined in `backend/main.py` as a top-level
module when the backend is deployed from the `backend/` folder.
"""
from main import app as app
