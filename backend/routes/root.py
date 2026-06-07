from ..app import app


@app.get("/")
def home():
    return {"status": "Smart Tourism Management System backend is running"}
