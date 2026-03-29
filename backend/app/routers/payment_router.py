from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.database import payment_orders_db, payment_quotes_db, policies_db
from app.schemas import (
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentQuoteCreate,
    PaymentQuoteResponse,
    PaymentVerificationRequest,
    PaymentVerificationResponse,
)
from app.services.payment_service import (
    RazorpayConfigError,
    RazorpayRequestError,
    RazorpayVerificationError,
    build_quote_record,
    create_razorpay_order,
    fetch_payment,
    verify_payment_signature,
)
from app.services.user_store import SupabaseConfigError, SupabaseRequestError, fetch_user_by_id

router = APIRouter(prefix="/payments", tags=["Payments"])


def _raise_store_error(error: Exception) -> None:
    if isinstance(error, RazorpayVerificationError):
        status_code = 400
    else:
        status_code = 500 if isinstance(error, (SupabaseConfigError, RazorpayConfigError)) else 502
    raise HTTPException(status_code=status_code, detail=str(error)) from error


def _find_active_policy(user_id: int) -> dict | None:
    return next(
        (policy for policy in policies_db if policy["user_id"] == user_id and policy["status"] == "active"),
        None,
    )


def _find_quote(quote_id: str) -> dict | None:
    return next((quote for quote in payment_quotes_db if quote["id"] == quote_id), None)


def _find_order(order_id: str) -> dict | None:
    return next((order for order in payment_orders_db if order["order_id"] == order_id), None)


def _assert_user_exists(user_id: int) -> dict:
    try:
        user = fetch_user_by_id(user_id)
    except (SupabaseConfigError, SupabaseRequestError) as error:
        _raise_store_error(error)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def _validate_quote(request_user_id: int, plan_tier: str, quote_id: str) -> dict:
    quote = _find_quote(quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote["user_id"] != request_user_id or quote["plan_tier"] != plan_tier:
        raise HTTPException(status_code=400, detail="Quote does not match the selected user or plan")
    if datetime.now(timezone.utc) > quote["expires_at"]:
        raise HTTPException(status_code=410, detail="Quote expired. Refresh the plan quote and try again.")
    return quote


def _create_policy_from_quote(user_id: int, quote: dict, payment: dict) -> dict:
    policy_data = {
        "id": len(policies_db) + 1,
        "user_id": user_id,
        "plan_tier": quote["plan_tier"],
        "weekly_premium": quote["weekly_premium"],
        "daily_coverage": quote["daily_coverage"],
        "max_weekly_payout": quote["max_weekly_payout"],
        "status": "active",
        "payment_order_id": payment["order_id"],
        "payment_id": payment["id"],
        "payment_status": payment["status"],
    }
    policies_db.append(policy_data)
    return policy_data


@router.post("/quote", response_model=PaymentQuoteResponse, status_code=201)
def create_quote(payload: PaymentQuoteCreate):
    user = _assert_user_exists(payload.user_id)

    if _find_active_policy(payload.user_id):
        raise HTTPException(status_code=400, detail="User already has an active policy")

    quote = build_quote_record(user, payload.plan_tier)
    payment_quotes_db.append(quote)
    return quote


@router.post("/order", response_model=PaymentOrderResponse, status_code=201)
def create_order(payload: PaymentOrderCreate):
    _assert_user_exists(payload.user_id)

    if _find_active_policy(payload.user_id):
        raise HTTPException(status_code=400, detail="User already has an active policy")

    quote = _validate_quote(payload.user_id, payload.plan_tier, payload.quote_id)

    try:
        key_id = get_settings().razorpay_key_id or ""
        razorpay_order = create_razorpay_order(
            amount=quote["amount"],
            currency=quote["currency"],
            receipt=f"es-{payload.user_id}-{quote['id'][-6:]}",
            notes={
                "user_id": str(payload.user_id),
                "plan_tier": payload.plan_tier,
                "quote_id": quote["id"],
            },
        )
    except (RazorpayConfigError, RazorpayRequestError) as error:
        _raise_store_error(error)

    order_record = {
        "order_id": razorpay_order["id"],
        "user_id": payload.user_id,
        "plan_tier": payload.plan_tier,
        "quote_id": quote["id"],
        "amount": quote["amount"],
        "currency": quote["currency"],
        "status": "created",
        "payment_id": None,
        "payment_status": None,
        "policy_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    payment_orders_db.append(order_record)

    return {
        "order_id": razorpay_order["id"],
        "key_id": key_id,
        "amount": quote["amount"],
        "currency": quote["currency"],
        "name": "EarnSafe",
        "description": f"{payload.plan_tier.title()} Shield weekly cover",
        "quote": quote,
    }


@router.post("/verify", response_model=PaymentVerificationResponse)
def verify_payment(payload: PaymentVerificationRequest):
    order = _find_order(payload.razorpay_order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != payload.user_id or order["plan_tier"] != payload.plan_tier:
        raise HTTPException(status_code=400, detail="Order does not match the selected user or plan")
    if order["quote_id"] != payload.quote_id:
        raise HTTPException(status_code=400, detail="Order does not match the current quote")

    existing_policy = _find_active_policy(payload.user_id)
    if existing_policy:
        if order["policy_id"] == existing_policy["id"]:
            return {
                "status": "verified",
                "payment_status": order["payment_status"] or "captured",
                "order_id": order["order_id"],
                "payment_id": order["payment_id"] or payload.razorpay_payment_id,
                "policy": existing_policy,
            }
        raise HTTPException(status_code=400, detail="User already has an active policy")

    quote = _validate_quote(payload.user_id, payload.plan_tier, payload.quote_id)

    try:
        verify_payment_signature(
            order_id=order["order_id"],
            payment_id=payload.razorpay_payment_id,
            signature=payload.razorpay_signature,
        )
        payment = fetch_payment(payload.razorpay_payment_id)
    except (RazorpayConfigError, RazorpayRequestError, RazorpayVerificationError) as error:
        _raise_store_error(error)

    if payment.get("order_id") != order["order_id"]:
        raise HTTPException(status_code=400, detail="Payment order mismatch")
    if payment.get("amount") != order["amount"] or payment.get("currency") != order["currency"]:
        raise HTTPException(status_code=400, detail="Payment amount mismatch")
    if payment.get("status") not in {"authorized", "captured"}:
        raise HTTPException(status_code=400, detail="Payment is not authorized")

    policy = _create_policy_from_quote(payload.user_id, quote, payment)
    order["status"] = "verified"
    order["payment_id"] = payment["id"]
    order["payment_status"] = payment["status"]
    order["policy_id"] = policy["id"]
    order["verified_at"] = datetime.now(timezone.utc)

    return {
        "status": "verified",
        "payment_status": payment["status"],
        "order_id": order["order_id"],
        "payment_id": payment["id"],
        "policy": policy,
    }
