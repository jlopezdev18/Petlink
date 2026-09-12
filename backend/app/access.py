from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Pet, PetCaregiver


def get_viewable_pet(db: Session, user_id: UUID, pet_id: UUID) -> Pet:
    pet = db.scalar(
        select(Pet)
        .outerjoin(
            PetCaregiver,
            (PetCaregiver.pet_id == Pet.id)
            & (PetCaregiver.caregiver_id == user_id)
            & (PetCaregiver.status == "accepted")
            & (PetCaregiver.can_view_pet.is_(True)),
        )
        .where(Pet.id == pet_id, or_(Pet.owner_id == user_id, PetCaregiver.id.is_not(None)))
    )

    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")

    return pet


def get_owned_pet_or_404(db: Session, owner_id: UUID, pet_id: UUID) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.owner_id == owner_id))

    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found.")

    return pet


def get_updatable_pet(db: Session, user_id: UUID, pet_id: UUID) -> Pet:
    pet = get_viewable_pet(db, user_id, pet_id)

    if pet.owner_id == user_id or has_pet_permission(db, user_id, pet.id, "can_update_pet"):
        return pet

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this pet.")


def get_medication_manageable_pet(db: Session, user_id: UUID, pet_id: UUID) -> Pet:
    pet = get_viewable_pet(db, user_id, pet_id)

    if pet.owner_id == user_id or has_pet_permission(db, user_id, pet.id, "can_manage_medications"):
        return pet

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You cannot manage medications for this pet.",
    )


def get_medication_viewable_pet(db: Session, user_id: UUID, pet_id: UUID) -> Pet:
    pet = get_viewable_pet(db, user_id, pet_id)

    if pet.owner_id == user_id or has_pet_permission(db, user_id, pet.id, "can_view_medications"):
        return pet

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You cannot view medications for this pet.",
    )


def has_pet_permission(db: Session, user_id: UUID, pet_id: UUID, permission: str) -> bool:
    permission_column = getattr(PetCaregiver, permission)

    return db.scalar(
        select(PetCaregiver.id).where(
            PetCaregiver.pet_id == pet_id,
            PetCaregiver.caregiver_id == user_id,
            PetCaregiver.status == "accepted",
            permission_column.is_(True),
        )
    ) is not None
