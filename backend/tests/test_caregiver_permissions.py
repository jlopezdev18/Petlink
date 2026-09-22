import unittest
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.caregivers import update_caregiver
from app.database import Base
from app.dependencies import CurrentUser
from app.models import Pet, PetCaregiver, Profile
from app.schemas.caregivers import CaregiverUpdateRequest


class CaregiverPermissionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.owner = Profile(
            id=uuid4(),
            email="owner@example.com",
            full_name="Owner",
            account_type="owner",
        )
        self.caregiver = Profile(
            id=uuid4(),
            email="caregiver@example.com",
            full_name="Caregiver",
            account_type="caregiver",
        )
        self.pet = Pet(id=uuid4(), owner_id=self.owner.id, name="Luna", species="dog")
        self.access = PetCaregiver(
            pet_id=self.pet.id,
            owner_id=self.owner.id,
            caregiver_id=self.caregiver.id,
            status="accepted",
            can_view_pet=True,
        )
        self.db.add_all([self.owner, self.caregiver, self.pet, self.access])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_registered_access_is_always_caregiver(self) -> None:
        response = update_caregiver(
            self.access.id,
            CaregiverUpdateRequest(notes="Puede apoyar con las dosis"),
            CurrentUser(id=self.owner.id, account_type="owner"),
            self.db,
        )

        self.assertEqual(response.preset, "caregiver")
        self.assertTrue(self.access.can_view_medications)
        self.assertFalse(self.access.can_manage_medications)


if __name__ == "__main__":
    unittest.main()
