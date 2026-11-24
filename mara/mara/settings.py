"""Runtime settings, read from env (Modal Secret "mara-secrets" in deployed envs).

Nothing is required at import time: every field is optional, and code that needs a
value calls `require(...)`, which raises a clear error naming the missing variable.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    mara_env: Literal["staging", "prod"] = "staging"

    # Service-to-service: verifies X-Mara-Signature on every endpoint.
    mara_hmac_secret: SecretStr | None = None

    # Database (Supabase Postgres, service role; bypasses RLS)
    database_url: SecretStr | None = None

    # Supabase Storage (uploads-staging -> deal-files)
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    # AI
    anthropic_api_key: SecretStr | None = None
    mara_check_model: str = "claude-opus-5-5"

    # SMS: EgoSMS only. Only mara.outbound.sender may build a provider.
    egosms_username: str | None = None
    egosms_password: SecretStr | None = None
    egosms_sender_id: str | None = None
    # Kept configurable (TODO(decision): confirm against EgoSMS's current API docs).
    egosms_api_url: str = "https://www.egosms.co/api/v1/json/"

    # "off" = demo without SMS: every message is recorded as blocked ("sms_disabled").
    mara_sms_mode: Literal["egosms", "off"] = "egosms"
    # False = demo without SMS: client links open without the 6-digit code.
    mara_client_verify: bool = True

    # Base URL of the web app, for portal links in SMS: {PUBLIC_SITE_URL}/c/{token}
    public_site_url: str | None = None

    # Optional overrides (default: <repo>/config and <repo>/prompts, or /root/* on Modal).
    mara_config_dir: str | None = None
    mara_prompts_dir: str | None = None


class MissingSettingError(RuntimeError):
    pass


@lru_cache
def get_settings() -> Settings:
    return Settings()


def require(value: object, env_name: str):
    """Return the plain value of a setting or raise naming the missing env var."""
    if value is None or value == "":
        raise MissingSettingError(f"{env_name} is not set")
    if isinstance(value, SecretStr):
        return value.get_secret_value()
    return value
