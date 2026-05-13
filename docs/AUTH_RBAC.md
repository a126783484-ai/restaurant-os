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

## Production requirements

- Login and register must work in production.
- Session persistence must survive browser reloads.
- Protected routes must return `401` when unauthenticated.
- Role-restricted routes must return `403` when authenticated but unauthorized.
- Logout must clear the active session.
- Auth errors must be JSON and must not expose sensitive values.
