# Module 2 — Slice 6 — Finance API + Service Layer — Report

Status: **Slice 6 COMPLETE (services + routes + tests).** No UI, no dashboard page,
no connectors, no public features, no Module 3. No Prisma/migration changes. Module 1
unchanged. Public/SaaS frozen.

## 1. Files created

Services (`src/services/owner-finance/`):
- `snapshot.service.ts` — `createFinancialSnapshot`, `getFinancialSnapshot`,
  `listFinancialSnapshots`, `toFinanceInput`, `rowToFinanceInput` (computes
  data-confidence at persist time; never invents).
- `diagnosis.service.ts` — `runFinanceDiagnosis` (persists cycle + findings +
  actions atomically), `getFinanceDiagnosis`, `listFinanceCycleFindings`,
  `listFinanceCycleActions`.
- `action.service.ts` — `updateFinanceAction` (shared status machine), `getFinanceAction`.
- `verification.service.ts` — `recordFinanceVerification` (shared `verifyOutcome`).
- `dashboard.service.ts` — `getFinanceDashboard` (aggregated, persisted-only).

Validation (`src/domain/owner-finance/`):
- `validation.ts` — `financialSnapshotCreateSchema`, `runFinanceDiagnosisSchema`,
  `financeActionUpdateSchema`, `financeVerifySchema` (Zod v4; reuses the recovery
  action-status vocab).

Routes (`src/app/api/owner/finance/`) — 9 route files (see §5).

Tests (`src/__tests__/owner-finance/`):
- `routes.test.ts` (non-DB) — canonical-enforcement wiring proof.
- `validation.test.ts` (non-DB) — schema accept/reject + status-machine rejection.
- `services.db.test.ts` (`[db]`-gated) — service persistence + isolation + transition.

Report: `MODULE2_SLICE6_FINANCE_API_REPORT.md`.

## 2. Files modified

- `src/domain/constants/audit-events.ts` — **additive only**: 4 finance event names
  (`OWNER_FINANCE_SNAPSHOT_RECORDED`, `OWNER_FINANCE_DIAGNOSIS_RUN`,
  `OWNER_FINANCE_ACTION_UPDATED`, `OWNER_FINANCE_OUTCOME_VERIFIED`). No recovery
  entries changed.

## 3. Prisma changes

**NONE.** `prisma/schema.prisma` unchanged this slice (Slice 5 already migrated).
`npx prisma validate` → valid.

## 4. Migration changes

**NONE.** No new/edited migration; no migration run.

## 5. Route inventory (all `withCanonicalEnforcement`, `requireWorkspace: true`)

| Method + path | Capability |
|---|---|
| `POST /api/owner/finance/businesses/[businessId]/snapshots` | OWNER_MANAGE |
| `GET  /api/owner/finance/businesses/[businessId]/snapshots` | OWNER_VIEW |
| `GET  /api/owner/finance/snapshots/[snapshotId]` | OWNER_VIEW |
| `POST /api/owner/finance/businesses/[businessId]/diagnoses` | OWNER_MANAGE |
| `GET  /api/owner/finance/diagnoses/[cycleId]` | OWNER_VIEW |
| `GET  /api/owner/finance/diagnoses/[cycleId]/findings` | OWNER_VIEW |
| `GET  /api/owner/finance/diagnoses/[cycleId]/actions` | OWNER_VIEW |
| `GET  /api/owner/finance/actions/[actionId]` | OWNER_VIEW |
| `PATCH /api/owner/finance/actions/[actionId]` (status update) | OWNER_MANAGE |
| `POST /api/owner/finance/actions/[actionId]/verify` | OWNER_MANAGE |
| `GET  /api/owner/finance/dashboard` | OWNER_VIEW |

Note: the action **status update** is exposed as **PATCH** (mirroring Module 1's
proven `recovery/actions/[actionId]` route) rather than POST — same canonical-enforced
write semantics, consistent with the existing owner action convention.

## 6. Service inventory

`createFinancialSnapshot` · `getFinancialSnapshot` · `listFinancialSnapshots` ·
`runFinanceDiagnosis` · `getFinanceDiagnosis` · `listFinanceCycleFindings` ·
`listFinanceCycleActions` · `updateFinanceAction` · `getFinanceAction` ·
`recordFinanceVerification` · `getFinanceDashboard`. All workspace-scoped (every
query filters by `verifiedWorkspaceId`; cross-workspace reads throw `NotFoundError`),
emit audit events on mutation, validate input, and reuse pure Slice 1–4 logic +
Module 1's `getBusiness`, action-status machine, and `verifyOutcome`.

## 7. Test inventory

- `routes.test.ts` — 5 tests: every route uses canonical enforcement + requires
  workspace + correct OWNER_VIEW/MANAGE capability; writes validate via Zod; no
  recovery route/table referenced.
- `validation.test.ts` — 10 tests: snapshot schema accepts valid / rejects negative,
  bad period order, missing currency, unknown model; diagnosis/action/verify schema
  validation; shared status machine accepts legal and rejects illegal transitions.
- `services.db.test.ts` (`[db]`) — 4 tests: full snapshot→diagnosis→findings→actions
  →dashboard persistence; action transition + invalid-transition rejection;
  before/after verification; **workspace isolation** (cross-workspace read NotFound).

Route happy-path + unauthenticated/cross-workspace runtime behavior follow Module 1's
proven model: enforced by the shared `withCanonicalEnforcement` wrapper (wiring proven
statically) + service-level workspace scoping (proven by the `[db]` tests), with the
live end-to-end happy path to be confirmed by the deployed runtime smoke (Slice 9).

## 8. `npm run build`

Compiled successfully (all finance API routes registered as dynamic functions).

## 9. `npx prisma validate`

valid 🚀 (no schema change).

## 10. founder-recovery suite

38 passed, 8 skipped — **Module 1 unchanged**.

## 11. full `npm test`

**199 files passed, 0 failed; 5565 passed** (+15 non-DB finance tests). The `[db]`
service test is skipped under normal `npm test` (runs in CI under `TEST_WITH_DB`).
`lint:ratchet` PASS (1500 errors / 1153 warnings — no increase); `git diff --check`
clean; eslint clean.

## 12. Module 1 remains green

Confirmed — founder-recovery 38 passed; no recovery table/route/workflow modified;
no `recovery_*` reference in finance routes (asserted by `routes.test.ts`).

## Stop-condition check

No recovery schema/table mutation, no `owner_businesses` column change, no migration
change, no public/SaaS work, no Module 3 — none required, none done. Slice 7 (UI) not
started; no pages created.

## Next single action

Apply the Module 2 finance migration to staging (if not yet) and run **Slice 9** (a
deployed HTTP runtime proof for the finance loop) — or proceed to **Slice 7** (finance
dashboard UI) under explicit authorization.
