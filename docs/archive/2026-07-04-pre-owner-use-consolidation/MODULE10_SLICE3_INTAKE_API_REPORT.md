# Module 10 (Connectors & Data Intake) — Slice 3: API + Services — Report

Status: **BUILT + LOCALLY VERIFIED.** Persistence services + canonical API for the
intake loop (upload CSV → validated/normalized candidate → owner confirm), plus a
per-target-domain field-spec registry. Migration already applied (Module 10 Data
Intake Migration #1, staging). Module 1 + all proven modules untouched. Public/SaaS
frozen.

## 1. Why this is the correct next slice

The Module 10 migration **passed** (Module 10 Data Intake Migration #1, target
`staging`, `main`@`4257c0c`) — the `owner_data_intakes` table exists. Per the slice
contract the API + service layer is next: it turns the Slice 1 engine into a
persisted, workspace-scoped intake loop that ends with explicit owner confirmation.

## 2. Files created / changed

- `src/domain/owner-intake/field-specs.ts` — `INTAKE_FIELD_SPECS` per target domain
  (finance / sales / operations / sop / marketing; cashflow + strategy deferred —
  see §5). `fieldSpecForDomain(domain)`.
- `src/domain/owner-intake/validation.ts` — `intakeUploadSchema` (source + target
  domain enums, size-bounded CSV).
- `src/services/owner-intake/intake.service.ts` — `createDataIntake` (engine →
  persisted candidate, `ownerConfirmed` false), `getDataIntake`, `listDataIntakes`,
  `confirmDataIntake` (fails closed: an invalid intake can't be confirmed; duplicate
  confirm rejected), `getIntakeDashboard`. Emits 2 audit events.
- API routes (`src/app/api/owner/intake/`): `businesses/[businessId]/uploads`
  GET+POST, `uploads/[intakeId]` GET, `uploads/[intakeId]/confirm` POST,
  `dashboard` GET — all `withCanonicalEnforcement`, workspace-required, OWNER_VIEW
  read / OWNER_MANAGE write.
- Constants: 2 intake audit events.
- Tests: `validation.test.ts` + `routes.test.ts` (no DB), `services.db.test.ts`
  (`[db]`-gated end-to-end).

## 3. Honesty / governance

- All write paths validate input (Zod) + enforce auth/workspace/capability.
- `ownerConfirmed` is set only by the explicit confirm endpoint (OWNER_MANAGE);
  an `invalid` candidate can never be confirmed — connector data cannot feed a
  diagnosis without owner confirmation (execution.md §17).
- All meaningful mutations emit audit events. No other domain's table/route touched.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-intake/` | 24 passed, 3 [db]-skipped |
| `npx eslint` (domain + services + routes + tests) | clean |
| `npm run build` | REAL_EXIT=0; 4 intake routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |
| `npm test` | full suite — 5951 passed / 204 skipped / 0 failed |

## 5. Gate status + known limitation

**No gate reached by this slice** (code + non-DB tests; migration already applied).
Known limitation: v1 intake field specs cover finance/sales/operations/sop/
marketing; cashflow + strategy intake specs are deferred (honest, not invented).
Next is **Slice 4 — UI** (`/owner/intake`: upload CSV, review the validated
candidate + error report, confirm) + a command-center link, then Slice 5 (deployed
runtime proof) and Slice 6 (audit). Public/SaaS stays frozen.
