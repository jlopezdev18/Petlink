from datetime import date
from uuid import UUID

from pydantic import BaseModel


class PetResponse(BaseModel):
    id: UUID
    ownerId: UUID
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
    photoPath: str | None
    isOwner: bool
    canUpdatePet: bool
    canManageMedications: bool
    pendingSightingReports: int


class PetListResponse(BaseModel):
    pets: list[PetResponse]
