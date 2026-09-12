from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile, status

from app.core.config import Settings


class PetFileStorage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def upload_pet_photo(self, path: str, file: UploadFile, content: bytes) -> str:
        return self.upload_pet_file(path, file, content)

    def upload_pet_file(self, path: str, file: UploadFile, content: bytes) -> str:
        self._ensure_configured()

        response = httpx.post(
            self._object_url(path),
            content=content,
            headers={
                **self._headers(),
                "Content-Type": file.content_type or "application/octet-stream",
                "cache-control": "3600",
            },
            timeout=30,
        )
        self._raise_for_storage_error(response)
        return path

    def create_signed_url(self, path: str | None) -> str | None:
        if not path or not self.settings.supabase_secret_key:
            return None

        response = httpx.post(
            self._sign_url(path),
            json={"expiresIn": self.settings.signed_url_expires_seconds},
            headers={**self._headers(), "Content-Type": "application/json"},
            timeout=15,
        )
        self._raise_for_storage_error(response)
        signed_url = response.json().get("signedURL")

        if not signed_url:
            return None

        if signed_url.startswith("http"):
            return signed_url

        return f"{self.settings.supabase_url}/storage/v1{signed_url}"

    def delete_file(self, path: str | None) -> None:
        if not path or not self.settings.supabase_secret_key:
            return

        response = httpx.request(
            "DELETE",
            f"{self.settings.supabase_url}/storage/v1/object/{self.settings.pet_files_bucket}",
            json={"prefixes": [path]},
            headers={**self._headers(), "Content-Type": "application/json"},
            timeout=15,
        )

        if response.status_code >= 400:
            return

    def _headers(self) -> dict[str, str]:
        secret_key = self.settings.supabase_secret_key

        if secret_key.startswith("sb_secret_"):
            return {"apikey": secret_key}

        return {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
        }

    def _object_url(self, path: str) -> str:
        return (
            f"{self.settings.supabase_url}/storage/v1/object/"
            f"{self.settings.pet_files_bucket}/{quote(path, safe='/')}"
        )

    def _sign_url(self, path: str) -> str:
        return (
            f"{self.settings.supabase_url}/storage/v1/object/sign/"
            f"{self.settings.pet_files_bucket}/{quote(path, safe='/')}"
        )

    def _ensure_configured(self) -> None:
        if not self.settings.supabase_url or not self.settings.supabase_secret_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase Storage is not configured. Set SUPABASE_SECRET_KEY.",
            )

    @staticmethod
    def _raise_for_storage_error(response: httpx.Response) -> None:
        if response.status_code < 400:
            return

        detail: Any
        try:
            detail = response.json()
        except ValueError:
            detail = response.text

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Supabase Storage request failed.", "storage": detail},
        )


def clean_storage_path(path: str) -> str:
    return str(PurePosixPath(path))
