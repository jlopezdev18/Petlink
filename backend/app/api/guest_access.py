from datetime import date, datetime, timezone
import hashlib
import string
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.medications import clean_optional_text as clean_optional_medication_text
from app.api.medications import clean_required_text, serialize_medication, validate_dates
from app.api.pets import SEX_TO_UI, SPECIES_TO_UI, get_storage
from app.api.prescriptions import (
    get_pet_medication,
    serialize_prescription,
    upload_prescription_file,
)
from app.core.config import get_settings
from app.dependencies import DbSession
from app.models import Medication, MedicationLog, Pet, PetAccessCode, Prescription
from app.schemas.guest_access import (
    GuestAccessRequest,
    GuestAccessResponse,
    GuestMedicationCreateRequest,
    GuestMedicationAdministrationRequest,
    GuestMedicationAdministrationResponse,
    GuestPetResponse,
)
from app.schemas.medications import MedicationResponse
from app.schemas.prescriptions import PrescriptionResponse

router = APIRouter(prefix="/guest-access", tags=["guest-access"])


@router.post("/validate", response_model=GuestAccessResponse)
def validate_guest_access(request: GuestAccessRequest, db: DbSession) -> GuestAccessResponse:
    access_code = get_active_access_code(db, request.code)
    access_code.last_used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(access_code)
    return serialize_guest_access(db, access_code)


@router.post("/medications/{medication_id}/administer", response_model=GuestMedicationAdministrationResponse)
def administer_medication(
    medication_id: UUID,
    request: GuestMedicationAdministrationRequest,
    db: DbSession,
) -> GuestMedicationAdministrationResponse:
    access_code = get_active_access_code(db, request.code)
    medication = db.scalar(
        select(Medication).where(
            Medication.id == medication_id,
            Medication.pet_id == access_code.pet_id,
            Medication.is_active.is_(True),
        )
    )

    if medication is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found for this access code.")

    now = datetime.now(timezone.utc)
    note_parts = []
    guest_name = clean_optional_text(request.guestName)
    guest_notes = clean_optional_text(request.notes)
    if guest_name:
        note_parts.append(f"Administrado por {guest_name}.")
    if guest_notes:
        note_parts.append(guest_notes)

    medication_log = MedicationLog(
        medication_id=medication.id,
        scheduled_for=now,
        administered_at=now,
        status="given",
        notes=" ".join(note_parts) or None,
    )
    access_code.last_used_at = now
    db.add(medication_log)
    db.commit()
    db.refresh(medication_log)

    return GuestMedicationAdministrationResponse(
        id=medication_log.id,
        medicationId=medication_log.medication_id,
        administeredAt=medication_log.administered_at or now,
        status=medication_log.status,
        notes=medication_log.notes or "",
    )


@router.post("/medications", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_medication(
    request: GuestMedicationCreateRequest,
    db: DbSession,
) -> MedicationResponse:
    access_code = get_active_access_code(db, request.code)
    require_veterinarian_access(access_code)
    medication = Medication(
        pet_id=access_code.pet_id,
        name=clean_required_text(request.name, "name"),
        dosage=clean_required_text(request.dosage, "dosage"),
        frequency=clean_required_text(request.frequency, "frequency"),
        start_date=request.startDate,
        end_date=request.endDate,
        prescribing_vet=clean_optional_medication_text(request.prescribingVet),
        instructions=clean_optional_medication_text(request.instructions),
        is_active=True,
    )
    validate_dates(medication)
    access_code.last_used_at = datetime.now(timezone.utc)
    db.add(medication)
    db.commit()
    db.refresh(medication)
    return serialize_medication(medication)


@router.post("/prescriptions", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_prescription(
    db: DbSession,
    code: Annotated[str, Form()],
    guestName: Annotated[str, Form()] = "",
    title: Annotated[str, Form()] = "",
    issuedOn: Annotated[date | None, Form()] = None,
    prescribedBy: Annotated[str, Form()] = "",
    medicationId: Annotated[UUID | None, Form()] = None,
    notes: Annotated[str, Form()] = "",
    file: Annotated[UploadFile, File()] = ...,
) -> PrescriptionResponse:
    access_code = get_active_access_code(db, code)
    require_veterinarian_access(access_code)
    medication = get_pet_medication(db, medicationId, access_code.pet_id)
    prescription_file_path, size_bytes = upload_prescription_file(access_code.owner_id, access_code.pet_id, file)
    vet_name = clean_optional_text(prescribedBy) or clean_optional_text(guestName)
    prescription = Prescription(
        pet_id=access_code.pet_id,
        owner_id=access_code.owner_id,
        medication_id=medication.id if medication else None,
        title=clean_required_text(title, "title"),
        prescribed_by=vet_name,
        issued_on=issuedOn or date.today(),
        notes=clean_optional_text(notes),
        bucket_id=get_settings().pet_files_bucket,
        file_path=prescription_file_path,
        mime_type=file.content_type,
        size_bytes=size_bytes,
    )
    access_code.last_used_at = datetime.now(timezone.utc)
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return serialize_prescription(prescription)


def get_active_access_code(db: DbSession, code: str) -> PetAccessCode:
    code_hash = hash_access_code(code)
    access_code = db.scalar(select(PetAccessCode).where(PetAccessCode.code_hash == code_hash))
    now = datetime.now(timezone.utc)

    if access_code is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access code.")

    if access_code.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access code revoked.")

    if normalize_datetime(access_code.expires_at) <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access code expired.")

    return access_code


def require_veterinarian_access(access_code: PetAccessCode) -> None:
    if access_code.purpose != "veterinarian":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Veterinarian access code required.")


def serialize_guest_access(db: DbSession, access_code: PetAccessCode) -> GuestAccessResponse:
    pet = access_code.pet
    medications = db.scalars(
        select(Medication)
        .where(Medication.pet_id == pet.id, Medication.is_active.is_(True))
        .order_by(Medication.start_date.desc(), Medication.created_at.desc())
    ).all()
    prescriptions = db.scalars(
        select(Prescription)
        .where(Prescription.pet_id == pet.id)
        .order_by(Prescription.issued_on.desc(), Prescription.created_at.desc())
    ).all()

    return GuestAccessResponse(
        pet=serialize_guest_pet(pet),
        medications=[serialize_medication(medication) for medication in medications],
        prescriptions=[serialize_prescription(prescription) for prescription in prescriptions],
        purpose=access_code.purpose,
        expiresAt=access_code.expires_at,
    )


def serialize_guest_pet(pet: Pet) -> GuestPetResponse:
    return GuestPetResponse(
        id=pet.id,
        ownerName=pet.owner.full_name,
        name=pet.name,
        species=SPECIES_TO_UI.get(pet.species, "Otro"),
        breed=pet.breed or "",
        sex=SEX_TO_UI.get(pet.sex or "", ""),
        color=pet.color or "",
        birthDate=pet.birth_date,
        weightKg=float(pet.weight_kg) if pet.weight_kg is not None else None,
        notes=pet.notes or "",
        photoUrl=get_storage().create_signed_url(pet.photo_url),
    )


def hash_access_code(code: str) -> str:
    return hashlib.sha256(normalize_access_code(code).encode("utf-8")).hexdigest()


def normalize_access_code(code: str) -> str:
    return "".join(character for character in code.upper() if character in string.ascii_uppercase + string.digits)


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None
