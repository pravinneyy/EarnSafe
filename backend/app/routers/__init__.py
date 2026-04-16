from app.routers.auth_router import router as auth_router
from app.routers.claim_router import router as claim_router
from app.routers.health_router import router as health_router
from app.routers.payment_router import router as payment_router
from app.routers.policy_router import router as policy_router
from app.routers.user_router import router as user_router
from app.routers.weather_router import router as weather_router

__all__ = [
    "auth_router",
    "claim_router",
    "health_router",
    "payment_router",
    "policy_router",
    "user_router",
    "weather_router",
]
