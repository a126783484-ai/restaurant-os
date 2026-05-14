# Rebuild Restaurant OS V3 Core — Business Logic First

Repository: `a126783484-ai/restaurant-os`

## Why this V3 rebuild exists

The current implementation has useful UI experiments and several working pieces, but the production core is not stable enough for real operation.

Observed failures after the latest sprint:

- Login can fail after logout.
- Registration / login may show generic `Internal Server Error`.
- Orders can fail to create.
- Order detail can show `order not found` after a failed create.
- Receipt pages can go blank.
- Closing / dashboard can partially load or show stale data.
- Vercel API server has repeatedly timed out while connecting to Supabase pooler.
- `api-server` and `api-v2` coexist and create architectural ambiguity.
- Payment / order / closing logic has been patched in multiple rounds instead of being designed as one consistent domain model.

This V3 task is not a cosmetic redesign. It is a business-logic-first rebuild of the single-store MVP core.

## Highest priority

Correctness comes before features.

Build the next version so the following are true:

1. Auth is reliable.
2. Orders are reliable.
3. Tables are reliable.
4. KDS status logic is reliable.
5. Payments are mathematically correct.
6. Receipts always match the order ledger.
7. Closing / dashboard numbers match the same source of truth.
8. Every error is explicit and recoverable.
9. Mobile UI is usable, but UI must not hide broken backend logic.

If a feature cannot be made correct, keep it out of V3 P0.

---

## Branch and PR requirements

Create a new branch:

`codex/rebuild-restaurant-os-v3-core`

Open a PR only after:

- typecheck passes
- frontend build passes
- backend build passes
- smoke tests are documented
- all P0 routes return structured errors instead of blank pages or generic server errors

Suggested PR title:

`Rebuild V3 core: stable auth, orders, payments, receipts, and closing`

Do not directly commit large rewrites to `main`.

---

## Non-negotiable constraints

1. Do not expand P1/P2 features before P0 is stable.
2. Do not patch around the current broken flow without simplifying architecture.
3. Do not use `api-v2` as production runtime.
4. Do not keep two competing backend implementations.
5. Do not rely on unstable Vercel serverless `node-postgres` pooling unless the final tests prove it is stable.
6. Choose one stable data-access strategy and document it.
7. Do not put service-role keys, database passwords, or API secrets in frontend code.
8. Do not fake payments.
9. Do not let frontend directly decide final order/payment/closing state.
10. Do not calculate revenue differently in dashboard, receipt, closing, and order detail.
11. Do not store money as imprecise floating-point values in new V3 business logic.
12. Do not delete financial records. Use append-only events or explicit void/refund records.
13. Do not show blank pages. Every page must have loading, empty, success, and error states.
14. Do not claim tests passed unless they actually ran.
15. Keep the app mobile-first.

---

## Required architecture decision

Before coding, inspect the repo and choose one runtime strategy. Explain the choice in the PR.

### Preferred option A — stable long-lived backend

Use the existing frontend direction, but run the API on a long-lived Node runtime instead of Vercel serverless PostgreSQL pooling.

Possible targets:

- Replit deployment
- Railway
- Render
- Fly.io
- another long-lived Node host

Use this only if it can be implemented without unavailable secrets or paid setup.

### Preferred option B — serverless-safe Supabase access

Keep Vercel frontend, but avoid unstable `node-postgres` pooling by using a serverless-safe Supabase data access pattern.

Requirements:

- No service-role secret in frontend.
- Backend must still enforce roles.
- Public anon client must not bypass authorization.
- Writes must remain permission-safe.

### Fallback option C — current API server, but fail-safe

Only use this if A/B cannot be completed in this Codex run.

If using C, implement:

- fast DB failure
- explicit `DATABASE_UNAVAILABLE` responses
- auth must not hang
- frontend must not infinite-load
- all pages must recover from API failure

Do not proceed without documenting which option you chose and why.

---

## V3 P0 scope

Only implement the core below.

### P0 modules

1. Auth
2. Roles / permissions
3. Products menu
4. Tables
5. Orders
6. Order items
7. KDS
8. Payment ledger
9. Receipts
10. Closing / daily reconciliation
11. Dashboard summary
12. Error handling / diagnostics

### Explicitly out of scope for this V3 P0

- third-party payment gateways
- ECPay / NewebPay / LINE Pay / Stripe
- invoice integration
- multi-store SaaS tenancy
- subscription billing
- AI analysis
- inventory deduction recipes
- staff scheduling
- reservations beyond basic table occupancy protection
- advanced discount campaigns

---

## Core domain model

V3 must have a coherent domain model. Do not let each page invent its own logic.

### Money rule

Use integer minor units for all new V3 money calculations.

Example:

- `price_cents = 18000` for 180.00
- `total_cents = sum(line_subtotal_cents)`

Do not use floating-point math for canonical values.

If existing DB columns use `real`, either migrate to integer cents or normalize at the service layer and document the limitation.

### Currency rule

Use one configurable currency label.

The current UI has shown inconsistent labels such as `$` and `美元`. V3 must not hard-code the wrong currency label.

Minimum acceptable:

- use `$` only as a symbol
- avoid writing `美元` unless the store setting says USD
- prefer `NT$` or configurable display if target market is Taiwan

### Product price snapshot rule

When an order item is created, snapshot:

- `product_id`
- `product_name`
- `unit_price_cents`
- `quantity`
- `line_subtotal_cents`
- `notes`

Later product price changes must not rewrite old order item prices.

---

## Order business logic

### Order type

Allowed order types:

- `dine_in`
- `takeout`

### Order status

Allowed order statuses:

- `open`
- `preparing`
- `ready`
- `completed`
- `cancelled`

Recommended transitions:

- `open -> preparing`
- `preparing -> ready`
- `ready -> completed`
- `open/preparing/ready -> cancelled`

Invalid transitions must return a structured 400 error.

### Order amount logic

Canonical order total:

`order_total_cents = sum(order_items.line_subtotal_cents)`

Do not trust frontend-submitted total as canonical.

If the frontend sends a total, treat it only as client-side display or validation hint.

### Order cancellation logic

An order can be cancelled only when business rules allow it.

Minimum V3 rule:

- cancelling an unpaid order is allowed
- cancelling a paid or partially paid order requires manager/admin
- cancelling does not delete payments
- cancelled orders are excluded from revenue, but remain visible in audit/history

---

## Payment ledger business logic

Use a ledger-like model. Do not hard-delete financial records.

### Payment event types

Allowed event types:

- `payment`
- `refund`
- `void`

### Payment methods

Allowed payment methods:

- `cash`
- `card`
- `transfer`
- `external`

No third-party online gateway integration in V3 P0.

### Payment event fields

Each payment event should include:

- `id`
- `order_id`
- `type`
- `method`
- `amount_cents`
- `status`
- `note`
- `external_reference`
- `created_by`
- `created_at`
- `voided_at` or `refunded_at` when applicable

### Payment status

Order-level payment status is derived, never manually trusted from frontend.

Allowed derived statuses:

- `unpaid`
- `partially_paid`
- `paid`
- `refunded`
- `cancelled`

### Payment math

For each order:

```txt
charge_cents = sum(payment events where type = payment and status = valid)
refund_cents = sum(payment events where type = refund and status = valid)
void_cents = excluded from charge totals
net_paid_cents = max(charge_cents - refund_cents, 0)
balance_cents = max(order_total_cents - net_paid_cents, 0)
```

Derived status:

```txt
if order.status = cancelled:
  payment_status = cancelled if net_paid_cents = 0
  payment_status = refunded or partially_paid depending on refund state
else if net_paid_cents = 0:
  payment_status = unpaid
else if net_paid_cents < order_total_cents:
  payment_status = partially_paid
else:
  payment_status = paid
```

Do not count voided payment events as revenue.
Do not count refunded amounts as collected revenue.
Do not allow negative payment amounts.
Refunds must reference an order and preferably a source payment event.

### Overpayment rule

Default V3 P0 should reject overpayment unless there is an explicit business reason.

If overpayment is allowed, it must be shown as change due / store credit. Do not silently mark it as normal revenue.

For P0, prefer:

`payment amount <= balance_cents`

### Partial payment rule

Partial payment is allowed.

Example:

- order total = 30000
- cash payment = 10000
- card payment = 20000
- net paid = 30000
- balance = 0
- status = paid

### Refund rule

Refund must:

- create a refund event or mark a payment as refunded through auditable state
- require admin/manager
- reduce net collected amount
- update derived payment status
- appear on receipt
- appear in closing as refunded amount

### Void rule

Void is for cancelling an erroneous payment record before settlement.

Void must:

- require admin/manager
- not delete the original record
- exclude the event from collected revenue
- appear in audit log

---

## Closing / daily reconciliation logic

Closing must use the same ledger calculations as order detail, receipt, and dashboard.

### Date range

Closing date range should be based on store local business day.

For V3 P0:

- default range = today in configured store timezone
- if timezone setting is unavailable, document the default and use a consistent fallback

### Required closing metrics

For selected range:

- gross_order_total_cents
- collected_cents
- outstanding_cents
- cash_collected_cents
- card_collected_cents
- transfer_collected_cents
- external_collected_cents
- refunded_cents
- voided_cents
- cancelled_order_count
- order_count
- paid_order_count
- partially_paid_order_count
- unpaid_order_count
- average_order_value_cents
- list of unpaid orders
- list of partially paid orders

### Revenue rules

- cancelled orders are excluded from revenue totals
- unpaid orders do not count as collected revenue
- partially paid orders count only net paid amount
- paid orders count net paid amount
- refunded events reduce collected revenue or appear separately as refunded, but must not inflate revenue
- voided payment events do not count as collected
- closing totals must match receipts and dashboard

---

## Receipt business logic

Receipt must be generated from backend-trusted order data.

Receipt must show:

- store name or app name
- order number
- order type
- table number if dine-in
- created time
- item list with price snapshot
- subtotal / total
- payment events
- net paid
- balance
- refund / void records if any
- payment status
- print timestamp

Receipt page must never go blank. If data cannot load, show structured error and a retry button.

---

## Table business logic

Tables must support:

- create table
- edit capacity / section / notes
- mark available / occupied / reserved / cleaning / inactive
- delete table only if no active order uses it

Table occupancy rule:

- a table becomes occupied when there is an active dine-in order assigned
- a table becomes available only after all active orders are completed/cancelled and staff clears it

Do not allow table deletion when active orders or reservations exist.

---

## KDS business logic

KDS must show active kitchen orders and support status transitions.

Required transitions:

- open -> preparing
- preparing -> ready
- ready -> completed

KDS must not show cancelled orders as active.
KDS must not break when payments are added.
KDS and order detail must reflect the same order status.

---

## Auth / role business logic

V3 must make auth reliable before all other modules.

### Roles

Allowed roles:

- `admin`
- `manager`
- `staff`
- `kitchen`

### Permission baseline

Admin:

- all actions

Manager:

- orders
- payments
- refunds
- voids
- closing
- tables
- dashboard

Staff:

- create orders
- update order status
- record normal payments
- view receipts
- view tables

Kitchen:

- view KDS
- update KDS cooking status
- cannot process payment
- cannot view closing
- cannot refund / void

Backend must enforce permissions. Frontend hiding buttons is not enough.

### Auth requirements

- login must not randomly fail after logout
- logout must clear local session reliably
- stale token must redirect to login with clear message
- registration must return clear errors
- existing account must show `email already registered`, not `Internal Server Error`
- database unavailable must show `database unavailable`, not blank page

---

## API error contract

Every API error should follow this shape:

```json
{
  "ok": false,
  "error": {
    "code": "SOME_STABLE_CODE",
    "message": "Human readable message"
  },
  "timestamp": "ISO timestamp"
}
```

Frontend must display the backend message when safe.

Required error codes include:

- `AUTH_REQUIRED`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_FORBIDDEN`
- `AUTH_DATABASE_UNAVAILABLE`
- `ORDER_NOT_FOUND`
- `ORDER_INVALID_STATE`
- `PAYMENT_INVALID_AMOUNT`
- `PAYMENT_OVERPAYMENT_NOT_ALLOWED`
- `PAYMENT_FORBIDDEN`
- `TABLE_HAS_ACTIVE_ORDER`
- `DATABASE_UNAVAILABLE`
- `VALIDATION_ERROR`

---

## Frontend UX requirements

Mobile-first is required.

Every page must have:

- loading state
- empty state
- error state
- retry action
- safe navigation back to a stable page

No page may become blank due to failed API response.

Core screens:

- `/login`
- `/dashboard`
- `/orders`
- `/orders/:id`
- `/orders/:id/receipt`
- `/floor-plan`
- `/kitchen`
- `/closing`

Login screen must show the actual error reason.
Orders screen must not navigate to a missing order after failed create.
Receipt must not open blank if order fetch fails.
Closing must show API error with retry instead of stale or misleading numbers.

---

## Testing requirements

Run and report:

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/restaurant-os build
pnpm --filter @workspace/api-server build
pnpm run build
git diff --check
```

If any command cannot run, say why.

### Business logic tests

Add tests or at minimum executable smoke checks for:

1. order total from item snapshots
2. unpaid order
3. partial payment
4. multiple payments to paid
5. overpayment rejection
6. refund reduces collected amount
7. void excludes payment from collected amount
8. cancelled order excluded from revenue
9. closing totals match same payment ledger
10. receipt totals match order detail

### API smoke tests

Document how to test:

1. register admin
2. login admin
3. logout and login again
4. create table
5. create order
6. add item
7. open order detail
8. add partial payment
9. add second payment
10. open receipt
11. open closing
12. update KDS status
13. verify dashboard totals

### UI smoke tests

Test on mobile width:

- login
- orders
- create order modal
- order detail
- receipt
- closing
- floor plan
- KDS

---

## Final report format

The PR description must include:

1. Runtime architecture chosen and why.
2. Files changed.
3. Business logic model.
4. Money calculation rules.
5. Payment ledger rules.
6. Order state machine.
7. Table state logic.
8. KDS state logic.
9. Auth and role enforcement.
10. Error handling strategy.
11. Tests run.
12. Test results.
13. Known limitations.
14. Remaining risks.
15. Next sprint recommendation.

## Success definition

V3 P0 is successful only if:

- login works after logout
- order creation does not create broken navigation
- order detail always loads or shows a recoverable error
- receipt never goes blank
- payment numbers are mathematically consistent
- closing numbers match payments and orders
- dashboard numbers match closing rules
- KDS works independently of payment flow
- table management blocks dangerous deletion
- API errors are structured
- mobile UX is usable

If these are not true, do not claim production readiness.
