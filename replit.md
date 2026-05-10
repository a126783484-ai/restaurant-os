# Restaurant OS

A full-stack restaurant operating system with dashboard, order management, CRM, reservations, floor plan, staff scheduling, and menu management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/restaurant-os run dev` — run the frontend (port 23008)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Optional env: `JWT_SECRET` — secret for JWT auth middleware (defaults to "secret" in dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + cookie-parser + jsonwebtoken + bcryptjs
- DB: PostgreSQL + Drizzle ORM
- Frontend: React 19 + Vite + Tailwind CSS v4 + React Query + Wouter
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` (customers, tables, reservations, products, orders, order-items, staff, shifts, tasks, payments, visits)
- API spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/`
- Generated Zod schemas: `lib/api-zod/src/generated/`
- API routes: `artifacts/api-server/src/routes/`
- Auth middleware: `artifacts/api-server/src/middlewares/auth.ts`
- Frontend pages: `artifacts/restaurant-os/src/pages/`

## Architecture decisions

- Contract-first: OpenAPI spec gates codegen which gates frontend hooks
- All routes live under `/api` prefix; frontend at `/` (root)
- JWT auth middleware available but not enforced on all routes — opt-in per route
- Payments schema uses plain real/numeric columns (no currency type)
- Visits table tracks customer order history for loyalty tracking

## Product

- Dashboard with real-time stats, customer flow chart, top products
- Customer CRM with loyalty points and visit history
- Floor plan management with table status
- Reservation management
- Order management with line items
- Menu/product catalog
- Staff scheduling with shifts and tasks
- Login page at `/login`
- Payments endpoint at `POST /api/payments`

## User preferences

- Do not ask questions or stop for confirmation
- Keep all existing business logic unchanged

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing DB schema files
- The `restaurant-os` artifact must use `BASE_PATH` and `PORT` env vars (wired by workflow)
- `LOGIN_PAGE` route is inside `<Layout>` wrapper — acceptable for the OS context
- Drizzle schema index exports all tables from `lib/db/src/schema/index.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
