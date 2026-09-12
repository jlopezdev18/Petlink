from datetime import date, datetime, timezone
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import or_, select

from app.access import get_owned_pet_or_404, get_updatable_pet, has_pet_permission
from app.core.config import get_settings
from app.dependencies import CurrentUserDep, DbSession
from app.models import Pet, PetCaregiver
from app.schemas.pets import PetListResponse, PetResponse
from app.services.storage import PetFileStorage

router = APIRouter(prefix="/pets", tags=["pets"])

SPECIES_TO_DB = {
    "Perro": "dog",
    "Gato": "cat",
    "Ave": "bird",
    "Conejo": "rabbit",
    "Reptil": "reptile",
    "Pez": "fish",
    "Otro": "other",
}
SPECIES_TO_UI = {value: key for key, value in SPECIES_TO_DB.items()}
SEX_TO_DB = {"Macho": "male", "Hembra": "female", "": None}
SEX_TO_UI = {"male": "Macho", "female": "Hembra", "unknown": ""}


@router.get("", response_model=PetListResponse)
def list_pets(current_user: CurrentUserDep, db: DbSession) -> PetListResponse:
    pets = db.scalars(
        select(Pet)
        .outerjoin(
            PetCaregiver,
            (PetCaregiver.pet_id == Pet.id)
            & (PetCaregiver.caregiver_id == current_user.id)
            & (PetCaregiver.status == "accepted")
            & (PetCaregiver.can_view_pet.is_(True)),
        )
        .where(or_(Pet.owner_id == current_user.id, PetCaregiver.id.is_not(None)))
        .order_by(Pet.created_at.desc())
    ).all()

    return PetListResponse(pets=[serialize_pet(db, pet, current_user.id) for pet in pets])


@router.post("", response_model=PetResponse, status_code=status.HTTP_201_CREATED)
def create_pet(
    current_user: CurrentUserDep,
    db: DbSession,
    name: Annotated[str, Form()],
    species: Annotated[str, Form()],
    breed: Annotated[str, Form()] = "",
    sex: Annotated[str, Form()] = "",
    color: Annotated[str, Form()] = "",
    birthDate: Annotated[date | None, Form()] = None,
    weightKg: Annotated[float | None, Form()] = None,
    notes: Annotated[str, Form()] = "",
    photo: Annotated[UploadFile | None, File()] = None,
) -> PetResponse:
    pet = Pet(
        owner_id=current_user.id,
        name=clean_required_text(name, "name"),
        species=to_db_species(species),
        breed=clean_optional_text(breed),
        sex=to_db_sex(sex),
        color=clean_optional_text(color),
        birth_date=birthDate,
        weight_kg=clean_weight(weightKg),
        notes=clean_optional_text(notes),
    )
    db.add(pet)
    db.commit()
    db.refresh(pet)

    if photo and photo.filename:
        pet.photo_url = upload_photo_for_pet(current_user.id, pet.id, photo)
        db.commit()
        db.refresh(pet)

    return serialize_pet(db, pet, current_user.id)


@router.put("/{pet_id}", response_model=PetResponse)
def update_pet(
    pet_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
    name: Annotated[str, Form()],
    species: Annotated[str, Form()],
    breed: Annotated[str, Form()] = "",
    sex: Annotated[str, Form()] = "",
    color: Annotated[str, Form()] = "",
    birthDate: Annotated[date | None, Form()] = None,
    weightKg: Annotated[float | None, Form()] = None,
    notes: Annotated[str, Form()] = "",
    removePhoto: Annotated[bool, Form()] = False,
    photo: Annotated[UploadFile | None, File()] = None,
) -> PetResponse:
    pet = get_updatable_pet(db, current_user.id, pet_id)
    previous_photo_path = pet.photo_url

    pet.name = clean_required_text(name, "name")
    pet.species = to_db_species(species)
    pet.breed = clean_optional_text(breed)
    pet.sex = to_db_sex(sex)
    pet.color = clean_optional_text(color)
    pet.birth_date = birthDate
    pet.weight_kg = clean_weight(weightKg)
    pet.notes = clean_optional_text(notes)

    if photo and photo.filename:
        pet.photo_url = upload_photo_for_pet(current_user.id, pet.id, photo)
    elif removePhoto:
        pet.photo_url = None

    db.commit()
    db.refresh(pet)

    if previous_photo_path and previous_photo_path != pet.photo_url:
        get_storage().delete_file(previous_photo_path)

    return serialize_pet(db, pet, current_user.id)


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(pet_id: UUID, current_user: CurrentUserDep, db: DbSession) -> None:
    pet = get_owned_pet_or_404(db, current_user.id, pet_id)
    photo_path = pet.photo_url
    db.delete(pet)
    db.commit()
    get_storage().delete_file(photo_path)


def serialize_pet(db: DbSession, pet: Pet, user_id: UUID) -> PetResponse:
    is_owner = pet.owner_id == user_id

    return PetResponse(
        id=pet.id,
        ownerId=pet.owner_id,
        name=pet.name,
        species=SPECIES_TO_UI.get(pet.species, "Otro"),
        breed=pet.breed or "",
        sex=SEX_TO_UI.get(pet.sex or "", ""),
        color=pet.color or "",
        birthDate=pet.birth_date,
        weightKg=float(pet.weight_kg) if pet.weight_kg is not None else None,
        notes=pet.notes or "",
        photoUrl=get_storage().create_signed_url(pet.photo_url),
        photoPath=pet.photo_url,
        isOwner=is_owner,
        canUpdatePet=is_owner or has_pet_permission(db, user_id, pet.id, "can_update_pet"),
        canManageMedications=is_owner
        or has_pet_permission(db, user_id, pet.id, "can_manage_medications"),
    )


def upload_photo_for_pet(user_id: UUID, pet_id: UUID, photo: UploadFile) -> str:
    if not photo.content_type or not photo.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Photo must be an image file.",
        )

    extension = extension_for_content_type(photo.content_type)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    path = PurePosixPath(str(user_id), "pets", str(pet_id), f"profile-{timestamp}{extension}")
    content = photo.file.read()
    return get_storage().upload_pet_photo(str(path), photo, content)


def extension_for_content_type(content_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(content_type, ".img")


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


def clean_weight(value: float | None) -> float | None:
    if value is None or value <= 0:
        return None
    return value


def to_db_species(value: str) -> str:
    if value in SPECIES_TO_DB:
        return SPECIES_TO_DB[value]
    if value in SPECIES_TO_UI:
        return value
    return "other"


def to_db_sex(value: str) -> str | None:
    if value in SEX_TO_DB:
        return SEX_TO_DB[value]
    if value in SEX_TO_UI:
        return value
    return None


def get_storage() -> PetFileStorage:
    return PetFileStorage(get_settings())
