# Production Hardening Sprint 1: Payments, Closing, Audit, and Reconciliation

Repository: `a126783484-ai/restaurant-os`

## Context

PR #23 has already been merged: **Build manual checkout operations flow**.

Current baseline:

- `OrderDetail` has manual checkout UI.
- `Orders` shows payment status, paid amount, and balance.
- `OrderReceipt` has a printable receipt page.
- `Dashboard` has preliminary receivable / collected / outstanding metrics.
- KDS and table management have baseline flows.

Strict commercial readiness is still only around **35–45%**. This sprint should improve operational trust, not add broad new demo features.

## Sprint objective

Move the system from:

> manual order-level payment marking

To:

> payment records, reliable checkout accounting, closing reconciliation, auditability, and backend permission enforcement.

This sprint should push the system toward a single-store operational baseline.

## Hard constraints

1. Do not work on `api-v2`.
2. Do not switch production backend to `api-v2`.
3. Production backend must remain `restaurant-os-api-server`.
4. Do not integrate third-party payment gateways in this sprint.
5. Do not integrate ECPay, NewebPay, LINE Pay, Stripe, Apple Pay, or Google Pay.
6. Do not fake online payment success.
7. Do not hard-code API keys or secrets.
8. Do not make the frontend write directly to Supabase with anon client.
9. Do not remove Supabase RLS deny policies.
10. Do not build UI-only fake flows; backend persistence is required.
11. Do not break existing auth, orders, KDS, dashboard, or tables.
12. Do not hard-delete payment records.
13. Do not claim tests passed unless they actually ran.
14. Do not merge changes that fail build or typecheck.

## P0 deliverables

Complete these first:

1. `payments` table.
2. Payment API.
3. Multiple payment records per order.
4. Partial payments.
5. Refund and cancel payment records.
6. Closing / shift closing page.
7. Dashboard collected revenue reconciliation.
8. Audit log for payment-sensitive operations.
9. Backend role checks for payment / refund / cancel-payment actions.
10. Receipt displays payment records.
11. `Orders`, `OrderDetail`, `OrderReceipt`, `Dashboard`, and `Closing` use consistent payment math.

P1 work is optional only after P0 is stable and tests pass. Do not sacrifice P0 stability for P1 scope.

---

## 1. Inspect existing architecture first

Before modifying code, inspect:

### Database / schema

- `orders`
- `order_items`
- `products`
- `payments`, if already present
- `audit_logs`, if already present
- `users`, `sessions`, `staff`, or any current actor model

### Backend routes

- `artifacts/api-server/src/routes/orders.ts`
- `artifacts/api-server/src/routes/dashboard.ts`
- `artifacts/api-server/src/routes/tables.ts`
- auth middleware / route registry / route registration

### Frontend pages

- `artifacts/restaurant-os/src/pages/OrderDetail.tsx`
- `artifacts/restaurant-os/src/pages/Orders.tsx`
- `artifacts/restaurant-os/src/pages/OrderReceipt.tsx`
- `artifacts/restaurant-os/src/pages/Dashboard.tsx`
- `artifacts/restaurant-os/src/components/Layout.tsx`
- `Analytics` if useful for linking Closing

### Shared schema / client

- `lib/api-zod`
- `lib/api-client-react`
- generated API schemas and hooks

Do not blindly duplicate existing architecture.

---

## 2. Payments table

If there is no complete `payments` table, add a formal schema / migration using the project’s existing style.

Recommended fields:

- `id`
- `order_id`
- `amount`
- `method`
- `status`
- `note`
- `external_reference`
- `created_by`
- `created_at`
- `updated_at`
- `refunded_at`
- `cancelled_at`

Payment `method` allowed values:

- `cash`
- `card`
- `transfer`
- `external`

Payment record `status` allowed values:

- `paid`
- `refunded`
- `cancelled`

Order-level `paymentStatus` remains:

- `unpaid`
- `partially_paid`
- `paid`
- `refunded`
- `cancelled`

Requirements:

1. `payments.order_id` must reference `orders.id`.
2. `amount` must be greater than 0.
3. `created_by` should record the authenticated user ID when available.
4. If actor lookup is not reliable yet, keep the field nullable and document the limitation.
5. Payment records must not be hard-deleted.
6. Refund uses `status = refunded` and sets `refunded_at`.
7. Cancellation uses `status = cancelled` and sets `cancelled_at`.
8. Add `created_at` and `updated_at`.
9. Add indexes for `order_id`, `created_at`, `method`, and `status` where appropriate.
10. Keep `orders.paidAmount` as a summary field for compatibility.
11. Sync Drizzle schema if the project uses Drizzle for this table.
12. Keep DB naming consistent with existing snake_case / camelCase mappings.

---

## 3. Centralized payment calculation

Create a reusable backend service / helper, for example:

- `payment-service.ts`
- `payment-utils.ts`
- `order-payment.ts`

Use project naming conventions.

Do not let orders, dashboard, receipt, and closing each calculate payment state differently.

Unified rules:

1. `totalAmount` must come from backend-trusted order data / order items.
2. `validPaidAmount = sum(payments.amount where status = 'paid')`.
3. `refunded` payments do not count toward collected revenue.
4. `cancelled` payments do not count toward collected revenue.
5. `balance = max(totalAmount - validPaidAmount, 0)`.
6. If `validPaidAmount <= 0`, order-level `paymentStatus = unpaid`.
7. If `validPaidAmount > 0 && validPaidAmount < totalAmount`, order-level `paymentStatus = partially_paid`.
8. If `validPaidAmount >= totalAmount`, order-level `paymentStatus = paid`.
9. If `order.status = cancelled`, dashboard and closing must not count it as revenue.
10. Do not trust frontend-sent `totalAmount`.
11. Do not let the frontend directly determine final `paymentStatus`.
12. After payment create / refund / cancel, backend must update `orders.paidAmount`, `orders.paymentStatus`, and `orders.paidAt` if applicable.

---

## 4. Payment API

Add or organize payment routes.

### `GET /api/orders/:id/payments`

Returns payment records and payment summary for one order.

Response should include:

- `payments`
- `totalAmount`
- `paidAmount`
- `balance`
- `paymentStatus`

### `POST /api/orders/:id/payments`

Creates one payment record.

Body:

- `amount`
- `method`
- `note`
- `externalReference`

Requirements:

1. `amount > 0`.
2. `method` must be `cash`, `card`, `transfer`, or `external`.
3. Missing order returns 404.
4. Cancelled order cannot receive a new payment.
5. Create a `payments` record.
6. Recalculate and update `orders.paidAmount`.
7. Derive and update `orders.paymentStatus`.
8. Write audit log.
9. Return updated order and payment summary.

### `PATCH /api/payments/:id`

Edit payment metadata.

Allowed fields:

- `note`
- `externalReference`

Avoid allowing amount edits. If amount editing is implemented, it must be admin / manager only, audited before and after, and must recalculate order summary.

### `POST /api/payments/:id/refund`

Marks a payment as refunded.

Requirements:

1. Missing payment returns 404.
2. Already refunded payment should not refund again.
3. Set `status = refunded`.
4. Set `refunded_at = now`.
5. Recalculate order `paidAmount` / `paymentStatus`.
6. Write audit log.
7. Admin / manager only.

### `POST /api/payments/:id/cancel`

Cancels a payment record without deleting it.

Requirements:

1. Missing payment returns 404.
2. Set `status = cancelled`.
3. Set `cancelled_at = now`.
4. Recalculate order `paidAmount` / `paymentStatus`.
5. Write audit log.
6. Admin / manager only, or limited by current role rules.

### `GET /api/payments/summary`

Used by Dashboard and Closing.

Supported query parameters:

- `date`
- `from`
- `to`
- `method`
- `status`

Response should include:

- `totalReceivable`
- `totalCollected`
- `totalOutstanding`
- `cashTotal`
- `cardTotal`
- `transferTotal`
- `externalTotal`
- `refundedTotal`
- `cancelledPaymentTotal`
- `unpaidOrders`
- `partiallyPaidOrders`
- `paidOrders`
- `cancelledOrders`
- `orderCount`
- `averageOrderValue`
- `unpaidOrderList`
- `partiallyPaidOrderList`

Summary rules:

1. Cancelled orders are excluded from revenue.
2. Unpaid orders are not counted as collected revenue.
3. Partially paid orders count only collected paid amount.
4. Paid orders count collected paid amount.
5. Refunded / cancelled payments do not count as collected revenue.
6. Summary logic must match Dashboard, Closing, Receipt, and OrderDetail.

---

## 5. OrderDetail checkout upgrade

Upgrade `OrderDetail` from order-level paidAmount editing to payment record creation.

Required UI / behavior:

1. Show `totalAmount`, `paidAmount`, `balance`, `paymentStatus`.
2. Add new payment form:
   - `amount`
   - `method`
   - `note`
   - `externalReference`
3. Quick payment buttons:
   - collect remaining balance by cash
   - collect remaining balance by card
   - collect remaining balance by transfer
   - collect remaining balance by external payment
4. Quick payment amount should be current balance, not always total amount.
5. Support partial payment.
6. Support multiple payments on one order.
7. Display payment records:
   - time
   - amount
   - method
   - status
   - note
   - external reference
   - actor, if available
8. Each payment row should support appropriate actions:
   - refund
   - cancel
   - edit note / reference
9. Refund / cancel must refresh OrderDetail, Orders, Dashboard, and Closing-related queries.
10. Keep previous features:
    - update order status
    - edit item quantity
    - edit item note
    - cancel order
    - receipt link
11. Cancelling an order should confirm first.
12. If an order has payments, cancellation should warn that payment records will remain.

UI requirements:

- mobile first
- large payment buttons
- clear amount hierarchy
- clear colors for unpaid / partially paid / paid / refunded / cancelled
- loading skeletons
- empty payment state
- clear error messages

---

## 6. OrderReceipt upgrade

Upgrade `/orders/:id/receipt` to display payment records, not just order-level paid amount.

Receipt must show:

1. Restaurant OS / store name.
2. Order number.
3. Created time.
4. Dine-in / takeout.
5. Table ID / number if available.
6. Order status.
7. Payment status.
8. Item details: name, unit price, quantity, subtotal, notes.
9. Total amount.
10. Payment records: time, amount, method, status, note, external reference.
11. Paid amount.
12. Balance.
13. Order notes.
14. Payment notes.
15. Print timestamp.

Print requirements:

- use `window.print()`
- clean print CSS
- do not print sidebar, navigation, buttons, or extra backgrounds
- readable on A4 and acceptable for small receipt format

---

## 7. Orders list upgrade

`Orders` should use payment summary data where available.

Each order should show:

1. Order number.
2. Dine-in / takeout / table.
3. Order status.
4. Payment status.
5. `totalAmount`.
6. `paidAmount`.
7. `balance`.
8. Payment count if available.
9. Created time.

Entrypoints:

- details
- receipt
- checkout / go to checkout when appropriate

Filters:

- all orders
- today
- unpaid
- partially paid
- paid
- cancelled
- active
- has balance

Mobile view should remain card-based, with clear payment state and receipt entry.

---

## 8. Closing / shift closing page

Add a new page at `/closing`.

Name: `日結 / 班結`.

Link it in Layout sidebar or Analytics navigation.

Required metrics:

1. Today receivable.
2. Today collected.
3. Today outstanding.
4. Cash total.
5. Card total.
6. Transfer total.
7. External payment total.
8. Refunded total.
9. Cancelled payment total.
10. Cancelled order count.
11. Order count.
12. Average order value.
13. Unpaid order list.
14. Partially paid order list.
15. Paid order list.
16. Payment records list if practical.

Date filters:

- today
- yesterday
- this week
- this month
- custom range if practical

Rules:

1. Cancelled orders do not count as revenue.
2. Unpaid orders do not count as collected.
3. Partially paid orders count only collected paid amount.
4. Paid orders count collected paid amount.
5. Refunded payment is excluded from collected revenue or shown separately as refunded.
6. Cancelled payment does not count as collected revenue.
7. Cash / card / transfer / external must be separate.
8. Outstanding = totalAmount - paidAmount.
9. Numbers must match Dashboard and Receipt logic.

UI should look like a real manager closing page, not a demo.

---

## 9. Dashboard upgrade

Dashboard must use the same payment summary logic.

Add or correct:

1. Today receivable.
2. Today collected.
3. Today outstanding.
4. Cash total.
5. Card total.
6. Transfer total.
7. External payment total.
8. Unpaid order count.
9. Partially paid order count.
10. Paid order count.
11. Refund warning / refunded amount if available.
12. Outstanding order alert.

If space is limited, minimum acceptable dashboard changes:

- today collected
- today outstanding
- payment method distribution
- unpaid / partially paid counts

Dashboard / Closing / Receipt must use consistent calculation rules.

---

## 10. Audit log

Check whether `audit_logs` exists.

Payment-sensitive operations must write audit records:

1. Create payment.
2. Edit payment note / reference.
3. Refund payment.
4. Cancel payment.
5. Cancel order.
6. Modify `paidAmount`.
7. Modify `paymentStatus`.
8. Modify `paymentMethod`.
9. Modify order items affecting `totalAmount`.

Audit fields should include:

- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `before`
- `after`
- `created_at`

If actor is available, record it. If actor is not reliably available, keep nullable actor and document the reason.

---

## 11. Backend permission enforcement

Payment / checkout / refund / cancel-payment must have backend role checks.

Suggested rules:

- `admin`: all payment and closing operations
- `manager`: all payment and closing operations
- `staff`: can create payments and checkout, but should not refund / cancel payment unless explicitly allowed
- `kitchen`: cannot create payment, refund, cancel payment, or view closing
- unauthenticated: cannot operate

Requirements:

1. Frontend should hide disallowed buttons.
2. Backend must enforce roles.
3. Do not rely only on frontend visibility.
4. If current auth middleware is insufficient, add minimum viable role check without overhauling all auth.

---

## 12. Preserve KDS and table flows

KDS must still support:

- pending → preparing
- preparing → ready
- ready → completed

Payment changes must not break KDS query invalidation or status updates.

Table system must still support:

- `/floor-plan` create table
- delete table
- change table status
- block delete when active order / reservation exists
- clear deletion error message

---

## 13. API schema / client sync

If the project uses `api-zod` / generated API client, sync:

- API request schemas
- API response schemas
- React hooks
- generated client types
- frontend request / response types

Avoid broad `any` usage. If local fetch is used as a temporary shortcut, document it as technical debt in the final report.

---

## 14. Data consistency requirements

Ensure:

1. Payment sum matches `orders.paidAmount`.
2. `paymentStatus` is backend-derived.
3. Dashboard / Closing / Receipt use one consistent valid-payment logic.
4. Refund / cancel updates summary correctly.
5. Cancelled orders do not count as revenue.
6. Unpaid orders do not count as collected revenue.
7. Partially paid orders count only valid paid amount.
8. Frontend cannot directly decide final payment status.
9. Editing order items recalculates `totalAmount`, `paidAmount`, `balance`, and `paymentStatus`.
10. No FK errors.
11. No hard deletion of payment records.

---

## 15. Design standard

UI / UX must meet production SaaS baseline:

- mobile first
- large checkout buttons
- very clear financial hierarchy
- clear unpaid / partially paid / paid / refunded / cancelled states
- clear error messages
- loading skeletons
- empty states
- not a demo-looking screen
- usable by real staff and managers

---

## 16. Required tests

Run as many of these as possible and clearly report what ran.

### Install and build

1. `pnpm install`
2. `pnpm run typecheck`
3. `pnpm --filter @workspace/restaurant-os build`
4. `pnpm --filter @workspace/api-server build`
5. `pnpm run build`
6. `git diff --check`

### Backend smoke tests

1. Register / login.
2. Create order.
3. Add payment.
4. Partial payment.
5. Second payment to full paid.
6. Refund payment.
7. Cancel payment.
8. Verify `orders.paidAmount` recalculates.
9. Verify `paymentStatus` derives correctly.
10. Verify receipt data.
11. Verify closing summary.
12. Verify dashboard summary.
13. Verify cancelled order not counted as revenue.
14. Verify kitchen role cannot refund / cancel payment, if role middleware is available.
15. Verify KDS progression still works.
16. Verify table create / delete still works.

### Frontend route checks

1. `/orders`
2. `/orders/:id`
3. `/orders/:id/receipt`
4. `/closing`
5. `/dashboard`
6. `/floor-plan`
7. `/kitchen`
8. Mobile layout not broken.
9. Receipt print works.

If any tests cannot run, state why. Do not fake test results.

---

## Completion report format

After implementation, report:

1. Files changed.
2. Migrations / schema added.
3. Payments table design.
4. Payment API design.
5. Payment calculation helper design.
6. OrderDetail checkout result.
7. OrderReceipt result.
8. Orders list result.
9. Closing page result.
10. Dashboard result.
11. Audit log handling.
12. Permission handling.
13. KDS verification.
14. Table verification.
15. Tests run.
16. Test results.
17. Deployability.
18. Remaining risks.
19. Technical debt.
20. Next sprint recommendation.

## PR requirement

Create a branch, implement the sprint, run tests, and open a PR.

Suggested PR title:

`Production hardening: payments, closing, audit, and reconciliation`
