# Auth and RBAC

Goal: provide safe identity and permission control.

Roles:
- admin
- manager
- staff
- kitchen

Core requirements:
- login and register
- token persistence
- protected routes
- logout
- role-aware navigation
- backend authorization middleware

API rules:
- unauthenticated -> 401
- unauthorized -> 403
- errors must be JSON

Next work:
- permission matrix
- route guards
- audit logs
- session expiration handling
