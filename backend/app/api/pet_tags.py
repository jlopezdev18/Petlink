from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.access import get_owned_pet_or_404
from app.api.pets import SEX_TO_UI, SPECIES_TO_UI, get_storage, require_owner_mode
from app.dependencies import CurrentUserDep, DbSession
from app.models import PetQrTag, PetSightingReport
from app.schemas.pet_tags import (
    PetQrTagResponse,
    PetQrTagUpdateRequest,
    PublicPetQrTagResponse,
    PublicQrPetResponse,
    SightingReportCreateRequest,
    SightingReportListResponse,
    SightingReportResponse,
    SightingReportStatusRequest,
)
from app.services.pet_tags import generate_unique_qr_token

owner_router = APIRouter(prefix="/pets", tags=["pet-tags"])
public_router = APIRouter(prefix="/pet-tags", tags=["public-pet-tags"])

QrToken = Annotated[str, Path(min_length=32, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


@owner_router.post("/{pet_id}/qr-tag", response_model=PetQrTagResponse)
def get_or_create_pet_qr_tag(
    pet_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
) -> PetQrTagResponse:
    require_owner_mode(current_user)
    pet = get_owned_pet_or_404(db, current_user.id, pet_id)
    qr_tag = db.scalar(select(PetQrTag).where(PetQrTag.pet_id == pet.id))

    if qr_tag is None:
        qr_tag = PetQrTag(
            pet_id=pet.id,
            owner_id=current_user.id,
            token=generate_unique_qr_token(db),
        )
        db.add(qr_tag)
        try:
            db.commit()
            db.refresh(qr_tag)
        except IntegrityError:
            db.rollback()
            qr_tag = db.scalar(select(PetQrTag).where(PetQrTag.pet_id == pet.id))
            if qr_tag is None:
                raise

    return serialize_qr_tag(db, qr_tag)


@owner_router.put("/{pet_id}/qr-tag", response_model=PetQrTagResponse)
def update_pet_qr_tag(
    pet_id: UUID,
    request: PetQrTagUpdateRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> PetQrTagResponse:
    require_owner_mode(current_user)
    pet = get_owned_pet_or_404(db, current_user.id, pet_id)
    qr_tag = get_pet_qr_tag_or_404(db, pet.id)
    qr_tag.is_lost = request.isLost
    qr_tag.lost_message = clean_optional_text(request.lostMessage)
    qr_tag.show_owner_phone = request.showOwnerPhone
    db.commit()
    db.refresh(qr_tag)
    return serialize_qr_tag(db, qr_tag)


@owner_router.get("/{pet_id}/sighting-reports", response_model=SightingReportListResponse)
def list_sighting_reports(
    pet_id: UUID,
    current_user: CurrentUserDep,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SightingReportListResponse:
    require_owner_mode(current_user)
    pet = get_owned_pet_or_404(db, current_user.id, pet_id)
    qr_tag = db.scalar(select(PetQrTag).where(PetQrTag.pet_id == pet.id))

    if qr_tag is None:
        return SightingReportListResponse(reports=[])

    report_order = case(
        (PetSightingReport.status == "pending", 0),
        (PetSightingReport.status == "reviewed", 1),
        else_=2,
    )
    reports = db.scalars(
        select(PetSightingReport)
        .where(PetSightingReport.qr_tag_id == qr_tag.id)
        .order_by(report_order, PetSightingReport.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return SightingReportListResponse(reports=[serialize_sighting_report(report, pet.id) for report in reports])


@owner_router.patch(
    "/{pet_id}/sighting-reports/{report_id}",
    response_model=SightingReportResponse,
)
def update_sighting_report_status(
    pet_id: UUID,
    report_id: UUID,
    request: SightingReportStatusRequest,
    current_user: CurrentUserDep,
    db: DbSession,
) -> SightingReportResponse:
    require_owner_mode(current_user)
    pet = get_owned_pet_or_404(db, current_user.id, pet_id)
    report = db.scalar(
        select(PetSightingReport)
        .join(PetQrTag, PetQrTag.id == PetSightingReport.qr_tag_id)
        .where(PetSightingReport.id == report_id, PetQrTag.pet_id == pet.id)
    )

    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sighting report not found.")

    report.status = request.status
    db.commit()
    db.refresh(report)
    return serialize_sighting_report(report, pet.id)


@public_router.get("/{token}", response_model=PublicPetQrTagResponse)
def get_public_pet_qr_tag(token: QrToken, db: DbSession) -> PublicPetQrTagResponse:
    qr_tag = get_public_qr_tag_or_404(db, token)
    pet = qr_tag.pet
    return PublicPetQrTagResponse(
        pet=PublicQrPetResponse(
            name=pet.name,
            species=SPECIES_TO_UI.get(pet.species, "Otro"),
            breed=pet.breed or "",
            sex=SEX_TO_UI.get(pet.sex or "", ""),
            color=pet.color or "",
            photoUrl=get_storage().create_signed_url(pet.photo_url),
        ),
        isLost=qr_tag.is_lost,
        lostMessage=qr_tag.lost_message or "",
        ownerPhone=qr_tag.owner.phone if qr_tag.show_owner_phone else None,
    )


@public_router.post(
    "/{token}/reports",
    response_model=SightingReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_sighting_report(
    token: QrToken,
    request: SightingReportCreateRequest,
    db: DbSession,
) -> SightingReportResponse:
    qr_tag = get_public_qr_tag_or_404(db, token)
    report = PetSightingReport(
        qr_tag_id=qr_tag.id,
        status="pending",
        reporter_name=clean_optional_text(request.reporterName),
        reporter_phone=clean_optional_text(request.reporterPhone),
        message=request.message.strip(),
        location_description=clean_optional_text(request.locationDescription),
        latitude=request.latitude,
        longitude=request.longitude,
        accuracy_meters=request.accuracyMeters,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return serialize_sighting_report(report, qr_tag.pet_id)


def get_public_qr_tag_or_404(db: DbSession, token: str) -> PetQrTag:
    qr_tag = db.scalar(
        select(PetQrTag)
        .options(joinedload(PetQrTag.pet), joinedload(PetQrTag.owner))
        .where(PetQrTag.token == token)
    )
    if qr_tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet QR tag not found.")
    return qr_tag


def get_pet_qr_tag_or_404(db: DbSession, pet_id: UUID) -> PetQrTag:
    qr_tag = db.scalar(select(PetQrTag).where(PetQrTag.pet_id == pet_id))
    if qr_tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet QR tag not found.")
    return qr_tag


def serialize_qr_tag(db: DbSession, qr_tag: PetQrTag) -> PetQrTagResponse:
    pending_count = db.scalar(
        select(func.count(PetSightingReport.id)).where(
            PetSightingReport.qr_tag_id == qr_tag.id,
            PetSightingReport.status == "pending",
        )
    )
    return PetQrTagResponse(
        id=qr_tag.id,
        petId=qr_tag.pet_id,
        token=qr_tag.token,
        isLost=qr_tag.is_lost,
        lostMessage=qr_tag.lost_message or "",
        showOwnerPhone=qr_tag.show_owner_phone,
        pendingReportCount=int(pending_count or 0),
        createdAt=qr_tag.created_at,
        updatedAt=qr_tag.updated_at,
    )


def serialize_sighting_report(report: PetSightingReport, pet_id: UUID) -> SightingReportResponse:
    return SightingReportResponse(
        id=report.id,
        petId=pet_id,
        status=report.status,
        reporterName=report.reporter_name or "",
        reporterPhone=report.reporter_phone or "",
        message=report.message,
        locationDescription=report.location_description or "",
        latitude=float(report.latitude) if report.latitude is not None else None,
        longitude=float(report.longitude) if report.longitude is not None else None,
        accuracyMeters=float(report.accuracy_meters) if report.accuracy_meters is not None else None,
        createdAt=report.created_at,
        updatedAt=report.updated_at,
    )


def clean_optional_text(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None
