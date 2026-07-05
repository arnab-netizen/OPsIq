# Fake-Proof → Anti-Gaming Link — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/owner-mode/fake-proof-anti-gaming.test.ts \
               src/__tests__/owner-mode/anti-gaming-analytics.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts \
               src/__tests__/owner-mode/dispute-risk.test.ts \
               src/__tests__/execution/proof-dispute.test.ts

# DB (requires local Postgres)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/owner-mode/fake-proof-anti-gaming-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode
TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| fake-proof-anti-gaming.test.ts | 10/10 pass |
| fake-proof-anti-gaming-simulation.db.test.ts | 2/2 pass |
| anti-gaming / credibility / SLO / dispute-risk | pass (fake-pattern SLO added) |
| owner-mode (unit) | 63 files / 622 tests pass (15 db skipped) |
| owner-mode + owner-guidance (TEST_WITH_DB) | 85 files / 717 tests pass |

## New-tests map
- **domain (10):** single fake = warning (isRepeatedPattern false); repeated fake = pattern (top signal,
  CRITICAL, reason codes + proof/audit refs, no fraud label); wrong/insufficient ≥2 = pattern (single is
  not); tamper ≥2 = pattern (credibility link); manager accepted-fake = MANAGER_ACCEPTED_SUSPICIOUS_PROOF;
  accepted-tamper = REVIEW_QUALITY_CONCERN; profit/constraint link; clean = DATA_INSUFFICIENT; aggregation
  attributes to submitter+reviewer+tamper; cross-workspace proof skipped (no fabrication).
- **SLO (1):** ANTI_GAMING_RISK FAIL + links a fake/reused pattern.
- **DB sim (2):** two accepted proofs disputed suspected-fake → SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN
  topGamingSignal (operator-attributed, repeated, proof refs, owner action, no fraud label) + ANTI_GAMING_RISK
  FAIL + credibility concern + STAFF link; clean-workspace isolation (no signal).

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The known
non-required `stripe-simulation` lane (a missing test file) is pre-existing/unrelated. Do not claim
full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
