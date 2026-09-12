from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
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
    try:
        data = auth_client.sign_up(
            email=request.email,
            password=request.password,
            full_name=request.full_name,
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
