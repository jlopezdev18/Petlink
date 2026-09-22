from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


SightingReportStatus = Literal["pending", "reviewed", "dismissed"]


class PetQrTagUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    isLost: bool
    lostMessage: str | None = Field(default=None, max_length=500)
    showOwnerPhone: bool


class PetQrTagResponse(BaseModel):
    id: UUID
    petId: UUID
    token: str
    isLost: bool
    lostMessage: str
    showOwnerPhone: bool
    pendingReportCount: int
    createdAt: datetime
    updatedAt: datetime


class PublicQrPetResponse(BaseModel):
    name: str
    species: str
    breed: str
    sex: str
    color: str
    photoUrl: str | None


class PublicPetQrTagResponse(BaseModel):
    pet: PublicQrPetResponse
    isLost: bool
    lostMessage: str
    ownerPhone: str | None


class SightingReportCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reporterName: str | None = Field(default=None, max_length=100)
    reporterPhone: str | None = Field(default=None, max_length=30)
    message: str = Field(min_length=5, max_length=1000)
    locationDescription: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    accuracyMeters: float | None = Field(default=None, ge=0, le=100000)

    @model_validator(mode="after")
    def validate_coordinates(self) -> Self:
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together.")
        if self.accuracyMeters is not None and self.latitude is None:
            raise ValueError("Coordinates are required when accuracy is provided.")
        return self


class SightingReportStatusRequest(BaseModel):
    status: SightingReportStatus


class SightingReportResponse(BaseModel):
    id: UUID
    petId: UUID
    status: SightingReportStatus
    reporterName: str
    reporterPhone: str
    message: str
    locationDescription: str
    latitude: float | None
    longitude: float | None
    accuracyMeters: float | None
    createdAt: datetime
    updatedAt: datetime


class SightingReportListResponse(BaseModel):
    reports: list[SightingReportResponse]
