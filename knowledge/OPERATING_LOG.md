# Operating Log

## 2026-05-13

- Scope reset from broad SaaS platform to one-store production MVP.
- Prioritized auth, orders, manual payment state, KDS, dashboard resilience, and mobile usability.
- Third-party payments, websocket realtime, billing, and multi-store tenancy moved to roadmap.

## 2026-05-13 Post-merge production hardening

- PR #20 merged into `main` using squash merge.
- Main deployment checks passed for frontend, api-server, and api-v2.
- Frontend production URL loads publicly.
- Supabase `restaurant-os` project is active and healthy.
- Applied one-store MVP production schema to Supabase.
- Added migration record: `supabase/migrations/20260513080000_one_store_mvp_schema.sql`.
- Added RLS hardening draft: `supabase/migrations/20260513081500_rls_hardening_draft.sql`.
- Closed resolved deployment blocker issue #2.
- Closed duplicate Vercel protection issues #11 and #12.
- Updated #13 as the single active P0 blocker for backend Vercel Authentication / Deployment Protection.

### Current P0 blocker

`restaurant-os-api-server` is deployed and READY, but public API requests return Vercel Authentication. This blocks production auth/register/login verification and external monitoring.

### Current production readiness

Estimated readiness: 92%.

Remaining launch gates:

1. Disable backend production Deployment Protection or configure safe bypass.
2. Verify backend env vars: DATABASE_URL, JWT_SECRET, CORS_ORIGINS, FRONTEND_URL, NODE_ENV.
3. Re-test register/login/session/order/KDS against production backend.
4. Apply RLS policy hardening after backend DB access mode is confirmed.

## 2026-05-13 Vercel env deployment trigger

- Vercel production env vars were added for `restaurant-os-api-server`: DATABASE_URL, JWT_SECRET, CORS_ORIGINS, FRONTEND_URL, NODE_ENV.
- Triggered a new main deployment through this operating log commit so production functions load the new env values.
- Next validation target: `/health`, `/api/system/status`, auth register/login, database persistence, orders, and KDS.

## 2026-05-13 Production database smoke validation

- `/health` returns public 200 JSON.
- `/api/system/status` returns public 200 JSON after Vercel protection was disabled.
- `database.configured=true` and `database.ready=true`.
- Supabase write-path smoke tests passed in rollback transactions:
  - orders insert
  - order_items insert with product/order foreign keys
  - customer/order/visit dashboard chain
  - reservations insert
  - inventory insert
  - staff insert
  - shifts insert
  - tasks insert
- No smoke-test data was persisted because validation used explicit rollback transactions.
- Active remaining risks: RLS hardening pending, AI env not configured, NODE_ENV value should be cleaned to plain `production`.
