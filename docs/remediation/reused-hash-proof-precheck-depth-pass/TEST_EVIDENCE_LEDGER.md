# Reused-Hash Proof Precheck — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/reused-hash-precheck.test.ts \
               src/__tests__/owner-mode/anti-gaming-analytics.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/owner-mode/fake-proof-anti-gaming.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts

# DB (requires local Postgres)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/reused-hash-proof-simulation.db.test.ts

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
| reused-hash-precheck.test.ts | 11/11 pass |
| reused-hash-proof-simulation.db.test.ts | 3/3 pass |
| anti-gaming / credibility / fake-proof / SLO | pass (deterministic reuse feed added) |
| owner-mode + execution (unit) | 70 files / 681 tests pass (19 db skipped) |
| owner-mode + owner-guidance + execution (TEST_WITH_DB) | 96 files / 792 tests pass |

## New-tests map
- **domain policy (7):** unique → PASS; cross-task → NEEDS_REVIEW (EXACT_REUSED_HASH, HASH, same-op HIGH);
  different-op lower attribution (MEDIUM); same-task → ALLOWED; missing/malformed hash → DATA_INSUFFICIENT;
  cross-workspace-only → BLOCKED (no IDs leaked); mixed same+cross-workspace keeps only same-ws IDs.
- **workspace analysis (2):** NEEDS_REVIEW findings + per-submitter reuse counts; clean workspace no finding.
- **integration (2):** deterministic reuse → REUSED_PROOF_PATTERN (anti-gaming, proof refs, profit/constraint
  links); deterministic reuse → attributed REUSED_PROOF credibility concern.
- **DB sim (3):** operator reuses one hash across two jobs → NEEDS_REVIEW ×2, per-submitter count 2,
  workspace-scoped (other workspace's proof never in matched IDs), now-view surfaces reused pattern/concern,
  no fraud label; clean workspace no finding.

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The known
non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Do not claim
full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
