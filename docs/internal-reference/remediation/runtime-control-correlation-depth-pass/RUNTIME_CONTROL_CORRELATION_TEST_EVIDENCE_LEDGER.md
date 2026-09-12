# Runtime Control Correlation — TEST EVIDENCE LEDGER

## Commands
```bash
# Typecheck (0 errors)
npx tsc --noEmit

# Prisma schema valid
npx prisma validate

# Governance strict (0 NEW findings; 31 frozen)
npm run governance:scan:strict

# Pure unit tests (no DB)
npx vitest run src/__tests__/owner-mode/control-correlation.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts \
               src/__tests__/services/execution/proof-precheck.service.test.ts

# DB simulation (requires Postgres + migration applied)
source ./dbenv.sh   # TEST_WITH_DB=true, local Postgres
npx vitest run src/__tests__/owner-mode/control-correlation-simulation.db.test.ts

# Changed-area regression (all green)
npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance \
               src/__tests__/services/execution/proof-precheck.service.test.ts
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| control-correlation.test.ts | 14/14 pass |
| business-control-slo.test.ts | 16/16 pass (incl. 4 new measured-grading) |
| proof-precheck.service.test.ts | 7/7 pass (incl. 2 new tamper) |
| control-correlation-simulation.db.test.ts | 3/3 pass |
| owner-mode + owner-guidance + precheck suites | **79 files / 667 tests pass** |

## Full suite note (honest)
`npx vitest run` (entire repo) = **846 files / 14454 tests pass**, 14 files / 45 tests fail, 84 skipped.
All 14 failing files are **outside this pass's changed area** (HTTP route/`p2a`/`p2b`, `runtime-proof`
hostile-HTTP, `ci-cd/workflow-validation`, `signup-schema-contract`, `diagnosis-legal-governance-textual`,
`phase-i`, `demo-*-backfill`, `phase-d/admin-operability-db`, `first-value`). Verified **pre-existing**:
with this pass's changes `git stash`-ed away (clean `47a7741d`), the sampled representatives
(`diagnosis-legal-governance-textual`, `signup-schema-contract`, `runtime-proof/rp1-phase3-persistence`)
fail identically (11 fails). This pass touches none of those import graphs; the one proof-adjacent sample
(`rp1-phase3-persistence`) fails identically before and after, so the additive `tamper_suspected` column
does not cause them.

## New-tests map
- Reassessment: closed→LINKED latency; open-within→MISSING_TARGET (null target); open-past→FAILED; empty→not measurable; median.
- Shock: recorded+handling→2 LINKED + latency; no-handling→FAILED (null target); no-recorded→durability breach coverage 0; server `createdAt` used not `happenedAt`; empty→not measurable.
- Report: tamper persistence LINKED w/ real count; proof→outcome NOT_MEASURABLE w/ exact missing model; workspaceId echoed on all; disclosed target constants.
- SLO: AUDIT_DURABILITY PASS@100 / FAIL<100; REASSESSMENT PASS/WARN/FAIL; SHOCK PASS/FAIL.
- Precheck: tamper outcome persists `tamperSuspected=true`; clean proof does not.
- DB sim: measured correlations from persisted timestamps; live now-view SLO flip (REASSESSMENT PASS, AUDIT_DURABILITY PASS 100%, SHOCK FAIL); clean workspace NOT_MEASURABLE + isolated.
