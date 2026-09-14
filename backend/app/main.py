import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.api.auth import router as auth_router
from app.api.caregivers import router as caregivers_router
from app.api.guest_access import router as guest_access_router
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
    expose_headers=["X-Process-Time-Ms"],
)

app.include_router(auth_router)
app.include_router(profiles_router)
app.include_router(pets_router)
app.include_router(caregivers_router)
app.include_router(guest_access_router)
app.include_router(medications_router)
app.include_router(prescriptions_router)


@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - started_at) * 1000
        print(
            f"[API timing] {request.method} {request.url.path} failed after {duration_ms:.2f} ms",
            flush=True,
        )
        raise

    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.2f}"
    print(
        f"[API timing] {request.method} {request.url.path} -> {response.status_code} in {duration_ms:.2f} ms",
        flush=True,
    )
    return response


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Welcome to the PetLink API"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
