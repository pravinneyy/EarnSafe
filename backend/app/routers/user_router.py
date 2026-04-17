from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, get_current_user, get_redis_client
from app.models import User
from app.schemas import MeResponse, UserCreate, UserLogin, UserResponse, UserSessionResponse, WalletResponse, WalletSummaryResponse
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.services.wallet_service import WalletService

router = APIRouter(prefix="/users", tags=["Users"])


# ─── New token-based endpoints (registered FIRST so they take priority) ───────

@router.get(
    "/me",
    response_model=MeResponse,
    tags=["Profile"],
)
async def get_me(session: DbSession, current_user: User = Depends(get_current_user)):
    try:
        # REMOVED: redis argument
        return await AuthService(session).get_me(current_user.id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

@router.post("/register", response_model=UserSessionResponse, status_code=201)
async def register_user(user: UserCreate, session: DbSession):
    try:
        return await AuthService(session).register(user)
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

@router.post("/login", response_model=UserSessionResponse)
async def login_user(credentials: UserLogin, session: DbSession):
    try:
        return await AuthService(session).login(credentials)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error


@router.get(
    "/wallet",
    response_model=WalletResponse,
    tags=["Wallet"],
    summary="Get wallet balance",
    description="Returns the current user's wallet with Decimal-precision balance (INR).",
)
async def get_wallet(session: DbSession, current_user: User = Depends(get_current_user)):
    try:
        return await WalletService(session).get_wallet(current_user.id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get(
    "/wallet/summary",
    response_model=WalletSummaryResponse,
    tags=["Wallet"],
    summary="Get full wallet summary",
    description="Returns balance, weekly stats, and cap status in one call.",
)
async def get_wallet_summary(session: DbSession, current_user: User = Depends(get_current_user)):
    try:
        return await WalletService(session).get_wallet_summary(current_user.id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


# ─── Existing endpoints (kept for backward compatibility) ─────────────────────

@router.post("/register", response_model=UserSessionResponse, status_code=201)
async def register_user(user: UserCreate, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session).register(user)
    except ConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/login", response_model=UserSessionResponse)
async def login_user(credentials: UserLogin, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session).login(credentials)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, session: DbSession, current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        return await AuthService(session).get_current_user(user_id)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
