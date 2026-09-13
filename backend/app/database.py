from collections.abc import Generator

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

if settings.sqlalchemy_database_url:
    engine = create_engine(settings.sqlalchemy_database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
else:
    engine = None
    SessionLocal = None


def get_db() -> Generator[Session]:
    if SessionLocal is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database is not configured. Set DATABASE_URL.",
        )

    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database request failed. Check DATABASE_URL and database connectivity.",
        ) from error
    finally:
        db.close()
