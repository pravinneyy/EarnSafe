from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Policy, PolicyStatus


class PolicyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, policy: Policy) -> Policy:
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy

    async def get_by_id(self, policy_id: int) -> Policy | None:
        result = await self.session.execute(
            select(Policy)
            .options(selectinload(Policy.payments), selectinload(Policy.claims))
            .where(Policy.id == policy_id)
        )
        return result.scalar_one_or_none()

    async def get_active_for_user(self, user_id: int) -> Policy | None:
        result = await self.session.execute(
            select(Policy).where(Policy.user_id == user_id, Policy.status == PolicyStatus.active)
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: int) -> list[Policy]:
        result = await self.session.execute(select(Policy).where(Policy.user_id == user_id).order_by(Policy.id.desc()))
        return list(result.scalars().all())
