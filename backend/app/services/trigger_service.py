from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TriggerEvent, TriggerEventStatus
from app.repositories.policy_repository import PolicyRepository
from app.repositories.trigger_event_repository import TriggerEventRepository
from app.repositories.user_repository import UserRepository
from app.services.trigger_engine import CLAIM_COOLDOWN_MINUTES, TriggerEngine
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
            event_type = data["active_disruption"]
            recent_event = await self.trigger_repo.get_recent_similar_event(
                user_id=user.id,
                event_type=event_type,
                since=datetime.now(timezone.utc) - timedelta(minutes=CLAIM_COOLDOWN_MINUTES),
            )
            if recent_event is not None:
                continue
            event = TriggerEvent(
                user_id=user.id,
                policy_id=policy.id,
                zone=user.delivery_zone,
                event_type=event_type,
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

    async def sync_live_claim_for_user(self, user_id: int) -> dict[str, Any]:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return {"status": "user_not_found", "disruption_active": False, "claim_sync": None}

        policy = await self.policy_repo.get_active_for_user(user_id)
        if not policy:
            return {"status": "no_policy", "disruption_active": False, "claim_sync": None}

        data = await self.weather_service.get_weather_snapshot(
            lat=13.0827,
            lon=80.2707,
            zone=user.delivery_zone,
            tier=policy.plan_tier,
        )
        if not data["triggers"]["disruption_active"]:
            return {"status": "no_disruption", "disruption_active": False, "claim_sync": None}

        event_type = data["active_disruption"]
        recent_event = await self.trigger_repo.get_recent_similar_event(
            user_id=user_id,
            event_type=event_type,
            since=datetime.now(timezone.utc) - timedelta(minutes=CLAIM_COOLDOWN_MINUTES),
        )

        event_created = False
        if recent_event is None:
            event = TriggerEvent(
                user_id=user.id,
                policy_id=policy.id,
                zone=user.delivery_zone,
                event_type=event_type,
                severity="high" if data["triggers"]["trigger_count"] >= 2 else "medium",
                status=TriggerEventStatus.detected,
                payload=data,
                eligible_for_claim=True,
                processed_at=datetime.now(timezone.utc),
            )
            await self.trigger_repo.create(event)
            await self.session.flush()
            event_created = True

        summary = await TriggerEngine(self.session).run_claim_pipeline(user_id=user_id)
        return {
            "status": "processed" if event_created or summary["processed"] > 0 else "already_synced",
            "disruption_active": True,
            "event_type": event_type,
            "event_created": event_created,
            "claim_sync": summary,
        }
