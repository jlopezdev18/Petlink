import unittest
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.medications import (
    administer_medication,
    create_medication,
    list_due_medications,
    update_medication,
)
from app.database import Base
from app.dependencies import CurrentUser
from app.models import Medication, MedicationLog, Pet, PetCaregiver, Profile
from app.schemas.medications import MedicationAdministrationRequest, MedicationRequest


class MedicationNotificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.owner = Profile(id=uuid4(), email="owner@example.com", full_name="Owner", account_type="owner")
        self.caregiver = Profile(
            id=uuid4(),
            email="caregiver@example.com",
            full_name="Caregiver",
            account_type="caregiver",
        )
        self.stranger = Profile(id=uuid4(), email="other@example.com", full_name="Other", account_type="owner")
        self.pet = Pet(
            id=uuid4(),
            owner_id=self.owner.id,
            name="Luna",
            species="dog",
        )
        self.access = PetCaregiver(
            pet_id=self.pet.id,
            owner_id=self.owner.id,
            caregiver_id=self.caregiver.id,
            status="accepted",
            can_view_pet=True,
            can_view_medications=True,
        )
        self.db.add_all([self.owner, self.caregiver, self.stranger, self.pet, self.access])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_create_and_update_recurrent_schedule(self) -> None:
        first_dose = datetime.now(timezone.utc) + timedelta(hours=1)
        created = create_medication(
            self.medication_request(interval=12, next_dose=first_dose),
            CurrentUser(id=self.owner.id, account_type="owner"),
            self.db,
        )

        self.assertEqual(created.doseIntervalHours, 12)
        self.assert_datetime_equal(created.nextDoseAt, first_dose)

        updated_dose = first_dose + timedelta(hours=6)
        updated = update_medication(
            created.id,
            self.medication_request(interval=8, next_dose=updated_dose),
            CurrentUser(id=self.owner.id, account_type="owner"),
            self.db,
        )

        self.assertEqual(updated.doseIntervalHours, 8)
        self.assert_datetime_equal(updated.nextDoseAt, updated_dose)

    def test_due_medications_respect_owner_and_caregiver_access(self) -> None:
        medication = self.add_medication(datetime.now(timezone.utc) - timedelta(minutes=5), interval=12)

        owner_due = list_due_medications(CurrentUser(id=self.owner.id), self.db)
        caregiver_due = list_due_medications(
            CurrentUser(id=self.caregiver.id, account_type="caregiver"),
            self.db,
        )
        stranger_due = list_due_medications(CurrentUser(id=self.stranger.id), self.db)

        self.assertEqual([item.id for item in owner_due.medications], [medication.id])
        self.assertEqual([item.id for item in caregiver_due.medications], [medication.id])
        self.assertEqual(caregiver_due.medications[0].petName, "Luna")
        self.assertEqual(stranger_due.medications, [])

        self.access.can_view_medications = False
        self.db.commit()
        caregiver_without_permission = list_due_medications(
            CurrentUser(id=self.caregiver.id, account_type="caregiver"),
            self.db,
        )
        self.assertEqual(caregiver_without_permission.medications, [])

    def test_administer_records_scheduled_time_and_advances_to_future_dose(self) -> None:
        scheduled_for = datetime.now(timezone.utc) - timedelta(hours=25)
        medication = self.add_medication(scheduled_for, interval=12)

        response = administer_medication(
            medication.id,
            MedicationAdministrationRequest(notes="Given with food"),
            CurrentUser(id=self.caregiver.id, account_type="caregiver"),
            self.db,
        )
        medication_log = self.db.scalar(select(MedicationLog).where(MedicationLog.medication_id == medication.id))

        self.assertIsNotNone(medication_log)
        self.assert_datetime_equal(medication_log.scheduled_for, scheduled_for)
        self.assert_datetime_equal(response.nextDoseAt, scheduled_for + timedelta(hours=36))
        self.assertGreater(self.as_utc(response.nextDoseAt), datetime.now(timezone.utc))

    def medication_request(self, interval: int, next_dose: datetime) -> MedicationRequest:
        return MedicationRequest(
            petId=self.pet.id,
            name="Antibiotic",
            dosage="1 tablet",
            frequency=f"Every {interval} hours",
            startDate=date.today(),
            endDate=None,
            prescribingVet="Dr. Rivera",
            instructions="With food",
            isActive=True,
            doseIntervalHours=interval,
            nextDoseAt=next_dose,
        )

    def add_medication(self, next_dose: datetime, interval: int) -> Medication:
        medication = Medication(
            pet_id=self.pet.id,
            name="Antibiotic",
            dosage="1 tablet",
            frequency=f"Every {interval} hours",
            start_date=date.today(),
            is_active=True,
            dose_interval_hours=interval,
            next_dose_at=next_dose,
        )
        self.db.add(medication)
        self.db.commit()
        self.db.refresh(medication)
        return medication

    def assert_datetime_equal(self, actual: datetime | None, expected: datetime) -> None:
        self.assertIsNotNone(actual)
        self.assertEqual(self.as_utc(actual), self.as_utc(expected))

    @staticmethod
    def as_utc(value: datetime | None) -> datetime:
        if value is None:
            raise AssertionError("Expected a datetime value.")
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


if __name__ == "__main__":
    unittest.main()
