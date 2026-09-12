# Proof ↔ Outcome Linkage — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run \
  src/__tests__/owner-mode/proof-outcome-linkage.test.ts \
  src/__tests__/owner-mode/reassessment-event.service.test.ts \
  src/__tests__/owner-mode/business-control-slo.test.ts \
  src/__tests__/owner-mode/evidence-credibility-graph.test.ts

# DB (requires local Postgres + migrations applied)
source ./dbenv.sh   # TEST_WITH_DB=true
npx vitest run src/__tests__/owner-mode/proof-outcome-linkage-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/services/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| proof-outcome-linkage.test.ts | 9/9 pass |
| reassessment-event.service.test.ts | 4/4 pass |
| business-control-slo.test.ts | 19/19 pass (incl. 3 new PROOF_OUTCOME_INTEGRITY) |
| evidence-credibility-graph.test.ts | pass (incl. 2 new contradiction cases) |
| proof-outcome-linkage-simulation.db.test.ts | 4/4 pass |
| owner-mode + owner-guidance + execution suites | **89 files / 734 tests pass** |

## Full suite note (honest)
Not re-run in full this pass; the changed-area suites (owner-mode, owner-guidance, execution) are
green. Pre-existing repo-wide failures from PR #113 CI analysis were in unrelated lanes and two
were fixed there. This branch adds no new failing files in the changed area. Do not claim full repo
green until CI confirms required checks.

## New-tests map
- Linkage: accepted→DISPUTED LINKED + latency; accepted→OVERRIDDEN; accepted-never-reversed (no fake fail); no accepted proof → not measurable; DISPUTED-not-from-ACCEPTED not counted; rework link; complaint/recommendation-outcome NOT_MEASURABLE; workspaceId echoed.
- Reassessment service: atomic create + audit + sourceProofId; human-review trigger; idempotent reuse; low-severity no human-review + outcomeId.
- SLO: PROOF_OUTCOME_INTEGRITY PASS/WARN/FAIL + NOT_MEASURABLE.
- Credibility: ACCEPTED_PROOF_WITH_BAD_OUTCOME per submitter; contradicted submitter not reliable; checked-clean reliable HIGH-confidence.
- DB sim: measured contradiction from audit trail; governed idempotent reassessment keyed to proof; live now-view PROOF_OUTCOME_INTEGRITY FAIL + REASSESSMENT_LATENCY measured + topCredibilityConcern; clean workspace NOT_MEASURABLE + isolated.

## Browser E2E
Untouched — status unchanged (unproven). No browser-proven readiness claimed.
