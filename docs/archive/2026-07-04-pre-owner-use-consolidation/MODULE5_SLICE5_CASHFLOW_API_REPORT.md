# Module 5 (Cashflow Intelligence) — Slice 5: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API routes
for the cashflow loop (snapshot → diagnosis cycle → action status machine →
verification → dashboard), mirroring the proven Module 2 finance API. Reuses the
Module 1 ownership guard, status machine, and `verifyOutcome`. No migration run.
Module 1 + Module 2 untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

The Module 5 migration gate **passed** — the "Module 5 Cashflow Migration"
workflow ran on `main`@`31eaa6f` and succeeded (the `owner_cashflow_*` tables
exist). Per execution.md §23 (SCHEMA → DOMAIN LOGIC → **API** → UI → …) and §9/§12
(owner can enter data, system calculates, ranks, creates actions, verifies,
dashboard updates), the next step is the **API + service layer** that turns the
deterministic engine (Slices 1–3) into a persisted, workspace-scoped owner loop.

## 2. Files created / changed

Services (`src/services/owner-cashflow/`):
- `snapshot.service.ts` — create/get/list snapshots; computes data-confidence +
  missing-critical at persist time; duplicate-period → `ConflictError`.
- `diagnosis.service.ts` — runs the engine+planner, persists an
  `OwnerCashflowCycle` + findings + actions **atomically** (`$transaction`),
  sequence-numbered per business.
- `action.service.ts` — status transitions via the **shared Module 1 status
  machine** (`canTransition`); completion requires notes + evidence; invalid
  transitions throw `ValidationError` (400).
- `verification.service.ts` — before/after via the **shared `verifyOutcome`**;
  missing before-value fails closed.
- `dashboard.service.ts` — aggregated read payload (businesses, latest snapshot,
  latest cycle, cashflow `DomainScore`, recommended next action, missing data,
  cycle history); explicit empty state; persisted reads only.

API routes (`src/app/api/owner/cashflow/`, all `withCanonicalEnforcement`,
workspace-required, OWNER_VIEW read / OWNER_MANAGE write — execution.md §12 namespace):
- `businesses/[businessId]/snapshots` GET+POST
- `businesses/[businessId]/diagnoses` POST
- `snapshots/[snapshotId]` GET
- `diagnoses/[cycleId]` GET, `.../findings` GET, `.../actions` GET
- `actions/[actionId]` GET+PATCH, `actions/[actionId]/verify` POST
- `dashboard` GET

Domain/constants:
- `src/domain/owner-cashflow/validation.ts` — Zod write-path schemas (negative
  values rejected; period order enforced; status/direction enums). Exported via
  the domain barrel.
- `src/domain/constants/audit-events.ts` — 4 cashflow audit events.

Tests (`src/__tests__/owner-cashflow/`):
- `validation.test.ts` — schema accept/reject + shared status machine (no DB).
- `routes.test.ts` — every route canonically enforced, correct capability,
  validates input, touches no recovery/finance route/table (no DB).
- `services.db.test.ts` — `[db]`-gated end-to-end persistence (snapshot →
  diagnosis → findings/actions → dashboard), transition + invalid-transition,
  verification, duplicate-period conflict, cross-workspace isolation.

## 3. Honesty / governance

- All write paths validate input (Zod) and enforce auth + workspace + capability
  server-side via the canonical wrapper.
- All meaningful mutations emit audit events (snapshot recorded, diagnosis run,
  action updated, outcome verified).
- Diagnosis persistence is transactional (cycle + findings + actions all-or-none).
- No silent mutation of completed records; completion needs evidence.
- Reuses Module 1's status machine + verification (no second pattern). No
  recovery/finance table or route modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-cashflow/` | 57 passed, 5 skipped (`[db]` gated) |
| `npx eslint` (services + routes + validation + tests) | clean |
| `npm run build` | compiled successfully (routes registered) |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | green (Module 1 unchanged) |
| `npm test` | full suite — see status (0 failed) |

`[db]` service tests require `TEST_WITH_DB=true` + the applied migration; they run
in CI/runtime-proof, not in the sandbox (no DB).

## 5. Gate status

**No gate reached by this slice** (code + tests only; the migration it depends on
is already applied). Per the auto-continue rule, proceeding to **Slice 6 — UI +
command-center integration** (owner cashflow dashboard page + wiring the cashflow
`DomainScore` into the Business Condition Profile). The next **stop** is Slice 7,
the deployed runtime-proof gate.
