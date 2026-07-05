# Adjudication Suppression All Sources — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/proof-risk-adjudication.test.ts \
               src/__tests__/owner-mode/anti-gaming-analytics.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts

# DB (requires local Postgres)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/adjudication-suppression-simulation.db.test.ts \
  src/__tests__/execution/proof-risk-adjudication-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/execution
TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| proof-risk-adjudication.test.ts | 11/11 pass (incl. isFindingSuppressed + training reclassification) |
| adjudication-suppression-simulation.db.test.ts | 7/7 pass |
| proof-risk-adjudication-simulation.db.test.ts (prior) | 4/4 pass (unbroken) |
| anti-gaming / credibility / SLO | pass |
| owner-mode + execution (unit) | 71 files / 692 tests pass (21 db skipped) |
| owner-mode + owner-guidance + execution (TEST_WITH_DB) | 99 files / 814 tests pass |

## New-tests map (covers the pass's required tests)
- **domain (1 new):** `isFindingSuppressed` — all-cleared suppresses; a new proof re-surfaces; empty /
  unknown supporting ids never suppress; nothing cleared → visible. (Plus the training-classification
  test updated: training no longer clears.)
- **DB sim (7):** baseline reused → gaming + credibility + reused surface (req 7); dismiss ANTI_GAMING
  suppresses ONLY gaming + eases SLO, credibility stays (req 1, 9, 12-per-source); dismiss CREDIBILITY
  suppresses the concern (req 3); NEW reused proof re-surfaces gaming + CONFIRM keeps it active + SLO
  stays FAIL (req 2, 8, 10); dismiss REUSED_HASH for A+B leaves new proof C flagged (req 7, 8); dismiss
  PROOF_DISPUTE keeps PROOF_OUTCOME_INTEGRITY FAIL + retains proof.disputed audit (req 5, 6); clean
  workspace no state + isolation (req 11, 13). No fraud/theft label asserted (req 14).

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The known
non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Do not claim
full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
