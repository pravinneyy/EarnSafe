from decimal import Decimal
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Wallet, WalletTransaction
from app.repositories.claim_repository import ClaimRepository
from app.repositories.policy_repository import PolicyRepository
from app.repositories.wallet_repository import WalletRepository
from app.services.exceptions import NotFoundError


class WalletService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.wallet_repo = WalletRepository(session)
        self.claim_repo = ClaimRepository(session)
        self.policy_repo = PolicyRepository(session)

    async def get_or_create_wallet(self, user_id: int) -> Wallet:
        """
        Idempotent — returns existing wallet or creates one with balance=0.00.
        Does NOT commit — callers own their transaction boundaries.
        """
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if wallet:
            return wallet
        wallet = Wallet(user_id=user_id, balance=Decimal("0.00"))
        await self.wallet_repo.create(wallet)
        # No commit here — caller commits (AuthService, TriggerEngine, etc.)
        return wallet

    async def get_balance(self, user_id: int) -> Decimal:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            raise NotFoundError("Wallet not found for user")
        return Decimal(str(wallet.balance))

    async def get_wallet(self, user_id: int) -> Wallet:
        wallet = await self.wallet_repo.get_by_user_id(user_id)
        if not wallet:
            raise NotFoundError("Wallet not found for user")
        return wallet

    async def credit_idempotent(self, user_id: int, claim_id: int, amount: Decimal) -> Wallet:
        """
        Credit the wallet for a given claim.

        Idempotency guarantee:
          - WalletTransaction has a UNIQUE constraint on claim_id.
          - If this method is called twice for the same claim (Celery retry),
            the second call is a no-op and returns the current wallet state.

        Safety:
          - Uses SELECT FOR UPDATE on the wallet row to prevent concurrent
            double-credits when multiple Celery workers run simultaneously.
        """
        # Idempotency check — already credited for this claim?
        if await self.wallet_repo.transaction_exists(claim_id):
            wallet = await self.wallet_repo.get_by_user_id(user_id)
            return wallet  # already processed, return current state

        # Lock the wallet row for the duration of this transaction
        wallet = await self.wallet_repo.get_for_update(user_id)
        if not wallet:
            # Wallet may not exist for very old users created before this feature
            wallet = Wallet(user_id=user_id, balance=Decimal("0.00"))
            await self.wallet_repo.create(wallet)

        # Apply the credit
        current_balance = Decimal(str(wallet.balance))
        wallet.balance = current_balance + amount
        wallet.updated_at = datetime.now(timezone.utc)

        # Record the transaction for idempotency
        txn = WalletTransaction(
            user_id=user_id,
            claim_id=claim_id,
            amount=amount,
            created_at=datetime.now(timezone.utc),
        )
        await self.wallet_repo.create_transaction(txn)

        # Flush so updated wallet balance is reflected before caller commits
        await self.session.flush()
        await self.session.refresh(wallet)
        return wallet

    async def get_wallet_summary(self, user_id: int) -> dict:
        """
        Returns everything the Wallet screen needs in one call.
        Returns a zeroed summary if no wallet exists yet (instead of 404).
        """
        from app.models import ClaimStatus

        wallet = await self.wallet_repo.get_by_user_id(user_id)

        # ── All-time claims ──────────────────────────────────────────────────
        all_claims = await self.claim_repo.list_for_user(user_id)
        total_claims = len(all_claims)

        # ── Weekly window (rolling 7 days) ───────────────────────────────────
        # Use naive UTC to safely compare with DB timestamps that may be naive
        window_start_naive = datetime.utcnow() - timedelta(days=7)

        _weekly_statuses = {ClaimStatus.paid, ClaimStatus.approved, ClaimStatus.triggered}

        def _in_window(c) -> bool:
            if not c.created_at:
                return False
            ts = c.created_at.replace(tzinfo=None)   # strip tz → naive UTC
            return ts >= window_start_naive

        weekly_claim_count = sum(
            1 for c in all_claims
            if _in_window(c) and c.status in _weekly_statuses
        )
        weekly_earned = sum(
            float(c.claim_amount)
            for c in all_claims
            if _in_window(c) and c.status == ClaimStatus.paid
        )

        # ── Policy cap ───────────────────────────────────────────────────────
        policy = await self.policy_repo.get_active_for_user(user_id)
        max_weekly_payout = float(policy.max_weekly_payout) if policy else None
        cap_exhausted = (
            max_weekly_payout is not None and weekly_earned >= max_weekly_payout
        )

        return {
            "balance": float(wallet.balance) if wallet else 0.0,
            "total_claims": total_claims,
            "weekly_earned": round(weekly_earned, 2),
            "weekly_claim_count": weekly_claim_count,
            "max_weekly_payout": max_weekly_payout,
            "cap_exhausted": cap_exhausted,
            "updated_at": wallet.updated_at if wallet else None,
        }
