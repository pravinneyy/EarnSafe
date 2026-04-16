from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, get_redis_client
from app.schemas import FirebaseAuthRequest, UserLogin, UserSessionResponse
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError, NotFoundError, ValidationError

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/firebase",
    response_model=UserSessionResponse,
    summary="Login via Firebase Phone Auth",
    description=(
        "Primary auth method. The client authenticates the user's phone number "
        "via the Firebase SDK (OTP is sent and verified client-side). "
        "The resulting Firebase ID token is exchanged here for an EarnSafe JWT."
    ),
)
async def firebase_login(payload: FirebaseAuthRequest, session: DbSession):
    try:
        return await AuthService(session).firebase_login(payload.firebase_token)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post(
    "/login",
    response_model=UserSessionResponse,
    summary="Login (Username + Password)",
    description="Secondary auth method. Use /auth/firebase for phone-based login.",
)
async def login(credentials: UserLogin, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session).login(credentials)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
