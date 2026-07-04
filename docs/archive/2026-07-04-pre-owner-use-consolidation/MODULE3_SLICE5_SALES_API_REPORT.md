# Module 3 (Sales & Customer Intelligence) — Slice 5: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API routes
for the sales loop (snapshot → diagnosis cycle → action status machine →
verification → dashboard), mirroring the proven Module 2/5 API. Reuses the
Module 1 ownership guard, status machine, and `verifyOutcome`. No migration run.
Module 1 + Module 2 + Module 5 untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

The sales domain logic (engine + detector + planner, Slices 1–3) is complete and
unit-proven, and the persistence schema + migration (Slice 4) is built. Per
execution.md §23 the next step is the **API + service layer** that turns the
deterministic engine into a persisted, workspace-scoped owner loop. The Prisma
client is already regenerated with the sales models, so the services + routes
compile and unit-test now; the `[db]` tests + deployed runtime proof require the
migration applied (Slice 4 gate → Slice 7), which is the later runtime gate — no
false green.

## 2. Files created / changed

Services (`src/services/owner-sales/`): `snapshot.service.ts` (create/get/list +
data-confidence at persist + duplicate conflict), `diagnosis.service.ts`
(engine+planner → cycle+findings+actions in a **transaction using `createMany` +
explicit timeout** — proactively applying the cashflow P2028 lesson),
`action.service.ts` (shared Module 1 status machine, completion evidence),
`verification.service.ts` (shared `verifyOutcome`), `dashboard.service.ts`
(aggregated persisted read + explicit empty state).

API routes (`src/app/api/owner/sales/`, all `withCanonicalEnforcement`,
workspace-required, OWNER_VIEW read / OWNER_MANAGE write — execution.md §10
namespace): `businesses/[businessId]/snapshots` GET+POST,
`businesses/[businessId]/diagnoses` POST, `snapshots/[snapshotId]` GET,
`diagnoses/[cycleId]` GET, `.../findings` GET, `.../actions` GET,
`actions/[actionId]` GET+PATCH, `actions/[actionId]/verify` POST, `dashboard` GET.

Domain/constants: `src/domain/owner-sales/validation.ts` (Zod write-path schemas;
negative values rejected; period order; status/direction enums; exported via the
barrel), `src/domain/constants/audit-events.ts` (4 sales audit events).

Tests (`src/__tests__/owner-sales/`): `validation.test.ts` (schema accept/reject +
shared status machine, no DB), `routes.test.ts` (every route canonically enforced,
correct capability, validates input, touches no recovery/finance/cashflow
route/table, no DB), `services.db.test.ts` (`[db]`-gated end-to-end
persistence/isolation/transition/verification/duplicate).

## 3. Honesty / governance

- All write paths validate input (Zod) and enforce auth + workspace + capability
  server-side via the canonical wrapper.
- All meaningful mutations emit audit events (snapshot recorded, diagnosis run,
  action updated, outcome verified).
- Diagnosis persistence is transactional (cycle + findings + actions all-or-none),
  written with `createMany` + a generous timeout so the higher-volume distress
  path does not hit the interactive-transaction limit (P2028) on the pooled
  connection.
- No silent mutation of completed records; completion needs evidence.
- Reuses Module 1's status machine + verification (no second pattern). No
  recovery/finance/cashflow table or route modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sales/` | 51 passed, 5 skipped (`[db]` gated) |
| `npx eslint` (services + routes + validation + tests) | clean |
| `npm run build` | compiled successfully (9 sales routes registered) |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | full suite — see status (0 failed) |

`[db]` service tests require `TEST_WITH_DB=true` + the applied migration; they run
in CI/runtime-proof, not in the sandbox (no DB).

## 5. Gate status

**No gate reached by this slice** (code + non-DB tests only). The sales migration
(Slice 4) remains the pending manual gate before the deployed runtime proof
(Slice 7). Next is **Slice 6 — UI + command-center integration** (owner sales
dashboard page + wiring the sales `DomainScore` into the Business Condition
Profile). Public/SaaS stays frozen.
