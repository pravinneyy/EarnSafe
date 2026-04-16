from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MSG91_SEND_OTP_URL = "https://control.msg91.com/api/v5/otp"
MSG91_VERIFY_OTP_URL = "https://control.msg91.com/api/v5/otp/verify"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "EarnSafe API"
    app_version: str = "2.0.0"
    environment: Literal["local", "development", "staging", "production"] = "development"
    debug: bool = Field(default=False, validation_alias=AliasChoices("APP_DEBUG"))
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    database_url: str = Field(..., description="Async SQLAlchemy connection string")
    redis_url: str = "redis://redis:6379/0"

    jwt_secret_key: SecretStr = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)

    openweather_api_key: SecretStr | None = None
    open_meteo_base_url: AnyHttpUrl = "https://api.open-meteo.com"
    open_meteo_air_quality_base_url: AnyHttpUrl = "https://air-quality-api.open-meteo.com"
    tomtom_api_key: SecretStr | None = None

    razorpay_key_id: SecretStr | None = None
    razorpay_key_secret: SecretStr | None = None
    razorpay_webhook_secret: SecretStr | None = None
    razorpay_base_url: AnyHttpUrl = "https://api.razorpay.com/v1"

    request_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    retry_attempts: int = Field(default=3, ge=1, le=10)
    ai_cache_ttl_seconds: int = Field(default=300, ge=30, le=86400)

    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # ── SMS / OTP gateway (MSG91) ──────────────────────────────────────────
    # Set these env vars to send real SMS via MSG91.
    # If not set, the OTP is returned in the API response as 'debug_otp'
    # (only shown when no gateway is configured, regardless of environment).
    msg91_api_key: SecretStr | None = None
    msg91_template_id: str | None = None      # MSG91 OTP template ID
    msg91_sender_id: str = "EARNSAFE"         # Registered Sender ID on MSG91
    msg91_otp_expiry_minutes: int = 5         # must match OTP_TTL_SECONDS / 60

    @computed_field
    @property
    def sms_gateway_configured(self) -> bool:
        """True when MSG91 credentials are fully set."""
        return bool(self.msg91_api_key and self.msg91_template_id)

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value is None:
            return value

        database_url = str(value).strip()
        if database_url.startswith("postgresql+asyncpg://"):
            return database_url
        if database_url.startswith("postgresql://"):
            return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if database_url.startswith("postgres://"):
            return database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        return database_url

    @computed_field
    @property
    def effective_celery_broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @computed_field
    @property
    def effective_celery_result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
