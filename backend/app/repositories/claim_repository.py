from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Claim, ClaimStatus


class ClaimRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, claim: Claim) -> Claim:
        self.session.add(claim)
        await self.session.flush()
        await self.session.refresh(claim)
        return claim

    async def get_by_id(self, claim_id: int) -> Claim | None:
        return await self.session.get(Claim, claim_id)

    async def list_for_user(self, user_id: int) -> list[Claim]:
        result = await self.session.execute(select(Claim).where(Claim.user_id == user_id).order_by(Claim.id.desc()))
        return list(result.scalars().all())

    async def list_pending(self) -> list[Claim]:
        result = await self.session.execute(
            select(Claim).where(Claim.status == ClaimStatus.pending).order_by(Claim.id.asc())
        )
        return list(result.scalars().all())

    async def count_by_user_and_disruption(self, user_id: int, disruption_type: str) -> int:
        result = await self.session.execute(
            select(Claim).where(Claim.user_id == user_id, Claim.disruption_type == disruption_type)
        )
        return len(result.scalars().all())

    # ------------------------------------------------------------------
    # Weekly limit helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _week_window_start() -> datetime:
        """
        Rolling 7-day window anchored to now.
        Safer than ISO week (avoids timezone resets and year-boundary weirdness).
        """
        return datetime.now(timezone.utc) - timedelta(days=7)

    async def count_this_week_for_update(self, user_id: int) -> int:
        """
        Count active claims submitted in the last 7 days.
        Uses SELECT FOR UPDATE to prevent race conditions — always call
        inside an active DB transaction.
        """
        window_start = self._week_window_start()
        result = await self.session.execute(
            select(Claim)
            .where(
                Claim.user_id == user_id,
                Claim.created_at >= window_start,
                Claim.status.in_([ClaimStatus.triggered, ClaimStatus.approved, ClaimStatus.paid]),
            )
            .with_for_update()
        )
        return len(result.scalars().all())

    async def get_last_paid_claim(self, user_id: int) -> Claim | None:
        """Return the most recent paid claim for cooldown check."""
        result = await self.session.execute(
            select(Claim)
            .where(Claim.user_id == user_id, Claim.status == ClaimStatus.paid)
            .order_by(Claim.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def weekly_payout_total(self, user_id: int) -> Decimal:
        """
        Sum of claim_amount for paid claims in the rolling 7-day window.
        Used to enforce the max_weekly_payout cap per policy.
        """
        window_start = self._week_window_start()
        result = await self.session.execute(
            select(func.coalesce(func.sum(Claim.claim_amount), 0)).where(
                Claim.user_id == user_id,
                Claim.status == ClaimStatus.paid,
                Claim.created_at >= window_start,
            )
        )
        total = result.scalar_one()
        return Decimal(str(total))
