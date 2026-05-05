# Smart Tourism Management System

Capstone title: **Design and Development of a Smart Tourism Management System with AI-Based Geolocation Guidance and Crowd Monitoring**

## Added Safety Map Features

- Users can click the map to select their location.
- Users can turn on **Add Danger Pin** and click the map to report danger/warning areas.
- The map shows danger zones using circles based on the reported radius.
- The system checks nearby warnings such as:
  - Danger zones
  - Wildlife / animal sightings
  - Dark areas during night mode
  - General warnings
- The system alerts users when they are near dangerous animals, wildlife, danger zones, or dark areas.
- The system can recommend a safer route when danger or dark areas are detected ahead.

## Run Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

## Admin Login

```text
admin@stms.com
admin123
```

## How to Use Safety Features

1. Click anywhere on the map to set your current/starting location.
2. Click **Add Danger Pin**, then click on the map to report a warning.
3. Click **Night Mode / Dark Areas** to include dark-area warnings.
4. Click **Recommend Safer Route**, then click your destination on the map.
5. The system will show a direct route or a safer detour if danger is detected.
