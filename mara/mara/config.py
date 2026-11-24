"""Config loading: YAML in /config, validated by pydantic (docs/CONTRACTS.md §4).

Policies, standards, reminder cadence and message templates are config, not code.
Every file must parse; tests/test_config.py proves it.
"""

from __future__ import annotations

from datetime import time
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from mara.settings import get_settings

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _find_dir(name: str, override: str | None) -> Path:
    candidates = [Path(override)] if override else []
    candidates += [_REPO_ROOT / name, Path("/root") / name]
    for c in candidates:
        if c.is_dir():
            return c
    raise FileNotFoundError(f"could not find the {name!r} directory (tried {candidates})")


ROOT_DIRS = {"prompts": _REPO_ROOT / "prompts", "config": _REPO_ROOT / "config"}


def config_dir() -> Path:
    return _find_dir("config", get_settings().mara_config_dir)


def prompts_dir() -> Path:
    return _find_dir("prompts", get_settings().mara_prompts_dir)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DocumentType(_Strict):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    standard_key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")


class DocumentTypesFile(_Strict):
    document_types: list[DocumentType] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self):
        keys = [t.key for t in self.document_types]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate document type key")
        return self


class Rule(_Strict):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    description: str = Field(min_length=1)
    severity: Literal["blocker", "warning"] = "blocker"
    client_fix_text: str = Field(min_length=1)


class Standard(_Strict):
    key: str
    name: str
    required_signatures: list[Rule] = []
    required_initials: list[Rule] = []
    required_dates: list[Rule] = []
    required_fields: list[Rule] = []
    other_rules: list[Rule] = []

    @model_validator(mode="after")
    def _unique_rules(self):
        keys = [r.key for r, _ in self.rules()]
        if len(keys) != len(set(keys)):
            raise ValueError(f"standard {self.key}: duplicate rule key")
        if not keys:
            raise ValueError(f"standard {self.key}: no rules")
        return self

    def rules(self) -> list[tuple[Rule, str]]:
        """Every rule with its category: signature | initials | date | field | other."""
        out: list[tuple[Rule, str]] = []
        for cat, rules in (
            ("signature", self.required_signatures),
            ("initials", self.required_initials),
            ("date", self.required_dates),
            ("field", self.required_fields),
            ("other", self.other_rules),
        ):
            out += [(r, cat) for r in rules]
        return out


class Cadence(_Strict):
    # Days after the deal was created for the first reminder, then each next reminder.
    days: list[int] = Field(min_length=1)
    repeat_every_days: int = Field(gt=0)


class QuietHours(_Strict):
    start: time  # e.g. 20:00 (no sends from here...)
    end: time  # ...until here, in the client's local time

    def contains(self, t: time) -> bool:
        if self.start <= self.end:
            return self.start <= t < self.end
        return t >= self.start or t < self.end


class Reminders(_Strict):
    cadence: Cadence
    send_hour_local: int = Field(ge=0, le=23)
    quiet_hours: QuietHours
    max_per_client_per_day: int = Field(ge=1, le=5, default=1)
    stuck_document_minutes: int = Field(gt=0, default=10)

    @field_validator("quiet_hours", mode="before")
    @classmethod
    def _times(cls, v):
        return v


class Messages(_Strict):
    invite: str
    verify_code: str
    reminder: str
    fix_request_footer: str


@lru_cache
def _read(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a mapping at the top level")
    return data


def load_document_types(base: Path | None = None) -> list[DocumentType]:
    base = base or config_dir()
    return DocumentTypesFile.model_validate(_read(str(base / "document_types.yaml"))).document_types


def load_standard(standard_key: str, base: Path | None = None) -> Standard:
    base = base or config_dir()
    if not standard_key.replace("_", "").isalnum():
        raise ValueError(f"bad standard key {standard_key!r}")
    return Standard.model_validate(_read(str(base / "standards" / f"{standard_key}.yaml")))


def load_reminders(base: Path | None = None) -> Reminders:
    base = base or config_dir()
    return Reminders.model_validate(_read(str(base / "reminders.yaml")))


def load_messages(base: Path | None = None) -> Messages:
    base = base or config_dir()
    return Messages.model_validate(_read(str(base / "messages.yaml")))
