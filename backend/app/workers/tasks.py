import asyncio
import logging

from app.database import SessionLocal
from app.services.trigger_engine import TriggerEngine
from app.services.trigger_service import TriggerService
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.tasks.poll_weather",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,       # exponential: 2s → 4s → 8s ...
    retry_backoff_max=60,     # capped at 60s
    max_retries=3,
)
def poll_weather(self) -> int:
    """
    Polls weather APIs for all active users and creates TriggerEvents
    when environmental conditions exceed parametric thresholds.
    Runs every 5 minutes (configured in celery_app.py beat schedule).

    autoretry_for=(Exception,) + retry_backoff handles transient API/DB failures
    gracefully without requiring manual retry logic.
    """
    async def _run() -> int:
        async with SessionLocal() as session:
            return await TriggerService(session).poll_weather_for_active_users()

    count = asyncio.run(_run())
    logger.info("poll_weather: created %d trigger events", count)
    return count


@celery_app.task(
    name="app.workers.tasks.process_triggers",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,       # exponential: 2s → 4s → 8s ...
    retry_backoff_max=60,
    max_retries=3,
)
def process_triggers(self) -> dict:
    """
    Runs the TriggerEngine pipeline:
      TriggerEvent(detected, eligible) → Claim(triggered→approved→paid) → Wallet credited

    Safety guarantees:
      - Per-event savepoints: event N failure doesn't affect events 1…N-1
      - Weekly claim limit (max 2 per rolling 7-day window, SELECT FOR UPDATE)
      - 6-hour cooldown between consecutive paid claims
      - Weekly payout cap: min(daily_coverage, remaining_cap)
      - Idempotent wallet credit (WalletTransaction UNIQUE on claim_id)
      - autoretry_for + retry_backoff: safe to re-run (idempotent by design)

    Runs every 60 seconds (configured in celery_app.py beat schedule).
    """
    async def _run() -> dict:
        async with SessionLocal() as session:
            engine = TriggerEngine(session)
            return await engine.run_claim_pipeline()

    summary = asyncio.run(_run())
    logger.info("process_triggers: pipeline complete", extra=summary)
    return summary
