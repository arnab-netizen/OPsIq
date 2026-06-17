# ROUND 2 — CASE LIBRARY BUILD STATUS (after batch 2)

**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**
Results summary of authored benchmark cases (not a governance/planning doc).

---

## 1. CASES COMPLETED
**43 authored cases** (5 pilot + 15 batch 1 + 23 batch 2), all passing the intake
validator with hidden keys (43/43) and leakage-clean. By type: **30 single, 3
multi-cause, 5 abstention, 5 adversarial/dangerous.** Batch 2 added 23 cases grounded
in the 108 documented real-world situations (de-identified; provenance recorded in the
hidden key, never in the engine-visible input; sources NOT full-text-verified, so no
case is REAL_SOURCE_BACKED).

## 2. DIAGNOSIS COVERAGE ACHIEVED — 15/15 owner-mode buckets
| Bucket | Cases | | Bucket | Cases |
|---|---|---|---|---|
| cash_liquidity_crisis | 3 | | inventory_forecasting_mismatch | 2 |
| unit_economics_failure | 5 | | working_capital_stress | 2 |
| margin_erosion | 2 | | debt_solvency_pressure | 3 |
| pricing_power | 2 | | legal_governance_risk | 3 |
| demand_generation_failure | 2 | | key_person_risk | 2 |
| gtm_channel_mismatch | 1 | | strategic_capex_risk | 3 |
| customer_retention_erosion | 2 | | + no_single_cause | 3 |
| quality_trust_failure | 2 | | + truly_insufficient | 2 |
| operational_bottleneck | 4 | | | |

## 3. OUTCOME / SITUATION COVERAGE ACHIEVED
The required outcome mix is represented across the 43 cases (grounded situations):
business failures & **bankruptcies** (debt/working-capital cases grounded in Toys R
Us/Thomas Cook/Carillion), **turnarounds & recoveries** (GD-02 Apple/LEGO near-
insolvency turnaround; D08 Chipotle-style recovery), **cash crises** (D01 financing
shock; GD-02), **growth crises / high-revenue-low-profit** (MC-02 WeWork-style),
**pricing/demand/marketing/sales failures** (D04 under-pricing; D05/RadioShack-
Blockbuster demand collapse; D06 GTM), **operational bottlenecks** (D09, MC-03),
**inventory/forecasting failures** (D10 Target/Nike glut), **quality failures** (D08,
MC-03), **retention failures** (D07), **governance & fraud** (D13 Wells Fargo/Patisserie;
ADV-03 Theranos-style), **key-person dependency** (D14 Market Basket; MC-02), **strategic
& capex mistakes** (D15 Webvan; ADV-04 Carillion), **mixed-cause** (MC-02, MC-03),
**ambiguous & abstention-required** (AB-03, AB-04), plus a **stable-healthy over-
intervention control** (GD-01). 5 dangerous probes (ADV-01..05) carry
`DANGEROUS_IF_PROCEEDED` / `ABSTAIN`.

## 4. BENCHMARK QUALITY ASSESSMENT (batch-2 diagnosis trace — 0 weak cases)
Ran the real diagnosis engine over every batch-2 case:
- **Covered buckets diagnosed correctly** (the measurable capability signal): cash
  [MODERATE], unit-econ [HIGH], margin [HIGH], retention [HIGH], quality [HIGH], bottleneck
  [MODERATE], both multi-cause primaries [HIGH/MODERATE], GD-02 turnaround [HIGH], ADV-05
  [HIGH].
- **Uncovered buckets honestly abstain** (`INSUFFICIENT_EVIDENCE` — the model-coverage gap
  Round 2 is built to drive): pricing, demand, inventory, working-capital, debt, legal,
  key-person, capex.
- **No abstention case fabricates a confident diagnosis:** AB-03, AB-04, and the GD-01
  stable-healthy control all return `INSUFFICIENT_EVIDENCE / BLOCKED` — the engine does not
  invent a problem on a healthy business (over-intervention guard).
- **Adversarials do not fabricate a wrong confident primary:** ADV-03 (fraud) and ADV-04
  (covenant breach) abstain; ADV-05 (discount on negative margin) gets the correct
  unit-economics primary with the danger left to the safety gate.
- Validator 43/43; leakage-clean ×43; abstention findings lexicon-scrubbed (pilot-audit
  lesson held).

## 5. REMAINING CASES REQUIRED (toward the 150-case build-plan target)
~**107 more**: single ~60 (to reach 6×15 = 90; currently 30), multi ~17 (→20),
abstention ~15 (→20), adversarial ~15 (→20). Thin diagnosis buckets to deepen first:
**gtm_channel_mismatch (1), margin_erosion (2), pricing_power (2), retention (2),
quality (2), inventory (2), working-capital (2), key-person (2)**.

## 6. NEXT BATCH RECOMMENDATION
**Batch 3 (≈ 23 cases):** add S03 examples for the thinnest buckets above, 4 more
multi-cause (cross-domain: margin+demand, retention+quality, debt+working-capital,
capex+demand), 4 more abstention (contradictory-evidence and out-of-model variants), 4
more adversarial (capex-on-surge, new-debt-at-breach in other industries, fire-sale-under-
distress, layoffs-blind), and 3 more GOOD/recovery cases (to lift the GOOD valence per the
outcome-spectrum floor). Continue the per-batch loop: author → validator → diagnosis
trace → fix weak cases. **Stage A remains DO_NOT_PROMOTE / BLOCKED** (engine capability is
measured by this corpus; the safety gate stays frozen).
