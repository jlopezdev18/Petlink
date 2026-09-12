from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import json

from app.core.config import Settings


class SupabaseAuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class SupabaseAuthClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def sign_up(self, email: str, password: str, full_name: str) -> dict[str, Any]:
        return self._post(
            "/auth/v1/signup",
            {
                "email": email,
                "password": password,
                "data": {"full_name": full_name},
            },
        )

    def sign_in_with_password(self, email: str, password: str) -> dict[str, Any]:
        return self._post(
            "/auth/v1/token?grant_type=password",
            {
                "email": email,
                "password": password,
            },
        )

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.settings.supabase_url or not self.settings.supabase_publishable_key:
            raise SupabaseAuthError(
                status_code=500,
                message="Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
            )

        body = json.dumps(payload).encode("utf-8")
        request = Request(
            url=f"{self.settings.supabase_url}{path}",
            data=body,
            headers={
                "apikey": self.settings.supabase_publishable_key,
                "Authorization": f"Bearer {self.settings.supabase_publishable_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = self._read_error(error)
            raise SupabaseAuthError(error.code, detail) from error
        except URLError as error:
            raise SupabaseAuthError(502, f"Could not reach Supabase: {error.reason}") from error

    @staticmethod
    def _read_error(error: HTTPError) -> str:
        raw_body = error.read().decode("utf-8")
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return raw_body or "Supabase request failed."

        return (
            body.get("msg")
            or body.get("message")
            or body.get("error_description")
            or body.get("error")
            or "Supabase request failed."
        )
