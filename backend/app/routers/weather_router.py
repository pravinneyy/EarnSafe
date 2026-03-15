from fastapi import APIRouter
from app.services.weather_service import get_weather

router = APIRouter(
    prefix="/weather",
    tags=["Weather"]
)

@router.get("/")
def fetch_weather(lat: float, lon: float):
    return get_weather(lat, lon)