from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    dose_interval_hours: int | None = Field(default=None, alias="doseIntervalHours", ge=1, le=8760)
    next_dose_at: datetime | None = Field(default=None, alias="nextDoseAt")

    @model_validator(mode="after")
    def validate_schedule(self) -> "MedicationRequest":
        has_interval = self.dose_interval_hours is not None
        has_next_dose = self.next_dose_at is not None

        if has_interval != has_next_dose:
            raise ValueError("doseIntervalHours and nextDoseAt must be provided together.")

        if self.next_dose_at is not None and self.next_dose_at.tzinfo is None:
            raise ValueError("nextDoseAt must include a timezone.")

        return self


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
    doseIntervalHours: int | None
    nextDoseAt: datetime | None


class DueMedicationResponse(MedicationResponse):
    petName: str


class MedicationListResponse(BaseModel):
    medications: list[MedicationResponse]


class DueMedicationListResponse(BaseModel):
    medications: list[DueMedicationResponse]


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
    nextDoseAt: datetime | None


class MedicationAdministrationHistoryItem(BaseModel):
    id: UUID
    medicationId: UUID
    scheduledFor: datetime
    administeredAt: datetime | None
    status: str
    notes: str
    createdAt: datetime


class MedicationAdministrationHistoryResponse(BaseModel):
    administrations: list[MedicationAdministrationHistoryItem]
