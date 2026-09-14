from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.access import get_medication_manageable_pet, get_medication_viewable_pet
from app.dependencies import CurrentUserDep, DbSession
from app.models import Medication, MedicationLog
from app.schemas.medications import (
    MedicationAdministrationRequest,
    MedicationAdministrationResponse,
    MedicationListResponse,
    MedicationRequest,
    MedicationResponse,
)

router = APIRouter(prefix="/medications", tags=["medications"])


@router.get("", response_model=MedicationListResponse)
def list_medications(
    petId: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> MedicationListResponse:
    pet = get_medication_viewable_pet(db, current_user.id, petId)
    medications = db.scalars(
        select(Medication)
        .where(Medication.pet_id == pet.id)
        .order_by(Medication.is_active.desc(), Medication.start_date.desc(), Medication.created_at.desc())
    ).all()

    return MedicationListResponse(medications=[serialize_medication(medication) for medication in medications])


@router.post("", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
def create_medication(
    request: MedicationRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> MedicationResponse:
    require_owner_mode(current_user)
    pet = get_medication_manageable_pet(db, current_user.id, request.pet_id)
    medication = Medication(
        pet_id=pet.id,
        name=clean_required_text(request.name, "name"),
        dosage=clean_required_text(request.dosage, "dosage"),
        frequency=clean_required_text(request.frequency, "frequency"),
        start_date=request.start_date,
        end_date=request.end_date,
        prescribing_vet=clean_optional_text(request.prescribing_vet),
        instructions=clean_optional_text(request.instructions),
        is_active=request.is_active,
    )
    validate_dates(medication)
    db.add(medication)
    db.commit()
    db.refresh(medication)
    return serialize_medication(medication)


@router.put("/{medication_id}", response_model=MedicationResponse)
def update_medication(
    medication_id: UUID,
    request: MedicationRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> MedicationResponse:
    require_owner_mode(current_user)
    medication = get_medication_or_404(db, medication_id)
    get_medication_manageable_pet(db, current_user.id, medication.pet_id)

    if medication.pet_id != request.pet_id:
        get_medication_manageable_pet(db, current_user.id, request.pet_id)
        medication.pet_id = request.pet_id

    medication.name = clean_required_text(request.name, "name")
    medication.dosage = clean_required_text(request.dosage, "dosage")
    medication.frequency = clean_required_text(request.frequency, "frequency")
    medication.start_date = request.start_date
    medication.end_date = request.end_date
    medication.prescribing_vet = clean_optional_text(request.prescribing_vet)
    medication.instructions = clean_optional_text(request.instructions)
    medication.is_active = request.is_active
    validate_dates(medication)
    db.commit()
    db.refresh(medication)
    return serialize_medication(medication)


@router.post("/{medication_id}/administer", response_model=MedicationAdministrationResponse)
def administer_medication(
    medication_id: UUID,
    request: MedicationAdministrationRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> MedicationAdministrationResponse:
    medication = get_medication_or_404(db, medication_id)
    get_medication_viewable_pet(db, current_user.id, medication.pet_id)

    if not medication.is_active:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Medication is inactive.")

    now = datetime.now(timezone.utc)
    medication_log = MedicationLog(
        medication_id=medication.id,
        scheduled_for=now,
        administered_at=now,
        status="given",
        notes=clean_optional_text(request.notes),
    )
    db.add(medication_log)
    db.commit()
    db.refresh(medication_log)
    return MedicationAdministrationResponse(
        id=medication_log.id,
        medicationId=medication_log.medication_id,
        administeredAt=medication_log.administered_at or now,
        status=medication_log.status,
        notes=medication_log.notes or "",
    )


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(
    medication_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> None:
    require_owner_mode(current_user)
    medication = get_medication_or_404(db, medication_id)
    get_medication_manageable_pet(db, current_user.id, medication.pet_id)

    if medication.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Medication must be inactive before deletion.",
        )

    db.delete(medication)
    db.commit()


def get_medication_or_404(db: DbSession, medication_id: UUID) -> Medication:
    medication = db.scalar(select(Medication).where(Medication.id == medication_id))

    if medication is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found.")

    return medication


def serialize_medication(medication: Medication) -> MedicationResponse:
    return MedicationResponse(
        id=medication.id,
        petId=medication.pet_id,
        name=medication.name,
        dosage=medication.dosage,
        frequency=medication.frequency,
        startDate=medication.start_date,
        endDate=medication.end_date,
        prescribingVet=medication.prescribing_vet or "",
        instructions=medication.instructions or "",
        isActive=medication.is_active,
    )


def validate_dates(medication: Medication) -> None:
    if medication.end_date is not None and medication.end_date < medication.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="endDate cannot be earlier than startDate.",
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


def require_owner_mode(current_user: CurrentUserDep) -> None:
    if current_user.account_type != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner mode required.")
