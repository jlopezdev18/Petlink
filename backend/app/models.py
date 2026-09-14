from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(Text)
    full_name: Mapped[str] = mapped_column(Text)
    account_type: Mapped[str] = mapped_column(Text, default="owner")
    phone: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pets: Mapped[list["Pet"]] = relationship(back_populates="owner")
    caregiver_access_given: Mapped[list["PetCaregiver"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        foreign_keys="PetCaregiver.owner_id",
    )
    access_codes_given: Mapped[list["PetAccessCode"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        foreign_keys="PetAccessCode.owner_id",
    )
    caregiver_access_received: Mapped[list["PetCaregiver"]] = relationship(
        back_populates="caregiver",
        cascade="all, delete-orphan",
        foreign_keys="PetCaregiver.caregiver_id",
    )


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("profiles.id"))
    name: Mapped[str] = mapped_column(Text)
    species: Mapped[str] = mapped_column(Text)
    breed: Mapped[str | None] = mapped_column(Text)
    sex: Mapped[str | None] = mapped_column(Text)
    birth_date: Mapped[date | None] = mapped_column(Date)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(5, 2))
    color: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[Profile] = relationship(back_populates="pets")
    medications: Mapped[list["Medication"]] = relationship(back_populates="pet", cascade="all, delete-orphan")
    medical_records: Mapped[list["MedicalRecord"]] = relationship(back_populates="pet", cascade="all, delete-orphan")
    reminders: Mapped[list["Reminder"]] = relationship(back_populates="pet", cascade="all, delete-orphan")
    caregivers: Mapped[list["PetCaregiver"]] = relationship(back_populates="pet", cascade="all, delete-orphan")
    access_codes: Mapped[list["PetAccessCode"]] = relationship(back_populates="pet", cascade="all, delete-orphan")
    prescriptions: Mapped[list["Prescription"]] = relationship(back_populates="pet", cascade="all, delete-orphan")


class PetCaregiver(Base):
    __tablename__ = "pet_caregivers"
    __table_args__ = (UniqueConstraint("pet_id", "caregiver_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    owner_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("profiles.id"))
    caregiver_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("profiles.id"))
    role: Mapped[str] = mapped_column(Text, default="caregiver")
    status: Mapped[str] = mapped_column(Text, default="accepted")
    can_view_pet: Mapped[bool] = mapped_column(Boolean, default=True)
    can_update_pet: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_medications: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_medications: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_records: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_records: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_reminders: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="caregivers")
    owner: Mapped[Profile] = relationship(back_populates="caregiver_access_given", foreign_keys=[owner_id])
    caregiver: Mapped[Profile] = relationship(back_populates="caregiver_access_received", foreign_keys=[caregiver_id])


class PetAccessCode(Base):
    __tablename__ = "pet_access_codes"
    __table_args__ = (UniqueConstraint("code_hash"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    owner_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("profiles.id"))
    code_hash: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text, default="caregiver")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="access_codes")
    owner: Mapped[Profile] = relationship(back_populates="access_codes_given", foreign_keys=[owner_id])


class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    name: Mapped[str] = mapped_column(Text)
    dosage: Mapped[str] = mapped_column(Text)
    frequency: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    prescribing_vet: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="medications")
    logs: Mapped[list["MedicationLog"]] = relationship(back_populates="medication", cascade="all, delete-orphan")
    prescriptions: Mapped[list["Prescription"]] = relationship(back_populates="medication")


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    owner_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("profiles.id"))
    medication_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), ForeignKey("medications.id"))
    title: Mapped[str] = mapped_column(Text)
    prescribed_by: Mapped[str | None] = mapped_column(Text)
    issued_on: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    bucket_id: Mapped[str] = mapped_column(Text, default="pet-files")
    file_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="prescriptions")
    medication: Mapped[Medication | None] = relationship(back_populates="prescriptions")


class MedicationLog(Base):
    __tablename__ = "medication_logs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    medication_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("medications.id"))
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    administered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    medication: Mapped[Medication] = relationship(back_populates="logs")


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    record_type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    occurred_on: Mapped[date] = mapped_column(Date)
    provider: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    next_due_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="medical_records")


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    pet_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("pets.id"))
    title: Mapped[str] = mapped_column(Text)
    reminder_type: Mapped[str] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    pet: Mapped[Pet] = relationship(back_populates="reminders")
