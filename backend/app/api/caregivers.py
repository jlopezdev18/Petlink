from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.access import get_owned_pet_or_404
from app.dependencies import CurrentUserDep, DbSession
from app.models import Pet, PetCaregiver, Profile
from app.schemas.caregivers import CaregiverCreateRequest, CaregiverResponse, CaregiverUpdateRequest

router = APIRouter(prefix="/caregivers", tags=["caregivers"])

PRESETS = {
    "viewer": {
        "role": "other",
        "can_view_pet": True,
        "can_update_pet": False,
        "can_view_medications": False,
        "can_manage_medications": False,
        "can_view_records": False,
        "can_manage_records": False,
        "can_manage_reminders": False,
    },
    "caregiver": {
        "role": "caregiver",
        "can_view_pet": True,
        "can_update_pet": False,
        "can_view_medications": True,
        "can_manage_medications": True,
        "can_view_records": False,
        "can_manage_records": False,
        "can_manage_reminders": False,
    },
    "veterinarian": {
        "role": "veterinarian",
        "can_view_pet": True,
        "can_update_pet": True,
        "can_view_medications": True,
        "can_manage_medications": True,
        "can_view_records": False,
        "can_manage_records": False,
        "can_manage_reminders": False,
    },
}


@router.get("", response_model=list[CaregiverResponse])
def list_caregivers(current_user: CurrentUserDep, db: DbSession) -> list[CaregiverResponse]:
    caregivers = db.scalars(
        select(PetCaregiver)
        .where(or_(PetCaregiver.owner_id == current_user.id, PetCaregiver.caregiver_id == current_user.id))
        .order_by(PetCaregiver.created_at.desc())
    ).all()

    return [serialize_caregiver(caregiver, current_user.id) for caregiver in caregivers]


@router.post("", response_model=CaregiverResponse, status_code=status.HTTP_201_CREATED)
def create_caregiver(
    request: CaregiverCreateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> CaregiverResponse:
    pet = get_owned_pet_or_404(db, current_user.id, request.pet_id)
    caregiver_profile = db.scalar(
        select(Profile).where(func.lower(Profile.email) == request.caregiver_email.strip().lower())
    )

    if caregiver_profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caregiver must be a registered user with a profile email.",
        )

    if caregiver_profile.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot add yourself as a caregiver.",
        )

    caregiver = db.scalar(
        select(PetCaregiver).where(
            PetCaregiver.pet_id == pet.id,
            PetCaregiver.caregiver_id == caregiver_profile.id,
        )
    )

    if caregiver is None:
        caregiver = PetCaregiver(
            pet_id=pet.id,
            owner_id=current_user.id,
            caregiver_id=caregiver_profile.id,
            status="accepted",
        )
        db.add(caregiver)

    apply_preset(caregiver, request.preset)
    caregiver.notes = clean_optional_text(request.notes)
    db.commit()
    db.refresh(caregiver)
    return serialize_caregiver(caregiver, current_user.id)


@router.put("/{caregiver_id}", response_model=CaregiverResponse)
def update_caregiver(
    caregiver_id: UUID,
    request: CaregiverUpdateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> CaregiverResponse:
    caregiver = get_caregiver_or_404(db, caregiver_id)

    if caregiver.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can update access.")

    apply_preset(caregiver, request.preset)
    caregiver.notes = clean_optional_text(request.notes)
    db.commit()
    db.refresh(caregiver)
    return serialize_caregiver(caregiver, current_user.id)


@router.delete("/{caregiver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_caregiver(caregiver_id: UUID, current_user: CurrentUserDep, db: DbSession) -> None:
    caregiver = get_caregiver_or_404(db, caregiver_id)

    if caregiver.owner_id != current_user.id and caregiver.caregiver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot revoke this access.")

    db.delete(caregiver)
    db.commit()


def get_caregiver_or_404(db: DbSession, caregiver_id: UUID) -> PetCaregiver:
    caregiver = db.scalar(select(PetCaregiver).where(PetCaregiver.id == caregiver_id))

    if caregiver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caregiver access not found.")

    return caregiver


def apply_preset(caregiver: PetCaregiver, preset: str) -> None:
    if preset not in PRESETS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid caregiver preset.")

    caregiver.status = "accepted"
    for field, value in PRESETS[preset].items():
        setattr(caregiver, field, value)


def preset_for(caregiver: PetCaregiver) -> str:
    if caregiver.can_update_pet and caregiver.can_manage_medications:
        return "veterinarian"

    if caregiver.can_manage_medications:
        return "caregiver"

    return "viewer"


def serialize_caregiver(caregiver: PetCaregiver, current_user_id: UUID) -> CaregiverResponse:
    pet: Pet = caregiver.pet
    owner: Profile = caregiver.owner
    caregiver_profile: Profile = caregiver.caregiver

    return CaregiverResponse(
        id=caregiver.id,
        petId=caregiver.pet_id,
        petName=pet.name,
        ownerId=caregiver.owner_id,
        ownerName=owner.full_name,
        ownerEmail=owner.email,
        caregiverId=caregiver.caregiver_id,
        caregiverName=caregiver_profile.full_name,
        caregiverEmail=caregiver_profile.email,
        preset=preset_for(caregiver),
        status=caregiver.status,
        notes=caregiver.notes or "",
        isOwner=caregiver.owner_id == current_user_id,
        createdAt=caregiver.created_at,
    )


def clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None
