from redis.asyncio import Redis

from app.integrations.ai_client import get_live_risk_data




class WeatherService:
    def __init__(self, redis: Redis | None = None) -> None:
        self.redis = redis

    async def get_weather_snapshot(
        self,
        *,
        lat: float,
        lon: float,
        zone: str = "Chennai",
        tier: str = "standard",
        
        temperature: float = None,
        aqi: float = None,
        rainfall: float = None
    ) -> dict:
        return await get_live_risk_data(
            lat=lat,
            lon=lon,
            zone=zone,
            tier=tier,
            redis=self.redis,
            
            sim_temp=temperature,
            sim_aqi=aqi,
            sim_rain=rainfall
        )
