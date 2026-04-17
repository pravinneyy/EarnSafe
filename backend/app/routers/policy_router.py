from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import DbSession, get_current_user, get_redis_client
from app.models import User
from app.schemas import PolicyChangeRequest, PolicyCreate, PolicyResponse
from app.services.exceptions import ConflictError, NotFoundError, ValidationError
from app.services.policy_service import PolicyService

router = APIRouter(prefix="/policy", tags=["Policy"])


# ─── New token-based endpoints (registered FIRST, before wildcard routes) ─────

@router.get(
    "/",
    response_model=PolicyResponse | None,
    summary="Get current active policy",
    description="Returns the authenticated user's current active policy. Returns null if no policy is active.",
)
async def get_active_policy(session: DbSession, current_user: User = Depends(get_current_user)):
    return await PolicyService(session).get_active_policy(current_user.id)


@router.post(
    "/change",
    response_model=PolicyResponse,
    status_code=201,
    summary="Change policy plan tier",
    description=(
        "Switch to a different plan tier. Rate-limited to once per 7 days unless the current policy "
        "is expired or no policy exists."
    ),
)
async def change_policy(
    payload: PolicyChangeRequest,
    session: DbSession,
    current_user: User = Depends(get_current_user),
):
    try:
        return await PolicyService(session).change_policy(current_user.id, payload.plan_tier.value)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


# ─── AI / premium endpoints ───────────────────────────────────────────────────

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




@router.get("/triggers", tags=["AI"])
async def list_triggers(session: DbSession, current_user: User = Depends(get_current_user)):
    _ = current_user
    return await PolicyService(session).list_triggers()


# ─── Policy management (existing, preserved) ─────────────────────────────────

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
