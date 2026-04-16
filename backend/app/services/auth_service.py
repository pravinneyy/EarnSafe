import base64
import json
import logging

from firebase_admin import auth as firebase_auth, credentials
import firebase_admin
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import UserCreate, UserLogin
from app.security import create_access_token, hash_password, verify_password
from app.models import User
from app.config import get_settings
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError, ValidationError
from app.services.wallet_service import WalletService

logger = logging.getLogger(__name__)

# ── Firebase Admin SDK — initialize once at module level ─────────────────────
_firebase_initialized = False


def _ensure_firebase_initialized() -> None:
    """Lazily initialize Firebase Admin SDK using the service account from env."""
    global _firebase_initialized
    if _firebase_initialized or firebase_admin._apps:
        _firebase_initialized = True
        return

    settings = get_settings()

    if settings.firebase_service_account_json:
        try:
            raw_json = base64.b64decode(
                settings.firebase_service_account_json.get_secret_value()
            )
            service_account_info = json.loads(raw_json)
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin SDK initialized from service account JSON")
        except Exception as exc:
            logger.error("Failed to initialize Firebase Admin SDK", extra={"error": str(exc)})
            raise ValidationError(
                "Firebase is not configured correctly. "
                "Check FIREBASE_SERVICE_ACCOUNT_JSON env var."
            ) from exc
    elif settings.firebase_project_id:
        # Attempt default credentials (works on Google Cloud, not on Render without service account)
        try:
            firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
            _firebase_initialized = True
            logger.info("Firebase Admin SDK initialized with project ID only")
        except Exception as exc:
            raise ValidationError(
                "Firebase initialization failed. Set FIREBASE_SERVICE_ACCOUNT_JSON."
            ) from exc
    else:
        raise ValidationError(
            "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON env var."
        )


def _risk_score(city: str, platform: str) -> float:
    high_risk = {"chennai", "mumbai", "kolkata"}
    score = 60.0
    if city.lower() in high_risk:
        score += 15
    if platform.lower() in {"blinkit", "zepto"}:
        score += 10
    return min(score, 100.0)


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
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
            await self.user_repo.create(user)
            wallet = await self.wallet_service.get_or_create_wallet(user.id)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        logger.info("AuthService: user registered", extra={"user_id": user.id})
        token = create_access_token(str(user.id), extra_claims={"username": user.username})
        return _session_response(user, token, wallet, active_policy=None)

    async def login(self, payload: UserLogin) -> dict:
        """Username + password login (secondary auth method)."""
        user = await self.user_repo.get_by_username(payload.username)
        if not user or not verify_password(payload.password, user.password_hash):
            raise AuthenticationError("Invalid username or password")

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: user logged in (password)", extra={"user_id": user.id})
        return _session_response(user, token, wallet, active_policy)

    async def firebase_login(self, firebase_id_token: str) -> dict:
        """
        Primary auth: verify a Firebase Phone Auth ID token.

        Flow:
          1. Client authenticates phone via Firebase SDK (OTP sent by Firebase).
          2. Client receives Firebase ID token after OTP verification.
          3. Client sends ID token here.
          4. We verify it with Firebase Admin SDK.
          5. We extract the phone number and look up the user.
          6. We issue our own JWT and return the full session.
        """
        _ensure_firebase_initialized()

        try:
            decoded = firebase_auth.verify_id_token(firebase_id_token)
        except firebase_auth.ExpiredIdTokenError as exc:
            raise AuthenticationError("Firebase token has expired. Please log in again.") from exc
        except firebase_auth.InvalidIdTokenError as exc:
            raise AuthenticationError("Invalid Firebase token.") from exc
        except Exception as exc:
            logger.error("Firebase token verification failed", extra={"error": str(exc)})
            raise AuthenticationError("Could not verify Firebase token.") from exc

        # Firebase phone numbers are always in E.164 format: +91XXXXXXXXXX
        raw_phone: str = decoded.get("phone_number", "")
        if not raw_phone:
            raise AuthenticationError("Firebase token does not contain a phone number.")

        # Strip country code to get the 10-digit phone stored in our DB
        phone = raw_phone.lstrip("+")
        if phone.startswith("91") and len(phone) == 12:
            phone = phone[2:]   # +919876543210 → 9876543210

        user = await self.user_repo.get_by_phone(phone)
        if not user:
            raise NotFoundError(
                f"No EarnSafe account is linked to this phone number ({raw_phone}). "
                "Please register first."
            )

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: user logged in (Firebase phone auth)", extra={"user_id": user.id})
        return _session_response(user, token, wallet, active_policy)

    async def get_current_user(self, user_id: int) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user

    async def get_me(self, user_id: int) -> dict:
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


# ── Helpers ──────────────────────────────────────────────────────────────────

def _session_response(user: User, token: str, wallet, active_policy) -> dict:
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
