from __future__ import annotations

from typing import Any

import requests

from app.config import get_settings

PUBLIC_USER_COLUMNS = (
    "id",
    "username",
    "name",
    "phone",
    "city",
    "delivery_zone",
    "platform",
    "weekly_income",
    "risk_score",
)
PRIVATE_USER_COLUMNS = PUBLIC_USER_COLUMNS + ("password_hash",)


class SupabaseConfigError(RuntimeError):
    pass


class SupabaseRequestError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 500,
        code: str | None = None,
        details: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details


def normalize_username(username: str) -> str:
    return username.strip().lower()


def serialize_public_user(record: dict[str, Any]) -> dict[str, Any]:
    return {column: record[column] for column in PUBLIC_USER_COLUMNS if column in record}


def _rest_url(path: str) -> str:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SupabaseConfigError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before using Supabase-backed users."
        )
    return f"{settings.supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"


def _headers(*, prefer: str | None = None) -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise SupabaseConfigError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before using Supabase-backed users."
        )

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _request(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    prefer: str | None = None,
) -> Any:
    try:
        response = requests.request(
            method=method,
            url=_rest_url(path),
            headers=_headers(prefer=prefer),
            params=params,
            json=json_body,
            timeout=10,
        )
    except requests.RequestException as error:
        raise SupabaseRequestError(
            "Unable to reach Supabase. Check the project URL, service role key, and network access."
        ) from error

    if response.ok:
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    message = payload.get("message") or payload.get("detail") or "Supabase request failed."
    details = payload.get("details")
    if details:
        message = f"{message} ({details})"

    raise SupabaseRequestError(
        message,
        status_code=response.status_code,
        code=payload.get("code"),
        details=details,
    )


def _first_record(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, list):
        return payload[0] if payload else None
    if isinstance(payload, dict):
        return payload
    return None


def _column_string(include_password_hash: bool = False) -> str:
    columns = PRIVATE_USER_COLUMNS if include_password_hash else PUBLIC_USER_COLUMNS
    return ",".join(columns)


def create_user(user_data: dict[str, Any]) -> dict[str, Any]:
    payload = _request(
        "POST",
        "users",
        json_body=user_data,
        prefer="return=representation",
    )
    record = _first_record(payload)
    if not record:
        raise SupabaseRequestError("Supabase did not return the created user record.")
    return serialize_public_user(record)


def fetch_user_by_id(user_id: int, *, include_password_hash: bool = False) -> dict[str, Any] | None:
    payload = _request(
        "GET",
        "users",
        params={
            "select": _column_string(include_password_hash),
            "id": f"eq.{user_id}",
            "limit": "1",
        },
    )
    return _first_record(payload)


def find_user_by_username(
    username: str,
    *,
    include_password_hash: bool = False,
) -> dict[str, Any] | None:
    payload = _request(
        "GET",
        "users",
        params={
            "select": _column_string(include_password_hash),
            "username": f"eq.{normalize_username(username)}",
            "limit": "1",
        },
    )
    return _first_record(payload)


def find_user_by_phone(phone: str) -> dict[str, Any] | None:
    payload = _request(
        "GET",
        "users",
        params={
            "select": ",".join(PUBLIC_USER_COLUMNS),
            "phone": f"eq.{phone}",
            "limit": "1",
        },
    )
    return _first_record(payload)
