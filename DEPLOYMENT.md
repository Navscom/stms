Deployment guide — Free hosting options
=====================================

This repository contains a Vite React frontend and a FastAPI backend using Supabase.

Required environment variables (backend):
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_KEY` — your Supabase anon or service key
- `GEMINI_API_KEY` (optional) — for Gemini/AI features

Frontend needs `VITE_API_URL` to point at the deployed backend (example: `https://my-backend.fly.dev`).

Frontend (free, recommended: Vercel or Netlify)
---------------------------------------------
1. Push the repo to GitHub.
2. In Vercel, import the repo and set the project root to `/frontend`.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Set environment variable `VITE_API_URL` to your backend URL.
3. Deploy — Vercel will build and host the static site with HTTPS.

Backend (free options: Railway, Render, or Fly.io)
--------------------------------------------------
1. Push the repo to GitHub (root contains `backend/`).
2. In Railway or Render, create a new service and connect the GitHub repo; point the service to the `backend` folder.
   - Start command (Procfile present): `web: uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Runtime: Python 3.10+ (or pick available)
   - Install dependencies from `backend/requirements.txt`.
3. Set environment variables: `SUPABASE_URL`, `SUPABASE_KEY`, and optionally `GEMINI_API_KEY`.
4. Deploy. The platform will provide a public HTTPS URL (use it as `VITE_API_URL`).

Local quick test
----------------
From repo root:

```bash
# Start backend locally
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# In another terminal, start frontend
cd frontend
npm install
npm run dev
```

After backend deploy, make sure `VITE_API_URL` is set in the frontend hosting platform.

If you want, I can:
- create `backend/Procfile` (done)
- create a minimal GitHub Actions workflow to deploy frontend automatically
- assist pushing this repo to GitHub from your machine
