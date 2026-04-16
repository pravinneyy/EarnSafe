from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # ── Firebase Phone Auth ────────────────────────────────────────────────
    # FIREBASE_SERVICE_ACCOUNT_JSON: base64-encoded Firebase service account JSON
    # Get it from: Firebase Console → Project Settings → Service accounts → Generate key
    # Then run: base64 -w0 service-account.json (Linux/macOS) or
    #           [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json")) (PowerShell)
    firebase_service_account_json: SecretStr | None = None  # base64-encoded JSON
    firebase_project_id: str | None = None                  # used for token verification fallback

    @computed_field
    @property
    def celery_effective_broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @computed_field
    @property
    def celery_effective_result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
