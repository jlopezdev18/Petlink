import unittest
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.pet_tags import (
    create_sighting_report,
    get_or_create_pet_qr_tag,
    get_public_pet_qr_tag,
    list_sighting_reports,
    update_pet_qr_tag,
    update_sighting_report_status,
)
from app.api.pets import create_pet
from app.database import Base
from app.dependencies import CurrentUser
from app.models import Pet, PetQrTag, PetSightingReport, Profile
from app.schemas.pet_tags import (
    PetQrTagUpdateRequest,
    SightingReportCreateRequest,
    SightingReportStatusRequest,
)


class PetTagTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.owner = Profile(
            id=uuid4(),
            email="owner@example.com",
            full_name="Owner",
            account_type="owner",
            phone="+504 9999-1111",
        )
        self.stranger = Profile(
            id=uuid4(),
            email="stranger@example.com",
            full_name="Stranger",
            account_type="owner",
        )
        self.pet = Pet(
            id=uuid4(),
            owner_id=self.owner.id,
            name="Luna",
            species="dog",
            breed="Mestiza",
            sex="female",
            color="Negro",
            notes="Private medical note",
            weight_kg=12.5,
        )
        self.db.add_all([self.owner, self.stranger, self.pet])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_qr_token_is_permanent_across_updates(self) -> None:
        owner = CurrentUser(id=self.owner.id, account_type="owner")
        first = get_or_create_pet_qr_tag(self.pet.id, owner, self.db)
        second = get_or_create_pet_qr_tag(self.pet.id, owner, self.db)
        updated = update_pet_qr_tag(
            self.pet.id,
            PetQrTagUpdateRequest(
                isLost=True,
                lostMessage="Ayudanos a encontrarla",
                showOwnerPhone=True,
            ),
            owner,
            self.db,
        )
        found = update_pet_qr_tag(
            self.pet.id,
            PetQrTagUpdateRequest(isLost=False, lostMessage="", showOwnerPhone=False),
            owner,
            self.db,
        )

        self.assertEqual(first.token, second.token)
        self.assertEqual(first.token, updated.token)
        self.assertEqual(first.token, found.token)

    def test_creating_pet_also_creates_permanent_qr_tag(self) -> None:
        created = create_pet(
            CurrentUser(id=self.owner.id, email=self.owner.email, account_type="owner"),
            self.db,
            name="Sol",
            species="Gato",
            breed="",
            sex="",
            color="Blanco",
            birthDate=None,
            weightKg=None,
            notes="",
            photo=None,
        )
        tag = self.db.scalar(select(PetQrTag).where(PetQrTag.pet_id == created.id))

        self.assertIsNotNone(tag)
        self.assertEqual(len(tag.token), 32)
        self.assertEqual(created.pendingSightingReports, 0)

    def test_public_profile_hides_private_fields_and_phone_by_default(self) -> None:
        tag = self.add_tag(show_owner_phone=False)
        response = get_public_pet_qr_tag(tag.token, self.db)
        payload = response.model_dump()

        self.assertEqual(response.pet.name, "Luna")
        self.assertIsNone(response.ownerPhone)
        self.assertNotIn("notes", payload["pet"])
        self.assertNotIn("weightKg", payload["pet"])
        self.assertNotIn("birthDate", payload["pet"])

        tag.show_owner_phone = True
        self.db.commit()
        visible_contact = get_public_pet_qr_tag(tag.token, self.db)
        self.assertEqual(visible_contact.ownerPhone, "+504 9999-1111")

    def test_report_is_accepted_when_pet_is_not_marked_lost(self) -> None:
        tag = self.add_tag(is_lost=False)
        report = create_sighting_report(
            tag.token,
            SightingReportCreateRequest(
                reporterName="Ana",
                reporterPhone="9999-2222",
                message="La vi cerca del parque.",
                locationDescription="Entrada norte",
                latitude=14.0723,
                longitude=-87.1921,
                accuracyMeters=18,
            ),
            self.db,
        )
        self.db.refresh(tag)

        self.assertEqual(report.status, "pending")
        self.assertFalse(tag.is_lost)
        self.assertEqual(report.latitude, 14.0723)

        reports = list_sighting_reports(
            self.pet.id,
            CurrentUser(id=self.owner.id, account_type="owner"),
            self.db,
        )
        self.assertEqual([item.id for item in reports.reports], [report.id])

    def test_owner_can_review_or_dismiss_and_stranger_cannot_list(self) -> None:
        tag = self.add_tag()
        report = create_sighting_report(
            tag.token,
            SightingReportCreateRequest(message="La encontre frente al mercado."),
            self.db,
        )
        owner = CurrentUser(id=self.owner.id, account_type="owner")

        reviewed = update_sighting_report_status(
            self.pet.id,
            report.id,
            SightingReportStatusRequest(status="reviewed"),
            owner,
            self.db,
        )
        dismissed = update_sighting_report_status(
            self.pet.id,
            report.id,
            SightingReportStatusRequest(status="dismissed"),
            owner,
            self.db,
        )

        self.assertEqual(reviewed.status, "reviewed")
        self.assertEqual(dismissed.status, "dismissed")

        with self.assertRaises(HTTPException) as raised:
            list_sighting_reports(
                self.pet.id,
                CurrentUser(id=self.stranger.id, account_type="owner"),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_location_coordinates_must_be_complete_and_valid(self) -> None:
        with self.assertRaises(ValidationError):
            SightingReportCreateRequest(
                message="Reporte con ubicacion incompleta.",
                latitude=14.0,
            )

        with self.assertRaises(ValidationError):
            SightingReportCreateRequest(
                message="Reporte con latitud invalida.",
                latitude=91,
                longitude=-87,
            )

    def add_tag(self, *, is_lost: bool = False, show_owner_phone: bool = False) -> PetQrTag:
        tag = PetQrTag(
            pet_id=self.pet.id,
            owner_id=self.owner.id,
            token="abcdefghijklmnopqrstuvwxyzABCDEF",
            is_lost=is_lost,
            show_owner_phone=show_owner_phone,
        )
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag


if __name__ == "__main__":
    unittest.main()
