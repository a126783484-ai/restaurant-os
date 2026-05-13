# System Architecture

Current goal: **one restaurant can run daily operations in production**.

## Runtime

- Frontend: Vite + React in `artifacts/restaurant-os`.
- Backend: Express API in `artifacts/api-server`.
- Shared client/contracts: `lib/api-client-react` and `lib/api-zod`.
- Database: Postgres/Drizzle in `lib/db`; local smoke tests can use one-store runtime fallback when `DATABASE_URL` is missing.

## MVP flows

- Auth: register, login, `/auth/me`, logout, persisted token + user.
- Orders: create, edit items/notes, lifecycle status, cancel, idempotent submit.
- Payments: manual status/method/amount/note on orders.
- KDS: polling-based active order board.
- Dashboard: resilient business summary with readable failure states.

## Deferred

Multi-store SaaS, billing, third-party payment gateways, websocket realtime, full observability dashboard, and complex AI automation.
