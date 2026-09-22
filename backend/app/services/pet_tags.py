import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PetQrTag


def generate_unique_qr_token(db: Session) -> str:
    while True:
        token = secrets.token_urlsafe(24)
        if db.scalar(select(PetQrTag.id).where(PetQrTag.token == token)) is None:
            return token
