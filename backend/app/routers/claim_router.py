from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, get_current_user, get_redis_client
from app.models import User
from app.schemas import ClaimCreate, ClaimResponse
from app.services.claim_service import ClaimService
from app.services.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.services.trigger_service import TriggerService

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.get(
    "/",
    response_model=list[ClaimResponse],
    summary="Get my claims",
    description="Returns all claims for the authenticated user, ordered newest first.",
)
async def get_my_claims(session: DbSession, current_user: User = Depends(get_current_user)):
    return await ClaimService(session).get_user_claims(current_user.id)


@router.post("/sync-auto", summary="Sync automatic claims for current user")
async def sync_auto_claims(
    session: DbSession,
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis_client),
):
    return await TriggerService(session, redis).sync_live_claim_for_user(current_user.id)


@router.post("/submit", response_model=ClaimResponse, status_code=201)
async def submit_claim(claim: ClaimCreate, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != claim.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await ClaimService(session).submit_claim(claim)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except AuthorizationError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/user/{user_id}", response_model=list[ClaimResponse])
async def get_user_claims(user_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await ClaimService(session).get_user_claims(user_id)


@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(claim_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    try:
        claim = await ClaimService(session).get_claim(claim_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if claim.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return claim
