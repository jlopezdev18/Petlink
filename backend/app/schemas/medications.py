from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MedicationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    pet_id: UUID = Field(alias="petId")
    name: str = Field(min_length=1)
    dosage: str = Field(min_length=1)
    frequency: str = Field(min_length=1)
    start_date: date = Field(alias="startDate")
    end_date: date | None = Field(default=None, alias="endDate")
    prescribing_vet: str | None = Field(default=None, alias="prescribingVet")
    instructions: str | None = None
    is_active: bool = Field(default=True, alias="isActive")


class MedicationResponse(BaseModel):
    id: UUID
    petId: UUID
    name: str
    dosage: str
    frequency: str
    startDate: date
    endDate: date | None
    prescribingVet: str
    instructions: str
    isActive: bool


class MedicationListResponse(BaseModel):
    medications: list[MedicationResponse]


class MedicationLogRequest(BaseModel):
    scheduled_for: datetime
    administered_at: datetime | None = None
    status: str = "scheduled"
    notes: str | None = None


class MedicationLogResponse(MedicationLogRequest):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    medication_id: UUID


class MedicationAdministrationRequest(BaseModel):
    notes: str | None = None


class MedicationAdministrationResponse(BaseModel):
    id: UUID
    medicationId: UUID
    administeredAt: datetime
    status: str
    notes: str
