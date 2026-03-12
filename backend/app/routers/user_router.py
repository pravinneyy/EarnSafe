from fastapi import APIRouter, HTTPException
from app.schemas import UserCreate, UserResponse
from app.database import users_db

router = APIRouter(prefix="/users", tags=["Users"])


def _risk_score(city: str, platform: str) -> float:
    """Simple deterministic risk score (0–100). ML model replaces this."""
    high_risk = {"chennai", "mumbai", "kolkata"}
    score = 60.0
    if city.lower() in high_risk:
        score += 15
    if platform.lower() in ("blinkit", "zepto"):
        score += 10
    return min(score, 100.0)


@router.post("/register", response_model=UserResponse, status_code=201)
def register_user(user: UserCreate):
    # Prevent duplicate phone numbers
    if any(u["phone"] == user.phone for u in users_db):
        raise HTTPException(status_code=400, detail="Phone number already registered")

    user_id = len(users_db) + 1
    risk    = _risk_score(user.city, user.platform)

    user_data = {
        "id":            user_id,
        "name":          user.name,
        "phone":         user.phone,
        "city":          user.city,
        "delivery_zone": user.delivery_zone,
        "platform":      user.platform,
        "weekly_income": user.weekly_income,
        "risk_score":    risk,
    }
    users_db.append(user_data)
    return user_data


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int):
    user = next((u for u in users_db if u["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=list[UserResponse])
def list_users():
    return users_db
