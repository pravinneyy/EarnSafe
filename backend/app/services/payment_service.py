from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
from typing import Any
from uuid import uuid4

import httpx
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Payment, PaymentStatus, Policy, PolicyStatus
from app.repositories.payment_repository import PaymentRepository
from app.repositories.policy_repository import PolicyRepository
from app.repositories.user_repository import UserRepository
from app.schemas import PaymentOrderCreate, PaymentVerificationRequest
from app.services.exceptions import ConflictError, IntegrationError, NotFoundError, ValidationError
from app.services.premium_service import PLAN_CONFIG, build_quote_response
from app.integrations.ai_client import predict_risk


class PaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.payment_repo = PaymentRepository(session)
        self.policy_repo = PolicyRepository(session)
        self.user_repo = UserRepository(session)

    async def create_quote(self, user_id: int, plan_tier: str) -> dict[str, Any]:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        if await self.policy_repo.get_active_for_user(user_id):
            raise ConflictError("User already has an active policy")
        ai_data = predict_risk(zone=user.delivery_zone or user.city, delivery_persona=user.platform, tier=plan_tier)
        return build_quote_response(quote_id=f"quote_{uuid4().hex[:12]}", user_id=user_id, plan_tier=plan_tier, ai_data=ai_data)

    @staticmethod
    def _serialize_quote_snapshot(quote: dict[str, Any]) -> dict[str, Any]:
        return jsonable_encoder(quote)

    @staticmethod
    def _parse_quote_datetime(value: Any) -> datetime | None:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        raise ValidationError("Stored quote contains an invalid datetime value")

    async def create_order(self, payload: PaymentOrderCreate, quote: dict[str, Any]) -> dict[str, Any]:
        existing = await self.payment_repo.get_by_idempotency_key(payload.idempotency_key)
        if existing and existing.provider_order_id:
            return {
                "order_id": existing.provider_order_id,
                "key_id": get_settings().razorpay_key_id.get_secret_value() if get_settings().razorpay_key_id else "",
                "amount": existing.amount,
                "currency": existing.currency,
                "name": "EarnSafe",
                "description": f"{payload.plan_tier.value.title()} Shield weekly cover",
                "quote": existing.quote_snapshot,
            }

        settings = get_settings()
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            raise IntegrationError("Razorpay credentials are missing.")

        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds, auth=(settings.razorpay_key_id.get_secret_value(), settings.razorpay_key_secret.get_secret_value())) as client:
            response = await client.post(
                f"{settings.razorpay_base_url}/orders",
                json={
                    "amount": quote["amount"],
                    "currency": quote["currency"],
                    "receipt": f"es-{payload.user_id}-{quote['id'][-6:]}",
                    "notes": {
                        "user_id": str(payload.user_id),
                        "plan_tier": payload.plan_tier.value,
                        "quote_id": quote["id"],
                    },
                },
            )
            try:
                response.raise_for_status()
            except httpx.HTTPError as error:
                raise IntegrationError(f"Unable to create Razorpay order: {response.text}") from error
            razorpay_order = response.json()

        payment = Payment(
            user_id=payload.user_id,
            plan_tier=payload.plan_tier.value,
            quote_id=quote["id"],
            amount=quote["amount"],
            currency=quote["currency"],
            provider_order_id=razorpay_order["id"],
            status=PaymentStatus.pending,
            idempotency_key=payload.idempotency_key,
            quote_snapshot=self._serialize_quote_snapshot(quote),
            provider_payload=razorpay_order,
        )
        try:
            await self.payment_repo.create(payment)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        return {
            "order_id": razorpay_order["id"],
            "key_id": settings.razorpay_key_id.get_secret_value(),
            "amount": quote["amount"],
            "currency": quote["currency"],
            "name": "EarnSafe",
            "description": f"{payload.plan_tier.value.title()} Shield weekly cover",
            "quote": quote,
        }

    async def verify_payment(self, payload: PaymentVerificationRequest) -> dict[str, Any]:
        payment = await self.payment_repo.get_by_provider_order_id(payload.razorpay_order_id)
        if not payment:
            raise NotFoundError("Order not found")
        if payment.user_id != payload.user_id or payment.plan_tier != payload.plan_tier.value or payment.quote_id != payload.quote_id:
            raise ValidationError("Order does not match the selected user, plan, or quote")

        settings = get_settings()
        if not settings.razorpay_key_secret:
            raise IntegrationError("Razorpay secret is missing.")
        digest = hmac.new(
            settings.razorpay_key_secret.get_secret_value().encode(),
            f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(digest, payload.razorpay_signature):
            payment.status = PaymentStatus.failed
            payment.failure_reason = "Signature verification failed"
            try:
                await self.session.commit()
            except Exception:
                await self.session.rollback()
                raise
            raise ValidationError("Razorpay signature verification failed.")

        existing_policy = await self.policy_repo.get_active_for_user(payload.user_id)
        if existing_policy:
            payment.policy_id = existing_policy.id
            payment.status = PaymentStatus.success
            payment.provider_payment_id = payload.razorpay_payment_id
            payment.provider_signature = payload.razorpay_signature
            payment.verified_at = datetime.now(timezone.utc)
            try:
                await self.session.commit()
            except Exception:
                await self.session.rollback()
                raise
            return {
                "status": "verified",
                "payment_status": payment.status.value,
                "order_id": payment.provider_order_id,
                "payment_id": payment.provider_payment_id,
                "policy": existing_policy,
            }

        quote = payment.quote_snapshot
        policy = Policy(
            user_id=payload.user_id,
            plan_tier=quote["plan_tier"],
            weekly_premium=quote["weekly_premium"],
            daily_coverage=quote["daily_coverage"],
            max_weekly_payout=quote["max_weekly_payout"],
            status=PolicyStatus.active,
            activated_at=datetime.now(timezone.utc),
            expires_at=self._parse_quote_datetime(quote["expires_at"]),
        )
        try:
            await self.policy_repo.create(policy)
            payment.policy_id = policy.id
            payment.status = PaymentStatus.success
            payment.provider_payment_id = payload.razorpay_payment_id
            payment.provider_signature = payload.razorpay_signature
            payment.verified_at = datetime.now(timezone.utc)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

        return {
            "status": "verified",
            "payment_status": payment.status.value,
            "order_id": payment.provider_order_id,
            "payment_id": payment.provider_payment_id,
            "policy": policy,
        }

    async def verify_webhook_signature(self, body: bytes, signature: str | None) -> None:
        settings = get_settings()
        if not settings.razorpay_webhook_secret:
            raise IntegrationError("Razorpay webhook secret is missing.")
        expected = hmac.new(
            settings.razorpay_webhook_secret.get_secret_value().encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature):
            raise ValidationError("Webhook signature verification failed.")
