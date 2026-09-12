from datetime import date
from uuid import UUID

from pydantic import BaseModel


class PrescriptionResponse(BaseModel):
    id: UUID
    petId: UUID
    ownerId: UUID
    medicationId: UUID | None
    medicationName: str | None
    title: str
    prescribedBy: str
    issuedOn: date
    notes: str
    fileUrl: str | None
    filePath: str
    mimeType: str | None
    sizeBytes: int | None


class PrescriptionListResponse(BaseModel):
    prescriptions: list[PrescriptionResponse]
