# Codex Workflow

## Current scope

Do not optimize for full multi-store SaaS first. The active goal is one restaurant that can operate: auth, orders, payments, KDS, dashboard, mobile basics.

## P0

- Production auth stabilization.
- Orders create/edit/status/cancel/idempotency.
- Manual payment status on orders.
- KDS polling board.
- Dashboard resilience.

## P1

- Customers, reservations, inventory, staff basics.
- Formal DB migrations.
- Audit log persistence.
- Mobile hardening.

## P2+

- Full RBAC permissions.
- Websocket realtime.
- Payment gateway integrations.
- SaaS multi-store, billing, provider integrations.
