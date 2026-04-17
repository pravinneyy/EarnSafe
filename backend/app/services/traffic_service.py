import httpx
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)

async def get_traffic_status(lat: float, lon: float):
    settings = get_settings()
    api_key = settings.tomtom_api_key
    
    # TomTom Flow Segment API
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={api_key}"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
        
        flow_data = data.get("flowSegmentData", {})
        current_speed = flow_data.get("currentSpeed", 0)
        free_flow_speed = flow_data.get("freeFlowSpeed", 1) 
        
        congestion_index = max(0, 1 - (current_speed / free_flow_speed))
        
        return {
            "current_speed": current_speed,
            "free_flow_speed": free_flow_speed,
            "congestion_level": round(congestion_index * 100, 2),
            "is_gridlock": congestion_index > 0.7 
        }
    except Exception as e:
        logger.error(f"TomTom API Error: {e}")
        return {"congestion_level": 0, "is_gridlock": False, "error": "API Unavailable"}