import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DbSession, get_redis_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    summary="Health check",
    description="Returns connectivity status for the app, database, and Redis cache.",
)
async def health_check(session: DbSession, redis: Redis = Depends(get_redis_client)):
    db_ok = False
    redis_ok = False
    db_error: str | None = None
    redis_error: str | None = None

    # ── DB liveness probe ────────────────────────────────────────────
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        db_error = str(exc)
        logger.error("Health check: DB probe failed", exc_info=True)

    # ── Redis liveness probe ─────────────────────────────────────────
    try:
        if redis:
            await redis.ping()
            redis_ok = True
        else:
            redis_error = "Redis client not configured"
    except Exception as exc:
        redis_error = str(exc)
        logger.error("Health check: Redis probe failed", exc_info=True)

    overall = "ok" if (db_ok and redis_ok) else "degraded"

    return {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "db": "connected" if db_ok else f"error: {db_error}",
            "redis": "connected" if redis_ok else f"error: {redis_error}",
        },
    }
