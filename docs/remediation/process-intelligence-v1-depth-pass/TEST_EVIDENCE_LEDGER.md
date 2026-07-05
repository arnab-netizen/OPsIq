# Process Intelligence v1 — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new
npm run build                  # exit 0

# Unit (no DB)
npx vitest run src/__tests__/owner-mode/process-intelligence.test.ts

# DB simulation (local Postgres)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/process-intelligence-simulation.db.test.ts

# Regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results (this machine)
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `next build` | exit 0 |
| process-intelligence.test.ts | 15/15 pass |
| process-intelligence-simulation.db.test.ts | 2/2 pass |
| owner-mode + owner-guidance (unit regression) | 71 files / 706 tests pass (18 db skipped) |
| owner-guidance + execution (TEST_WITH_DB regression) | 25 files / 158 tests pass |

## Required-tests map (§ Pass 2)
1. rework loop → REWORK_LOOP → unit #1 + DB sim.
2. repeated quality complaints → QUALITY_FAILURE_LOOP → unit #2 + DB sim.
3. delivery/late events → DELIVERY_HANDOFF_DELAY → unit #3.
4. repeated weak/reused proof → PROOF_QUALITY_BREAKDOWN → unit #4.
5. manager missed escalations → ESCALATION_RESPONSE_BREAKDOWN → unit #5 + DB sim.
6. owner review burden → OWNER_APPROVAL_BOTTLENECK → unit #6.
7. cleared false-positive risk does NOT create a process finding → unit #7.
8. confirm/require-fresh risk contributes → unit #8.
9. clean workspace → DATA_INSUFFICIENT → unit #9 + DB sim.
10. cross-workspace non-contamination → unit #10 + DB sim (clean workspace, no id bleed).
11. owner now-view shows top process breakdown → DB sim (getOwnerNowView → processIntelligence.topFinding).
12. no fake financial impact → unit #12 + DB sim.
13. no unsupported fraud/negligence label → unit #13 + DB sim.
14. no hidden staff score → unit #14 + DB sim.
Extra: ≥5 types reachable (unit #11, #15 cover STAFF_TRAINING_GAP, MANAGER_REVIEW_GAP, REVIEW_BOTTLENECK).

## Browser E2E
Untouched this pass — status unchanged.

## Full suite note (honest)
Not re-run in full; the changed-area unit + DB suites are green and this branch adds no failing file. The
known non-required `stripe-simulation` lane is pre-existing/unrelated.
