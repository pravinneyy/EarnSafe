from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.integrations.ai_client import get_live_risk_data
from app.models import Claim, ClaimStatus
from app.repositories.claim_repository import ClaimRepository
from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import ClaimCreate
from app.services.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.services.fraud_service import detect_claim_anomaly, score_location_trust

# Must match PLAN_CONFIG in premium_service.py
PLAN_DAILY_CAPS = {"basic": 300.0, "standard": 500.0, "pro": 800.0}


class ClaimService:
    def __init__(self, session: AsyncSession, redis: Redis | None = None) -> None:
        self.session = session
        self.redis   = redis
        self.claim_repo  = ClaimRepository(session)
        self.policy_repo = PolicyRepository(session)
        self.user_repo   = UserRepository(session)

    async def submit_claim(self, payload: ClaimCreate) -> Claim:
        """
        Manual claim submission.
        Fraud scoring pipeline:
          1. Basic validity (hours, amount cap, repeat claims)
          2. Location trust score (mock GPS, speed, rain mismatch)
          3. IsolationForest ML anomaly detection
        """
        user = await self.user_repo.get_by_id(payload.user_id)
        if not user:
            raise NotFoundError("User not found")

        policy = await self.policy_repo.get_by_id(payload.policy_id)
        if not policy:
            raise NotFoundError("Policy not found")
        if policy.user_id != payload.user_id:
            raise AuthorizationError("Policy does not belong to this user")
        if policy.status.value != "active":
            raise ValidationError("Policy is not active")

        fraud_score = 0.0
        signals: list[str] = []

        # ── 1. Basic validity ────────────────────────────────────────────────
        prior_claims = await self.claim_repo.count_by_user_and_disruption(
            payload.user_id, payload.disruption_type.value
        )

        if payload.hours_lost > 10:
            fraud_score += 0.35
            signals.append("hours_lost exceeds plausible maximum")

        cap = PLAN_DAILY_CAPS.get(policy.plan_tier, 500.0)
        if payload.claim_amount > cap:
            fraud_score += 0.40
            signals.append("claim amount exceeds daily cap")
        elif payload.claim_amount > cap * 0.90 and payload.hours_lost < 4:
            fraud_score += 0.20
            signals.append("high claim amount relative to hours lost")

        if prior_claims >= 3:
            fraud_score += 0.25
            signals.append("repeated claims for the same disruption type")
        elif prior_claims >= 1:
            fraud_score += 0.10

        # ── 2. Location trust (anti-spoofing) ────────────────────────────────
        live_rain_mm: float | None = None

        if payload.lat is not None and payload.lon is not None:
            try:
                live = await get_live_risk_data(
                    lat=payload.lat,
                    lon=payload.lon,
                    zone=user.delivery_zone or user.city,
                    tier=policy.plan_tier,
                    redis=self.redis,  # use cache — avoids redundant HTTP call
                )
                live_rain_mm = float(live.get("weather", {}).get("rain_mm", 0.0))
            except Exception:
                signals.append("live weather verification unavailable")

        location_trust, location_signals = score_location_trust(
            is_mock_location = payload.is_mock_location,
            device_speed_kph = payload.device_speed_kph,
            reported_rain_mm = payload.reported_rain_mm,
            live_rain_mm     = live_rain_mm,
        )
        location_fraud_contribution = round((1.0 - location_trust) * 0.50, 2)
        if location_fraud_contribution > 0:
            fraud_score += location_fraud_contribution
            signals.extend(location_signals)

        # ── 3. IsolationForest ML anomaly ─────────────────────────────────────
        ml_result = detect_claim_anomaly(
            reported_rain_mm          = live_rain_mm if live_rain_mm is not None else 0.0,
            hours_worked_before_claim = payload.hours_lost,
            location_match_score      = location_trust,
        )
        if ml_result["is_anomaly"]:
            fraud_score += 0.25
            signals.append(f"IsolationForest: anomaly detected (score {ml_result['anomaly_score']:.3f})")

        fraud_score = min(round(fraud_score, 2), 1.0)

        # ── Verdict ───────────────────────────────────────────────────────────
        if fraud_score < 0.30:
            status = ClaimStatus.approved
            reason = None
        elif fraud_score < 0.60:
            status = ClaimStatus.flagged
            reason = "Claim flagged for review: " + "; ".join(signals)
        else:
            status = ClaimStatus.rejected
            reason = "Fraud detected: " + "; ".join(signals)

        claim = Claim(
            user_id         = payload.user_id,
            policy_id       = payload.policy_id,
            disruption_type = payload.disruption_type.value,
            hours_lost      = payload.hours_lost,
            claim_amount    = payload.claim_amount,
            fraud_score     = fraud_score,
            status          = status,
            reason          = reason,
            processed_at    = datetime.now(timezone.utc),
        )
        try:
            await self.claim_repo.create(claim)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return claim

    async def get_claim(self, claim_id: int) -> Claim:
        claim = await self.claim_repo.get_by_id(claim_id)
        if not claim:
            raise NotFoundError("Claim not found")
        return claim

    async def get_user_claims(self, user_id: int) -> list[Claim]:
        return await self.claim_repo.list_for_user(user_id)
