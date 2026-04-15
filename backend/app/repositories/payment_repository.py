from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Payment


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, payment: Payment) -> Payment:
        self.session.add(payment)
        await self.session.flush()
        await self.session.refresh(payment)
        return payment

    async def get_by_provider_order_id(self, order_id: str) -> Payment | None:
        result = await self.session.execute(select(Payment).where(Payment.provider_order_id == order_id))
        return result.scalar_one_or_none()

    async def get_by_idempotency_key(self, idempotency_key: str) -> Payment | None:
        result = await self.session.execute(select(Payment).where(Payment.idempotency_key == idempotency_key))
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: int) -> list[Payment]:
        result = await self.session.execute(select(Payment).where(Payment.user_id == user_id).order_by(Payment.id.desc()))
        return list(result.scalars().all())
