from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.auth import (
    AuthMessageResponse,
    AuthResponse,
    LoginRequest,
    PasswordRecoveryRequest,
    PasswordUpdateRequest,
    RegisterRequest,
)
from app.services.supabase_auth import SupabaseAuthClient, SupabaseAuthError

router = APIRouter(prefix="/auth", tags=["auth"])


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_auth_client(settings: SettingsDep) -> SupabaseAuthClient:
    return SupabaseAuthClient(settings)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(
    request: RegisterRequest,
    auth_client: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> AuthResponse:
    account_type = clean_account_type(request.account_type)
    try:
        data = auth_client.sign_up(
            email=request.email,
            password=request.password,
            full_name=request.full_name,
            account_type=account_type,
        )
    except SupabaseAuthError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return AuthResponse(message="User registered successfully.", data=data)


@router.post("/login")
def login_user(
    request: LoginRequest,
    auth_client: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> AuthResponse:
    try:
        data = auth_client.sign_in_with_password(
            email=request.email,
            password=request.password,
        )
    except SupabaseAuthError as error:
        status_code = (
            status.HTTP_401_UNAUTHORIZED
            if error.status_code in {400, 401}
            else error.status_code
        )
        raise HTTPException(status_code=status_code, detail=error.message) from error

    return AuthResponse(message="User logged in successfully.", data=data)


@router.post(
    "/password-recovery",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_password_recovery(
    request: PasswordRecoveryRequest,
    auth_client: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
    settings: SettingsDep,
) -> AuthMessageResponse:
    redirect_url = settings.password_reset_redirect_url.strip()
    if not redirect_url:
        if not settings.frontend_origins:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Password recovery redirect is not configured.",
            )
        redirect_url = f"{settings.frontend_origins[0].rstrip('/')}/restablecer-contrasena"

    try:
        auth_client.send_password_recovery(request.email.strip().lower(), redirect_url)
    except SupabaseAuthError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return AuthMessageResponse(
        message="If the account exists, a password recovery email has been sent."
    )


@router.put("/password", response_model=AuthMessageResponse)
def update_password(
    request: PasswordUpdateRequest,
    auth_client: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> AuthMessageResponse:
    try:
        auth_client.update_password(request.access_token, request.password)
    except SupabaseAuthError as error:
        status_code = (
            status.HTTP_401_UNAUTHORIZED
            if error.status_code in {400, 401, 403}
            else error.status_code
        )
        raise HTTPException(status_code=status_code, detail=error.message) from error

    return AuthMessageResponse(message="Password updated successfully.")


def clean_account_type(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned not in {"owner", "caregiver"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid account type.")
    return cleaned
