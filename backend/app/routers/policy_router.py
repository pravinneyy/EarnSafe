from fastapi import APIRouter, HTTPException, Query

from app.database import policies_db
from app.schemas import PolicyCreate, PolicyResponse
from app.services.premium_service import calculate_weekly_premium
from app.services.ai_service import predict_risk
from app.services.user_store import SupabaseConfigError, SupabaseRequestError, fetch_user_by_id

router = APIRouter(prefix="/policy", tags=["Policy"])


def _raise_store_error(error: Exception) -> None:
    status_code = 500 if isinstance(error, SupabaseConfigError) else 502
    raise HTTPException(status_code=status_code, detail=str(error)) from error


@router.get("/ai-premium", tags=["AI"])
def get_ai_premium(
    zone: str = Query(..., description="Delivery zone, e.g. Velachery"),
    persona: str = Query(..., description="Delivery type, e.g. Food"),
    tier: str = Query("standard", description="Plan tier: basic, standard, or pro"),
):
    """
    Real-time AI-powered premium quote using the CatBoost risk model.
    """
    result = predict_risk(zone=zone, delivery_persona=persona, tier=tier)
    return {"status": "success", **result}


@router.post("/create", response_model=PolicyResponse, status_code=201)
def create_policy(policy: PolicyCreate):
    try:
        user = fetch_user_by_id(policy.user_id)
    except (SupabaseConfigError, SupabaseRequestError) as error:
        _raise_store_error(error)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if any(p["user_id"] == policy.user_id and p["status"] == "active" for p in policies_db):
        raise HTTPException(status_code=400, detail="User already has an active policy")

    calc = calculate_weekly_premium(
        plan_tier=policy.plan_tier,
        city=user["city"],
        platform=user["platform"],
    )

    policy_id = len(policies_db) + 1
    policy_data = {
        "id": policy_id,
        "user_id": policy.user_id,
        "plan_tier": policy.plan_tier,
        "weekly_premium": calc["weekly_premium"],
        "daily_coverage": calc["daily_coverage"],
        "max_weekly_payout": calc["max_weekly_payout"],
        "status": "active",
    }
    policies_db.append(policy_data)
    return policy_data


@router.get("/user/{user_id}", response_model=list[PolicyResponse])
def get_user_policies(user_id: int):
    return [p for p in policies_db if p["user_id"] == user_id]


@router.get("/{policy_id}", response_model=PolicyResponse)
def get_policy(policy_id: int):
    policy = next((p for p in policies_db if p["id"] == policy_id), None)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy

