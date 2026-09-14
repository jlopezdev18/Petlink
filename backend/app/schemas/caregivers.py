from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CaregiverCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    pet_id: UUID = Field(alias="petId")
    caregiver_email: str = Field(alias="caregiverEmail", min_length=3)
    preset: str = "caregiver"
    notes: str | None = None


class CaregiverUpdateRequest(BaseModel):
    preset: str = "caregiver"
    notes: str | None = None


class CaregiverResponse(BaseModel):
    id: UUID
    petId: UUID
    petName: str
    ownerId: UUID
    ownerName: str
    ownerEmail: str | None
    caregiverId: UUID
    caregiverName: str
    caregiverEmail: str | None
    preset: str
    status: str
    notes: str
    isOwner: bool
    createdAt: datetime


class AccessCodeCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    pet_id: UUID = Field(alias="petId")
    expires_at: datetime = Field(alias="expiresAt")
    purpose: str = "caregiver"


class AccessCodeResponse(BaseModel):
    id: UUID
    petId: UUID
    petName: str
    purpose: str
    expiresAt: datetime
    revokedAt: datetime | None
    lastUsedAt: datetime | None
    createdAt: datetime
    isActive: bool


class AccessCodeCreateResponse(AccessCodeResponse):
    code: str
