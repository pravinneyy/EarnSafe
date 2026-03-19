import requests

# Test the AI premium endpoint on the main backend
url = "http://127.0.0.1:8000/policy/ai-premium"

params = {
    "zone": "Velachery",
    "persona": "Food",
    "tier": "standard"
}

print(f"Sending request to AI Engine at {url}...")

try:
    response = requests.get(url, params=params)

    print("\n✅ SUCCESS! Here is the AI premium data:")
    print(response.json())

except Exception as e:
    print(f"\n❌ ERROR: Could not connect. {e}")


# Also test the standalone FastAPI wrapper (if running on port 8001)
print("\n--- Testing standalone AI wrapper (port 8001) ---")
standalone_url = "http://127.0.0.1:8001/api/v1/calculate-premium"
payload = {
    "zone": "Velachery",
    "delivery_persona": "Food",
    "tier": "standard"
}

try:
    response = requests.post(standalone_url, json=payload)
    print("✅ Standalone API response:")
    print(response.json())
except Exception as e:
    print(f"⚠️ Standalone server not running (this is OK if using the main backend): {e}")