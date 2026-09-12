from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)


class AuthResponse(BaseModel):
    message: str
    data: dict[str, Any]
