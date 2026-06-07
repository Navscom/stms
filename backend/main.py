import os
import sys

# This file is an entrypoint wrapper for backend deployments. It keeps the
# application object small and delegates actual route registration to
# backend/app.py and backend/routes/*.
if __package__ in (None, ''):
    parent_dir = os.path.dirname(os.path.dirname(__file__))
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    from backend.app import app
    import backend.routes  # noqa: F401
else:
    from .app import app
    from . import routes  # noqa: F401

__all__ = ['app']
