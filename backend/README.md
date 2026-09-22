# PetLink Backend

This is a minimal FastAPI backend.

## What Was Created

- `.venv`: local virtual environment for backend dependencies. It is ignored by Git.
- `requirements.txt`: Python packages needed by the backend.
- `.env.example`: example environment variables. Copy it to `.env` for local values.
- `app/main.py`: the FastAPI application and the first routes.
- `app/api/auth.py`: authentication endpoints.
- `app/services/supabase_auth.py`: small Supabase Auth REST client.
- `app/__init__.py`: marks `app` as a Python package.

## Environment

Set these values in `.env`:

```ini
SUPABASE_URL=https://uimxlgudpxdtbkujngxh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
PASSWORD_RESET_REDIRECT_URL=http://localhost:4200/restablecer-contrasena
```

Use the public publishable key for these endpoints. Do not use the service role key for login/register requests.

## How To Run

From the `backend` folder:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

Open:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## Auth Endpoints

### Register

```http
POST /auth/register
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "secret-password",
  "full_name": "User Name"
}
```

### Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "secret-password"
}
```

Successful login returns Supabase session data, including `access_token` and `refresh_token`.

### Password recovery

`POST /auth/password-recovery` sends a Supabase recovery email. The link returns to `PASSWORD_RESET_REDIRECT_URL`, which must also be listed in the Supabase Auth redirect URLs.

`PUT /auth/password` receives the recovery access token and the new password, then updates the authenticated Supabase user.

## How It Works

`FastAPI()` creates the app.

`@app.get("/")` says: when someone visits `/` with a GET request, run the function below it.

`@app.get("/health")` is a simple status endpoint. Later, this can check the database connection or other services.

`/auth/register` sends the email, password, and full name to Supabase Auth signup.

`/auth/login` sends email and password to Supabase Auth's password token endpoint.
