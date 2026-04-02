import requests
from app.config import get_settings

def get_traffic_status(lat: float, lon: float):
    settings = get_settings()
    api_key = settings.tomtom_api_key # Make sure this is in your .env
    
    # TomTom Flow Segment API - gives speed vs free flow speed
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={api_key}"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        flow_data = data.get("flowSegmentData", {})
        current_speed = flow_data.get("currentSpeed", 0)
        free_flow_speed = flow_data.get("freeFlowSpeed", 1) # Avoid div by zero
        
        # Calculate congestion percentage (0% = clear, 100% = stopped)
        # In India, if speed is < 30% of normal, it's a gridlock.
        congestion_index = max(0, 1 - (current_speed / free_flow_speed))
        
        return {
            "current_speed": current_speed,
            "free_flow_speed": free_flow_speed,
            "congestion_level": round(congestion_index * 100, 2),
            "is_gridlock": congestion_index > 0.7  # Trigger if 70% slower than normal
        }
    except Exception as e:
        print(f"TomTom API Error: {e}")
        return {"congestion_level": 0, "is_gridlock": False, "error": "API Unavailable"}