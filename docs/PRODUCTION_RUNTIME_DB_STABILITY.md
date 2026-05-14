# Production Runtime / DB Connection Stability

## Root cause

The observed production failures come from this runtime combination:

```txt
Vercel serverless function
+ node-postgres Pool
+ Supabase pooler host on port 6543
= intermittent connection timeouts during auth/orders/closing requests
```

When the Supabase pooler does not accept a connection quickly, a serverless invocation can spend most of its execution window waiting for PostgreSQL. That turns normal business errors into 504s, generic Internal Server Error responses, stale frontend data, or blank/recoverability failures.

## Can this be fully production-stabilized in Vercel serverless with node-postgres Pool?

Not reliably enough to call production-ready. This PR keeps the existing API runtime only as **fail-safe option C**:

- keep `artifacts/api-server` as the only production backend runtime;
- do not use `api-v2`;
- fail fast on DB connect/query timeouts;
- expose precise diagnostics;
- return structured `DATABASE_UNAVAILABLE` / `AUTH_DATABASE_UNAVAILABLE` errors instead of hanging to 504;
- keep the V3 business logic foundation intact.

A truly stable production target should be either:

1. **Option A — serverless-safe Supabase backend access** using backend-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, with backend role enforcement preserved; or
2. **Option B — long-lived Node backend** on Railway, Render, Fly.io, Replit Deployment, or similar, pointed to by the frontend API base URL.

## Current fail-safe runtime strategy

The database layer uses `node-postgres-fail-fast`:

- `DB_POOL_MAX` default: `1`
- `DB_CONNECTION_TIMEOUT_MS` default: `1500`
- `DB_QUERY_TIMEOUT_MS` default: `2000`
- `DB_IDLE_TIMEOUT_MS` default: `1000`
- `DB_CIRCUIT_BREAKER_MS` default: `15000`

When a DB operation times out, the backend opens a short circuit breaker so follow-up requests fail immediately with structured JSON instead of piling up slow pooler attempts.

## Required environment variables

Existing required variable:

- `DATABASE_URL` — current Postgres/Supabase connection string.

Recommended tuning variables for the current fail-safe Vercel runtime:

- `DB_POOL_MAX=1`
- `DB_CONNECTION_TIMEOUT_MS=1500`
- `DB_QUERY_TIMEOUT_MS=2000`
- `DB_IDLE_TIMEOUT_MS=1000`
- `DB_CIRCUIT_BREAKER_MS=15000`
- `CORS_ORIGINS=<frontend origin>`
- `FRONTEND_URL=<frontend origin>`
- `JWT_SECRET=<strong secret>`

Future Option A variables, if migrating to Supabase serverless-safe backend access:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` must only be set on backend hosting. Never expose it to Vite/frontend env variables.

## Diagnostics to verify after deploy

After setting env variables on the API host, test:

1. `GET /health`
2. `GET /api/system/status`
3. `GET /api/auth/diagnostics`
4. `POST /api/auth/login`
5. `POST /api/auth/logout`
6. `POST /api/auth/login` again
7. `GET /api/orders`
8. `GET /api/payments/summary`
9. `GET /api/dashboard/summary`

Expected failure behavior if Supabase pooler is unavailable:

- auth routes return `AUTH_DATABASE_UNAVAILABLE`;
- DB-backed routes return `DATABASE_UNAVAILABLE`;
- `/api/system/status` shows last DB error, timeout settings, strategy, and circuit state;
- frontend shows a readable error and retry, not a blank page.

## Production-readiness statement

With fail-fast runtime guards, PR #25 can avoid 504/blank-page behavior more reliably, but the system is **still not production-ready until deployed runtime validation passes** against the real API host and Supabase project.
