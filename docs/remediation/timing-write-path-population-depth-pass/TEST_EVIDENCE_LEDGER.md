# Timing Write-Path Population — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new
npm run build                  # exit 0 (/api/escalation/acknowledge in manifest)

# Unit (no DB)
npx vitest run \
  src/__tests__/services/execution/escalation-acknowledgement.test.ts \
  src/__tests__/services/execution/task-work-start.test.ts

# DB simulation (local Postgres; needs delegated_tasks.work_started_at)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/timing-write-path-population-simulation.db.test.ts

# Regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/execution src/__tests__/domain/execution src/__tests__/execution
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run src/__tests__/services/execution src/__tests__/execution src/__tests__/services/owner-guidance
```

## Results (this machine)
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `next build` | exit 0 — `/api/escalation/acknowledge` in manifest |
| escalation-acknowledgement.test.ts | 7/7 pass |
| task-work-start.test.ts | 3/3 pass |
| timing-write-path-population-simulation.db.test.ts | 6/6 pass |
| owner-mode + execution + domain (unit regression) | 118 files / 1243 tests pass (27 db skipped) |
| execution + owner-guidance (TEST_WITH_DB regression) | 34 files / 218 tests pass |

## Required-tests map (§ Pass 1)
1. proof submission sets submittedAt → confirmed (submitProof; unchanged) + exercised in DB sim's proof fixtures.
2. explicit work-start sets workStartedAt → task-work-start #1 + DB sim #1 (real applyTaskTransition on a DB row).
3. missing work-start remains TIMING_MISSING → clean-workspace DB sim #6 + evaluator behavior (proof null start).
4. completion timing signal appears → DB sim #2 (SUSPICIOUS_FAST_COMPLETION_PATTERN from populated timing).
5. <3 samples → BASELINE_MISSING → covered by timing-evidence unit suite (regression) + evaluator.
6. ack sets acknowledgedAt + acknowledgedBy → ack-service #1 + DB sim #3.
7. repeated ack idempotent → ack-service #2 + DB sim #3.
8. wrong-workspace ack fails closed → ack-service #3 + DB sim #3.
9. unauthorized ack fails closed → DB sim #5 (real requirePermission denies unauth, allows granted mgr).
10. overdue signal eases after acknowledgement → DB sim #4 (pattern → single ack-overdue).
11. new overdue resurfaces → DB sim #4 (esc3 → pattern again).
12. no fraud/negligence label → DB sim #2/#6.
13. no hidden staff score → DB sim #6.
14. cross-workspace isolation → DB sim #3 (wrong-ws no-op) + #6 (clean workspace, no bleed).

## Browser E2E
Untouched this pass — status unchanged.

## Full suite note (honest)
Not re-run in full; the changed-area unit + DB suites are green and this branch adds no failing file. The
known non-required `stripe-simulation` lane is pre-existing/unrelated.
