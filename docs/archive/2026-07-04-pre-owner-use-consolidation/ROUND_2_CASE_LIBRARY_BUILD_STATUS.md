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

---

## BATCH 3 UPDATE (reasoning-trap cases) — after 78 total
**Cases authored:** +35 (35/35 validator-pass; corpus now **78**: 50 single, 8 multi,
10 abstention, 10 adversarial). 7 categories ×5: false-root-cause, hidden-constraint,
prioritization-conflict, delayed-consequence, misleading-KPI, healthy-business, recovery.
**Diagnosis coverage:** 15/15 buckets + no_single_cause 8 + truly_insufficient 2.

**Benchmark weaknesses FOUND (engine reasoning failures the corpus now exposes — the goal):**
1. **False root cause (5/5):** the engine confidently diagnoses the surface symptom over
   the true root cause — FRC-01 cash≠debt, FRC-02 churn≠quality, FRC-03 bottleneck≠
   key-person, FRC-04 margin≠inventory, FRC-05 unit-econ≠pricing.
2. **Prioritization (PC-01):** with a 3-month runway the engine diagnoses retention when
   cash/survival must come first — it does not prioritize survival.
3. **Model-coverage gap:** debt/legal/working-capital/demand/capex prioritization &
   misleading-KPI cases abstain (uncovered) — quantifies where archetypes are missing.

**Controls holding (no false positives):** all 5 healthy-business cases →
INSUFFICIENT_EVIDENCE/BLOCKED (engine never fabricates a problem on a healthy business);
misleading-KPI margin/retention/bottleneck not fooled by the headline metric; all 5
recovery cases diagnose correctly.

**Benchmark weaknesses FIXED:** 1 weak case — HC-01 originally encoded the cash
constraint so severely (2-month runway) that the engine read it as a competing cash
diagnosis; re-authored as a clean capital-budget constraint → now traces to
operational_bottleneck [MODERATE] with the budget constraint isolated.

**Remaining corpus gap analysis:** ~72 toward 150. The most valuable next additions are
MORE false-root-cause and prioritization traps on the COVERED archetypes (where the
engine fails confidently and the benchmark bites), plus second/third examples deepening
multi-cause and adversarial. Thin: gtm_channel_mismatch (1), and the uncovered buckets
need richer cases for when E2+ archetypes land.

**Recommendation for Batch 4:** ~25 cases weighted to (a) 8 more false-root-cause across
the 6 covered archetypes (maximize confident-wrong exposure), (b) 6 prioritization
conflicts where survival/safety must precede optimization, (c) 5 misleading-KPI on
covered archetypes, (d) 3 more healthy/seasonal controls, (e) 3 recovery sequences.
Continue author → validator → diagnosis trace → fix-weak each batch.
**Stage A remains DO_NOT_PROMOTE / BLOCKED** (safety gate frozen; corpus measures capability).

---

## BATCH 4 UPDATE (high-power reasoning traps) — after 103 total
**+25** (25/25 validator-pass; corpus **103**: 66 single, 14 multi, 13 abstention, 10
adversarial). Composition: 8 false-root-cause, 6 prioritization, 5 misleading-KPI, 3
healthy controls, 3 recovery (with failed/successful/sequence/why keys). Validator
103/103; leakage-clean. Special-requirement classes all met: action_should_be_delayed
8, diagnosis_correct_action_wrong 8, positive_metrics_hide_deterioration 5,
survives_only_via_prioritization 6.

**Engine failures EXPOSED (diagnosis trace):**
- **False root cause 8/8** — engine confidently picks the surface decoy over the true
  cause on 8 NEW pairs: churn≠pricing, margin≠demand, bottleneck≠inventory,
  unit-econ≠**gtm** (fills thin bucket), cash≠working-capital, quality≠bottleneck,
  churn≠key-person, margin≠pricing. Combined with batch 3, **13/13 false-root-cause
  cases the engine gets wrong, always confidently.**
- This proves the engine performs **pure lexical surface-matching with no causal
  discrimination** — it diagnoses whichever covered surface signal is loudest, never
  the root cause.

**Controls holding:** all 3 healthy cases → INSUFFICIENT_EVIDENCE/BLOCKED; misleading-KPI
retention/margin not fooled; all 3 recovery cases diagnose correctly.

**Weak case FIXED:** R2-HB-08 (healthy SaaS) fabricated cash_liquidity_crisis because a
finding said "a long reserve **runway**" — the word "runway" trips the engine's liquidity
regex even on a healthy business (same class as the pilot AB-01 bug). Reworded to "reserve
position" → now INSUFFICIENT_EVIDENCE/BLOCKED. Re-confirms the lexical-trigger fragility is
systemic.

**Most important new failure discovered:** the engine has **no root-cause reasoning** — it
is a lexical surface-classifier. Across 13 false-root-cause cases it is confidently wrong
every time, and it can even invent a *cash crisis on a healthy business* from the single
word "runway". This is the central capability gap the benchmark must drive E2+ to close.

**Recommendation for Batch 5:** stop adding healthy/recovery (well-covered); concentrate
on (a) multi-domain cases where two covered surfaces compete and the engine must pick the
true primary (extends the prioritization failure), (b) false-root-cause variants on the
remaining surface pairs, and (c) "diagnosis-correct-action-wrong" + delayed-consequence
cases that the future safety/constraint gate must catch. **Stage A remains
DO_NOT_PROMOTE / BLOCKED.**
