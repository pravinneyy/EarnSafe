from fastapi import APIRouter, HTTPException, Query
from app.services import weather_service, ai_service
from app.services.traffic_service import get_traffic_status
from typing import Optional

router = APIRouter(prefix="/weather", tags=["Weather"])

@router.get("/")
def get_unified_weather_analysis(
    lat: float, 
    lon: float, 
    temperature: Optional[float] = Query(None), 
    aqi: Optional[int] = Query(None), 
    rainfall: Optional[float] = Query(None)
):
    
    data = weather_service.get_weather(lat, lon, m_temp=temperature, m_aqi=aqi, m_rain=rainfall)
    
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])

    
    try:
        traffic = get_traffic_status(lat, lon)
    except:
        traffic = {"is_gridlock": False, "congestion_level": 0}

    # 3. Fetch ML Score (The fix for static values)
    try:
        ml = ai_service.predict_risk_with_weather(
            zone="Chennai", 
            delivery_persona="Food", 
            tier="standard",
            rain_mm=data.get("rain", 0.0),
            temp_c=data.get("temperature", 30.0),
            aqi_pm25=data.get("pm25", 25.0)
        )
        data["risk_score"] = ml.get("ai_risk_score", 0.0)
    except Exception as e:
        print(f"ML Processing Error: {e}")
        data["risk_score"] = 0.0

    
    
    analysis = data.get("parametric_analysis", {})
    is_disrupted = analysis.get("is_disrupted", False)
    reasons = [analysis.get("disruption_reason")] if analysis.get("disruption_reason") else []

    if traffic.get("is_gridlock"):
        is_disrupted = True
        reasons.append("Severe Traffic Gridlock")

    # We must keep the payout_factor from the weather_service analysis!
    data["parametric_analysis"] = {
        "is_disrupted": is_disrupted,
        "disruption_reason": " & ".join([r for r in reasons if r]),
        "traffic_congestion": traffic.get("congestion_level"),
        "payout_eligible": is_disrupted,
        "payout_factor": analysis.get("payout_factor", 0.0) # <--- ADD THIS LINE
    }
    
    return data

@router.get("/forecast")
def fetch_forecast(lat: float, lon: float):
    return weather_service.get_forecast(lat, lon)