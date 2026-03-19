from fastapi import APIRouter
from app.services.weather_service import get_weather, get_forecast

router = APIRouter(
    prefix="/weather",
    tags=["Weather"]
)

@router.get("/")
def fetch_weather(lat: float, lon: float):
    return get_weather(lat, lon)

@router.get("/forecast")
def fetch_forecast(lat: float, lon: float):
    return get_forecast(lat, lon)