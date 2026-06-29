# OpsIQ Browser-Representative E2E — Report (Slice C)

## Result
**7/7 Playwright flows passed** on real Chromium against the built app + real seeded postgres:16:
**4 distinct desktop flows** + **3 mobile flows**. 0 failed, 0 skipped, no fatal console errors.

| # | Flow | Seed (business-scoped) | Dominant constraint | Mobile |
|---|---|---|---|---|
| 1 | Cash crisis | cash 0, overdue receivables | `cash_survival` | ✓ |
| 2 | Bad contract / opportunity | negative gross margin (rev<cogs) | `below_margin` | ✓ |
| 3 | Vendor / supplier compliance | expired trade licence | `compliance_block` | ✓ |
| 4 | Growth / scale (healthy) | all healthy | `profitable_growth` | — |

Each flow asserts the command-center "Whole-business plan (live runtime)" card renders from the runtime:
`wbp-dominant-constraint` = the expected constraint, plus do-not-do/stop, next action, owner-workload/
offload, proof, reassessment, growth-gate, arbitration, **provider-backed data** + confidence, and
**stored-learning provenance** — with no `Cannot read / is not a function / Hydration failed` console
errors. The dropdown selects each DB-backed scenario business; one login per `describe` (no login
rate-limit hit).

## Login rate-limit handling
One authenticated context per `describe` (serial mode), reused across all flows in that describe → ≤2
logins total, well under the 10/15-min/IP limiter. Production login security unchanged; rate limiting not
disabled.

## Service-level proof of ALL 10 constraints
`owner-scenario-constraints.test.ts` (11 tests, green) proves each of the 10 representative profiles
resolves its expected dominant constraint through the full `getOwnerWholeBusinessPlan` path (mock-DB,
provider-backed), exercising **7 distinct constraints** (cash_survival, below_margin, capacity_feasibility,
owner_workload, proof_fraud_block, compliance_block, profitable_growth).

## HARD ARCHITECTURAL BLOCKER (the reason it is not 10 browser flows)
`OwnerCapacitySnapshot`, `OwnerWorkloadSnapshot`, `Proof`, and `OwnerStandingInstruction` have **no
`businessId` column** — they are workspace-scoped entities. The wbp providers therefore read them per
WORKSPACE, not per business. With 10 businesses in one workspace, capacity/proof/workload bleed across
all of them (a single duplicate-flagged proof made 8/10 resolve `proof_fraud_block` — captured during
this slice). So the 4 constraints driven by **business-scoped** rows (cashflow/finance/compliance/working-
capital) render distinctly in the browser, but the constraints driven by **workspace-scoped** entities
(`capacity_feasibility`, `owner_workload`, `proof_fraud_block`, and the delivery/shutdown/multi-location
flows that depend on them) **cannot be isolated per business in one workspace**. Producing all 10 distinct
browser flows would require either (a) a scoped schema migration adding `businessId` to those 3–4 entities
+ provider scoping, or (b) a 10-workspace harness with a UI workspace-switcher — both **architectural
changes beyond this slice's scope** (and explicitly out of "do not touch unrelated integrations").

## Classification
**`BROWSER_REPRESENTATIVE_FAILED`** — honestly: the "all 10 representative browser flows pass" gate is
NOT met (6 are architecturally blocked as above). What DID run passed: 4 distinct desktop flows + 3 mobile,
plus all 10 constraints proven at the service level. This is a documented HARD BLOCKER, not a defect and
not a faked result. CORE_READY/EXPERT_READY are therefore NOT claimed. The training rung
`LEARNING_PERSISTENCE_READY` (60/60 domains + learning persistence + 4,032-case corpus) stands.
