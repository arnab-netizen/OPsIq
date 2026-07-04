# Module 4 (Operations & Productivity Intelligence) — Slice 5: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API routes
for the operations loop (snapshot → diagnosis cycle → action status machine →
verification → dashboard), mirroring the proven Module 2/3/5 API. Reuses the
Module 1 ownership guard, status machine, and `verifyOutcome`. No migration run.
Module 1 + Module 2 + Module 3 + Module 5 untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

The Module 4 Operations migration **passed** (Module 4 Operations Migration #1,
target `staging`, on `main`@`3cd4b4a`) — the `owner_operations_*` tables exist. Per
execution.md §23 the next step is the **API + service layer** that turns the
deterministic engine (Slices 1–3) into a persisted, workspace-scoped owner loop.
The Prisma client is regenerated with the operations models, so the services +
routes compile and unit-test now; the `[db]` tests + deployed runtime proof are the
later runtime gate (Slice 7).

## 2. Files created / changed

Services (`src/services/owner-operations/`): `snapshot.service.ts` (create/get/list
+ data-confidence at persist + duplicate conflict), `diagnosis.service.ts`
(engine+planner → cycle+findings+actions in a transaction using **`createMany` +
explicit timeout** — the cashflow P2028 lesson), `action.service.ts` (shared
Module 1 status machine, completion evidence), `verification.service.ts` (shared
`verifyOutcome`), `dashboard.service.ts` (aggregated persisted read + empty state).

API routes (`src/app/api/owner/operations/`, all `withCanonicalEnforcement`,
workspace-required, OWNER_VIEW read / OWNER_MANAGE write — execution.md §11
namespace): `businesses/[businessId]/snapshots` GET+POST,
`businesses/[businessId]/diagnoses` POST, `snapshots/[snapshotId]` GET,
`diagnoses/[cycleId]` GET, `.../findings` GET, `.../actions` GET,
`actions/[actionId]` GET+PATCH, `actions/[actionId]/verify` POST, `dashboard` GET.

Domain/constants: `src/domain/owner-operations/validation.ts` (Zod write-path
schemas), `src/domain/constants/audit-events.ts` (4 operations audit events).

Tests (`src/__tests__/owner-operations/`): `validation.test.ts`, `routes.test.ts`
(both no DB), `services.db.test.ts` (`[db]`-gated end-to-end).

## 3. Honesty / governance

- All write paths validate input (Zod) + enforce auth/workspace/capability via the
  canonical wrapper.
- All meaningful mutations emit audit events.
- Diagnosis persistence is transactional, `createMany` + timeout so the
  higher-volume overloaded path does not hit the interactive-transaction limit.
- Reuses Module 1's status machine + verification (no second pattern). No other
  domain's table or route modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-operations/` | 51 passed, 5 skipped (`[db]` gated) |
| `npx eslint` (services + routes + validation + tests) | clean |
| `npm run build` | compiled successfully (9 operations routes registered) |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 / 1153 — no increase) |
| `npm test` | full suite — see status (0 failed) |

## 5. Gate status

**No gate reached by this slice** (code + non-DB tests only; the migration it
depends on is already applied). Next is **Slice 6 — UI + command-center
integration** (owner operations dashboard page + wiring the operations
`DomainScore` into the Business Condition Profile, where the
`owner_operations_*` read is introduced — now safe because the tables exist). Then
Slice 7 (deployed runtime proof) and Slice 8 (audit). Public/SaaS stays frozen.
