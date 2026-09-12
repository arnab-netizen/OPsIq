# Governed Proof Dispute — TEST EVIDENCE LEDGER

## Commands
```bash
npx prisma validate            # valid (no schema change)
npx prisma generate
npx tsc --noEmit               # 0 errors
npm run governance:scan:strict # 31 frozen, 0 new

# Unit (no DB)
npx vitest run src/__tests__/execution/proof-dispute.test.ts \
               src/__tests__/execution/proof-dispute.service.test.ts

# DB (requires local Postgres)
source ./dbenv.sh
npx vitest run src/__tests__/execution/proof-dispute-simulation.db.test.ts

# Changed-area regression
npx vitest run src/__tests__/execution src/__tests__/owner-mode src/__tests__/services/owner-guidance
```

## Results
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid (no schema change) |
| `governance:scan:strict` | 31 frozen, **0 new** |
| proof-dispute.test.ts | 5/5 pass |
| proof-dispute.service.test.ts | 8/8 pass |
| proof-dispute-simulation.db.test.ts | 5/5 pass |
| execution + owner-mode + owner-guidance suites | **85 files / 707 tests pass** |

## Full suite note (honest)
Not re-run in full this pass; the changed-area suites are green and this branch adds no new failing
files there. Repo-wide there is a known **pre-existing, non-required** `stripe-simulation` lane
failure (it runs `src/tests/stripe-sim/stripe-simulation.test.ts`, which does not exist → "No test
files found") — a billing lane untouched by and unrelated to this pass. Do not claim full-repo green
until CI confirms required checks.

## New-tests map
- Domain: valid manager dispute→DISPUTED+trigger; invalid/missing category fail; missing/blank reason fail; owner-only override (non-owner rejected, owner→OVERRIDDEN); high-impact human-review + category→trigger map.
- Service: reversal + dual audit + keyed reassessment; not-found fail-closed; non-accepted fail-closed; SoD self-dispute fail-closed; missing reason/category fail-closed; idempotent no-op; owner override vs manager-override-rejected; reassessment failure does not roll back the dispute.
- DB sim: SoD block (status unchanged); cross-workspace fail-closed; reviewer dispute → DISPUTED + proof.reviewed + proof.disputed + reassessment (idempotent, one row); propagation to linkage + credibility ACCEPTED_PROOF_WITH_BAD_OUTCOME + PROOF_OUTCOME_INTEGRITY FAIL via live now-view; clean workspace NOT_MEASURABLE + isolated.

## Browser E2E
Untouched — status unchanged (unproven). No browser-proven readiness claimed.
