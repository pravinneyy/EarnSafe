from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, get_redis_client
from app.schemas import OTPSendRequest, OTPVerifyRequest, UserLogin, UserSessionResponse
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError, RateLimitError, ValidationError

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/otp/send",
    summary="Send OTP (Primary Login — Phone)",
    description=(
        "Sends a 6-digit one-time password to the registered phone number. "
        "OTP expires in 5 minutes. Rate-limited to 3 requests per 5-minute window."
    ),
)
async def send_otp(payload: OTPSendRequest, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session, redis).send_otp(payload.phone)
    except NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except RateLimitError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post(
    "/otp/verify",
    response_model=UserSessionResponse,
    summary="Verify OTP + Get Token",
    description="Verify the OTP sent to the phone number. Returns a JWT access token on success.",
)
async def verify_otp(payload: OTPVerifyRequest, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session, redis).verify_otp(payload.phone, payload.otp)
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
    description="Secondary auth method. Use /auth/otp/send + /auth/otp/verify for phone-based login.",
)
async def login(credentials: UserLogin, session: DbSession, redis=Depends(get_redis_client)):
    try:
        return await AuthService(session, redis).login(credentials)
    except AuthenticationError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
