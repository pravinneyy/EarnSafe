from fastapi import APIRouter, HTTPException
from app.schemas import PolicyCreate, PolicyResponse
from app.database import users_db, policies_db
from app.services.premium_service import calculate_weekly_premium

router = APIRouter(prefix="/policy", tags=["Policy"])


@router.post("/create", response_model=PolicyResponse, status_code=201)
def create_policy(policy: PolicyCreate):
    user = next((u for u in users_db if u["id"] == policy.user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only one active policy per user
    if any(p["user_id"] == policy.user_id and p["status"] == "active" for p in policies_db):
        raise HTTPException(status_code=400, detail="User already has an active policy")

    calc = calculate_weekly_premium(
        plan_tier=policy.plan_tier,
        city=user["city"],
        platform=user["platform"],
    )

    policy_id   = len(policies_db) + 1
    policy_data = {
        "id":                policy_id,
        "user_id":           policy.user_id,
        "plan_tier":         policy.plan_tier,
        "weekly_premium":    calc["weekly_premium"],
        "daily_coverage":    calc["daily_coverage"],
        "max_weekly_payout": calc["max_weekly_payout"],
        "status":            "active",
    }
    policies_db.append(policy_data)
    return policy_data


@router.get("/{policy_id}", response_model=PolicyResponse)
def get_policy(policy_id: int):
    policy = next((p for p in policies_db if p["id"] == policy_id), None)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.get("/user/{user_id}", response_model=list[PolicyResponse])
def get_user_policies(user_id: int):
    return [p for p in policies_db if p["user_id"] == user_id]
