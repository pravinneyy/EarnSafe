from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ── Enums ──────────────────────────────────────────────────────────

class PlatformType(str, Enum):
    zomato   = "zomato"
    swiggy   = "swiggy"
    blinkit  = "blinkit"
    zepto    = "zepto"

class PlanTier(str, Enum):
    basic    = "basic"      # ₹29/week → ₹300/day → max ₹1500
    standard = "standard"   # ₹49/week → ₹500/day → max ₹2500
    pro      = "pro"        # ₹89/week → ₹800/day → max ₹4000

class DisruptionType(str, Enum):
    heavy_rainfall = "heavy_rainfall"
    extreme_heat   = "extreme_heat"
    flood_alert    = "flood_alert"
    severe_aqi     = "severe_aqi"
    dense_fog      = "dense_fog"
    curfew         = "curfew"


# ── User ───────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:          str         = Field(..., example="Ravi Kumar")
    phone:         str         = Field(..., example="9876543210")
    city:          str         = Field(..., example="Pune")
    delivery_zone: str         = Field(..., example="Koregaon Park")
    platform:      PlatformType
    weekly_income: float       = Field(..., gt=0, example=4000)

class UserResponse(BaseModel):
    id:            int
    name:          str
    phone:         str
    city:          str
    delivery_zone: str
    platform:      str
    weekly_income: float
    risk_score:    float


# ── Policy ─────────────────────────────────────────────────────────

class PolicyCreate(BaseModel):
    user_id:   int
    plan_tier: PlanTier

class PolicyResponse(BaseModel):
    id:                int
    user_id:           int
    plan_tier:         str
    weekly_premium:    float
    daily_coverage:    float
    max_weekly_payout: float
    status:            str


# ── Claim ──────────────────────────────────────────────────────────

class ClaimCreate(BaseModel):
    user_id:         int
    policy_id:       int
    disruption_type: DisruptionType
    hours_lost:      float = Field(..., gt=0, le=24, example=6)
    claim_amount:    float = Field(..., gt=0, example=500)

class ClaimResponse(BaseModel):
    id:              int
    user_id:         int
    policy_id:       int
    disruption_type: str
    hours_lost:      float
    claim_amount:    float
    fraud_score:     float
    status:          str   # approved | flagged | rejected
    reason:          Optional[str] = None
