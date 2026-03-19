from fastapi import APIRouter, HTTPException

from app.schemas import UserCreate, UserLogin, UserResponse
from app.security import hash_password, verify_password
from app.services.user_store import (
    SupabaseConfigError,
    SupabaseRequestError,
    create_user,
    fetch_user_by_id,
    find_user_by_phone,
    find_user_by_username,
    normalize_username,
    serialize_public_user,
)

router = APIRouter(prefix="/users", tags=["Users"])


def _risk_score(city: str, platform: str) -> float:
    high_risk = {"chennai", "mumbai", "kolkata"}
    score = 60.0
    if city.lower() in high_risk:
        score += 15
    if platform.lower() in ("blinkit", "zepto"):
        score += 10
    return min(score, 100.0)


def _raise_store_error(error: Exception) -> None:
    status_code = 500 if isinstance(error, SupabaseConfigError) else 502
    raise HTTPException(status_code=status_code, detail=str(error)) from error


@router.post("/register", response_model=UserResponse, status_code=201)
def register_user(user: UserCreate):
    try:
        username = normalize_username(user.username)
        if find_user_by_username(username):
            raise HTTPException(status_code=400, detail="Username already registered")
        if find_user_by_phone(user.phone):
            raise HTTPException(status_code=400, detail="Phone number already registered")

        return create_user(
            {
                "username": username,
                "password_hash": hash_password(user.password),
                "name": user.name,
                "phone": user.phone,
                "city": user.city,
                "delivery_zone": user.delivery_zone,
                "platform": user.platform.value,
                "weekly_income": user.weekly_income,
                "risk_score": _risk_score(user.city, user.platform.value),
            }
        )
    except HTTPException:
        raise
    except SupabaseRequestError as error:
        if error.code == "23505":
            detail_text = f"{error} {error.details or ''}".lower()
            if "username" in detail_text:
                raise HTTPException(status_code=400, detail="Username already registered") from error
            if "phone" in detail_text:
                raise HTTPException(status_code=400, detail="Phone number already registered") from error
            raise HTTPException(status_code=400, detail="User already registered") from error
        _raise_store_error(error)
    except SupabaseConfigError as error:
        _raise_store_error(error)


@router.post("/login", response_model=UserResponse)
def login_user(credentials: UserLogin):
    try:
        user = find_user_by_username(credentials.username, include_password_hash=True)
    except (SupabaseConfigError, SupabaseRequestError) as error:
        _raise_store_error(error)

    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return serialize_public_user(user)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int):
    try:
        user = fetch_user_by_id(user_id)
    except (SupabaseConfigError, SupabaseRequestError) as error:
        _raise_store_error(error)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
