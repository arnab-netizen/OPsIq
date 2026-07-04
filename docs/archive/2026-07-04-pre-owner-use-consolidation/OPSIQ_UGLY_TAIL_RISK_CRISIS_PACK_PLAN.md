# OpsIQ Ugly / Tail-Risk / Crisis Pack (150) — Plan

> Pack 9 of the known-to-unknown corpus (Step 6 of the Business Reality Corpus execution chain). Committed BEFORE
> implementation, per the chain's plan-first rule.

## 1. Purpose
Prove OpsIQ handles the **ugly / tail-risk / crisis** end of business reality SAFELY: in a cash-collapse, fraud,
key-person-loss, major-customer-loss, supply-disruption, safety-incident, lawsuit, reputational-crisis, disaster, or
data-breach, OpsIQ does NOT act rashly or autonomously. It BLOCKS unsafe/irreversible crisis moves and matters that
cross a legal/safety/insolvency line (route to a professional / emergency response), OWNER-gates the material crisis
response, asks for the missing facts (need_more_data), and only allows a tiny set of routine, reversible,
immediate-containment steps to proceed. Confirmed fraud/theft is blocked. This is where restraint matters most:
OpsIQ never claims to autonomously handle a high-risk crisis. No new engine; no schema change; no live claim.

## 2. Branch & base
- Branch: `claude/ugly-tail-risk-crisis-pack`
- Base: `main` @ `f30d5a34` (PR #73 merge — Local/Legal/Professional-Boundary Pack 100). Confirmed present before branching.

## 3. Scenario count & taxonomy
Minimum **150**; final **150** = **10 subcategories × 15**. Every scenario is a distinct authored vignette
(no filler), source-backed, `synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false`.

Subcategories (15 each):
1. `cash_collapse_insolvency_risk`
2. `fraud_theft_embezzlement`
3. `key_person_loss_founder_dependency`
4. `major_customer_loss_revenue_shock`
5. `supply_chain_disruption_shortage`
6. `safety_incident_injury`
7. `legal_lawsuit_regulatory_action`
8. `reputational_crisis_public_backlash`
9. `natural_disaster_business_continuity`
10. `data_breach_cyber_incident`

## 4. Action-status distribution (target ranges → planned)
| status | required range | planned |
|---|---|---|
| proceed | 0–5 | 4 |
| cautious_proceed | 5–15 | 12 |
| need_more_data | 20–45 | 30 |
| owner_decision_required | 35–60 | 46 |
| blocked | 45–80 | 58 |

Crisis/tail-risk is the **most-blocked** pack: blocked + owner_decision dominate (unsafe/irreversible crisis moves
and legal/safety/insolvency lines are blocked; the material crisis response is the owner's call), need-data is
moderate (get the facts fast), and proceed is near-zero — only a routine, reversible, immediate-containment step.

Per-subcategory disposition mix (PR/CA/NF/OD/BL), each row = 15, columns hit the totals above:

| # | subcategory | PR | CA | NF | OD | BL |
|---|---|---|---|---|---|---|
| 1 | cash_collapse_insolvency_risk | 0 | 1 | 3 | 5 | 6 |
| 2 | fraud_theft_embezzlement | 0 | 1 | 2 | 4 | 8 |
| 3 | key_person_loss_founder_dependency | 1 | 2 | 3 | 5 | 4 |
| 4 | major_customer_loss_revenue_shock | 1 | 2 | 4 | 5 | 3 |
| 5 | supply_chain_disruption_shortage | 1 | 2 | 4 | 4 | 4 |
| 6 | safety_incident_injury | 0 | 1 | 3 | 5 | 6 |
| 7 | legal_lawsuit_regulatory_action | 0 | 1 | 3 | 4 | 7 |
| 8 | reputational_crisis_public_backlash | 0 | 1 | 3 | 5 | 6 |
| 9 | natural_disaster_business_continuity | 1 | 1 | 3 | 4 | 6 |
| 10 | data_breach_cyber_incident | 0 | 0 | 2 | 5 | 8 |

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Pure data + a pure `expand()` over the merged `business-reality-scenario` contract, identical to the prior packs.
Each disposition carries a deterministic `ScenarioSeedPlan` that the existing `getOwnerWholeBusinessPlan` DB path
resolves to the intended status:
- `PR` → `{ profitable_growth, good, sopRiskClass: low }` → **proceed**
- `CA` → `{ profitable_growth, good, sopRiskClass: medium }` → **cautious_proceed**
- `NF` → `{ profitable_growth, bad, stripCriticalData: true }` → **need_more_data**
- `OD` → `{ OD_DOMINANT[sub], bad }` → **owner_decision_required**
- `BL` → `{ BL_DOMINANT[sub], ugly }` → **blocked**

Per-subcategory binding constraints (all DB-proven by the prior packs via the same seed path):
- `OD_DOMINANT`: cash-collapse → `cash_survival`; major-customer-loss/lawsuit → `below_margin`; supply-disruption/
  disaster → `capacity_feasibility`; fraud/key-person/safety/reputational/data-breach → `owner_workload`.
- `BL_DOMINANT`: fraud-theft-embezzlement → `proof_fraud_block` (confirmed fraud/theft); all others →
  `compliance_block` (legal / safety / insolvency / breach-notification boundary → professional/emergency review).
  Planned: 50 compliance (professional-review) blocks, 8 fraud blocks.

## 6. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-UTR-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
each crisis subcategory + the containment/professional-boundary/fraud boundaries backed. **10 independent gold**
(≥1 per subcategory). Every counted scenario source-backed.

## 7. Proof plan
- **Schema + invariant tests** (`ugly-tail-risk-crisis-pack.test.ts`): count 150, 10×15, unique, schema-valid,
  source-backed, 24 sources privacy-clean, 10 gold, distribution within the required ranges, and hard safety rules
  (every professional/legal/safety boundary is blocked; confirmed fraud/theft blocked; no missing-facts case
  proceeds; no high-risk/irreversible crisis move proceeds; proceed/cautious only on routine reversible containment;
  no live claim; blocked ≥ owner ≥ every other bucket — crisis is block-dominant).
- **DB proof** (`ugly-tail-risk-crisis-db.db.test.ts`): all 150 seeded into isolated businesses, run through the
  REAL `getOwnerWholeBusinessPlan`; assert status + dominant + need_more_data provider-gate + safety + proof/
  reassessment; all five statuses present; cross-workspace isolation. Ledger →
  `OPSIQ_UGLY_TAIL_RISK_CRISIS_PACK.run.json`.
- **Desktop + mobile Playwright** (`39-crisis-desktop.spec.ts`, `40-crisis-mobile.spec.ts`): all 150 render the
  runtime-fed Supervisor Summary at desktop + mobile (375×812); status matches; no high-risk/fraud/professional
  case reads "Proceed"; no horizontal overflow. Shardable via `UTR_SHARD_INDEX`/`UTR_SHARD_TOTAL`. CI-gated.
- **CI workflow** (`ugly-tail-risk-crisis.yml`): `utr-db` + 2-shard `utr-browser`. Additive; modifies no existing lane.

## 8. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: cumulative 1330 → **1480** counted scenarios; this pack
brings **crisis / tail-risk (28)** to full coverage and extends compliance/safety (27), anti-gaming (19), and
finance/cash-survival (20).

## 9. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data only (no schema change → all 1330 prior scenarios stay valid). Every scenario reduces risk or improves proof
coverage. No fabricated volume, no filler, no weakened gate, no lowered threshold, no deleted test.

## 10. What this pack does NOT claim
- Does **not** claim OpsIQ autonomously handles high-risk crises — the opposite: it blocks/escalates and reserves
  the crisis decision for the owner + professionals/emergency response.
- Does **not** give final legal/insurance/safety/crisis advice — boundary cases block / professional-gate.
- Does **not** prove live crisis-outcome improvement (no live data; `liveOutcomeClaimAllowed=false` on all 150).
- Does **not** solve unknown-unknowns, unblock public SaaS, or make OpsIQ autonomous.
- The proven signal is the **disposition** (status + confidence + proof demand + owner-gate + block). Where a
  routine/need-data disposition resolves dominant `profitable_growth` under the seeded knobs, that is the documented
  arbitration behaviour (same as prior packs), not a claim about the crisis's resolution.

## 11. Merge gate
Merge only when: DB 150/150 green in CI, desktop+mobile shards green, ALL prior lanes green (no regression),
ratchet unchanged, and a final read-only hostile audit passes. Classification target on merge:
`UGLY_TAIL_RISK_CRISIS_PACK_READY`.
