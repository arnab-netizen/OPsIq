# Operational Event Resolution / Aging — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/operational-event-aging.test.ts \
               src/__tests__/execution/complaint-rework.test.ts \
               src/__tests__/execution/complaint-rework.service.test.ts \
               src/__tests__/owner-mode/constraint-engine.test.ts \
               src/__tests__/owner-mode/profit-leak-radar.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts

# DB (requires local Postgres + operational_events + resolution-column migrations)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/operational-event-aging-simulation.db.test.ts \
  src/__tests__/execution/complaint-rework-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| operational-event-aging.test.ts | 8/8 pass |
| operational-event-aging-simulation.db.test.ts | 4/4 pass |
| complaint-rework (domain + service) | pass (2 + 4 new assertions) |
| constraint-engine / profit-leak-radar / business-control-slo | pass (delivery/pricing/SLO added) |
| complaint-rework-simulation.db.test.ts (prior) | 4/4 pass (unbroken) |
| owner-mode (unit) | 76 files / 661 tests pass |
| owner-mode + owner-guidance + execution (no DB) | 72 files / 694 tests pass (71 db skipped) |
| owner-guidance + execution (TEST_WITH_DB) | 16 files / 104 tests pass |

## Migration
`prisma/migrations/20260705150000_operational_event_resolution/migration.sql` — two additive nullable
columns on `operational_events`. Applied to the local DB (the columns were added; the CI LANE_B applies
all migrations fresh on a throwaway Postgres). Note: the local dev DB carries a pre-existing history
drift from an earlier migration (unrelated to this pass); the new migration itself is strictly additive.

## New-tests map
- **aging domain (8):** active/terminal classification; note/reason fail-closed; terminal-lock +
  status validation + IN_REVIEW→OPEN reopen; age from createdAt + overdue by severity + escalation;
  severity scales the window; resolved is inactive w/ frozen unresolved-age; urgency ranking; empty-ws.
- **service (4):** resolve + status-change audit + idempotent; fail-closed on missing note/reason;
  mark in-review (no note); cross-workspace/missing event fail-closed.
- **constraint (2):** delivery complaint → DELIVERY; pricing complaint → PRICING NEEDS_DATA (no
  fabricated margin).
- **radar (2):** delivery complaint → DELIVERY_DELAY_COST (measured only with an amount); pricing
  complaint → PRICING_UNDERCHARGE NEEDS_DATA unless an amount is supplied.
- **SLO (1):** OPERATIONAL_EVENT_RESOLUTION PASS/WARN/FAIL/NOT_MEASURABLE.
- **complaint-rework domain (2):** resolved event drops from live aggregates but stays historically
  measurable + counted resolved; aging summary exposed.
- **DB sim (4):** record backdated→overdue; overdue drives DELIVERY constraint/leak + resolution +
  integrity FAIL; resolve clears live risk (SLO PASS) but integrity stays FAIL + audit; clean-ws
  isolation + no fabrication.

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The
pre-existing, non-required `stripe-simulation` lane (a missing test file) is unrelated to this pass.
Do not claim full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
