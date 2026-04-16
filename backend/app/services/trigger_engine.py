"""
Trigger Engine — core automated pipeline for EarnSafe parametric insurance.

Flow per trigger event (each in its own DB savepoint):
  TriggerEvent(detected, eligible, claim_id=NULL)
    → policy check
    → cooldown check  (6h between paid claims)
    → weekly limit    (SELECT FOR UPDATE, max 2 per rolling 7-day window)
    → payout cap      (min(daily_coverage, remaining_weekly_cap))
    → zero-value guard
    → Claim(triggered → approved → paid)
    → WalletTransaction (idempotent — UNIQUE on claim_id)
    → TriggerEvent(processed, claim_id set)

Each event runs in its own savepoint so a failure on event N doesn't
roll back successfully committed events 1…N-1.
All steps are structured-logged for observability.
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Claim, ClaimStatus, TriggerEvent, TriggerEventStatus
from app.repositories.claim_repository import ClaimRepository
from app.repositories.policy_repository import PolicyRepository
from app.repositories.trigger_event_repository import TriggerEventRepository
from app.services.wallet_service import WalletService

logger = logging.getLogger(__name__)

# ─── Configuration constants ────────────────────────────────────────────────
WEEKLY_CLAIM_LIMIT = 2          # max claims per rolling 7-day window
CLAIM_COOLDOWN_HOURS = 6        # min hours between consecutive paid claims
# ────────────────────────────────────────────────────────────────────────────


class TriggerEngine:
    """
    Converts eligible TriggerEvents into paid Claims and wallet credits.
    Designed to be called from a Celery periodic task.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.claim_repo = ClaimRepository(session)
        self.policy_repo = PolicyRepository(session)
        self.trigger_repo = TriggerEventRepository(session)
        self.wallet_service = WalletService(session)

    async def run_claim_pipeline(self) -> dict:
        """
        Process all unhandled eligible trigger events.

        Each event runs inside its own savepoint (BEGIN SAVEPOINT … RELEASE /
        ROLLBACK TO SAVEPOINT). A failure on one event does not affect others.

        Returns a summary dict suitable for Celery task result / monitoring.
        """
        events = await self.trigger_repo.list_eligible_unprocessed()
        logger.info(
            "TriggerEngine: pipeline started",
            extra={"eligible_events": len(events)},
        )

        processed = 0
        skipped_no_policy = 0
        skipped_cooldown = 0
        skipped_weekly_limit = 0
        skipped_cap_exhausted = 0
        errors = 0

        for event in events:
            try:
                # Each event gets its own savepoint — atomic, isolated, and safe
                # to retry individually.  session.begin_nested() issues a
                # SAVEPOINT; on __aexit__ it either RELEASEs or ROLLBACKs it.
                async with self.session.begin_nested() as savepoint:
                    result = await self._process_event(event, savepoint)

                # Commit the outer session after each successful savepoint release
                await self.session.commit()

                if result == "claimed":
                    processed += 1
                elif result == "no_policy":
                    skipped_no_policy += 1
                elif result == "cooldown":
                    skipped_cooldown += 1
                elif result == "weekly_limit":
                    skipped_weekly_limit += 1
                elif result == "cap_exhausted":
                    skipped_cap_exhausted += 1

            except Exception as exc:
                errors += 1
                logger.error(
                    "TriggerEngine: error processing event — savepoint rolled back",
                    extra={"event_id": event.id, "error": str(exc)},
                    exc_info=True,
                )
                # The savepoint context manager already issued ROLLBACK TO SAVEPOINT.
                # The outer session stays alive for the next event.

        summary = {
            "processed": processed,
            "skipped_no_policy": skipped_no_policy,
            "skipped_cooldown": skipped_cooldown,
            "skipped_weekly_limit": skipped_weekly_limit,
            "skipped_cap_exhausted": skipped_cap_exhausted,
            "errors": errors,
        }
        logger.info("TriggerEngine: pipeline complete", extra=summary)
        return summary

    async def _process_event(self, event: TriggerEvent, savepoint) -> str:
        """
        Process a single trigger event within the caller's savepoint.
        Returns a string tag describing the outcome.
        Does NOT call session.commit() — the savepoint context handles that.
        """
        user_id = event.user_id

        # ── 1. Check for active policy ───────────────────────────────────────
        policy = await self.policy_repo.get_active_for_user(user_id)
        if not policy:
            logger.info(
                "TriggerEngine: skipping event — no active policy",
                extra={"event_id": event.id, "user_id": user_id},
            )
            return "no_policy"

        # ── 2. Cooldown — ≥ CLAIM_COOLDOWN_HOURS since last paid claim ───────
        last_claim = await self.claim_repo.get_last_paid_claim(user_id)
        if last_claim and last_claim.created_at:
            elapsed = datetime.now(timezone.utc) - last_claim.created_at.replace(tzinfo=timezone.utc)
            if elapsed < timedelta(hours=CLAIM_COOLDOWN_HOURS):
                logger.info(
                    "TriggerEngine: skipping event — cooldown active",
                    extra={
                        "event_id": event.id,
                        "user_id": user_id,
                        "hours_since_last_claim": round(elapsed.total_seconds() / 3600, 2),
                        "cooldown_hours": CLAIM_COOLDOWN_HOURS,
                    },
                )
                return "cooldown"

        # ── 3. Weekly claim limit — SELECT FOR UPDATE (anti-race) ────────────
        weekly_count = await self.claim_repo.count_this_week_for_update(user_id)
        if weekly_count >= WEEKLY_CLAIM_LIMIT:
            logger.info(
                "TriggerEngine: skipping event — weekly claim limit reached",
                extra={
                    "event_id": event.id,
                    "user_id": user_id,
                    "claims_this_week": weekly_count,
                    "limit": WEEKLY_CLAIM_LIMIT,
                },
            )
            return "weekly_limit"

        # ── 4. Weekly payout cap ─────────────────────────────────────────────
        weekly_paid = await self.claim_repo.weekly_payout_total(user_id)
        max_weekly = Decimal(str(policy.max_weekly_payout))
        remaining_cap = max_weekly - weekly_paid

        if remaining_cap <= Decimal("0"):
            logger.info(
                "TriggerEngine: skipping event — weekly payout cap exhausted",
                extra={
                    "event_id": event.id,
                    "user_id": user_id,
                    "weekly_paid": str(weekly_paid),
                    "max_weekly_payout": str(max_weekly),
                },
            )
            return "cap_exhausted"

        # ── 5. Compute claim amount — defensive zero guard ───────────────────
        daily_coverage = Decimal(str(policy.daily_coverage))
        claim_amount = min(daily_coverage, remaining_cap)

        if claim_amount <= Decimal("0"):
            logger.info(
                "TriggerEngine: skipping event — computed claim amount is zero",
                extra={
                    "event_id": event.id,
                    "user_id": user_id,
                    "daily_coverage": str(daily_coverage),
                    "remaining_cap": str(remaining_cap),
                },
            )
            return "cap_exhausted"

        # ── 6. Create Claim (status=triggered, source=auto) ──────────────────
        now = datetime.now(timezone.utc)
        claim = Claim(
            user_id=user_id,
            policy_id=policy.id,
            trigger_event_id=event.id,
            disruption_type=event.event_type,
            hours_lost=0.0,           # parametric — no hours tracked
            claim_amount=float(claim_amount),
            fraud_score=0.0,          # parametric — objective weather condition
            status=ClaimStatus.triggered,
            source="auto",            # TriggerEngine origin
            reason=f"Auto-triggered by event {event.public_id} ({event.event_type})",
            processed_at=now,
        )
        self.session.add(claim)
        await self.session.flush()    # get claim.id before FK linkage
        await self.session.refresh(claim)

        logger.info(
            "TriggerEngine: claim created",
            extra={
                "claim_id": claim.id,
                "event_id": event.id,
                "user_id": user_id,
                "amount": str(claim_amount),
                "disruption_type": event.event_type,
            },
        )

        # ── 7. Advance: triggered → approved → paid ──────────────────────────
        claim.status = ClaimStatus.approved
        await self.session.flush()

        claim.status = ClaimStatus.paid
        claim.processed_at = datetime.now(timezone.utc)
        await self.session.flush()

        # ── 8. Credit wallet — idempotent (UNIQUE constraint on claim_id) ────
        wallet = await self.wallet_service.credit_idempotent(
            user_id=user_id,
            claim_id=claim.id,
            amount=claim_amount,
        )

        logger.info(
            "TriggerEngine: wallet credited",
            extra={
                "user_id": user_id,
                "claim_id": claim.id,
                "amount": str(claim_amount),
                "new_balance": str(wallet.balance),
            },
        )

        # ── 9. Mark trigger event as processed, link claim ───────────────────
        event.status = TriggerEventStatus.processed
        event.claim_id = claim.id
        event.processed_at = datetime.now(timezone.utc)

        await self.session.flush()   # flush inside savepoint; caller commits

        logger.info(
            "TriggerEngine: event fully processed",
            extra={"event_id": event.id, "claim_id": claim.id},
        )
        return "claimed"
