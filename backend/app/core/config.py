from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

import os


BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


class Settings:
    app_name: str = os.getenv("APP_NAME", "PetLink API")
    app_version: str = os.getenv("APP_VERSION", "0.1.0")
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_publishable_key: str = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY", "")
    )
    supabase_secret_key: str = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    )
    database_url: str = os.getenv("DATABASE_URL", "")
    password_reset_redirect_url: str = os.getenv("PASSWORD_RESET_REDIRECT_URL", "")
    pet_files_bucket: str = os.getenv("PET_FILES_BUCKET", "pet-files")
    signed_url_expires_seconds: int = int(os.getenv("SIGNED_URL_EXPIRES_SECONDS", "3600"))
    frontend_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:4200,http://127.0.0.1:4200,http://localhost:4300,http://127.0.0.1:4300",
        ).split(",")
        if origin.strip()
    ]

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
