from datetime import datetime, timedelta, timezone
from uuid import uuid4

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.ai_client import TRIGGERS, ZONE_RISK_MAP, get_live_risk_data, predict_risk
from app.models import Policy, PolicyStatus
from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import PolicyCreate
from app.services.exceptions import ConflictError, NotFoundError, ValidationError
from app.services.premium_service import PLAN_CONFIG


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

    async def simulate_premium(self, *, zone: str, tier: str, rain_mm: float, temp_c: float, aqi_pm25: float, wind_kph: float) -> dict:
        zone_profile = ZONE_RISK_MAP.get(zone.strip().title(), {"flood": 0.5, "heat": 0.6, "aqi": 0.5})
        ai = predict_risk(zone=zone, delivery_persona="Food", tier=tier)
        return {
            "inputs": {
                "zone": zone,
                "tier": tier,
                "rain_mm": rain_mm,
                "temp_c": temp_c,
                "aqi_pm25": aqi_pm25,
                "wind_kph": wind_kph,
            },
            "zone_risk_profile": zone_profile,
            "triggers": {
                "available": TRIGGERS,
            },
            "ai_risk_score": ai["ai_risk_score"],
            "active_disruption": ai["active_disruption"],
            "weekly_premium": ai["weekly_premium_inr"],
        }

    async def demo_scenario(self, *, scenario: str, tier: str) -> dict:
        if scenario not in {"monsoon_flood", "extreme_heat", "aqi_hazard", "high_wind", "clear_day"}:
            raise ValidationError("Unknown scenario")
        base = {
            "monsoon_flood": {"zone": "Velachery", "rain_mm": 85.0, "temp_c": 27.0, "wind_kph": 35.0, "aqi_pm25": 28.0},
            "extreme_heat": {"zone": "T Nagar", "rain_mm": 0.0, "temp_c": 44.0, "wind_kph": 8.0, "aqi_pm25": 45.0},
            "aqi_hazard": {"zone": "Perambur", "rain_mm": 0.0, "temp_c": 32.0, "wind_kph": 5.0, "aqi_pm25": 110.0},
            "high_wind": {"zone": "OMR", "rain_mm": 15.0, "temp_c": 29.0, "wind_kph": 75.0, "aqi_pm25": 20.0},
            "clear_day": {"zone": "Anna Nagar", "rain_mm": 0.0, "temp_c": 31.0, "wind_kph": 12.0, "aqi_pm25": 25.0},
        }[scenario]
        return {"scenario": scenario, **(await self.simulate_premium(tier=tier, **base))}

    async def list_demo_scenarios(self) -> dict:
        return {
            "available_scenarios": [
                {"id": "monsoon_flood", "label": "Chennai Monsoon Flood"},
                {"id": "extreme_heat", "label": "Extreme Heat"},
                {"id": "aqi_hazard", "label": "Hazardous AQI"},
                {"id": "high_wind", "label": "High Wind"},
                {"id": "clear_day", "label": "Clear Day"},
            ]
        }

    async def list_triggers(self) -> dict:
        return {"triggers": TRIGGERS}
