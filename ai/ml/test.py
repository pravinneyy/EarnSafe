import requests

# The exact endpoint we built in FastAPI
url = "http://127.0.0.1:8000/api/v1/calculate-premium"

# The data your React Native app will send
payload = {
    "zone": "Velachery",
    "delivery_persona": "Food"
}

print(f"Sending request to AI Engine at {url}...")

try:
    # Ping the API
    response = requests.post(url, json=payload)
    
    # Print the exact JSON your frontend will receive
    print("\n✅ SUCCESS! Here is the data for your frontend:")
    print(response.json())
    
except Exception as e:
    print(f"\n❌ ERROR: Could not connect. {e}")