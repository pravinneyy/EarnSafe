from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

USERNAME_PATTERN = r"^[A-Za-z0-9_]{3,30}$"
PHONE_PATTERN = r"^\d{10}$"


class PlatformType(str, Enum):
    zomato = "zomato"
    swiggy = "swiggy"
    blinkit = "blinkit"
    zepto = "zepto"


class PlanTier(str, Enum):
    basic = "basic"
    standard = "standard"
    pro = "pro"


class DisruptionType(str, Enum):
    heavy_rainfall = "heavy_rainfall"
    extreme_heat = "extreme_heat"
    flood_alert = "flood_alert"
    severe_aqi = "severe_aqi"
    dense_fog = "dense_fog"
    curfew = "curfew"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=USERNAME_PATTERN, example="ravi_kumar")
    password: str = Field(..., min_length=8, max_length=128, example="StrongPassword123")
    name: str = Field(..., min_length=2, max_length=80, example="Ravi Kumar")
    phone: str = Field(..., pattern=PHONE_PATTERN, example="9876543210")
    city: str = Field(..., min_length=2, max_length=60, example="Pune")
    delivery_zone: str = Field(..., min_length=2, max_length=80, example="Koregaon Park")
    platform: PlatformType
    weekly_income: float = Field(..., gt=0, example=4000)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("name", "phone", "city", "delivery_zone", mode="before")
    @classmethod
    def strip_text_fields(cls, value: str) -> str:
        return value.strip()


class UserLogin(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=USERNAME_PATTERN, example="ravi_kumar")
    password: str = Field(..., min_length=8, max_length=128, example="StrongPassword123")

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    phone: str
    city: str
    delivery_zone: str
    platform: str
    weekly_income: float
    risk_score: float


class PolicyCreate(BaseModel):
    user_id: int
    plan_tier: PlanTier


class PolicyResponse(BaseModel):
    id: int
    user_id: int
    plan_tier: str
    weekly_premium: float
    daily_coverage: float
    max_weekly_payout: float
    status: str


class ClaimCreate(BaseModel):
    user_id: int
    policy_id: int
    disruption_type: DisruptionType
    hours_lost: float = Field(..., gt=0, le=24, example=6)
    claim_amount: float = Field(..., gt=0, example=500)


class ClaimResponse(BaseModel):
    id: int
    user_id: int
    policy_id: int
    disruption_type: str
    hours_lost: float
    claim_amount: float
    fraud_score: float
    status: str
    reason: Optional[str] = None
