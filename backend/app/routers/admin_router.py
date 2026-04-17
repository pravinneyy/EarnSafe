from fastapi import APIRouter, Body, HTTPException, Request

from app.dependencies import DbSession
from app.integrations.ai_client import SYSTEM_SIMULATION, get_live_risk_data
from app.services.trigger_engine import TriggerEngine
from app.services.trigger_service import TriggerService

router = APIRouter(prefix="/admin", tags=["Admin Control"])


async def _build_admin_snapshot(
    request: Request,
    *,
    lat: float,
    lon: float,
    zone: str,
    tier: str,
) -> dict:
    redis = getattr(request.app.state, "redis", None)
    return await get_live_risk_data(
        lat=lat,
        lon=lon,
        zone=zone,
        tier=tier,
        redis=redis,
    )


async def _run_claim_sync(session: DbSession, request: Request) -> dict:
    redis = getattr(request.app.state, "redis", None)
    trigger_service = TriggerService(session, redis)
    created_events = await trigger_service.poll_weather_for_active_users()
    pipeline_summary = await TriggerEngine(session).run_claim_pipeline()
    return {
        "events_detected": created_events,
        "pipeline_summary": pipeline_summary,
    }

@router.post("/login")
async def admin_login(data: dict = Body(...)):
    if data.get("phone") == "8754470200": 
        return {"status": "success"}
    raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/start-simulation")
async def start_sim(
    request: Request,
    session: DbSession,
    data: dict = Body(...),
):
    lat = float(data.get("lat", 13.0527))
    lon = float(data.get("lon", 80.2017))
    zone = str(data.get("zone", "Chennai"))
    tier = str(data.get("tier", "standard"))

    SYSTEM_SIMULATION["active"] = True
    SYSTEM_SIMULATION["temp"] = float(data.get("temp", 25))
    SYSTEM_SIMULATION["rain"] = float(data.get("rain", 0))
    SYSTEM_SIMULATION["aqi"] = int(data.get("aqi", 1))
    SYSTEM_SIMULATION["traffic"] = int(data.get("traffic", 20))

    response = await _build_admin_snapshot(
        request,
        lat=lat,
        lon=lon,
        zone=zone,
        tier=tier,
    )
    response["claim_sync"] = await _run_claim_sync(session, request)

    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})
    return response

@router.post("/stop-simulation")
async def stop_sim(request: Request, data: dict = Body(default={})):
    lat = float(data.get("lat", 13.0527))
    lon = float(data.get("lon", 80.2017))
    zone = str(data.get("zone", "Chennai"))
    tier = str(data.get("tier", "standard"))

    SYSTEM_SIMULATION["active"] = False

    # Trigger instant WebSocket update to phones
    manager = request.app.state.manager
    await manager.broadcast({"type": "REFRESH_DATA"})

    return await _build_admin_snapshot(
        request,
        lat=lat,
        lon=lon,
        zone=zone,
        tier=tier,
    )
