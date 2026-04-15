from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class PolicyStatus(str, Enum):
    pending = "pending"
    active = "active"
    cancelled = "cancelled"
    expired = "expired"


class ClaimStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    flagged = "flagged"
    rejected = "rejected"
    processing = "processing"


class PaymentStatus(str, Enum):
    pending = "pending"
    success = "success"
    failed = "failed"


class PaymentProvider(str, Enum):
    razorpay = "razorpay"


class TriggerEventStatus(str, Enum):
    detected = "detected"
    processed = "processed"
    dismissed = "dismissed"


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("phone", name="uq_users_phone"),
        CheckConstraint("weekly_income > 0", name="ck_users_weekly_income_positive"),
        Index("ix_users_city_platform", "city", "platform"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(30), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    city: Mapped[str] = mapped_column(String(60), nullable=False)
    delivery_zone: Mapped[str] = mapped_column(String(80), nullable=False)
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    weekly_income: Mapped[float] = mapped_column(Float, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    policies: Mapped[list["Policy"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    claims: Mapped[list["Claim"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    trigger_events: Mapped[list["TriggerEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Policy(Base, TimestampMixin):
    __tablename__ = "policies"
    __table_args__ = (
        CheckConstraint("weekly_premium >= 0", name="ck_policies_weekly_premium_non_negative"),
        CheckConstraint("daily_coverage >= 0", name="ck_policies_daily_coverage_non_negative"),
        CheckConstraint("max_weekly_payout >= daily_coverage", name="ck_policies_max_weekly_gte_daily"),
        Index("ix_policies_user_status", "user_id", "status"),
        Index(
            "uq_policies_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    weekly_premium: Mapped[float] = mapped_column(Float, nullable=False)
    daily_coverage: Mapped[float] = mapped_column(Float, nullable=False)
    max_weekly_payout: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[PolicyStatus] = mapped_column(SqlEnum(PolicyStatus), default=PolicyStatus.pending, nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="policies")
    claims: Mapped[list["Claim"]] = relationship(back_populates="policy", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="policy")
    trigger_events: Mapped[list["TriggerEvent"]] = relationship(back_populates="policy")


class Claim(Base, TimestampMixin):
    __tablename__ = "claims"
    __table_args__ = (
        CheckConstraint("hours_lost > 0 AND hours_lost <= 24", name="ck_claims_hours_lost_range"),
        CheckConstraint("claim_amount > 0", name="ck_claims_claim_amount_positive"),
        Index("ix_claims_user_status", "user_id", "status"),
        Index("ix_claims_policy_created_at", "policy_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id", ondelete="CASCADE"), nullable=False)
    disruption_type: Mapped[str] = mapped_column(String(40), nullable=False)
    hours_lost: Mapped[float] = mapped_column(Float, nullable=False)
    claim_amount: Mapped[float] = mapped_column(Float, nullable=False)
    fraud_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[ClaimStatus] = mapped_column(SqlEnum(ClaimStatus), default=ClaimStatus.pending, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="claims")
    policy: Mapped["Policy"] = relationship(back_populates="claims")


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_payments_idempotency_key"),
        UniqueConstraint("provider_order_id", name="uq_payments_provider_order_id"),
        UniqueConstraint("provider_payment_id", name="uq_payments_provider_payment_id"),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        Index("ix_payments_user_status", "user_id", "status"),
        Index("ix_payments_quote_id", "quote_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(40), default=lambda: f"pay_{uuid4().hex[:16]}", nullable=False, unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[int | None] = mapped_column(ForeignKey("policies.id", ondelete="SET NULL"))
    provider: Mapped[PaymentProvider] = mapped_column(SqlEnum(PaymentProvider), default=PaymentProvider.razorpay, nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    quote_id: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(SqlEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    provider_order_id: Mapped[str | None] = mapped_column(String(80))
    provider_payment_id: Mapped[str | None] = mapped_column(String(80))
    provider_signature: Mapped[str | None] = mapped_column(String(255))
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    quote_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    provider_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="payments")
    policy: Mapped["Policy"] = relationship(back_populates="payments")


class TriggerEvent(Base, TimestampMixin):
    __tablename__ = "trigger_events"
    __table_args__ = (
        Index("ix_trigger_events_user_status", "user_id", "status"),
        Index("ix_trigger_events_zone_created_at", "zone", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(40), default=lambda: f"evt_{uuid4().hex[:16]}", nullable=False, unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    policy_id: Mapped[int | None] = mapped_column(ForeignKey("policies.id", ondelete="SET NULL"))
    zone: Mapped[str] = mapped_column(String(80), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[TriggerEventStatus] = mapped_column(
        SqlEnum(TriggerEventStatus),
        default=TriggerEventStatus.detected,
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    eligible_for_claim: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="trigger_events")
    policy: Mapped["Policy"] = relationship(back_populates="trigger_events")
