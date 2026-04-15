from sqlalchemy import select
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
        result = await self.session.execute(select(Claim).where(Claim.status == ClaimStatus.pending).order_by(Claim.id.asc()))
        return list(result.scalars().all())

    async def count_by_user_and_disruption(self, user_id: int, disruption_type: str) -> int:
        result = await self.session.execute(
            select(Claim).where(Claim.user_id == user_id, Claim.disruption_type == disruption_type)
        )
        return len(result.scalars().all())
