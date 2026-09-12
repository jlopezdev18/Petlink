from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReminderRequest(BaseModel):
    title: str = Field(min_length=1)
    reminder_type: str = "other"
    due_at: datetime
    completed_at: datetime | None = None
    notes: str | None = None


class ReminderResponse(ReminderRequest):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pet_id: UUID
