import logging
import random
import string

import httpx
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import UserCreate, UserLogin
from app.security import create_access_token, hash_password, verify_password
from app.models import User
from app.config import MSG91_SEND_OTP_URL, get_settings
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError, RateLimitError, ValidationError
from app.services.wallet_service import WalletService

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300        # OTP expires in 5 minutes
OTP_REDIS_PREFIX = "otp:"
OTP_RATE_PREFIX = "otp_rate:)"  # rate-limit counter key prefix
OTP_MAX_REQUESTS = 3           # max OTP sends per rate window
OTP_RATE_WINDOW = 300          # rate window = 5 minutes (matches OTP TTL)


def _risk_score(city: str, platform: str) -> float:
    high_risk = {"chennai", "mumbai", "kolkata"}
    score = 60.0
    if city.lower() in high_risk:
        score += 15
    if platform.lower() in {"blinkit", "zepto"}:
        score += 10
    return min(score, 100.0)


def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


async def _send_sms_msg91(phone: str, otp: str) -> None:
    """
    Send a real SMS via MSG91's OTP API.
    Docs: https://docs.msg91.com/reference/send-otp
    Raises ValidationError if the gateway returns an error.
    """
    settings = get_settings()
    api_key = settings.msg91_api_key.get_secret_value() if settings.msg91_api_key else ""

    payload = {
        "authkey": api_key,
        "mobile": f"91{phone}",          # MSG91 expects country code prefix
        "otp": otp,
        "otp_expiry": settings.msg91_otp_expiry_minutes,
        "sender": settings.msg91_sender_id,
    }
    if settings.msg91_template_id:
        payload["template_id"] = settings.msg91_template_id

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(MSG91_SEND_OTP_URL, json=payload)

    if response.status_code != 200:
        logger.error(
            "MSG91 OTP send failed",
            extra={"phone": phone, "status": response.status_code, "body": response.text},
        )
        raise ValidationError(f"SMS gateway error: {response.text}")

    data = response.json()
    if data.get("type") != "success":
        logger.error("MSG91 OTP send rejected", extra={"phone": phone, "response": data})
        raise ValidationError(f"SMS gateway rejected: {data.get('message', 'Unknown error')}")

    logger.info("MSG91 OTP sent successfully", extra={"phone": phone})


class AuthService:
    def __init__(self, session: AsyncSession, redis: Redis | None = None) -> None:
        self.session = session
        self.redis = redis
        self.user_repo = UserRepository(session)
        self.policy_repo = PolicyRepository(session)
        self.wallet_service = WalletService(session)

    async def register(self, payload: UserCreate) -> dict:
        if await self.user_repo.get_by_username(payload.username):
            raise ConflictError("Username already registered")
        if await self.user_repo.get_by_phone(payload.phone):
            raise ConflictError("Phone number already registered")

        user = User(
            username=payload.username,
            password_hash=hash_password(payload.password),
            name=payload.name,
            phone=payload.phone,
            city=payload.city,
            delivery_zone=payload.delivery_zone,
            platform=payload.platform.value,
            weekly_income=payload.weekly_income,
            risk_score=_risk_score(payload.city, payload.platform.value),
        )
        try:
            await self.user_repo.create(user)  # flush only, no commit
            # Auto-create wallet in the same transaction
            wallet = await self.wallet_service.get_or_create_wallet(user.id)
            await self.session.commit()         # single commit covers user + wallet
        except Exception:
            await self.session.rollback()
            raise

        logger.info("AuthService: user registered", extra={"user_id": user.id, "phone": user.phone})

        token = create_access_token(str(user.id), extra_claims={"username": user.username})
        return {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "phone": user.phone,
            "city": user.city,
            "delivery_zone": user.delivery_zone,
            "platform": user.platform,
            "weekly_income": user.weekly_income,
            "risk_score": user.risk_score,
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 3600,
            "wallet_balance": wallet.balance,
            "active_policy": None,
        }

    async def login(self, payload: UserLogin) -> dict:
        user = await self.user_repo.get_by_username(payload.username)
        if not user or not verify_password(payload.password, user.password_hash):
            raise AuthenticationError("Invalid username or password")

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: user logged in (password)", extra={"user_id": user.id})
        return {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "phone": user.phone,
            "city": user.city,
            "delivery_zone": user.delivery_zone,
            "platform": user.platform,
            "weekly_income": user.weekly_income,
            "risk_score": user.risk_score,
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 3600,
            "wallet_balance": wallet.balance,
            "active_policy": active_policy,
        }

    async def send_otp(self, phone: str) -> dict:
        """
        Primary auth: generates a 6-digit OTP stored in Redis with a 5-min TTL.

        SMS delivery behaviour:
          - If MSG91_API_KEY + MSG91_TEMPLATE_ID are set → real SMS is sent.
          - If not configured → OTP is returned in the API response as 'debug_otp'
            so the app can complete login without a real SMS gateway.

        Rate-limited: max 3 requests per 5-minute window per phone.
        """
        if not self.redis:
            raise ValidationError("OTP service is unavailable (Redis not configured)")

        # ── Rate limit check ─────────────────────────────────────────────────
        rate_key = f"{OTP_RATE_PREFIX}{phone}"
        request_count = await self.redis.get(rate_key)
        if request_count and int(request_count) >= OTP_MAX_REQUESTS:
            raise RateLimitError(
                "Too many OTP requests. Please wait before trying again."
            )

        # User must already exist (OTP is for login, not registration)
        user = await self.user_repo.get_by_phone(phone)
        if not user:
            raise NotFoundError(
                "No account found for this phone number. "
                "Please register first or use the phone number you signed up with."
            )

        otp = _generate_otp()
        redis_key = f"{OTP_REDIS_PREFIX}{phone}"
        await self.redis.set(redis_key, otp, ex=OTP_TTL_SECONDS)

        # Increment rate counter; set TTL only on first request
        pipe = self.redis.pipeline()
        pipe.incr(rate_key)
        pipe.expire(rate_key, OTP_RATE_WINDOW)
        await pipe.execute()

        settings = get_settings()
        response: dict = {
            "message": "OTP sent successfully",
            "phone": phone,
            "expires_in": OTP_TTL_SECONDS,
        }

        if settings.sms_gateway_configured:
            # ── Real SMS via MSG91 ────────────────────────────────────────
            await _send_sms_msg91(phone, otp)
            logger.info("AuthService: OTP dispatched via MSG91", extra={"phone": phone})
        else:
            # ── No SMS gateway — return OTP in response for dev/testing ──
            # This is the fallback when MSG91 is not configured.
            # Wire up MSG91_API_KEY + MSG91_TEMPLATE_ID in env to send real SMS.
            response["debug_otp"] = otp
            logger.warning(
                "AuthService: No SMS gateway configured — debug_otp included in response. "
                "Set MSG91_API_KEY + MSG91_TEMPLATE_ID env vars to send real SMS.",
                extra={"phone": phone, "otp": otp},
            )

        return response

    async def verify_otp(self, phone: str, otp: str) -> dict:
        """
        Verify a previously sent OTP and return a JWT if valid.
        The OTP key is deleted from Redis on first use (single-use).
        """
        if not self.redis:
            raise ValidationError("OTP service is unavailable (Redis not configured)")

        redis_key = f"{OTP_REDIS_PREFIX}{phone}"
        stored_otp = await self.redis.get(redis_key)

        if not stored_otp or stored_otp != otp:
            raise AuthenticationError("Invalid or expired OTP")

        # Single-use: delete immediately
        await self.redis.delete(redis_key)

        user = await self.user_repo.get_by_phone(phone)
        if not user:
            raise NotFoundError("User not found")

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: user logged in (OTP)", extra={"user_id": user.id})
        return {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "phone": user.phone,
            "city": user.city,
            "delivery_zone": user.delivery_zone,
            "platform": user.platform,
            "weekly_income": user.weekly_income,
            "risk_score": user.risk_score,
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 3600,
            "wallet_balance": wallet.balance,
            "active_policy": active_policy,
        }

    async def get_current_user(self, user_id: int) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user

    async def get_me(self, user_id: int) -> dict:
        """
        Full profile for the /me endpoint.
        Returns user fields + wallet balance + active policy + last_policy_change_at.
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        active_policy = await self.policy_repo.get_active_for_user(user_id)
        wallet = await self.wallet_service.get_or_create_wallet(user_id)

        return {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "phone": user.phone,
            "city": user.city,
            "delivery_zone": user.delivery_zone,
            "platform": user.platform,
            "weekly_income": user.weekly_income,
            "risk_score": user.risk_score,
            "wallet_balance": wallet.balance,
            "active_policy": active_policy,
            "last_policy_change_at": user.last_policy_change_at,
        }
