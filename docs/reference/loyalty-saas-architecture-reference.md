# Loyalty SaaS Architecture Reference for Restaurant OS V3

This document summarizes the architecture patterns extracted from the uploaded `loyalty-saas.zip` reference project.

The source project is not a restaurant POS. It is a loyalty / points SaaS. Do not copy its customer-loyalty features directly into Restaurant OS P0.

Use it only as a reference for production-grade SaaS business logic patterns.

## Reference project profile

The uploaded reference project uses:

- Next.js 14 App Router
- Prisma
- PostgreSQL
- NextAuth v5
- Credentials auth
- bcrypt password hashing
- Zod validation
- Prisma Decimal / Decimal.js
- Transactional business operations
- Ledger model
- Outbox pattern
- Drift / consistency monitoring ideas
- Multi-tenant organization and member model

## Why this matters for Restaurant OS

Restaurant OS has restaurant-specific modules:

- tables
- orders
- order items
- kitchen display system
- payments
- receipts
- closing
- dashboard

But the current Restaurant OS implementation has had production issues:

- auth instability
- Vercel serverless / Supabase pooler timeouts
- scattered payment and closing logic
- partial business transactions
- blank frontend states after API failure
- money calculations passing through floating-point database columns

The loyalty SaaS reference shows stronger production business-system patterns that should be adapted into Restaurant OS V3.

---

## Pattern 1 — Transaction atomicity

The reference project settles an order inside one transaction. The settlement operation updates the order, updates customer balance, writes a ledger entry, and writes outbox events as one atomic unit.

Restaurant OS should apply the same principle to every critical business operation.

### Restaurant OS transaction examples

Create order transaction:

- validate order input
- create order
- create order item snapshots
- calculate order total
- assign table if dine-in
- update table state if needed
- write audit log

Payment transaction:

- validate payment amount
- reject overpayment
- create payment ledger event
- update derived order payment summary
- write audit log
- optionally write outbox event

Refund / void transaction:

- validate role
- validate payment state
- create or mark refund / void event
- recalculate order payment summary
- write audit log
- optionally write outbox event

Complete order transaction:

- validate order state transition
- update order status
- update table state to cleaning or available according to business rule
- write audit log

Closing transaction:

- derive closing totals from payment ledger
- persist closing snapshot if implemented
- write audit log
- optionally write outbox event

### Must not happen

Restaurant OS must not allow partial success such as:

- order created but order_items missing
- payment inserted but order paid summary not updated
- refund completed but closing/dashboard numbers not aligned
- order completed but table remains occupied incorrectly
- receipt, closing, dashboard, and order detail showing different totals

---

## Pattern 2 — Ledger model

The reference project uses a `LoyaltyLedger` with `EARN` and `REDEEM` entries.

Restaurant OS should apply this same thinking to payments.

### Restaurant payment ledger

Use ledger-like records for:

- payment
- refund
- void
- audit events

Do not hard-delete financial records.

Derived values should come from the ledger:

- paid amount
- refund amount
- void amount
- net paid
- balance
- payment status
- closing collected amount
- dashboard revenue
- receipt totals

The frontend must not decide canonical payment status, paid amount, balance, or closing revenue.

---

## Pattern 3 — Decimal / integer money precision

The loyalty reference uses Prisma Decimal for financial-like values.

Restaurant OS should not use JavaScript floating point or PostgreSQL `REAL` as canonical business money logic.

Acceptable strategies:

1. integer cents, for example `30000 = NT$300.00`
2. database `numeric` / Decimal

Restaurant OS V3 should centralize money logic:

- `orderTotalCents`
- `lineSubtotalCents`
- `paidCents`
- `refundCents`
- `voidCents`
- `netPaidCents`
- `balanceCents`
- `closingCollectedCents`
- `dashboardRevenueCents`

If legacy columns still use `REAL`, V3 service code must normalize at boundaries and document that an integer-cent migration is required.

---

## Pattern 4 — Idempotency

The reference project uses unique idempotency keys for outbox events such as order settlement and tier upgrades.

Restaurant OS needs idempotency for operations likely to be repeated from mobile users or unstable networks.

### Restaurant OS idempotency targets

- create order
- add order item
- create payment
- refund payment
- void payment
- close day

Idempotency prevents:

- duplicate orders
- duplicate payments
- duplicate refunds
- duplicate closing records
- repeated side effects after retry

Use stable idempotency keys and unique constraints where possible.

---

## Pattern 5 — Outbox pattern

The reference project uses an `EventOutbox` table and worker pattern.

Restaurant OS should not directly couple critical order/payment transactions to external services.

External systems may include:

- Gmail
- LINE
- Make
- n8n
- webhook
- AI workflow
- receipt notification
- analytics sync

Correct pattern:

1. complete main database transaction
2. write event_outbox record
3. worker processes event later
4. failed event can retry
5. main order/payment flow remains successful even if notification fails

V3 P0 does not need a full worker, but should reserve the architecture or document the next implementation step.

---

## Pattern 6 — Drift / consistency monitor

The loyalty reference includes the concept of detecting drift between balance and ledger.

Restaurant OS should have diagnostics for operational consistency.

### Required Restaurant OS drift checks

- order total equals sum of order item snapshots
- order paid amount equals payment ledger net paid
- order balance equals total minus net paid
- receipt total equals order detail total
- closing collected equals payment ledger collected amount
- dashboard revenue equals closing rule
- cancelled orders excluded from revenue
- refunded / voided payments excluded or separately shown
- table occupied state matches active dine-in orders

If inconsistent, return a drift report rather than silently showing wrong numbers.

---

## Pattern 7 — Domain services

Routes should not contain scattered business logic.

Restaurant OS should organize business rules into service modules, for example:

- `order-service`
- `payment-ledger-service`
- `closing-service`
- `table-state-service`
- `receipt-service`
- `audit-service`
- `diagnostics-service`

Route responsibilities:

- validate request
- call domain service
- return structured response

Service responsibilities:

- enforce business rules
- run transactions
- derive totals
- write ledger / audit / outbox
- handle idempotency

---

## Pattern 8 — State machines

The reference project enforces clear business states such as pending, completed, and cancelled.

Restaurant OS needs explicit state machines.

### Order states

Allowed:

- open
- preparing
- ready
- completed
- cancelled

Transitions:

- open -> preparing
- preparing -> ready
- ready -> completed
- open/preparing/ready -> cancelled

Completed and cancelled orders should not move back to open without an explicit admin correction flow.

### Payment states

- payment -> refunded
- payment -> voided
- cannot refund twice
- cannot void an already refunded payment
- refund / void require admin or manager

### Table states

- available -> occupied
- occupied -> cleaning
- cleaning -> available
- table with active order cannot be deleted

### KDS states

- open -> preparing
- preparing -> ready
- ready -> completed
- cancelled orders do not appear in active KDS

Invalid transitions must return structured API errors.

---

## Pattern 9 — Audit log

The Restaurant OS V3 system must audit sensitive operations.

Minimum audit fields:

- actorUserId
- action
- entityType
- entityId
- before
- after
- createdAt

Audit targets:

- create order
- edit order items
- cancel order
- create payment
- refund payment
- void payment
- change table state
- complete order
- close day
- permission-sensitive operations

---

## Pattern 10 — Business logic smoke tests

Do not treat build success as production readiness.

Restaurant OS should include smoke tests for:

- create order transaction
- order item price snapshot
- partial payment
- second payment to paid
- overpayment rejection
- refund reduces net paid
- void excludes revenue
- cancelled order excluded from revenue
- closing equals payment ledger
- receipt equals order detail
- dashboard equals closing rules
- duplicate idempotency key does not duplicate order/payment
- drift monitor detects inconsistent data
- illegal state transition returns structured error

---

## Runtime warning

These business patterns do not solve the current runtime problem by themselves.

Restaurant OS still needs a stable production runtime strategy:

- long-lived backend runtime, or
- serverless-safe backend data access

If Vercel serverless + node-postgres + Supabase pooler remains unstable, the system is not production-ready even if the business logic is correct.

Runtime must provide:

- fast DB failure
- structured `DATABASE_UNAVAILABLE` errors
- no 504 timeouts
- no blank frontend pages
- clear diagnostics
- deployed runtime validation

---

## How Codex should use this reference

Do not add loyalty points to Restaurant OS P0.

Use this document only to improve:

- transaction atomicity
- ledger design
- money precision
- idempotency
- outbox readiness
- drift detection
- domain service organization
- state machines
- auditability
- business tests

The goal is to make Restaurant OS V3 behave like a correct business system, not just a visually complete demo.
