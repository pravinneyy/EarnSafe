from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import hmac
from typing import Any
from uuid import uuid4

import requests

from app.config import get_settings
from app.services.ai_service import predict_risk
from app.services.premium_service import PLAN_CONFIG

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
QUOTE_TTL_MINUTES = 15


class RazorpayConfigError(RuntimeError):
    pass


class RazorpayRequestError(RuntimeError):
    pass


class RazorpayVerificationError(RuntimeError):
    pass


def _round_currency(amount: float | Decimal) -> float:
    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(value)


def to_subunits(amount: float | Decimal) -> int:
    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(value * 100)


def ensure_razorpay_config() -> tuple[str, str]:
    settings = get_settings()
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise RazorpayConfigError(
            "Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the backend environment."
        )
    return settings.razorpay_key_id, settings.razorpay_key_secret


def build_quote_record(user: dict[str, Any], plan_tier: str) -> dict[str, Any]:
    tier_config = PLAN_CONFIG[plan_tier]
    zone = user.get("delivery_zone") or user["city"]
    ai_data = predict_risk(zone=zone, delivery_persona=user["platform"], tier=plan_tier)
    weekly_premium = _round_currency(ai_data["weekly_premium_inr"])
    created_at = datetime.now(timezone.utc)

    return {
        "id": f"quote_{uuid4().hex[:12]}",
        "user_id": user["id"],
        "plan_tier": plan_tier,
        "weekly_premium": weekly_premium,
        "amount": to_subunits(weekly_premium),
        "currency": "INR",
        "base_premium": tier_config["premium"],
        "daily_coverage": tier_config["daily_coverage"],
        "max_weekly_payout": tier_config["max_weekly"],
        "ai_risk_score": ai_data["ai_risk_score"],
        "zone": ai_data["zone"],
        "active_disruption": ai_data["active_disruption"],
        "created_at": created_at,
        "expires_at": created_at + timedelta(minutes=QUOTE_TTL_MINUTES),
    }


def create_razorpay_order(*, amount: int, currency: str, receipt: str, notes: dict[str, str] | None = None) -> dict[str, Any]:
    key_id, key_secret = ensure_razorpay_config()
    payload = {
        "amount": amount,
        "currency": currency,
        "receipt": receipt,
    }
    if notes:
        payload["notes"] = notes

    try:
        response = requests.post(
            f"{RAZORPAY_API_BASE}/orders",
            auth=(key_id, key_secret),
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        detail = _extract_razorpay_error(error)
        raise RazorpayRequestError(f"Unable to create Razorpay order. {detail}") from error


def fetch_payment(payment_id: str) -> dict[str, Any]:
    key_id, key_secret = ensure_razorpay_config()

    try:
        response = requests.get(
            f"{RAZORPAY_API_BASE}/payments/{payment_id}",
            auth=(key_id, key_secret),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        detail = _extract_razorpay_error(error)
        raise RazorpayRequestError(f"Unable to fetch Razorpay payment status. {detail}") from error


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str) -> None:
    _, key_secret = ensure_razorpay_config()
    payload = f"{order_id}|{payment_id}".encode()
    digest = hmac.new(key_secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, signature):
        raise RazorpayVerificationError("Razorpay signature verification failed.")


def _extract_razorpay_error(error: requests.RequestException) -> str:
    response = getattr(error, "response", None)
    if response is None:
        return "Check your network connection and Razorpay credentials."

    try:
        payload = response.json()
    except ValueError:
        return f"Razorpay returned HTTP {response.status_code}."

    description = payload.get("error", {}).get("description")
    if description:
        return description
    return f"Razorpay returned HTTP {response.status_code}."
