from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TriggerEvent, TriggerEventStatus
from app.repositories.policy_repository import PolicyRepository
from app.repositories.trigger_event_repository import TriggerEventRepository
from app.repositories.user_repository import UserRepository
from app.services.weather_service import WeatherService


class TriggerService:
    def __init__(self, session: AsyncSession, redis: Redis | None = None) -> None:
        self.session = session
        self.redis = redis
        self.user_repo = UserRepository(session)
        self.policy_repo = PolicyRepository(session)
        self.trigger_repo = TriggerEventRepository(session)
        self.weather_service = WeatherService(redis)

    async def poll_weather_for_active_users(self) -> int:
        users = await self.user_repo.list_active()
        created = 0
        for user in users:
            policy = await self.policy_repo.get_active_for_user(user.id)
            if not policy:
                continue
            data = await self.weather_service.get_weather_snapshot(lat=13.0827, lon=80.2707, zone=user.delivery_zone, tier=policy.plan_tier)
            if not data["triggers"]["disruption_active"]:
                continue
            event = TriggerEvent(
                user_id=user.id,
                policy_id=policy.id,
                zone=user.delivery_zone,
                event_type=data["active_disruption"],
                severity="high" if data["triggers"]["trigger_count"] >= 2 else "medium",
                status=TriggerEventStatus.detected,
                payload=data,
                eligible_for_claim=True,
                processed_at=datetime.now(timezone.utc),
            )
            try:
                await self.trigger_repo.create(event)
                await self.session.commit()
            except Exception:
                await self.session.rollback()
                raise
            created += 1
        return created

    async def process_pending_triggers(self) -> int:
        events = await self.trigger_repo.list_pending()
        for event in events:
            event.status = TriggerEventStatus.processed
            event.processed_at = datetime.now(timezone.utc)
        await self.session.commit()
        return len(events)
