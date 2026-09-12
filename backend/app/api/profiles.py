from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.dependencies import CurrentUser, CurrentUserDep, DbSession
from app.models import Profile
from app.schemas.profiles import ProfileResponse, ProfileSearchResponse, ProfileUpdateRequest

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def get_profile(current_user: CurrentUserDep, db: DbSession) -> ProfileResponse:
    profile = get_or_create_profile(db, current_user)
    return serialize_profile(profile, current_user.email)


@router.put("", response_model=ProfileResponse)
def update_profile(
    request: ProfileUpdateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> ProfileResponse:
    profile = get_or_create_profile(db, current_user)
    profile.email = clean_email(current_user.email)
    profile.full_name = clean_required_text(request.full_name, "fullName")
    profile.phone = clean_optional_text(request.phone)
    profile.avatar_url = clean_optional_text(request.avatar_url)
    db.commit()
    db.refresh(profile)
    return serialize_profile(profile, current_user.email)


@router.get("/search", response_model=ProfileSearchResponse)
def search_profile_by_email(
    email: str,
    current_user: CurrentUserDep,
    db: DbSession,
) -> ProfileSearchResponse:
    normalized_email = clean_required_text(email, "email").lower()
    profile = db.scalar(select(Profile).where(func.lower(Profile.email) == normalized_email))

    if profile is None or profile.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    return ProfileSearchResponse(
        id=profile.id,
        email=profile.email,
        fullName=profile.full_name,
    )


def get_or_create_profile(db: DbSession, current_user: CurrentUser) -> Profile:
    profile = db.scalar(select(Profile).where(Profile.id == current_user.id))

    if profile:
        profile.email = clean_email(current_user.email)
        db.commit()
        db.refresh(profile)
        return profile

    profile = Profile(
        id=current_user.id,
        email=clean_email(current_user.email),
        full_name=default_full_name(current_user.email),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def serialize_profile(profile: Profile, email: str | None) -> ProfileResponse:
    return ProfileResponse(
        id=profile.id,
        email=profile.email or email,
        fullName=profile.full_name,
        phone=profile.phone or "",
        avatarUrl=profile.avatar_url,
    )


def default_full_name(email: str | None) -> str:
    if not email:
        return "Nuevo usuario"

    name = email.split("@", 1)[0].strip()
    return name or "Nuevo usuario"


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


def clean_email(value: str | None) -> str | None:
    cleaned = clean_optional_text(value)
    return cleaned.lower() if cleaned else None
