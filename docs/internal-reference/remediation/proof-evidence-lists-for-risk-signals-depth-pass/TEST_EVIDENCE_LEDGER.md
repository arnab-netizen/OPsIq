# Per-Proof Evidence Lists — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/owner-mode/proof-evidence-lists.test.ts \
               src/__tests__/owner-mode/anti-gaming-analytics.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/execution/proof-risk-adjudication.test.ts

# DB (requires local Postgres)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/proof-evidence-lists-simulation.db.test.ts \
  src/__tests__/execution/adjudication-suppression-simulation.db.test.ts

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
| proof-evidence-lists.test.ts | 7/7 pass |
| proof-evidence-lists-simulation.db.test.ts | 5/5 pass |
| adjudication-suppression-simulation.db.test.ts (prior) | 7/7 pass (unbroken) |
| anti-gaming / credibility / adjudication | pass |
| owner-mode + execution (unit) | 72 files / 699 tests pass (22 db skipped) |
| owner-mode + owner-guidance + execution (TEST_WITH_DB) | 101 files / 826 tests pass |

## New-tests map (covers the pass's required tests)
- **unit (7):** aggregateProofEvents collects per-actor/reviewer proof IDs; self-review signal
  COMPLETE + proof refs (adjudicable, req 1-2, 9); self-review WITHOUT ids stays BLOCKED_BY_DATA (req 8);
  rubber-stamp COMPLETE with reviewer's accepted-weak ids (req 3); aggregateCredibility collects
  submitter/reviewer/proof-type ids; self-review + unreliable-submitter credibility COMPLETE (req 1,10);
  unreliable-submitter WITHOUT ids BLOCKED_BY_DATA (req 8). No fabricated ids (req 14 via no-fraud in sim).
- **DB sim (5):** self-review signal carries supporting proof IDs (COMPLETE) + credibility concern + SLO
  FAIL, no fraud label (req 1,4,9,10,14); dismiss ANTI_GAMING suppresses it + eases SLO, credibility
  stays (req 5,11); dismiss CREDIBILITY suppresses the concern (req 5); NEW self-reviewed proof
  re-surfaces (req 7); clean-workspace isolation (req 12,13).

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The known
non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Do not claim
full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
