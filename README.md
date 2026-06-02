Smart Tourism Management System

Capstone title: **Design and Development of a Smart Tourism Management System with AI-Based Geolocation Guidance and Crowd Monitoring**

## What the System Can Do

This application provides an integrated safety and tourism experience by combining interactive mapping, crowd monitoring, local hazard reporting, and route guidance.

- Interactive safety map
  - Users can click on the map to set their current location.
  - The map can display multiple warning markers and active danger zones.

- Hazard and incident reporting
  - Users can add danger pins for areas with hazards, wildlife sightings, dark zones, or other risks.
  - Each danger report can include type, description, radius, and duration.
  - The system renders warnings as circles and alerts nearby users when they approach dangerous zones.

- Crowd monitoring and predictions
  - Users can submit crowd reports for destinations.
  - The backend analyzes recent crowd data to identify patterns and make crowd-level predictions.
  - This helps tourists avoid crowded or unsafe spots.

- Route safety and detours
  - The backend can detect whether a planned route intersects a danger zone.
  - It can suggest safer detours to help users avoid reported risks.

- Community feedback and moderation
  - Users can post comments on markers to share additional context.
  - The system supports optional AI moderation and translation if the AI client is configured.

- AI-driven safety guidance
  - The backend can generate personalized travel and safety advice for a user location.
  - It can automatically create friendly crowd warning descriptions for busy areas.
  - It can moderate marker comments for spam/inappropriate content.
  - It can translate safety alerts into a preferred language.

- Admin and role management
  - Local admin access is available for managing system data and reviewing reports.
  - User roles can be updated through the database when needed.

## AI Requirements

To enable AI features, set one of these environment variables in the backend:

```bash
set GEMINI_API_KEY=your-gemini-api-key
# or
set GOOGLE_API_KEY=your-google-genai-api-key
```

Optionally, you can set a model name:

```bash
set GEMINI_MODEL=gemini-3.1-flash
```

## Backend Setup

1. Open a terminal and go to the backend folder:

```bash
cd backend
```

2. Create and activate a Python virtual environment:

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
# source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Configure environment variables:

```bash
set SUPABASE_URL=https://your-project.supabase.co
set SUPABASE_KEY=your-service-role-key
```

5. Start the backend API server:

```bash
uvicorn main:app --reload
```

## Frontend Setup

1. Open a new terminal and go to the frontend folder:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the frontend development server:

```bash
npm run dev
```

## Local Admin Login

Use the following credentials for local admin access:

```text
admin@stms.com
admin123
```

## User Workflow

1. Open the frontend application in your browser.
2. Click on the map to set your current or starting location.
3. Enable marker mode to report a hazard, dark area, crowded location, wildlife sighting, or other warning.
4. Add a description and place the marker on the map.
5. View nearby warnings and receive alerts if your path approaches an active danger zone.

## Notes

- The backend is Supabase-backed and stores destinations, crowd reports, danger pins, and marker comments.
- The system is designed for smart tourism guidance, crowd awareness, and local safety reporting.
- If you configure AI services, the backend can support comment moderation and alert translation.
