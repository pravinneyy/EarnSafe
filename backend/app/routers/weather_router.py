from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_redis_client
from app.integrations.ai_client import _build_fallback_snapshot
from app.models import User
from app.services.weather_service import WeatherService

router = APIRouter(prefix="/weather", tags=["Weather"])


async def _safe_weather(
    lat: float,
    lon: float,
    zone: str,
    tier: str,
    redis,
    temperature: float | None = None,
    aqi: float | None = None,
    rainfall: float | None = None,
) -> dict:
    """Always returns weather data — never raises. Falls back to synthetic snapshot."""
    try:
        return await WeatherService(redis).get_weather_snapshot(
            lat=lat,
            lon=lon,
            zone=zone,
            tier=tier,
            temperature=temperature,
            aqi=aqi,
            rainfall=rainfall,
        )
    except Exception as exc:  # noqa: BLE001
        return _build_fallback_snapshot(lat=lat, lon=lon, zone=zone, tier=tier, reason=str(exc))




@router.get("/")
async def get_weather_data(
    lat: float,
    lon: float,
    zone: str = Query("Chennai"),
    tier: str = Query("standard"),
    # --- ADD THESE OPTIONAL PARAMS ---
    temperature: float = Query(None),
    aqi: float = Query(None),
    rainfall: float = Query(None),
    # ---------------------------------
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis_client),
):
    _ = current_user

    return await _safe_weather(
        lat=lat,
        lon=lon,
        zone=zone,
        tier=tier,
        redis=redis,
        temperature=temperature,
        aqi=aqi,
        rainfall=rainfall,
    )


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
    return await _safe_weather(lat, lon, zone, tier, redis)
