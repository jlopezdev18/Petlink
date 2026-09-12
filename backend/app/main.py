from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.caregivers import router as caregivers_router
from app.api.medications import router as medications_router
from app.api.pets import router as pets_router
from app.api.prescriptions import router as prescriptions_router
from app.api.profiles import router as profiles_router
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(profiles_router)
app.include_router(pets_router)
app.include_router(caregivers_router)
app.include_router(medications_router)
app.include_router(prescriptions_router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Welcome to the PetLink API"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
