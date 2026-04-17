from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.ai_client import TRIGGERS, ZONE_RISK_MAP, get_live_risk_data, predict_risk
from app.models import Policy, PolicyStatus, User
from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import PolicyCreate
from app.services.exceptions import ConflictError, NotFoundError, ValidationError
from app.services.premium_service import PLAN_CONFIG

POLICY_CHANGE_COOLDOWN_DAYS = 7


class PolicyService:
    def __init__(self, session: AsyncSession, redis: Redis | None = None) -> None:
        self.session = session
        self.redis = redis
        self.user_repo = UserRepository(session)
        self.policy_repo = PolicyRepository(session)

    async def create_policy(self, payload: PolicyCreate) -> Policy:
        user = await self.user_repo.get_by_id(payload.user_id)
        if not user:
            raise NotFoundError("User not found")
        if await self.policy_repo.get_active_for_user(payload.user_id):
            raise ConflictError("User already has an active policy")

        ai_data = predict_risk(zone=user.delivery_zone or user.city, delivery_persona=user.platform, tier=payload.plan_tier.value)
        tier = PLAN_CONFIG[payload.plan_tier.value]
        policy = Policy(
            user_id=payload.user_id,
            plan_tier=payload.plan_tier.value,
            weekly_premium=ai_data["weekly_premium_inr"],
            daily_coverage=tier["daily_coverage"],
            max_weekly_payout=tier["max_weekly"],
            status=PolicyStatus.active,
            activated_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        try:
            await self.policy_repo.create(policy)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return policy

    async def change_policy(self, user_id: int, new_plan_tier: str) -> Policy:
        """
        Change a user's policy with weekly rate-limiting.

        Allow if:
          - User has no active policy (create freely)
          - Current policy is expired
          - Last policy change was > 7 days ago

        Block if:
          - Policy was changed within the last 7 days
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        now = datetime.now(timezone.utc)
        active_policy = await self.policy_repo.get_active_for_user(user_id)

        if not active_policy:
            # No active policy → create freely
            from app.schemas import PolicyCreate, PlanTier
            return await self.create_policy(PolicyCreate(user_id=user_id, plan_tier=PlanTier(new_plan_tier)))

        # Check if existing policy is expired
        policy_expired = active_policy.expires_at is not None and active_policy.expires_at <= now

        if not policy_expired:
            # Policy is still active — enforce weekly rate limit
            if user.last_policy_change_at is not None:
                days_since_change = (now - user.last_policy_change_at.replace(tzinfo=timezone.utc)).days
                if days_since_change < POLICY_CHANGE_COOLDOWN_DAYS:
                    remaining = POLICY_CHANGE_COOLDOWN_DAYS - days_since_change
                    raise ValidationError(
                        f"Policy can only be changed once per week. "
                        f"Please wait {remaining} more day(s)."
                    )

        # Deactivate the current policy
        active_policy.status = PolicyStatus.cancelled
        await self.session.flush()

        # Create the new policy
        ai_data = predict_risk(zone=user.delivery_zone or user.city, delivery_persona=user.platform, tier=new_plan_tier)
        tier = PLAN_CONFIG[new_plan_tier]
        new_policy = Policy(
            user_id=user_id,
            plan_tier=new_plan_tier,
            weekly_premium=ai_data["weekly_premium_inr"],
            daily_coverage=tier["daily_coverage"],
            max_weekly_payout=tier["max_weekly"],
            status=PolicyStatus.active,
            activated_at=now,
            expires_at=now + timedelta(days=7),
        )
        await self.policy_repo.create(new_policy)

        # Record the change timestamp on the user
        user.last_policy_change_at = now

        try:
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        return new_policy

    async def get_active_policy(self, user_id: int) -> Policy | None:
        return await self.policy_repo.get_active_for_user(user_id)

    async def get_user_policies(self, user_id: int) -> list[Policy]:
        return await self.policy_repo.list_for_user(user_id)

    async def get_policy(self, policy_id: int) -> Policy:
        policy = await self.policy_repo.get_by_id(policy_id)
        if not policy:
            raise NotFoundError("Policy not found")
        return policy

    async def get_ai_premium(self, *, zone: str, persona: str, tier: str) -> dict:
        return predict_risk(zone=zone, delivery_persona=persona, tier=tier)

    async def get_live_premium(self, *, lat: float, lon: float, zone: str, tier: str) -> dict:
        return await get_live_risk_data(lat=lat, lon=lon, zone=zone, tier=tier, redis=self.redis)


    async def list_triggers(self) -> dict:
        return {"triggers": TRIGGERS}
