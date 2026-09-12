# Dispute → Profit/Constraint Wiring — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/owner-mode/dispute-risk.test.ts \
               src/__tests__/owner-mode/profit-leak-radar.test.ts \
               src/__tests__/owner-mode/constraint-engine.test.ts

# DB
source ./dbenv.sh
npx vitest run src/__tests__/owner-mode/dispute-risk-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| dispute-risk.test.ts | 6/6 pass |
| profit-leak-radar.test.ts | pass (incl. 4 dispute-driven) |
| constraint-engine.test.ts | pass (incl. 4 dispute-driven) |
| dispute-risk-simulation.db.test.ts | 3/3 pass |
| owner-mode + owner-guidance + execution | **87 files / 724 tests pass** |

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files there.
Repo-wide there is a known **pre-existing, non-required** `stripe-simulation` lane failure (runs a
`src/tests/stripe-sim/stripe-simulation.test.ts` that does not exist), unrelated to this pass. Do not
claim full-repo green until CI confirms required checks.

## New-tests map
- dispute-risk: REWORK→REWORK_REDO_COST+QUALITY; CUSTOMER_COMPLAINT→COMPLAINT_REVENUE_RISK + missing complaint model disclosed; FAKE→WEAK_PROOF+STAFF, MANAGER_ERROR→MANAGER; OTHER not overclassified; repeated→HIGH; topRisk ranking + no fake numeric impact.
- radar: rework dispute → REWORK_REDO_COST (NEEDS_DATA impact); complaint dispute → COMPLAINT_REVENUE_RISK (no revenue figure); weak-proof dispute → WEAK_PROOF_REWORK_RISK top; no disputes → nothing fabricated.
- constraint: quality/staff/manager disputes fire QUALITY/STAFF/MANAGER; repeated quality → binding top; no disputes → nothing fabricated.
- DB sim: live dispute → dispute-risk maps REWORK_REDO_COST+QUALITY; live now-view topProfitLeak=REWORK_REDO_COST + topConstraint=QUALITY + disputeRisk; credibility + PROOF_OUTCOME_INTEGRITY FAIL remain; reassessment not duplicated; clean workspace no dispute risk + isolated.

## Browser E2E
Untouched — status unchanged (unproven).
