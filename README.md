# PetLink

Base tecnica del prototipo PetLink:

- Frontend: Angular 21, TypeScript, Angular Material y PWA.
- Backend: Python 3.12 con FastAPI, SQLAlchemy y psycopg.
- Servicios previstos: Supabase Auth, PostgreSQL y Storage.
- Ambientes: desarrollo y produccion.

## Backend

Desde la carpeta `Petlink`:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

La API estara disponible en `http://127.0.0.1:8000`.

- Inicio: `http://127.0.0.1:8000/`
- Salud del servicio: `http://127.0.0.1:8000/health`
- Documentacion interactiva: `http://127.0.0.1:8000/docs`
- Registro: `POST http://127.0.0.1:8000/auth/register`
- Login: `POST http://127.0.0.1:8000/auth/login`
- Mascotas: `GET|POST http://127.0.0.1:8000/pets`
- Editar/eliminar mascotas: `PUT|DELETE http://127.0.0.1:8000/pets/{pet_id}`

Si PowerShell no permite activar el entorno virtual, puedes correr el servidor asi:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

## Frontend

En otra terminal, desde la carpeta `Petlink`:

```powershell
cd frontend
npm install
npm start
```

La aplicacion estara disponible en `http://localhost:4200`.

## PWA

El service worker se habilita en la compilacion de produccion:

```powershell
cd frontend
npm run build
npx http-server dist/frontend/browser -p 4200 -c-1
```

Abre `http://localhost:4200` para comprobar la instalacion y el funcionamiento sin conexion de la PWA.

## Configuracion

- Backend: `backend/.env`, tomando como base `backend/.env.example`.
- `DATABASE_URL`: conexion PostgreSQL de Supabase. FastAPI usa SQLAlchemy para leer y escribir tablas.
- `SUPABASE_URL`: URL del proyecto, por ejemplo `https://uimxlgudpxdtbkujngxh.supabase.co`.
- `SUPABASE_PUBLISHABLE_KEY`: se usa para login, registro y validar el JWT recibido por FastAPI.
- `SUPABASE_SECRET_KEY`: solo backend. Se usa para crear URLs firmadas y manejar fotos privadas en Storage.
- `PET_FILES_BUCKET`: bucket privado para fotos de mascotas. Por defecto: `pet-files`.
- Frontend desarrollo: `frontend/src/environments/environment.ts`.
- Frontend produccion: `frontend/src/environments/environment.prod.ts`.

## Flujo de mascotas

1. El usuario inicia sesion y Angular guarda el `access_token`.
2. `authInterceptor` agrega `Authorization: Bearer <access_token>` a las llamadas al backend.
3. FastAPI valida ese token contra Supabase Auth.
4. Los endpoints consultan PostgreSQL con SQLAlchemy y siempre filtran por `owner_id`.
5. Las fotos se suben al bucket privado `pet-files`; la base guarda el path y el backend devuelve una URL firmada temporal.
