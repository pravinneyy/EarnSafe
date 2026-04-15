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
    ) -> dict:
        return await get_live_risk_data(
            lat=lat,
            lon=lon,
            zone=zone,
            tier=tier,
            redis=self.redis,
        )
