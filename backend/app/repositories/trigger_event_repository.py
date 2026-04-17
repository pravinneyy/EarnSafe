from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TriggerEvent, TriggerEventStatus


class TriggerEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, event: TriggerEvent) -> TriggerEvent:
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def list_pending(self) -> list[TriggerEvent]:
        """Detected events not yet processed (legacy method, kept for compat)."""
        result = await self.session.execute(
            select(TriggerEvent).where(TriggerEvent.status == TriggerEventStatus.detected).order_by(TriggerEvent.id.asc())
        )
        return list(result.scalars().all())

    async def list_eligible_unprocessed(self) -> list[TriggerEvent]:
        """
        Fetch trigger events that are:
          - status = detected (not yet processed)
          - eligible_for_claim = True
          - claim_id IS NULL (no claim created yet — dedup guard)
        """
        result = await self.session.execute(
            select(TriggerEvent)
            .where(
                TriggerEvent.status == TriggerEventStatus.detected,
                TriggerEvent.eligible_for_claim.is_(True),
                TriggerEvent.claim_id.is_(None),
            )
            .order_by(TriggerEvent.id.asc())
        )
        return list(result.scalars().all())

    async def list_eligible_unprocessed_for_user(self, user_id: int) -> list[TriggerEvent]:
        result = await self.session.execute(
            select(TriggerEvent)
            .where(
                TriggerEvent.user_id == user_id,
                TriggerEvent.status == TriggerEventStatus.detected,
                TriggerEvent.eligible_for_claim.is_(True),
                TriggerEvent.claim_id.is_(None),
            )
            .order_by(TriggerEvent.id.asc())
        )
        return list(result.scalars().all())

    async def get_recent_similar_event(
        self,
        *,
        user_id: int,
        event_type: str,
        since: datetime,
    ) -> TriggerEvent | None:
        result = await self.session.execute(
            select(TriggerEvent)
            .where(
                TriggerEvent.user_id == user_id,
                TriggerEvent.event_type == event_type,
                TriggerEvent.created_at >= since,
            )
            .order_by(TriggerEvent.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: int) -> list[TriggerEvent]:
        result = await self.session.execute(
            select(TriggerEvent).where(TriggerEvent.user_id == user_id).order_by(TriggerEvent.id.desc())
        )
        return list(result.scalars().all())
