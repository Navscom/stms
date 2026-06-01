#!/usr/bin/env python3
import requests
import json
import time

time.sleep(2)  # Wait for server to be ready
print("Making request to /ai-advice...")
try:
    response = requests.get('http://127.0.0.1:8000/ai-advice?lat=40.7128&lng=-74.0060', timeout=15)
    print(f"Status: {response.status_code}")
    print(f"Response:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")
