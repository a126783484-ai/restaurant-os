# Database Blueprint

Goal: design restaurant-os as a reusable operating-system database.

Core tables:
- users
- workspaces
- memberships
- roles
- permissions
- sessions
- orders
- order_items
- resources
- reservations
- customers
- inventory_items
- audit_logs
- system_events

Generic mapping:
- restaurant = workspace
- order = job or ticket
- table = resource
- customer = contact
- staff = member

Priority: keep schema multi-tenant, auditable, and safe for production operations.
