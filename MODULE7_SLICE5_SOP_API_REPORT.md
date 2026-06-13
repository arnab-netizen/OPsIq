# Module 7 (SOP, Process & Execution Accountability) — Slice 5: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API routes
for the execution loop (snapshot → diagnosis cycle → action status machine →
verification → dashboard), mirroring the proven Module 2/3/4/5 API. Reuses the
Module 1 ownership guard, status machine, and `verifyOutcome`. Migration already
applied (Module 7 SOP Migration #1, staging). Module 1 + all proven modules
untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

The Module 7 SOP migration **passed** (Module 7 SOP Migration #1, target
`staging`, on `main`@`a1c0266`) — the `owner_sop_*` tables exist. Per the 8-slice
contract the next step is the **API + service layer** that turns the deterministic
engine (Slices 1–3) into a persisted, workspace-scoped owner loop. The Prisma
client is regenerated with the sop models, so the services + routes compile and
unit-test now; the `[db]` tests + deployed runtime proof are the later runtime
gate (Slice 7).

## 2. Files created / changed

Services (`src/services/owner-sop/`): `snapshot.service.ts` (create/get/list +
data-confidence at persist + duplicate conflict), `diagnosis.service.ts`
(engine+planner → cycle+findings+actions in a transaction using **`createMany` +
explicit timeout** — the cashflow P2028 lesson), `action.service.ts` (shared
Module 1 status machine, completion evidence), `verification.service.ts` (shared
`verifyOutcome`), `dashboard.service.ts` (aggregated persisted read + empty state).

API routes (`src/app/api/owner/sop/`, all `withCanonicalEnforcement`,
workspace-required, OWNER_VIEW read / OWNER_MANAGE write):
`businesses/[businessId]/snapshots` GET+POST,
`businesses/[businessId]/diagnoses` POST, `snapshots/[snapshotId]` GET,
`diagnoses/[cycleId]` GET, `.../findings` GET, `.../actions` GET,
`actions/[actionId]` GET+PATCH, `actions/[actionId]/verify` POST, `dashboard` GET.

Domain/constants: `src/domain/owner-sop/validation.ts` (Zod write-path schemas),
`src/domain/constants/audit-events.ts` (4 sop audit events).

Tests (`src/__tests__/owner-sop/`): `validation.test.ts`, `routes.test.ts` (both
no DB), `services.db.test.ts` (`[db]`-gated end-to-end).

## 3. Honesty / governance

- All write paths validate input (Zod) + enforce auth/workspace/capability via the
  canonical wrapper.
- All meaningful mutations emit audit events.
- Diagnosis persistence is transactional, `createMany` + timeout so the
  higher-volume breakdown path does not hit the interactive-transaction limit.
- Reuses Module 1's status machine + verification (no second pattern). No other
  domain's table or route modified (asserted by `routes.test.ts`).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sop/` | 50 passed, 5 skipped (`[db]` gated) |
| `npx eslint` (services + routes + validation + tests) | clean |
| `npm run build` | REAL_EXIT=0; `.next/BUILD_ID` written; 9 `/api/owner/sop/*` routes registered |
| `npm run lint:ratchet` | see status (1500/1153 — no increase) |
| `npm test` | full suite — see status (0 failed) |

## 5. Gate status

**No gate reached by this slice** (code + non-DB tests only; the migration it
depends on is already applied). Next is **Slice 6 — UI + command-center
integration** (owner execution dashboard page + wiring the sop `DomainScore` into
the Business Condition Profile, where the `owner_sop_*` read is introduced — now
safe because the tables exist). Then Slice 7 (deployed runtime proof) and Slice 8
(audit). Public/SaaS stays frozen.
