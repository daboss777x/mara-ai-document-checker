"""Pydantic models for endpoint bodies (docs/CONTRACTS.md §4)."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class EventIn(BaseModel):
    """Supabase webhook body: `{type, id}`."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["document.created", "message.queued"]
    id: UUID


class ClientRequest(BaseModel):
    """Body of POST /client/{action}. Extra fields per action are validated separately."""

    model_config = ConfigDict(extra="ignore")

    token: str = Field(min_length=8, max_length=256)
    session: str | None = Field(default=None, max_length=256)


class ItemIn(ClientRequest):
    itemId: UUID  # noqa: N815 (camelCase wire format)


class VerifyCodeIn(ClientRequest):
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


class CreateUploadIn(ItemIn):
    filename: str = Field(min_length=1, max_length=255)
    sizeBytes: int = Field(gt=0)  # noqa: N815
    mime: str = Field(min_length=1, max_length=200)


class ConfirmUploadIn(ClientRequest):
    documentId: UUID  # noqa: N815


class OptOutIn(ClientRequest):
    optOut: bool  # noqa: N815
