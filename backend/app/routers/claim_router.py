from fastapi import APIRouter, HTTPException
from app.schemas import ClaimCreate, ClaimResponse
from app.database import users_db, policies_db, claims_db
from app.services.fraud_service import detect_fraud

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/submit", response_model=ClaimResponse, status_code=201)
def submit_claim(claim: ClaimCreate):
    # Validate user
    if not any(u["id"] == claim.user_id for u in users_db):
        raise HTTPException(status_code=404, detail="User not found")

    # Validate policy is active
    policy = next((p for p in policies_db if p["id"] == claim.policy_id), None)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    if policy["status"] != "active":
        raise HTTPException(status_code=400, detail="Policy is not active")
    if policy["user_id"] != claim.user_id:
        raise HTTPException(status_code=403, detail="Policy does not belong to this user")

    # Run fraud detection
    result = detect_fraud(
        user_id=claim.user_id,
        policy_id=claim.policy_id,
        disruption_type=claim.disruption_type,
        hours_lost=claim.hours_lost,
        claim_amount=claim.claim_amount,
        plan_tier=policy["plan_tier"],
    )

    claim_id   = len(claims_db) + 1
    claim_data = {
        "id":              claim_id,
        "user_id":         claim.user_id,
        "policy_id":       claim.policy_id,
        "disruption_type": claim.disruption_type,
        "hours_lost":      claim.hours_lost,
        "claim_amount":    claim.claim_amount,
        "fraud_score":     result["fraud_score"],
        "status":          result["status"],
        "reason":          result["reason"],
    }
    claims_db.append(claim_data)
    return claim_data


@router.get("/user/{user_id}", response_model=list[ClaimResponse])
def get_user_claims(user_id: int):
    return [c for c in claims_db if c["user_id"] == user_id]


@router.get("/{claim_id}", response_model=ClaimResponse)
def get_claim(claim_id: int):
    claim = next((c for c in claims_db if c["id"] == claim_id), None)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim
