# Complaint / Rework Event Linkage — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/complaint-rework.test.ts \
               src/__tests__/execution/complaint-rework.service.test.ts \
               src/__tests__/owner-mode/proof-outcome-linkage.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/owner-mode/profit-leak-radar.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts

# DB (requires local Postgres + operational_events migration applied)
source ./dbenv.sh
npx vitest run src/__tests__/execution/complaint-rework-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| complaint-rework.test.ts | 7/7 pass |
| complaint-rework.service.test.ts | 8/8 pass |
| complaint-rework-simulation.db.test.ts | 4/4 pass |
| proof-outcome / credibility / radar / SLO | pass (assertions updated for new measurable behaviour) |
| owner-mode + owner-guidance + execution | **90 files / 742 tests pass** |

## Migration
`prisma/migrations/20260705140000_operational_event/migration.sql` — new `operational_events` table
(+ two indexes). Applied cleanly to the local DB; CI LANE_B applies migrations fresh.

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files there.
Repo-wide there is a known **pre-existing, non-required** `stripe-simulation` lane failure (a missing
test file), unrelated to this pass. Do not claim full-repo green until CI confirms required checks.

## New-tests map
- domain: valid record; fail-closed (missing category/blank description/bad type/wrong-category-for-type); measured amount only when supplied; category→risk map; linkage measurable+attributed; MISSING_PROOF; qualitative-when-no-amount + workspace echo.
- service: record + audit; fail-closed missing category/description; wrong-workspace proof; link + audit + idempotent; cross-workspace link fail-closed; read path.
- radar: linked complaint with a measured amount → quantified impact (not fabricated).
- DB sim: record+link (cross-workspace refused, idempotent); complaint-driven now-view (COMPLAINT_REVENUE_RISK + ACCEPTED_PROOF_WITH_COMPLAINT + PROOF_OUTCOME_INTEGRITY FAIL + proof→complaint LINKED); dispute → one idempotent reassessment; clean workspace no fabrication + isolated.

## Browser E2E
Untouched — status unchanged (unproven).
