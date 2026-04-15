from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import UserCreate, UserLogin
from app.security import create_access_token, hash_password, verify_password
from app.models import User
from app.services.exceptions import AuthenticationError, ConflictError, NotFoundError


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
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

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
            "active_policy": None,
        }

    async def login(self, payload: UserLogin) -> dict:
        user = await self.user_repo.get_by_username(payload.username)
        if not user or not verify_password(payload.password, user.password_hash):
            raise AuthenticationError("Invalid username or password")

        active_policy = await self.policy_repo.get_active_for_user(user.id)
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
            "active_policy": active_policy,
        }

    async def get_current_user(self, user_id: int) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user
