import time
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database import get_db


DbSession = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None = None
    account_type: str = "owner"


AUTH_USER_CACHE_TTL_SECONDS = 60
_auth_user_cache: dict[str, tuple[float, CurrentUser]] = {}
_auth_http_client = httpx.Client(timeout=10)


def get_current_user(
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
    x_petlink_account_type: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    requested_account_type = clean_account_type(x_petlink_account_type)
    cached_user = get_cached_user(token)
    if cached_user is not None:
        return CurrentUser(id=cached_user.id, email=cached_user.email, account_type=requested_account_type)

    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase Auth is not configured.",
        )

    try:
        response = _auth_http_client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {token}",
            },
        )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not validate token: {error}",
        ) from error

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    payload = response.json()
    user_id = payload.get("id")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    current_user = CurrentUser(id=UUID(user_id), email=payload.get("email"), account_type=requested_account_type)
    cache_user(token, current_user)
    return current_user


def clean_account_type(value: str | None) -> str:
    cleaned = (value or "owner").strip().lower()
    return cleaned if cleaned in {"owner", "caregiver"} else "owner"


def get_cached_user(token: str) -> CurrentUser | None:
    cached = _auth_user_cache.get(token)

    if cached is None:
        return None

    expires_at, current_user = cached
    if expires_at > time.monotonic():
        return current_user

    _auth_user_cache.pop(token, None)
    return None


def cache_user(token: str, current_user: CurrentUser) -> None:
    now = time.monotonic()
    _auth_user_cache[token] = (now + AUTH_USER_CACHE_TTL_SECONDS, current_user)

    expired_tokens = [
        cached_token for cached_token, (expires_at, _) in _auth_user_cache.items() if expires_at <= now
    ]

    for expired_token in expired_tokens:
        _auth_user_cache.pop(expired_token, None)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
