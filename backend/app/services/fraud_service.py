"""
Mock fraud detection service.

Simulates a Random Forest classifier output (fraud_score 0.0–1.0).
Real implementation will use scikit-learn RandomForestClassifier
trained on synthetic claims data.

Scoring logic mirrors what the ML model would learn:
  - GPS mismatch with disruption zone        → high signal
  - Claim amount exceeds plan daily coverage → hard reject
  - Hours lost implausibly high              → high signal
  - Repeated claims for same disruption type → medium signal
  - Claim amount suspiciously close to max   → medium signal
"""

from app.database import claims_db


# Thresholds
AUTO_APPROVE_THRESHOLD = 0.30
FLAG_THRESHOLD         = 0.60   # above this → hold for manual review

# Max sensible hours lost in a disruption day
MAX_PLAUSIBLE_HOURS = 10

# Plan daily coverage caps (must match PLAN_CONFIG in premium_service)
PLAN_DAILY_CAPS = {
    "basic":    300,
    "standard": 500,
    "pro":      800,
}


def _count_prior_claims(user_id: int, disruption_type: str) -> int:
    return sum(
        1 for c in claims_db
        if c["user_id"] == user_id and c["disruption_type"] == disruption_type
    )


def detect_fraud(
    user_id: int,
    policy_id: int,
    disruption_type: str,
    hours_lost: float,
    claim_amount: float,
    plan_tier: str = "standard",
) -> dict:
    """
    Returns a fraud score (0.0–1.0) and verdict.

    Score bands:
        0.0 – 0.30  → approved   (auto payout)
        0.30 – 0.60 → flagged    (approve + log for review)
        0.60 – 1.0  → rejected   (hold, manual review)
    """
    score = 0.0
    signals = []

    # 1. Hours lost exceeds plausible maximum
    if hours_lost > MAX_PLAUSIBLE_HOURS:
        score += 0.35
        signals.append(f"hours_lost ({hours_lost}h) exceeds plausible maximum ({MAX_PLAUSIBLE_HOURS}h)")

    # 2. Claim amount exceeds plan's daily coverage cap
    daily_cap = PLAN_DAILY_CAPS.get(plan_tier, 500)
    if claim_amount > daily_cap:
        score += 0.40
        signals.append(f"claim_amount (₹{claim_amount}) exceeds {plan_tier} plan cap (₹{daily_cap})")

    # 3. Claim amount suspiciously close to cap (>90%) without large hours lost
    elif claim_amount > daily_cap * 0.90 and hours_lost < 4:
        score += 0.20
        signals.append("high claim amount relative to hours lost")

    # 4. Repeated claims for same disruption type (possible pattern fraud)
    prior = _count_prior_claims(user_id, disruption_type)
    if prior >= 3:
        score += 0.25
        signals.append(f"repeated claims for {disruption_type} ({prior} prior)")
    elif prior >= 1:
        score += 0.10

    # Cap at 1.0
    score = min(round(score, 2), 1.0)

    # Verdict
    if score < AUTO_APPROVE_THRESHOLD:
        status = "approved"
        reason = None
    elif score < FLAG_THRESHOLD:
        status = "flagged"
        reason = "Claim flagged for review: " + "; ".join(signals)
    else:
        status = "rejected"
        reason = "Fraud detected: " + "; ".join(signals)

    return {
        "fraud_score": score,
        "status":      status,
        "reason":      reason,
        "signals":     signals,
    }
