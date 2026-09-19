from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.medications import MedicationResponse
from app.schemas.prescriptions import PrescriptionResponse


class GuestAccessRequest(BaseModel):
    code: str = Field(min_length=4)
    guestName: str | None = None


class GuestPetResponse(BaseModel):
    id: UUID
    ownerName: str
    name: str
    species: str
    breed: str
    sex: str
    color: str
    birthDate: date | None
    weightKg: float | None
    notes: str
    photoUrl: str | None


class GuestAccessResponse(BaseModel):
    pet: GuestPetResponse
    medications: list[MedicationResponse]
    prescriptions: list[PrescriptionResponse]
    purpose: str
    expiresAt: datetime


class GuestMedicationAdministrationRequest(GuestAccessRequest):
    notes: str | None = None


class GuestMedicationAdministrationResponse(BaseModel):
    id: UUID
    medicationId: UUID
    administeredAt: datetime
    status: str
    notes: str


class GuestMedicationCreateRequest(GuestAccessRequest):
    name: str = Field(min_length=1)
    dosage: str = Field(min_length=1)
    frequency: str = Field(min_length=1)
    startDate: date
    endDate: date | None = None
    prescribingVet: str | None = None
    instructions: str | None = None
