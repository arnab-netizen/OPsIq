# Module 9 (Multi-Business Portfolio Command Center) — Slice 2: API + Service — Report

Status: **BUILT + LOCALLY VERIFIED.** Read-only portfolio service over the proven
per-business condition profiles + 4 canonical read routes. No migration (the module
owns no entity). Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice + why no migration

Slice 1 (engine) is proven. Module 9 is a cross-business **aggregation** over data
the proven domains already persist, so there is no persistence/migration gate. This
slice is the service + API that turns the engine into a workspace-scoped, governed
read surface.

## 2. Files created

- `src/services/owner-portfolio/portfolio.service.ts` — `getPortfolio(workspaceId)`:
  reads the workspace's businesses, resolves each one's
  `BusinessConditionProfile` via the proven `getBusinessCondition` (in parallel),
  and feeds them to `buildPortfolioView`. Explicit empty view for an empty
  workspace. Owns no table; workspace ownership is enforced by the underlying
  condition reads.
- API routes (`src/app/api/owner/portfolio/`, all `withCanonicalEnforcement`,
  workspace-required, **OWNER_VIEW only** — the module is read-only):
  `dashboard` (full view), `ranking` (cross-business ranking + per-business
  scores), `actions` (top-3 priorities + per-business action queue), `risks`
  (risk alerts + investment recommendation).
- Tests (`src/__tests__/owner-portfolio/`): `routes.test.ts` (enforcement +
  read-only + single-source-of-truth, no DB), `services.db.test.ts` (`[db]`-gated:
  aggregates a business with a real finance cycle + one without; empty-workspace
  empty view; determinism).

## 3. Honesty / governance

- All routes enforce auth/workspace/OWNER_VIEW via the canonical wrapper; no write
  routes exist (no mutations, no audit events needed — read-only).
- Single source of truth: every route reads through the one portfolio service.
- No invention: businesses without a profile are reported `hasData: false`;
  no other domain's table or route is modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-portfolio/` | 13 passed, 2 [db]-skipped |
| `npx eslint` (service + routes + tests) | clean |
| `npm run build` | REAL_EXIT=0; 4 portfolio routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |
| `npm test` | full suite — 5927 passed / 201 skipped / 0 failed |

## 5. Gate status

**No gate reached** (read-only; no migration). Next: **Slice 3 — UI +
command-center link** (`/owner/portfolio` page + a Portfolio link on the owner
home). Then Slice 4 (deployed runtime proof gate) and Slice 5 (audit). Public/SaaS
stays frozen.
