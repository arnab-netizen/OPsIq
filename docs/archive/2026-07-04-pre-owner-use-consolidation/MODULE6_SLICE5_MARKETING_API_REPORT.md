# Module 6 (Marketing & Growth Intelligence) — Slice 5: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API routes
for the marketing loop (snapshot → diagnosis cycle → action status machine →
verification → dashboard), mirroring the proven Module 2/3/4/5/7 API. Reuses the
Module 1 ownership guard, status machine, and `verifyOutcome`. No migration run.
Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

The Module 6 Marketing migration **passed** (Module 6 Marketing Migration #1,
target `staging`, on `main`@`1ef5530`) — the `owner_marketing_*` tables exist. Per
the 8-slice contract the next step is the API + service layer that turns the
deterministic engine (Slices 1–3) into a persisted, workspace-scoped owner loop.

## 2. Files created / changed

Services (`src/services/owner-marketing/`): `snapshot.service.ts` (create/get/list
+ data-confidence at persist + duplicate conflict), `diagnosis.service.ts`
(engine+planner → cycle+findings+actions in a transaction using **`createMany` +
explicit timeout** — the cashflow P2028 lesson), `action.service.ts` (shared
Module 1 status machine, completion evidence), `verification.service.ts` (shared
`verifyOutcome`), `dashboard.service.ts` (aggregated persisted read + empty state).

API routes (`src/app/api/owner/marketing/`, all `withCanonicalEnforcement`,
workspace-required, OWNER_VIEW read / OWNER_MANAGE write): `businesses/[businessId]/snapshots`
GET+POST, `businesses/[businessId]/diagnoses` POST, `snapshots/[snapshotId]` GET,
`diagnoses/[cycleId]` GET, `.../findings` GET, `.../actions` GET,
`actions/[actionId]` GET+PATCH, `actions/[actionId]/verify` POST, `dashboard` GET.

Domain/constants: `src/domain/owner-marketing/validation.ts` (Zod write-path
schemas), `src/domain/constants/audit-events.ts` (4 marketing audit events).

Tests (`src/__tests__/owner-marketing/`): `validation.test.ts`, `routes.test.ts`
(both no DB), `services.db.test.ts` (`[db]`-gated end-to-end).

## 3. Honesty / governance

- All write paths validate input (Zod) + enforce auth/workspace/capability via the
  canonical wrapper.
- All meaningful mutations emit audit events.
- Diagnosis persistence is transactional, `createMany` + timeout so the higher
  volume wasting path does not hit the interactive-transaction limit.
- Reuses Module 1's status machine + verification (no second pattern). No other
  domain's table or route modified (asserted by `routes.test.ts`).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-marketing/` | 52 passed, 5 [db]-skipped |
| `npx eslint` (services + routes + validation + tests) | clean |
| `npm run build` | REAL_EXIT=0; 9 marketing routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |
| `npm test` | full suite — 5856 passed / 194 skipped / 0 failed |

## 5. Gate status

**No gate reached by this slice** (code + non-DB tests only; the migration it
depends on is already applied). Next is **Slice 6 — UI + command-center
integration** (owner marketing dashboard page + wiring the marketing `DomainScore`
into the Business Condition Profile, where the `owner_marketing_*` read is
introduced — now safe because the tables exist). Then Slice 7 (deployed runtime
proof) and Slice 8 (audit). Public/SaaS stays frozen.
