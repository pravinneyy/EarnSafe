from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

PLAN_CONFIG = {
    "basic": {"premium": 29.0, "daily_coverage": 150.0, "max_weekly": 800.0},
    "standard": {"premium": 49.0, "daily_coverage": 300.0, "max_weekly": 1500.0},
    "pro": {"premium": 89.0, "daily_coverage": 500.0, "max_weekly": 2500.0},
}


def round_currency(amount: float) -> float:
    return float(Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def to_subunits(amount: float) -> int:
    return int(Decimal(str(round_currency(amount))) * 100)


def build_quote_response(*, quote_id: str, user_id: int, plan_tier: str, ai_data: dict) -> dict:
    tier = PLAN_CONFIG[plan_tier]
    weekly_premium = round_currency(ai_data["weekly_premium_inr"])
    created_at = datetime.now(timezone.utc)
    return {
        "id": quote_id,
        "user_id": user_id,
        "plan_tier": plan_tier,
        "weekly_premium": weekly_premium,
        "amount": to_subunits(weekly_premium),
        "currency": "INR",
        "base_premium": tier["premium"],
        "daily_coverage": tier["daily_coverage"],
        "max_weekly_payout": tier["max_weekly"],
        "ai_risk_score": ai_data["ai_risk_score"],
        "zone": ai_data["zone"],
        "active_disruption": ai_data["active_disruption"],
        "created_at": created_at,
        "expires_at": created_at + timedelta(minutes=15),
    }
