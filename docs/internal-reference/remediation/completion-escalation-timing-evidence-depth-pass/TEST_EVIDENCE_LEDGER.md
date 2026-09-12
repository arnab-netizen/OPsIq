# Timing Evidence — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/owner-mode/timing-evidence.test.ts

# DB (requires local Postgres; schema has work_started_at + escalations.acknowledged_at/_by)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/completion-escalation-timing-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| `timing-evidence.test.ts` | 18/18 pass |
| `completion-escalation-timing-simulation.db.test.ts` | 5/5 pass |
| owner-mode + owner-guidance + execution (unit) | 77 files / 752 tests pass (26 db skipped) |
| owner-mode + owner-guidance + execution (`TEST_WITH_DB`) | 103 files / 849 tests pass |

## New-tests map (17+ required behaviours)
**Unit (18):** fast-completion — DATA_INSUFFICIENT (no rows), TIMING_MISSING (no start/submit pair),
BASELINE_MISSING (<3 samples), NO_SIGNAL (baseline but nothing fast), FAST_COMPLETION_WARNING (1 job),
SUSPICIOUS_FAST_COMPLETION_PATTERN (≥2), per-proof-type baseline isolation, no fraud/accusation language;
escalation — DATA_INSUFFICIENT, NO_SIGNAL (all resolved / within due), ESCALATION_TIMING_MISSING (no
due), NO_MANAGER_ASSIGNMENT (unassigned overdue), ESCALATION_ACK_OVERDUE (1), ESCALATION_RESOLUTION_
OVERDUE (acknowledged-but-unresolved), MANAGER_IGNORES_ESCALATION_PATTERN (≥2, per-target), no fraud
language; integration — active signals map to gaming signals carrying evidence ids while blocked ones do
not fire (2 tests).
**DB sim (5):** both signals from persisted trusted timestamps (COMPLETE) + SLO FAIL + no fraud label;
dismiss fast-completion suppresses exactly its proofs; a NEW fast job re-surfaces; clean-workspace
isolation (DATA_INSUFFICIENT, no bleed); TIMING_MISSING honesty when only `submitted_at` exists.

## Full suite note (honest)
Not re-run in full; the changed-area unit + DB suites are green and this branch adds no failing file.
The known non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Full-repo
green is claimed only when CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
