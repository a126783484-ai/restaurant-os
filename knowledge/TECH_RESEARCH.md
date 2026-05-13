# Tech Research

## Near-term research

- Choose migration workflow for production Postgres schema changes.
- Validate Vercel env and deployment protection settings.
- Decide how to persist audit logs for order/payment changes.

## Deferred research

- Payment providers and webhook reconciliation.
- Websocket/SSE realtime transport.
- SaaS tenancy and billing model.

## Merge conflict resolution notes

- Keep API server typechecking scoped to its source entrypoints and avoid emitting unrelated workspace files from the artifact package.
- Keep OpenAI integration lazy: imports expose proxies/helpers only, and the OpenAI client is created only when an AI method is invoked.
- Keep JWT handling centralized through one secret helper so production fails fast without `JWT_SECRET`, while local smoke tests can use the explicit `dev-smoke-secret` fallback.
