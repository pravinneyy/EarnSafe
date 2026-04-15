from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import DbSession, get_current_user, get_redis_client
from app.models import User
from app.schemas import PolicyCreate, PolicyResponse
from app.services.exceptions import ConflictError, NotFoundError, ValidationError
from app.services.policy_service import PolicyService

router = APIRouter(prefix="/policy", tags=["Policy"])


@router.get("/ai-premium", tags=["AI"])
async def get_ai_premium(
    session: DbSession,
    current_user: User = Depends(get_current_user),
    zone: str = Query(..., description="Delivery zone e.g. Velachery"),
    persona: str = Query(..., description="Delivery type e.g. Food"),
    tier: str = Query("standard", description="basic | standard | pro"),
):
    _ = current_user
    return {"status": "success", **(await PolicyService(session).get_ai_premium(zone=zone, persona=persona, tier=tier))}


@router.get("/ai-premium/live", tags=["AI"])
async def get_live_premium(
    session: DbSession,
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis_client),
    lat: float = Query(...),
    lon: float = Query(...),
    zone: str = Query("Chennai"),
    tier: str = Query("standard"),
):
    _ = current_user
    return {"status": "success", **(await PolicyService(session, redis).get_live_premium(lat=lat, lon=lon, zone=zone, tier=tier))}


@router.get("/ai-premium/simulate", tags=["AI"])
async def simulate_premium(
    session: DbSession,
    current_user: User = Depends(get_current_user),
    zone: str = Query(...),
    tier: str = Query("standard"),
    rain_mm: float = Query(60.0),
    temp_c: float = Query(28.0),
    aqi_pm25: float = Query(30.0),
    wind_kph: float = Query(12.0),
):
    _ = current_user
    return {
        "status": "success",
        **(await PolicyService(session).simulate_premium(
            zone=zone,
            tier=tier,
            rain_mm=rain_mm,
            temp_c=temp_c,
            aqi_pm25=aqi_pm25,
            wind_kph=wind_kph,
        )),
    }


@router.get("/ai-premium/demo", tags=["AI"])
async def demo_scenario(
    session: DbSession,
    current_user: User = Depends(get_current_user),
    scenario: str = Query("monsoon_flood"),
    tier: str = Query("standard"),
):
    _ = current_user
    try:
        return {"status": "success", **(await PolicyService(session).demo_scenario(scenario=scenario, tier=tier))}
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/ai-premium/demo/scenarios", tags=["AI"])
async def list_scenarios(session: DbSession, current_user: User = Depends(get_current_user)):
    _ = current_user
    return await PolicyService(session).list_demo_scenarios()


@router.get("/triggers", tags=["AI"])
async def list_triggers(session: DbSession, current_user: User = Depends(get_current_user)):
    _ = current_user
    return await PolicyService(session).list_triggers()


@router.post("/create", response_model=PolicyResponse, status_code=201)
async def create_policy(payload: PolicyCreate, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await PolicyService(session).create_policy(payload)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.get("/user/{user_id}", response_model=list[PolicyResponse])
async def get_user_policies(user_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await PolicyService(session).get_user_policies(user_id)


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(policy_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    try:
        policy = await PolicyService(session).get_policy(policy_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if policy.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return policy
