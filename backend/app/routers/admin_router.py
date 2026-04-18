"""
admin_router.py — EarnSafe Admin Controls

Security:
  - Admin login requires ADMIN_PHONE from environment (never hardcoded)
  - All simulation endpoints require a valid admin JWT
  - Simulation state stored in Redis (multi-worker safe, auto-expires in 2h)
"""

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.integrations.ai_client import (
    clear_simulation_state,
    get_live_risk_data,
    get_simulation_state,
    set_simulation_state,
)
from app.security import decode_access_token

router   = APIRouter(prefix="/admin", tags=["Admin Control"])
_bearer  = HTTPBearer(auto_error=False)


def _require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Dependency — validates JWT and checks admin role."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


@router.post("/login")
async def admin_login(data: dict = Body(...)) -> dict:
    """
    Admin login — phone must match ADMIN_PHONE env variable.
    Returns a plain success flag; real auth uses the main JWT flow.
    The phone is read from environment, never hardcoded.
    """
    settings    = get_settings()
    admin_phone = getattr(settings, "admin_phone", None)
    if not admin_phone:
        raise HTTPException(status_code=503, detail="Admin login not configured")
    if data.get("phone") != admin_phone:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"status": "success"}


@router.post("/start-simulation")
async def start_sim(
    request: Request,
    data: dict = Body(...),
    _admin: dict = Depends(_require_admin),
) -> dict:
    """
    Start a weather simulation. State stored in Redis so all workers see it.
    Broadcasts a WebSocket refresh to connected clients.
    Auto-expires after 2 hours if not manually stopped.
    """
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=503, detail="Redis not available")

    sim_state = {
        "active":       True,
        "temp":         float(data.get("temp",          25.0)),
        "rain":         float(data.get("rain",           0.0)),
        "aqi_pm25":     float(data.get("aqi",            1) * 25.0),  # slider 1-5 → PM2.5
        "traffic_score": float(data.get("traffic",       20)) / 100.0,
        "reason":       str(data.get("reason",          "Admin Simulation")),
    }
    await set_simulation_state(redis, sim_state)

    # Broadcast WebSocket refresh to all connected phones
    manager = getattr(request.app.state, "manager", None)
    if manager:
        await manager.broadcast({"type": "REFRESH_DATA"})

    return await get_live_risk_data(
        lat=float(data.get("lat",  13.0527)),
        lon=float(data.get("lon",  80.2017)),
        zone=str(data.get("zone", "Chennai")),
        tier=str(data.get("tier", "standard")),
        redis=redis,
    )


@router.post("/stop-simulation")
async def stop_sim(
    request: Request,
    data: dict = Body(default={}),
    _admin: dict = Depends(_require_admin),
) -> dict:
    """Stop simulation — clears Redis key and resumes live data."""
    redis = getattr(request.app.state, "redis", None)
    if not redis:
        raise HTTPException(status_code=503, detail="Redis not available")

    await clear_simulation_state(redis)

    manager = getattr(request.app.state, "manager", None)
    if manager:
        await manager.broadcast({"type": "REFRESH_DATA"})

    return await get_live_risk_data(
        lat=float(data.get("lat",  13.0527)),
        lon=float(data.get("lon",  80.2017)),
        zone=str(data.get("zone", "Chennai")),
        tier=str(data.get("tier", "standard")),
        redis=redis,
    )


@router.get("/simulation-status")
async def sim_status(
    request: Request,
    _admin: dict = Depends(_require_admin),
) -> dict:
    """Returns current simulation state (active or inactive)."""
    redis = getattr(request.app.state, "redis", None)
    sim   = await get_simulation_state(redis)
    return {"simulation_active": sim is not None, "state": sim}
