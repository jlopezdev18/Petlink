import unittest

from app.api.auth import request_password_recovery, update_password
from app.core.config import Settings
from app.schemas.auth import PasswordRecoveryRequest, PasswordUpdateRequest


class FakeSupabaseAuthClient:
    def __init__(self) -> None:
        self.recovery_request: tuple[str, str] | None = None
        self.password_update: tuple[str, str] | None = None

    def send_password_recovery(self, email: str, redirect_to: str) -> dict[str, str]:
        self.recovery_request = (email, redirect_to)
        return {}

    def update_password(self, access_token: str, password: str) -> dict[str, str]:
        self.password_update = (access_token, password)
        return {"id": "user-id"}


class AuthRecoveryTests(unittest.TestCase):
    def test_recovery_uses_configured_redirect_and_normalized_email(self) -> None:
        settings = Settings()
        settings.password_reset_redirect_url = "https://petlink.example/restablecer-contrasena"
        client = FakeSupabaseAuthClient()

        response = request_password_recovery(
            PasswordRecoveryRequest(email="  Owner@Example.com "),
            client,
            settings,
        )

        self.assertEqual(
            client.recovery_request,
            ("owner@example.com", "https://petlink.example/restablecer-contrasena"),
        )
        self.assertIn("recovery email", response.message)

    def test_recovery_falls_back_to_first_frontend_origin(self) -> None:
        settings = Settings()
        settings.password_reset_redirect_url = ""
        settings.frontend_origins = ["http://localhost:4200"]
        client = FakeSupabaseAuthClient()

        request_password_recovery(
            PasswordRecoveryRequest(email="owner@example.com"),
            client,
            settings,
        )

        self.assertEqual(
            client.recovery_request,
            ("owner@example.com", "http://localhost:4200/restablecer-contrasena"),
        )

    def test_password_update_uses_recovery_access_token(self) -> None:
        client = FakeSupabaseAuthClient()
        token = "recovery-access-token-value"

        response = update_password(
            PasswordUpdateRequest(accessToken=token, password="new-password"),
            client,
        )

        self.assertEqual(client.password_update, (token, "new-password"))
        self.assertEqual(response.message, "Password updated successfully.")


if __name__ == "__main__":
    unittest.main()
