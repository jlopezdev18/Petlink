from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.access import get_medication_manageable_pet, get_medication_viewable_pet
from app.dependencies import CurrentUserDep, DbSession
from app.models import Medication, MedicationLog, Pet, PetCaregiver
from app.schemas.medications import (
    DueMedicationListResponse,
    DueMedicationResponse,
    MedicationAdministrationHistoryResponse,
    MedicationAdministrationHistoryItem,
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


@router.get("/due", response_model=DueMedicationListResponse)
def list_due_medications(
    current_user: CurrentUserDep,
    db: DbSession,
) -> DueMedicationListResponse:
    now = datetime.now(timezone.utc)
    today = now.date()
    caregiver_access = (
        (PetCaregiver.pet_id == Pet.id)
        & (PetCaregiver.caregiver_id == current_user.id)
        & (PetCaregiver.status == "accepted")
        & (PetCaregiver.can_view_pet.is_(True))
        & (PetCaregiver.can_view_medications.is_(True))
    )
    rows = db.execute(
        select(Medication, Pet.name)
        .join(Pet, Pet.id == Medication.pet_id)
        .outerjoin(PetCaregiver, caregiver_access)
        .where(
            Medication.is_active.is_(True),
            Medication.dose_interval_hours.is_not(None),
            Medication.next_dose_at.is_not(None),
            Medication.next_dose_at <= now,
            Medication.start_date <= today,
            or_(Medication.end_date.is_(None), Medication.end_date >= today),
            or_(Pet.owner_id == current_user.id, PetCaregiver.id.is_not(None)),
        )
        .order_by(Medication.next_dose_at.asc())
    ).all()

    return DueMedicationListResponse(
        medications=[serialize_due_medication(medication, pet_name) for medication, pet_name in rows]
    )


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
        dose_interval_hours=request.dose_interval_hours,
        next_dose_at=request.next_dose_at,
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
    medication.dose_interval_hours = request.dose_interval_hours
    medication.next_dose_at = request.next_dose_at
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
    scheduled_for = medication.next_dose_at or now
    medication_log = MedicationLog(
        medication_id=medication.id,
        scheduled_for=scheduled_for,
        administered_at=now,
        status="given",
        notes=clean_optional_text(request.notes),
    )
    medication.next_dose_at = calculate_next_dose_at(
        scheduled_for,
        medication.dose_interval_hours,
        now,
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
        nextDoseAt=medication.next_dose_at,
    )


@router.get("/{medication_id}/administrations", response_model=MedicationAdministrationHistoryResponse)
def list_medication_administrations(
    medication_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> MedicationAdministrationHistoryResponse:
    medication = get_medication_or_404(db, medication_id)
    get_medication_viewable_pet(db, current_user.id, medication.pet_id)
    medication_logs = db.scalars(
        select(MedicationLog)
        .where(MedicationLog.medication_id == medication.id)
        .order_by(
            MedicationLog.administered_at.desc().nullslast(),
            MedicationLog.scheduled_for.desc(),
            MedicationLog.created_at.desc(),
        )
    ).all()

    return MedicationAdministrationHistoryResponse(
        administrations=[serialize_medication_log(medication_log) for medication_log in medication_logs],
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
        doseIntervalHours=medication.dose_interval_hours,
        nextDoseAt=medication.next_dose_at,
    )


def serialize_due_medication(medication: Medication, pet_name: str) -> DueMedicationResponse:
    return DueMedicationResponse(
        **serialize_medication(medication).model_dump(),
        petName=pet_name,
    )


def serialize_medication_log(medication_log: MedicationLog) -> MedicationAdministrationHistoryItem:
    return MedicationAdministrationHistoryItem(
        id=medication_log.id,
        medicationId=medication_log.medication_id,
        scheduledFor=medication_log.scheduled_for,
        administeredAt=medication_log.administered_at,
        status=medication_log.status,
        notes=medication_log.notes or "",
        createdAt=medication_log.created_at,
    )


def validate_dates(medication: Medication) -> None:
    if medication.end_date is not None and medication.end_date < medication.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="endDate cannot be earlier than startDate.",
        )


def calculate_next_dose_at(
    scheduled_for: datetime,
    dose_interval_hours: int | None,
    administered_at: datetime,
) -> datetime | None:
    if dose_interval_hours is None:
        return None

    scheduled_for = ensure_utc(scheduled_for)
    administered_at = ensure_utc(administered_at)
    interval = timedelta(hours=dose_interval_hours)
    elapsed_intervals = max(0, (administered_at - scheduled_for) // interval)
    return scheduled_for + (elapsed_intervals + 1) * interval


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


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
