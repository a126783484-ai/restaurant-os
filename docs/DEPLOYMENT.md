# Deployment

## Production URLs

- Frontend: `https://restaurant-os-restaurant-os-opal.vercel.app`
- Backend: `https://restaurant-os-api-server-a126783484-2182s-projects.vercel.app`

## Required env

- Backend project: `DATABASE_URL`, strong `JWT_SECRET`, optional `CORS_ORIGINS` / `FRONTEND_URL`.
- Frontend project: `VITE_API_BASE_URL` should point to the stable backend URL.
- AI env vars are optional unless AI routes are used.

## Blockers to verify manually

If Vercel Deployment Protection is enabled or env vars are missing, production login/orders will fail. Verify `/health`, `/api/status`, auth register/login, and order creation after deploy.
