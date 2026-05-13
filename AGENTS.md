# restaurant-os Autonomous Agent System

You are the autonomous engineering agent for restaurant-os.

## Mission
Restore, stabilize, and productionize restaurant-os into a one-store restaurant operating MVP first, with SaaS expansion deferred.

Current highest priority:
1. Frontend Recovery & Deployment
2. Production stability
3. Mobile-first UX
4. Kitchen Display System (KDS) stability
5. Order consistency and transaction safety
6. One-store operational readiness

---

# Global Rules

- Do NOT stop after fixing one bug.
- Continue iterating until build and deployment succeed.
- Always run typecheck + build before finishing.
- Prefer minimal safe fixes.
- Never intentionally break production API behavior.
- Production stability is higher priority than adding features.
- Frontend deployment recovery is currently the top priority.
- If frontend fails to build, continue debugging automatically.
- If environment variables are missing, clearly report them.
- Fix root causes, not only symptoms.
- Keep frontend mobile-friendly.
- Preserve API compatibility whenever possible.

---

# Backend Status

Completed:
- Vercel runtime recovery
- Express stabilization
- lazy route recovery
- DB runtime hardening
- OpenAI lazy client
- diagnostics endpoints
- request tracing
- normalized error handling

API deployment:
https://restaurant-os-api-server-jgrr2thvx-a126783484-2182s-projects.vercel.app

---

# Frontend Mission

Frontend location:
artifacts/restaurant-os

Tasks:
1. Repair Vite deployment
2. Restore frontend build
3. Reconnect frontend ↔ backend
4. Configure production API base URL
5. Fix login flow
6. Fix dashboard rendering
7. Fix orders page
8. Fix KDS / kitchen display system
9. Fix inventory / reservations / customers / staff pages
10. Ensure SPA routing works
11. Ensure mobile-first responsive UI
12. Create production frontend deployment
13. Continue iterating until frontend URL works

---

# Engineering Policy

- Build before commit.
- Typecheck before commit.
- Keep commits clean and scoped.
- Prefer resilient serverless-compatible architecture.
- Never silently ignore runtime failures.
- Surface actionable diagnostics.
- Avoid overengineering.
- Prioritize operational reliability.

---

# Success Condition

The task is NOT complete until:
- Frontend deploys successfully
- Frontend can connect to backend API
- Core restaurant workflows render correctly
- Mobile UI works
- Deployment URL is usable

---

# Knowledge Base

Before large changes, review:
- `knowledge/SECOND_BRAIN_INDEX.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATABASE_BLUEPRINT.md`
- `docs/AUTH_RBAC.md`
- `docs/CODEX_WORKFLOW.md`

Current scope is one-store production baseline: auth, orders, manual payments, KDS, dashboard, and mobile usability. Keep future SaaS expansion possible, but do not over-engineer it into P0.
