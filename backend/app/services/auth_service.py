import logging
import time
from functools import lru_cache
from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.x509 import load_pem_x509_certificate
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import UserCreate, UserLogin
from app.security import create_access_token, hash_password, verify_password
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError, ValidationError
from app.services.wallet_service import WalletService

logger = logging.getLogger(__name__)

# ── Firebase token verification (no service account needed) ──────────────────
# Firebase ID tokens are signed JWTs. We verify them using Google's public certs.
# Docs: https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
GOOGLE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)
FIREBASE_ISSUER_PREFIX = "https://securetoken.google.com/"

# Simple in-process cache: {kid: public_key_pem, "_expires": unix_ts}
_cert_cache: dict[str, Any] = {}


async def _get_google_public_key(kid: str) -> bytes:
    """
    Fetch Google's Firebase signing certs and return the PEM public key for `kid`.
    Caches the certs until they expire (Cache-Control max-age from the response).
    """
    now = time.time()
    if _cert_cache.get("_expires", 0) > now and kid in _cert_cache:
        return _cert_cache[kid]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(GOOGLE_CERTS_URL)
    resp.raise_for_status()

    certs: dict[str, str] = resp.json()

    # Parse Cache-Control: max-age=XXXXX
    max_age = 3600  # default 1 hour
    cc = resp.headers.get("cache-control", "")
    for part in cc.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=", 1)[1])
            except ValueError:
                pass

    # Convert X.509 PEM certs → DER public key bytes
    _cert_cache.clear()
    _cert_cache["_expires"] = now + max_age
    for k, pem in certs.items():
        cert = load_pem_x509_certificate(pem.encode())
        _cert_cache[k] = cert.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)

    if kid not in _cert_cache:
        raise AuthenticationError(
            "Firebase token has an unrecognised key ID. "
            "It may have been issued before the current signing keys. Please log in again."
        )
    return _cert_cache[kid]


async def verify_firebase_id_token(id_token: str) -> dict:
    """
    Verify a Firebase Phone Auth ID token using Google's public X.509 certs.
    Returns the decoded JWT claims on success.
    No Firebase Admin SDK or service account needed — only the project ID.
    """
    settings = get_settings()
    project_id = settings.firebase_project_id
    if not project_id:
        raise ValidationError(
            "FIREBASE_PROJECT_ID is not set. "
            "Add it to the Render environment variables."
        )

    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.DecodeError as exc:
        raise AuthenticationError("Malformed Firebase token.") from exc

    kid = header.get("kid")
    if not kid:
        raise AuthenticationError("Firebase token is missing key ID (kid) in header.")

    public_key_pem = await _get_google_public_key(kid)

    try:
        claims = jwt.decode(
            id_token,
            public_key_pem,
            algorithms=["RS256"],
            audience=project_id,
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Firebase token has expired. Please sign in again.") from exc
    except jwt.InvalidAudienceError as exc:
        raise AuthenticationError("Firebase token is for a different project.") from exc
    except jwt.PyJWTError as exc:
        raise AuthenticationError(f"Firebase token verification failed: {exc}") from exc

    # Validate issuer
    expected_issuer = f"{FIREBASE_ISSUER_PREFIX}{project_id}"
    if claims.get("iss") != expected_issuer:
        raise AuthenticationError("Firebase token has an invalid issuer.")

    return claims


# ── Risk scoring ──────────────────────────────────────────────────────────────

def _risk_score(city: str, platform: str, zone: str = "") -> float:
    """
    Compute a 0.0–1.0 risk score using the ML model.
    When a global simulation is active, uses simulated weather values
    so the displayed risk score matches what get_live_risk_data returns.
    Falls back to a simple heuristic if the model is unavailable.
    """
    try:
        from app.integrations.ai_client import SYSTEM_SIMULATION, predict_risk

        # If admin simulation is running, use those weather values
        if SYSTEM_SIMULATION.get("active"):
            sim_rain = float(SYSTEM_SIMULATION.get("rain", 0))
            sim_temp = float(SYSTEM_SIMULATION.get("temp", 28))
            sim_aqi_slider = int(SYSTEM_SIMULATION.get("aqi", 1))
            sim_pm25 = float(sim_aqi_slider * 25.0)
            result = predict_risk(
                zone=zone or city.strip().title(),
                delivery_persona="Food",
                tier="standard",
                rain=sim_rain,
                temp=sim_temp,
                aqi=sim_pm25,
            )
        else:
            result = predict_risk(
                zone=zone or city.strip().title(),
                delivery_persona="Food",
                tier="standard",
            )
        return float(result["ai_risk_score"])
    except Exception:
        high_risk = {"chennai", "mumbai", "kolkata"}
        return 0.65 if city.lower() in high_risk else 0.45



# ── AuthService ───────────────────────────────────────────────────────────────

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
            risk_score=_risk_score(payload.city, payload.platform.value, getattr(payload, 'delivery_zone', '')),
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
        Primary auth: verify a Firebase Phone Auth ID token and return an EarnSafe JWT.

        Flow:
          1. Client authenticates phone via Firebase SDK (OTP sent + verified client-side).
          2. Client receives Firebase ID token after OTP verification.
          3. Client sends ID token to this endpoint.
          4. We verify it using Google's public certs (no service account needed).
          5. We extract the phone number, look up the user, and issue our own JWT.
        """
        claims = await verify_firebase_id_token(firebase_id_token)

        # Firebase phone numbers are in E.164 format: +91XXXXXXXXXX
        raw_phone: str = claims.get("phone_number", "")
        if not raw_phone:
            raise AuthenticationError(
                "Firebase token does not contain a phone number. "
                "Only Phone Auth tokens are accepted."
            )

        # Strip country code to get the 10-digit phone stored in our DB
        phone = raw_phone.lstrip("+")
        if phone.startswith("91") and len(phone) == 12:
            phone = phone[2:]   # +919876543210 → 9876543210

        user = await self.user_repo.get_by_phone(phone)
        if not user:
            raise NotFoundError(
                f"No EarnSafe account linked to {raw_phone}. "
                "Please register first or use the phone number you signed up with."
            )

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: Firebase phone login", extra={"user_id": user.id, "phone": phone})
        return _session_response(user, token, wallet, active_policy)

    async def phone_login(self, phone: str, otp: str) -> dict:
        """
        Mock OTP login — accepts any 6-digit OTP, looks up user by phone number.
        Replace with real Firebase OTP verification in production.
        """
        # Validate OTP format (6 digits) — value is not checked in mock mode
        if not otp.isdigit() or len(otp) != 6:
            raise AuthenticationError("OTP must be exactly 6 digits.")

        # Normalise phone — strip leading +91 if present
        clean = phone.strip().lstrip("+")
        if clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        if len(clean) != 10 or not clean.isdigit():
            raise AuthenticationError("Enter a valid 10-digit mobile number.")

        user = await self.user_repo.get_by_phone(clean)
        if not user:
            raise NotFoundError(
                f"No EarnSafe account found for {phone}. "
                "Please register first or use the phone number you signed up with."
            )

        active_policy = await self.policy_repo.get_active_for_user(user.id)
        wallet = await self.wallet_service.get_or_create_wallet(user.id)
        token = create_access_token(str(user.id), extra_claims={"username": user.username})

        logger.info("AuthService: mock phone login", extra={"user_id": user.id, "phone": clean})
        return _session_response(user, token, wallet, active_policy)


    async def get_me(self, user_id: int) -> dict:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        active_policy = await self.policy_repo.get_active_for_user(user_id)
        wallet = await self.wallet_service.get_or_create_wallet(user_id)

        # Refresh risk_score from ML model on every /me call so it
        # reflects live seasonal + zone factors, not a static registration value.
        try:
            fresh_score = _risk_score(user.city, user.platform, user.delivery_zone or "")
            if abs(fresh_score - user.risk_score) > 0.01:
                user.risk_score = fresh_score
                await self.session.commit()
        except Exception:
            pass  # keep existing score if ML call fails

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
    async def get_current_user(self, user_id: int) -> User | None:
        """Required by dependencies.py to verify the JWT owner."""
        user = await self.user_repo.get_by_id(user_id)
        return user


# ── Helpers ───────────────────────────────────────────────────────────────────

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
