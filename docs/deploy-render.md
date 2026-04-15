# Render Deployment

This repo already includes a Render Blueprint at [render.yaml](/d:/devtrails/render.yaml).

## What It Provisions

- `earnsafe-backend`: FastAPI web service
- `earnsafe-worker`: Celery worker with beat enabled
- `earnsafe-redis`: Render Key Value instance for cache and queueing
- `earnsafe-db`: Render Postgres database

## Before You Deploy

- Push the repo to GitHub or GitLab.
- Rotate any secrets that were previously stored in local `.env` files before using them in production.
- Decide whether you also want the static `earnsafe-web` service from the Blueprint. If not, remove that service block from `render.yaml` before the first sync.

## Deploy Steps

1. In Render, choose `New` -> `Blueprint`.
2. Connect the repo that contains this project.
3. Render will detect [render.yaml](/d:/devtrails/render.yaml).
4. Review the services and create the Blueprint.
5. Fill in the prompted secret environment variables:
   - `OPENWEATHER_API_KEY` if you still need it
   - `TOMTOM_API_KEY` if traffic APIs are enabled
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `CORS_ORIGINS` as JSON, for example `["https://your-frontend-domain.onrender.com"]`

## Important Notes

- Render Postgres provides a standard PostgreSQL connection string. The backend now auto-converts it to the async `postgresql+asyncpg://` format expected by SQLAlchemy.
- The Docker image now respects Render's `PORT` environment variable automatically.
- The worker uses the same database, Redis, and JWT secret as the web service.
- Tables are created automatically on startup by `init_db()`.

## Verify The Deploy

After the backend finishes deploying:

1. Open `https://earnsafe-backend.onrender.com/`
2. Confirm you get a JSON health response like:
   - `{"status":"ok", ...}`
3. Check the worker logs in Render to confirm Celery started cleanly.

## Mobile App Update

After the backend is live, point the frontend to the Render URL:

- Set `EXPO_PUBLIC_API_BASE_URL=https://earnsafe-backend.onrender.com`
- Rebuild or reload the frontend app after updating that environment variable
