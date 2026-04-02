from fastapi import APIRouter, HTTPException
from app.services.weather_service import get_weather, get_forecast
from app.services.traffic_service import get_traffic_status

router = APIRouter(prefix="/weather", tags=["Weather"])

@router.get("/")
def fetch_hyperlocal_status(lat: float, lon: float):
    
    # 1. Get Weather & AQI
    weather_data = get_weather(lat, lon)
    if "error" in weather_data:
        raise HTTPException(status_code=500, detail=weather_data["error"])
    
    # 2. Get Traffic from TomTom 
    try:
        traffic_data = get_traffic_status(lat, lon)
    except Exception as e:
        print(f"Traffic Service Error: {e}")
        traffic_data = {"is_gridlock": False, "congestion_level": 0}
    
    
    is_disrupted = False
    reasons = []

    
    if weather_data.get("rain", 0) > 5:
        is_disrupted = True
        reasons.append("Heavy Rain")

    
    if traffic_data.get("is_gridlock"):
        is_disrupted = True
        reasons.append("Severe Traffic Gridlock")

    
    if weather_data.get("pm25", 0) > 150: 
        is_disrupted = True
        reasons.append("Hazardous Air Quality")

    
    analysis = weather_data.get("parametric_analysis", {})
    
    
    weather_data["parametric_analysis"] = {
        "is_disrupted": is_disrupted or analysis.get("is_disrupted", False),
        "disruption_reason": " & ".join(reasons) if reasons else analysis.get("disruption_reason", "Normal"),
        "traffic_congestion": traffic_data.get("congestion_level"),
        "payout_eligible": is_disrupted or analysis.get("is_disrupted", False)
    }
    
    return weather_data


@router.get("/forecast")
def fetch_forecast(lat: float, lon: float):
    forecast_data = get_forecast(lat, lon)
    if "error" in forecast_data:
        raise HTTPException(status_code=500, detail=forecast_data["error"])
    return forecast_data