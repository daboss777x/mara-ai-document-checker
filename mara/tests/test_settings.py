import pytest

from mara.settings import MissingSettingError, Settings, require


def test_settings_load_with_empty_env(monkeypatch):
    for key in ["DATABASE_URL", "MARA_HMAC_SECRET", "SUPABASE_URL", "MARA_CHECK_MODEL"]:
        monkeypatch.delenv(key, raising=False)
    s = Settings()
    assert s.database_url is None and s.mara_check_model == "claude-opus-5-5"


def test_require_names_missing_var():
    with pytest.raises(MissingSettingError, match="DATABASE_URL"):
        require(None, "DATABASE_URL")


def test_import_app_module_has_no_side_effects():
    import app

    assert app.app.name == "mara"


def test_removed_providers_have_no_settings():
    banned = ("twilio", "resend", "sentry", "google", "mara_public_url")
    assert not [f for f in Settings.model_fields if f.startswith(banned)]
