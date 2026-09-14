from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1)
    account_type: str = Field(default="owner")


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    account_type: str = Field(default="owner")


class AuthResponse(BaseModel):
    message: str
    data: dict[str, Any]
