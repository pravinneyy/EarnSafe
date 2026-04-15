import asyncio

from app.database import SessionLocal
from app.models import ClaimStatus
from app.repositories.claim_repository import ClaimRepository
from app.services.trigger_service import TriggerService
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.poll_weather")
def poll_weather() -> int:
    async def _run() -> int:
        async with SessionLocal() as session:
            return await TriggerService(session).poll_weather_for_active_users()

    return asyncio.run(_run())


@celery_app.task(name="app.workers.tasks.evaluate_triggers")
def evaluate_triggers() -> int:
    async def _run() -> int:
        async with SessionLocal() as session:
            return await TriggerService(session).process_pending_triggers()

    return asyncio.run(_run())


@celery_app.task(name="app.workers.tasks.auto_process_claims")
def auto_process_claims() -> int:
    async def _run() -> int:
        async with SessionLocal() as session:
            repo = ClaimRepository(session)
            claims = await repo.list_pending()
            processed = 0
            for claim in claims:
                if claim.status == ClaimStatus.pending:
                    claim.status = ClaimStatus.processing
                    processed += 1
            await session.commit()
            return processed

    return asyncio.run(_run())
