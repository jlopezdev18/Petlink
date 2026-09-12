from datetime import date, datetime, timezone
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select

from app.access import get_owned_pet_or_404
from app.core.config import get_settings
from app.dependencies import CurrentUserDep, DbSession
from app.models import Medication, Prescription
from app.schemas.prescriptions import PrescriptionListResponse, PrescriptionResponse
from app.services.storage import PetFileStorage

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

ALLOWED_PRESCRIPTION_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


@router.get("", response_model=PrescriptionListResponse)
def list_prescriptions(
    petId: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> PrescriptionListResponse:
    pet = get_owned_pet_or_404(db, current_user.id, petId)
    prescriptions = db.scalars(
        select(Prescription)
        .where(Prescription.pet_id == pet.id, Prescription.owner_id == current_user.id)
        .order_by(Prescription.issued_on.desc(), Prescription.created_at.desc())
    ).all()

    return PrescriptionListResponse(
        prescriptions=[serialize_prescription(prescription) for prescription in prescriptions]
    )


@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_prescription(
    current_user: CurrentUserDep,
    db: DbSession,
    petId: Annotated[UUID, Form()],
    title: Annotated[str, Form()],
    issuedOn: Annotated[date, Form()],
    prescribedBy: Annotated[str, Form()] = "",
    medicationId: Annotated[UUID | None, Form()] = None,
    notes: Annotated[str, Form()] = "",
    file: Annotated[UploadFile, File()] = ...,
) -> PrescriptionResponse:
    pet = get_owned_pet_or_404(db, current_user.id, petId)
    medication = get_pet_medication(db, medicationId, pet.id)
    path, size_bytes = upload_prescription_file(current_user.id, pet.id, file)
    prescription = Prescription(
        pet_id=pet.id,
        owner_id=current_user.id,
        medication_id=medication.id if medication else None,
        title=clean_required_text(title, "title"),
        prescribed_by=clean_optional_text(prescribedBy),
        issued_on=issuedOn,
        notes=clean_optional_text(notes),
        bucket_id=get_settings().pet_files_bucket,
        file_path=path,
        mime_type=file.content_type,
        size_bytes=size_bytes,
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return serialize_prescription(prescription)


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
def update_prescription(
    prescription_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
    petId: Annotated[UUID, Form()],
    title: Annotated[str, Form()],
    issuedOn: Annotated[date, Form()],
    prescribedBy: Annotated[str, Form()] = "",
    medicationId: Annotated[UUID | None, Form()] = None,
    notes: Annotated[str, Form()] = "",
    file: Annotated[UploadFile | None, File()] = None,
) -> PrescriptionResponse:
    prescription = get_owned_prescription_or_404(db, current_user.id, prescription_id)
    pet = get_owned_pet_or_404(db, current_user.id, petId)
    medication = get_pet_medication(db, medicationId, pet.id)
    previous_file_path = prescription.file_path

    prescription.pet_id = pet.id
    prescription.medication_id = medication.id if medication else None
    prescription.title = clean_required_text(title, "title")
    prescription.prescribed_by = clean_optional_text(prescribedBy)
    prescription.issued_on = issuedOn
    prescription.notes = clean_optional_text(notes)

    if file and file.filename:
        path, size_bytes = upload_prescription_file(current_user.id, pet.id, file)
        prescription.file_path = path
        prescription.mime_type = file.content_type
        prescription.size_bytes = size_bytes

    db.commit()
    db.refresh(prescription)

    if file and file.filename and previous_file_path != prescription.file_path:
        get_storage().delete_file(previous_file_path)

    return serialize_prescription(prescription)


@router.delete("/{prescription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prescription(
    prescription_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> None:
    prescription = get_owned_prescription_or_404(db, current_user.id, prescription_id)
    file_path = prescription.file_path
    db.delete(prescription)
    db.commit()
    get_storage().delete_file(file_path)


def get_owned_prescription_or_404(db: DbSession, owner_id: UUID, prescription_id: UUID) -> Prescription:
    prescription = db.scalar(
        select(Prescription).where(Prescription.id == prescription_id, Prescription.owner_id == owner_id)
    )

    if prescription is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found.")

    return prescription


def get_pet_medication(db: DbSession, medication_id: UUID | None, pet_id: UUID) -> Medication | None:
    if medication_id is None:
        return None

    medication = db.scalar(select(Medication).where(Medication.id == medication_id, Medication.pet_id == pet_id))

    if medication is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Medication does not belong to this pet.",
        )

    return medication


def upload_prescription_file(user_id: UUID, pet_id: UUID, file: UploadFile) -> tuple[str, int]:
    if file.content_type not in ALLOWED_PRESCRIPTION_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prescription file must be a PDF or image.",
        )

    extension = ALLOWED_PRESCRIPTION_MIME_TYPES[file.content_type]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    path = PurePosixPath(str(user_id), str(pet_id), "prescriptions", f"prescription-{timestamp}{extension}")
    content = file.file.read()
    return get_storage().upload_pet_file(str(path), file, content), len(content)


def serialize_prescription(prescription: Prescription) -> PrescriptionResponse:
    return PrescriptionResponse(
        id=prescription.id,
        petId=prescription.pet_id,
        ownerId=prescription.owner_id,
        medicationId=prescription.medication_id,
        medicationName=prescription.medication.name if prescription.medication else None,
        title=prescription.title,
        prescribedBy=prescription.prescribed_by or "",
        issuedOn=prescription.issued_on,
        notes=prescription.notes or "",
        fileUrl=get_storage().create_signed_url(prescription.file_path),
        filePath=prescription.file_path,
        mimeType=prescription.mime_type,
        sizeBytes=prescription.size_bytes,
    )


def clean_required_text(value: str, field_name: str) -> str:
    cleaned = value.strip()

    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is required.",
        )

    return cleaned


def clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def get_storage() -> PetFileStorage:
    return PetFileStorage(get_settings())
