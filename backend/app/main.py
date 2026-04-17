from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.config import get_settings
from app.database import init_db
from app.middleware.logging import RequestLoggingMiddleware, configure_logging
from app.routers import auth_router, claim_router, health_router, payment_router, policy_router, user_router, weather_router, admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    app.state.redis = Redis.from_url(settings.redis_url, decode_responses=True)
    await init_db()
    yield
    redis_client = getattr(app.state, "redis", None)
    if redis_client:
        await redis_client.close()


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    description="Production-grade parametric income insurance API for delivery workers",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health + liveness (registered first so it's never behind auth middleware)
app.include_router(health_router)

# Auth endpoints — primary (OTP) + secondary (password)
app.include_router(auth_router)

# User profile + wallet
app.include_router(user_router)

# Policy management
app.include_router(policy_router)

# Payment + Razorpay integration
app.include_router(payment_router)

# Claims (manual submission + query)
app.include_router(claim_router)

# Weather / environmental data
app.include_router(weather_router)

app.include_router(admin_router.router)


@app.get("/", tags=["Health"])
async def health():
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}
