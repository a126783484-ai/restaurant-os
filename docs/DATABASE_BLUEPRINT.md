# Database Blueprint

Current target: **one-store production MVP**. Keep the schema easy to operate for one restaurant now, while leaving clear seams for a future SaaS/multi-store version.

## Concept mapping

| Restaurant term | Future generic primitive |
| --- | --- |
| restaurant | workspace / business unit / store |
| order | job / ticket / transaction |
| table | resource / location / asset |
| kitchen display | operations board / fulfillment board |
| reservation | booking / appointment / scheduled job |
| customer | contact / client / account |
| staff | member / operator |
| inventory | resources / stock / assets |
| payment | transaction / settlement record |

## MVP one-store required tables

- `users`: one-store operators with name, email, password hash, role, active flag.
- `roles`: app-level roles: admin, manager, staff, kitchen.
- `sessions`: token/session tracking, expiry, revoked flag.
- `orders`: type, status, notes, totalAmount, paymentStatus, paymentMethod, paidAmount, paymentNote, paidAt, idempotencyKey.
- `order_items`: product snapshot, quantity, unit price, subtotal, item notes.
- `kitchen_tickets` / `operation_tickets`: MVP can derive from active orders; persist later if KDS needs independent workflow.
- `customers`: name, phone, email, notes.
- `reservations`: customer, datetime, party size, status, notes.
- `inventory_items`: name, unit, quantity, minQuantity, cost, supplier, notes.
- `audit_logs`: order status changes, payment status changes, auth failures, critical edits.

## Future SaaS extension roadmap

Do not block the one-store MVP on these:

- `workspaces` / `organizations`
- `memberships`
- `permissions` and `role_permissions`
- `payment_transactions`, providers, webhook events, refunds, reconciliation
- `system_events`, `request_logs`, `error_logs`
- `ai_workflows`, `ai_task_runs`
- multi-tenant isolation, billing, provider integrations

## One-store MVP strategy

Use global restaurant data for now. Avoid hardcoding assumptions that make future workspace IDs impossible; new business tables should be able to accept `workspace_id` later.

## Runtime fallback boundary

Runtime in-memory data is only a resilience/demo path for local or incomplete environments. Production should persist users, sessions, orders, payments, and audit-relevant status changes in the configured database.
