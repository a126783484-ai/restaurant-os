# Auth and RBAC

## MVP endpoints

- `POST /api/auth/register`: name, email, password, confirmPassword, role/accountType.
- `POST /api/auth/login`: email and password.
- `GET /api/auth/me`: validates persisted token/session.
- `POST /api/auth/logout`: clears session.

## Roles

- `admin` / `manager`: full one-store access.
- `staff`: dashboard, orders, customers, reservations, inventory.
- `kitchen`: KDS-focused access.

## Rules

Backend authorization is the source of truth. Frontend guards prevent bad UX, but API routes still require bearer/cookie auth and return normalized 401/403 JSON.

## JWT secret policy

Production must set `JWT_SECRET`; the API fails fast when it is missing. Local development and smoke tests may use the explicit `dev-smoke-secret` fallback, and all token signing/verification flows use the shared `getJwtSecret` helper.
