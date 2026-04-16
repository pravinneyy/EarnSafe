from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Wallet, WalletTransaction


class WalletRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_user_id(self, user_id: int) -> Wallet | None:
        result = await self.session.execute(select(Wallet).where(Wallet.user_id == user_id))
        return result.scalar_one_or_none()

    async def get_for_update(self, user_id: int) -> Wallet | None:
        """Acquire a row-level lock — use inside an active transaction."""
        result = await self.session.execute(
            select(Wallet).where(Wallet.user_id == user_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def create(self, wallet: Wallet) -> Wallet:
        self.session.add(wallet)
        await self.session.flush()
        await self.session.refresh(wallet)
        return wallet

    async def transaction_exists(self, claim_id: int) -> bool:
        """Check whether a WalletTransaction already exists for this claim (idempotency guard)."""
        result = await self.session.execute(
            select(WalletTransaction.id).where(WalletTransaction.claim_id == claim_id)
        )
        return result.scalar_one_or_none() is not None

    async def create_transaction(self, txn: WalletTransaction) -> WalletTransaction:
        self.session.add(txn)
        await self.session.flush()
        await self.session.refresh(txn)
        return txn
