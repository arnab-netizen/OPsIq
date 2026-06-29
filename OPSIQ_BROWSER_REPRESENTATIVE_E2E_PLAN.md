# OpsIQ Browser-Representative E2E — Plan (Slice C)

Branch `claude/opsiq-real-world-case-training` · HEAD `971fc5e` · classification
`LEARNING_PERSISTENCE_READY`. Do not weaken any gate; do not open PR/merge.

## Approach
The command-center "Whole-business plan (live runtime)" card (`data-testid="owner-whole-business-plan"`)
renders `/api/owner/whole-business-plan` → `getOwnerWholeBusinessPlan` → `runOwnerAdvice` over a
**DB-backed seeded business**. The card's dominant constraint is driven by `deriveOwnerContext` flags.
To exercise distinct constraints I (a) **faithfully** enhance `deriveOwnerContext` to also derive
`hostile` (duplicate-flagged proof), `remoteOwner` (overloaded workload), and a `below_margin` signal
(negative gross margin → opportunity decision category + cost>price), and (b) seed 10 DB businesses with
profiles that each bind on a target constraint. The model has only **7 blocking constraints**, so the 10
flows exercise **7 distinct** constraints (3 flows faithfully share where the business genuinely binds
there) — documented honestly, never faked.

## 1. The 10 browser flows (seed profile → expected dominant constraint)
| # | Flow | Seed profile | Dominant constraint |
|---|---|---|---|
| 1 | cash crisis | cash≈0, overdue receivables; margin +; capacity safe | `cash_survival` |
| 2 | bad contract / opportunity | cash +; **negative gross margin** (revenue<cogs) | `below_margin` |
| 3 | marketing blocked by quality/capacity | bottleneck util ≥1 / growth unsafe; cash + | `capacity_feasibility` |
| 4 | owner workload overload | workload overloaded; cash +; capacity safe | `owner_workload` |
| 5 | proof / fake completion | **duplicate-flagged proof**, no expired compliance | `proof_fraud_block` |
| 6 | vendor / supplier issue | vendor **compliance/licence expired** | `compliance_block` |
| 7 | delivery / logistics | delivery capacity bottleneck ≥1 | `capacity_feasibility` |
| 8 | growth / scale | healthy: cash +, margin +, growth-safe, no risks | `profitable_growth` |
| 9 | shutdown / pivot / stop-loss | cash critical + loss-making | `cash_survival` |
| 10 | multi-location / remote-owner | overloaded remote owner, multi-branch | `owner_workload` |

Distinct constraints exercised: cash_survival, below_margin, capacity_feasibility, owner_workload,
proof_fraud_block, compliance_block, profitable_growth = **7 distinct** (all 7 blocking + growth).

## 2. Per-flow expected assertions (whole-business card)
Each flow asserts the card is visible and: `wbp-dominant-constraint` = the expected constraint;
`wbp-do-not-do` contains a stop/blocked action; `wbp-next-action` non-empty; `wbp-owner-workload`
(offload) visible; `wbp-proof` (proof required) visible; `wbp-reassessment` visible; `wbp-growth-gate` +
`wbp-arbitration` (risk/growth/arbitration) visible; `wbp-provider-status` = "Provider-backed data" +
`wbp-confidence` visible; `wbp-learning` (stored-learning provenance) visible; no cross-workspace leakage;
no critical console errors.

## 3. Owner-workload/offload, proof/reassessment, growth/arbitration
Asserted via `wbp-owner-workload`, `wbp-proof` + `wbp-reassessment`, `wbp-growth-gate` + `wbp-arbitration`
for every flow (these render for every runtime plan).

## 4. Provider/confidence
Each profile seeds the FULL critical-domain row set (cashflow/finance/working-capital/capacity/compliance/
proof/workload/standing-instruction/learning/business) so `criticalDomainsRealProviderBacked === true`
→ `wbp-provider-status` shows "Provider-backed data" + `wbp-confidence`.

## 5. Mobile flows
≥3 at 375×812: **cash crisis (1)**, **owner workload overload (4)**, **multi-location/remote (10)**.

## 6. Login rate-limit handling
The in-memory login limiter is 10 attempts / 15 min / IP. Each flow logs in once (per fresh context).
Plan: run in **batches of ≤8 flows per server process**, restarting `next start` between batches to clear
the in-memory counter (does NOT weaken production login security, does NOT disable rate limiting). Use
`retries: 0` so no retry burns a login. Document the batch boundaries in the report.

## 7. Tests to add/update
- `scripts/seed-owner-scenarios.ts` — parametrized DB seed producing the 10 profiles (full provider rows).
- `src/__tests__/services/owner-mode/owner-scenario-constraints.test.ts` — **mock-DB unit proof** that each
  of the 7 profiles yields its expected dominant constraint through `getOwnerWholeBusinessPlan` (fast, no
  browser) so the browser run is de-risked.
- `tests/browser/14-owner-representative-flows.spec.ts` — the 10 desktop flows + 3 mobile, asserting the
  card fields above; fails if the card / dominant / do-not-do / owner-workload / proof / reassessment /
  provider-status is missing or on critical console errors; no flow skipped.
- Enhance `owner-context-derivation.ts` (hostile / remoteOwner / below-margin) — keep existing owner-mode
  + `[db]` tests green (seeded compliance business still resolves `compliance_block`).

## 8. Final classification gates
`BROWSER_REPRESENTATIVE_READY` iff all 10 flows pass, ≥3 mobile pass, none skipped, card rendered from
runtime, provider/confidence + owner-workload + proof/reassessment + do-not-do visible, no critical
console errors, no cross-workspace leakage. `CORE_READY` iff that + all prior CORE gates (60/60 domains,
criticals ≥90, runtime ≥90, holdout ≥88, unsafe 0, regression 0, learning persistence, source register +
privacy) remain true. Otherwise `BROWSER_REPRESENTATIVE_FAILED` with exact evidence.
