from datetime import datetime, timezone
import hashlib
import secrets
import string
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.access import get_owned_pet_or_404
from app.dependencies import CurrentUserDep, DbSession
from app.models import Pet, PetAccessCode, PetCaregiver, Profile
from app.schemas.caregivers import (
    AccessCodeCreateRequest,
    AccessCodeCreateResponse,
    AccessCodeResponse,
    CaregiverCreateRequest,
    CaregiverResponse,
    CaregiverUpdateRequest,
)

router = APIRouter(prefix="/caregivers", tags=["caregivers"])

CAREGIVER_PERMISSIONS = {
    "role": "caregiver",
    "can_view_pet": True,
    "can_update_pet": False,
    "can_view_medications": True,
    "can_manage_medications": False,
    "can_view_records": False,
    "can_manage_records": False,
    "can_manage_reminders": False,
}
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@router.get("", response_model=list[CaregiverResponse])
def list_caregivers(current_user: CurrentUserDep, db: DbSession) -> list[CaregiverResponse]:
    access_filter = (
        PetCaregiver.caregiver_id == current_user.id
        if current_user.account_type == "caregiver"
        else or_(PetCaregiver.owner_id == current_user.id, PetCaregiver.caregiver_id == current_user.id)
    )
    caregivers = db.scalars(
        select(PetCaregiver)
        .where(access_filter)
        .order_by(PetCaregiver.created_at.desc())
    ).all()

    return [serialize_caregiver(caregiver, current_user.id) for caregiver in caregivers]


@router.get("/access-codes", response_model=list[AccessCodeResponse])
def list_access_codes(current_user: CurrentUserDep, db: DbSession) -> list[AccessCodeResponse]:
    require_owner_mode(current_user)
    access_codes = db.scalars(
        select(PetAccessCode)
        .where(PetAccessCode.owner_id == current_user.id)
        .order_by(PetAccessCode.created_at.desc())
    ).all()

    return [serialize_access_code(access_code) for access_code in access_codes]


@router.post("/access-codes", response_model=AccessCodeCreateResponse, status_code=status.HTTP_201_CREATED)
def create_access_code(
    request: AccessCodeCreateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> AccessCodeCreateResponse:
    require_owner_mode(current_user)
    pet = get_owned_pet_or_404(db, current_user.id, request.pet_id)
    expires_at = ensure_future_datetime(request.expires_at)
    purpose = clean_access_code_purpose(request.purpose)
    code = generate_access_code()
    access_code = PetAccessCode(
        pet_id=pet.id,
        owner_id=current_user.id,
        code_hash=hash_access_code(code),
        purpose=purpose,
        expires_at=expires_at,
    )
    db.add(access_code)
    db.commit()
    db.refresh(access_code)

    serialized = serialize_access_code(access_code)
    return AccessCodeCreateResponse(**serialized.model_dump(), code=code)


@router.delete("/access-codes/{access_code_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_access_code(access_code_id: UUID, current_user: CurrentUserDep, db: DbSession) -> None:
    require_owner_mode(current_user)
    access_code = db.scalar(
        select(PetAccessCode).where(
            PetAccessCode.id == access_code_id,
            PetAccessCode.owner_id == current_user.id,
        )
    )

    if access_code is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access code not found.")

    access_code.revoked_at = datetime.now(timezone.utc)
    db.commit()


@router.post("", response_model=CaregiverResponse, status_code=status.HTTP_201_CREATED)
def create_caregiver(
    request: CaregiverCreateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> CaregiverResponse:
    require_owner_mode(current_user)
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
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This caregiver is already authorized for this pet.",
        )

    apply_caregiver_permissions(caregiver)
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
    require_owner_mode(current_user)
    caregiver = get_caregiver_or_404(db, caregiver_id)

    if caregiver.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can update access.")

    apply_caregiver_permissions(caregiver)
    caregiver.notes = clean_optional_text(request.notes)
    db.commit()
    db.refresh(caregiver)
    return serialize_caregiver(caregiver, current_user.id)


@router.delete("/{caregiver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_caregiver(caregiver_id: UUID, current_user: CurrentUserDep, db: DbSession) -> None:
    caregiver = get_caregiver_or_404(db, caregiver_id)

    if current_user.account_type == "owner" and caregiver.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot revoke this access.")

    if current_user.account_type == "caregiver" and caregiver.caregiver_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot revoke this access.")

    db.delete(caregiver)
    db.commit()


def get_caregiver_or_404(db: DbSession, caregiver_id: UUID) -> PetCaregiver:
    caregiver = db.scalar(select(PetCaregiver).where(PetCaregiver.id == caregiver_id))

    if caregiver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Caregiver access not found.")

    return caregiver


def apply_caregiver_permissions(caregiver: PetCaregiver) -> None:
    caregiver.status = "accepted"
    for field, value in CAREGIVER_PERMISSIONS.items():
        setattr(caregiver, field, value)


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
        preset="caregiver",
        status=caregiver.status,
        notes=caregiver.notes or "",
        isOwner=caregiver.owner_id == current_user_id,
        createdAt=caregiver.created_at,
    )


def serialize_access_code(access_code: PetAccessCode) -> AccessCodeResponse:
    now = datetime.now(timezone.utc)
    revoked_at = normalize_datetime(access_code.revoked_at)
    expires_at = normalize_datetime(access_code.expires_at)
    return AccessCodeResponse(
        id=access_code.id,
        petId=access_code.pet_id,
        petName=access_code.pet.name,
        purpose=access_code.purpose,
        expiresAt=access_code.expires_at,
        revokedAt=access_code.revoked_at,
        lastUsedAt=access_code.last_used_at,
        createdAt=access_code.created_at,
        isActive=revoked_at is None and expires_at > now,
    )


def ensure_future_datetime(value: datetime) -> datetime:
    expires_at = normalize_datetime(value)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="expiresAt must be in the future.",
        )
    return expires_at


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def generate_access_code() -> str:
    raw_code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    return f"{raw_code[:5]}-{raw_code[5:]}"


def hash_access_code(code: str) -> str:
    return hashlib.sha256(normalize_access_code(code).encode("utf-8")).hexdigest()


def normalize_access_code(code: str) -> str:
    return "".join(character for character in code.upper() if character in string.ascii_uppercase + string.digits)


def clean_access_code_purpose(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in {"caregiver", "veterinarian"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid access code purpose.")
    return cleaned


def require_owner_mode(current_user: CurrentUserDep) -> None:
    if current_user.account_type != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner mode required.")


def clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None
