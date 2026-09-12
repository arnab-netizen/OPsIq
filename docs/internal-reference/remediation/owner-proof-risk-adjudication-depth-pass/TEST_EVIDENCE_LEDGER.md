# Owner Proof-Risk Adjudication — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/proof-risk-adjudication.test.ts \
               src/__tests__/execution/reused-hash-precheck.test.ts \
               src/__tests__/owner-mode/anti-gaming-analytics.test.ts \
               src/__tests__/owner-mode/evidence-credibility-graph.test.ts \
               src/__tests__/owner-mode/business-control-slo.test.ts

# DB (requires local Postgres + proof_risk_adjudications migration)
source ./dbenv.sh && TEST_WITH_DB=true npx vitest run \
  src/__tests__/execution/proof-risk-adjudication-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/owner-mode src/__tests__/execution
TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode src/__tests__/services/owner-guidance src/__tests__/execution
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| `governance:scan:strict` | 31 frozen, **0 new** |
| proof-risk-adjudication.test.ts | 10/10 pass (4 domain + 6 service) |
| proof-risk-adjudication-simulation.db.test.ts | 4/4 pass |
| reused-hash / anti-gaming / credibility / SLO | pass (unbroken) |
| owner-mode + execution (unit) | 71 files / 691 tests pass (20 db skipped) |
| owner-mode + owner-guidance + execution (TEST_WITH_DB) | 98 files / 806 tests pass |

## New-tests map
- **domain (4):** fail-closed on missing outcome/reason/sourceRef; fraud/theft reason rejected;
  per-outcome effect map + default idempotency key; clearing vs risk-keeping outcome classification.
- **service (6):** REQUIRE_FRESH_PROOF record + atomic audit + reassessment; DISMISS_FALSE_POSITIVE
  cleared (no reassessment); fail-closed missing reason/outcome; cross-workspace proofId fail-closed;
  idempotent (identical no-op / changed-outcome update + re-audit); read path.
- **DB sim (4):** reused risk surfaces (needsReviewCount 2); REQUIRE_FRESH_PROOF audited + keeps risk
  visible; re-adjudicate → DISMISS updates same record (1 record, 2 audits) + clears the risk
  (needsReviewCount 0, no REUSED_PROOF_PATTERN, evidence retained), no fraud label; clean-workspace isolation.

## Migration
`prisma/migrations/20260705160000_proof_risk_adjudication/migration.sql` — new `proof_risk_adjudications`
table (unique idempotency key + source-type index). Applied cleanly to the local DB; CI LANE_B applies
migrations fresh on a throwaway Postgres.

## Full suite note (honest)
Not re-run in full; changed-area suites are green and this branch adds no new failing files. The known
non-required `stripe-simulation` lane (missing test file) is pre-existing/unrelated. Do not claim
full-repo green until CI confirms the required checks.

## Browser E2E
Untouched — status unchanged (unproven).
