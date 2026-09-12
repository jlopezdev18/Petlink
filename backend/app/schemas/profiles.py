from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: str = Field(alias="fullName", min_length=1)
    phone: str | None = None
    avatar_url: str | None = Field(default=None, alias="avatarUrl")


class ProfileResponse(BaseModel):
    id: UUID
    email: str | None
    fullName: str
    phone: str
    avatarUrl: str | None


class ProfileSearchResponse(BaseModel):
    id: UUID
    email: str | None
    fullName: str
