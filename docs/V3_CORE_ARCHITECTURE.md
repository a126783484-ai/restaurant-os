# Restaurant OS V3 Core Architecture

## Runtime decision

V3 P0 uses **fallback option C: the existing `api-server` production runtime with fail-safe database access**.

Reasons:

- The repository already routes production traffic through `artifacts/api-server`; `api-v2` is not used as the production runtime.
- A long-lived host cannot be provisioned from this coding environment because deployment credentials and paid platform setup are outside the repo.
- A full Supabase serverless-safe rewrite would require authorization policy and secret validation that cannot be proven without deployment secrets.
- The current `lib/db` client now uses a single pooled connection per instance, short connection/query timeouts, and a short circuit breaker, so V3 centralizes business correctness in `api-server` while preserving explicit `DATABASE_UNAVAILABLE` failures instead of hanging. See `docs/PRODUCTION_RUNTIME_DB_STABILITY.md` for the blocker analysis and production validation plan.

## Business logic model

The P0 source of truth is backend-owned domain logic in `artifacts/api-server/src/lib/v3-core.ts` plus payment persistence in `artifacts/api-server/src/lib/payment-service.ts`.

- Orders are created from backend product snapshots, not frontend totals.
- Payments are append/audit style records; refund and void actions update records to terminal states rather than deleting financial history.
- Dashboard, closing, order detail, and receipts consume the same derived order payment summary.
- Table deletion is blocked when active orders or active reservations reference the table.

## Money rules

V3 canonical calculations use integer minor units at the service layer.

- Existing database columns remain `REAL` for compatibility in this sprint.
- Every calculation entering V3 logic is normalized with `toCents`.
- Every API response converts integer cents back to the legacy decimal amount shape expected by the frontend.
- Order totals are derived from item price snapshots: `sum(line_subtotal_cents)`.

## Payment ledger rules

Allowed methods are `cash`, `card`, `transfer`, and `external`.

- Valid payments increase `charge_cents`.
- Refunds increase `refund_cents` and reduce `net_paid_cents`.
- Voids/cancelled payments are tracked as `void_cents` and do not count as collected revenue.
- Overpayment is rejected for P0.
- Order-level `payment_status` is derived from ledger math and is not trusted from frontend PATCH payloads.

## Order state machine

V3 accepts the target state names `open`, `preparing`, `ready`, `completed`, and `cancelled`.

For compatibility with the current database and frontend, persisted `pending` is normalized as V3 `open` and new open orders are stored as `pending` until a database migration can safely rename the value.

Allowed transitions:

- `open -> preparing`
- `preparing -> ready`
- `ready -> completed`
- `open/preparing/ready -> cancelled`

Cancelling a paid or partially paid order requires admin or manager.

## Remaining limitations

- The database schema still stores monetary columns as `REAL`; V3 avoids floating point as canonical logic in services but a migration to integer cents remains the next hardening step.
- This sprint does not provision a new long-lived production host; deployed runtime validation remains required before claiming production readiness.
- Third-party payment gateways, invoices, multi-store tenancy, subscriptions, and AI analytics remain out of P0 scope.
