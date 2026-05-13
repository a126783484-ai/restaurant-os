# Order Lifecycle

MVP states:

1. `pending` — new order.
2. `preparing` — kitchen accepted / cooking.
3. `ready` — ready to serve or hand off.
4. `completed` — fulfilled.
5. `cancelled` — stopped without normal completion.

Orders should not be physically deleted during MVP operations. Use `cancelled` to preserve history and payment context.
