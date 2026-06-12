# Module 2 — Slice 8 — Business Condition Profile / Owner Command Center — Report

Status: **Slice 8 built + locally verified.** Deployed runtime proof for the new
command-center read requires a re-run of the finance runtime-proof workflow (a
`GET /api/owner/command-center` step was added). No public/SaaS, no billing, no
marketing, no Module 3. **No Prisma/migration change. Module 1 unchanged.**
Public/SaaS frozen.

## 1. Slice executed

**Slice 8 — Business Condition Profile / owner command-center integration.** Its
prerequisite (Module 2 finance API + UI deployed-runtime-proven) is satisfied (runs
27404358424 + 27406156168).

## 2. What was implemented

A deterministic cross-domain rollup that emits the finance `DomainScore` into ONE
**Business Condition Profile** and surfaces the **single highest-priority next owner
action**, via the proven Owner Intelligence Spine helper `buildBusinessConditionProfile`
(Slice 1, already tested):
- `src/services/owner-condition/business-condition.service.ts` — `getBusinessCondition`
  reads the latest persisted `OwnerFinanceCycle` (+ findings/actions) and the latest
  finance snapshot's `missingCriticalData`, maps them to spine `DomainScore` /
  `OwnerAction` via pure helpers (`financeCycleToDomainScore`,
  `financeActionRowToOwnerAction`), and assembles the profile. Workspace ownership via
  the shared Module 1 `getBusiness` guard. Reads persisted data only; nothing invented.
- `src/app/api/owner/command-center/route.ts` — `GET /api/owner/command-center?businessId=`
  (OWNER_VIEW, `requireWorkspace`, canonically enforced).

**Domain coverage:** v1 wires the **finance** domain (the first to emit a full spine
`DomainScore`). The rollup is domain-agnostic — more domains plug in as they adopt the
spine score. Recovery is **not** integrated yet (it doesn't emit a spine `DomainScore`,
and integrating it must not modify Module 1) — recorded as a known limitation, future
slice.

## 3. Files changed

- `src/services/owner-condition/business-condition.service.ts` (new service + pure mappers)
- `src/app/api/owner/command-center/route.ts` (new read route)
- `src/__tests__/owner-condition/business-condition.test.ts` (new, non-DB: mappers + profile assembly + route enforcement)
- `src/__tests__/owner-condition/business-condition.db.test.ts` (new, `[db]`-gated: rollup + workspace isolation)
- `scripts/smoke-owner-finance-runtime-proof.ts` (**updated**: added step 13 `GET /api/owner/command-center`)
- `MODULE2_SLICE8_BUSINESS_CONDITION_REPORT.md` (this report)

No Prisma schema, no migration, no Module 1 file, no public/SaaS file touched.

## 4. Verification results (local)

| Command | Result |
|---|---|
| `npm run build` | Compiled successfully (`/api/owner/command-center` registered) |
| `npx vitest run .../business-condition.test.ts` | 5 passed |
| `DRY_RUN=true` smoke script | exit 0 (lists step 13 command-center) |
| `npx eslint` (new files) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 (no schema change) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npm test` | 201 files passed, **0 failed**; 5575 passed (+5 condition tests) |

Coverage: finance→DomainScore mapping (clamped, schema-valid); finance action→OwnerAction
(schema-valid); profile assembly (survival risk from a survival domain, single
prioritized next action = highest priority, missing-data carried not invented);
command-center route is OWNER_VIEW + workspace-scoped + canonical and touches no
recovery; `[db]` rollup + workspace isolation.

## 5. Runtime-proof requirement (not skipped)

The deployed `GET /api/owner/command-center` proof was **added** to
`scripts/smoke-owner-finance-runtime-proof.ts` (step 13: asserts the command center
reflects the finance domain + a `recommendedNextAction`). The finance runtime-proof
workflow must be **re-run** to prove the command center on the deployed app; it is
**not** claimed deployed-proven until that re-run is green.

## 6. Module 1 status

Green/unchanged — founder-recovery 38 passed; no recovery files modified.

## 7. Public/SaaS status

Frozen — no public/SaaS/billing/marketing/Module 3 touched.

## 8. Next single action

Re-run **"Module 2 Finance Runtime Proof"** (`confirm = RUN_MODULE2_FINANCE_RUNTIME_PROOF`)
once the deployed app includes `/api/owner/command-center` — it now also proves the
Business Condition Profile read. After it passes, record it and proceed to the next
slice (owner home/command-center UI, or extending domains into the profile).
