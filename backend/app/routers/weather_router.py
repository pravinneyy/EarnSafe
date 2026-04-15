from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_redis_client
from app.models import User
from app.services.weather_service import WeatherService

router = APIRouter(prefix="/weather", tags=["Weather"])


@router.get("/")
async def get_weather_data(
    lat: float,
    lon: float,
    zone: str = Query("Chennai"),
    tier: str = Query("standard"),
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis_client),
):
    _ = current_user
    return await WeatherService(redis).get_weather_snapshot(lat=lat, lon=lon, zone=zone, tier=tier)


@router.get("/forecast")
async def fetch_forecast(
    lat: float,
    lon: float,
    zone: str = Query("Chennai"),
    tier: str = Query("standard"),
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis_client),
):
    _ = current_user
    return await WeatherService(redis).get_weather_snapshot(lat=lat, lon=lon, zone=zone, tier=tier)
