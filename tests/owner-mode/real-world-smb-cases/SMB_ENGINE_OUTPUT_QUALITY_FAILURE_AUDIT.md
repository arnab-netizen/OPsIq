# SMB Engine Output Quality Failure Audit

**Audit scope:** `SMB_ENGINE_OUTPUT_QUALITY_FAILURE_AUDIT`
**Date:** 2026-06-21
**Context:** After removing archetypeVocabulary() hand-mapping and sidecar leakages, the honest harness scores 0/9 supported cases passed. This audit documents the exact engine output per case, why ROOT_CAUSE_ALIGNMENT failed, and how to classify each failure.

**Hard constraints:** This audit does NOT modify production engine logic, fixtures, scoring thresholds, or vocabulary. It does NOT make cases pass.

---

## Scoring Contract Reference

- **ROOT_CAUSE_ALIGNMENT (RCA, weight=0.40):** Compares engine output against `must_identify` fixture terms (≥60% required to pass) plus `primary_root_cause` and first two `secondary_causes`. Score = `min(1, mustIdentifyRatio * (matchedTerms/allTerms + 0.5))`.
- **MISSING_INPUT_REQUESTS (MIR, weight=0.20):** Checks output against fixture `missing_inputs_opsiq_should_request`; passes if ≥1 anchor phrase matched.
- **FIRST_ACTION_QUALITY (FAQ, weight=0.20):** Checks first 6 words >4 chars from `expected_first_action`; passes if ≥40% matched.
- **BAD_RECOMMENDATION_AVOIDANCE (BRA, weight=0.20):** Passes if none of `bad_recommendations_to_flag` appear in output.
- **Case PASSES if:** RCA passed AND BRA passed AND total ≥ 0.70.

---

## SMB-001

**Expected root cause:** `working_capital_cash_flow_trap`
**Engine diagnosis:** `WORKING_CAPITAL_STRESS` (MODERATE confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: working_capital_stress
Description: Working-capital stress from receivables / payables / cash-conversion cycle
Confidence: MODERATE

Mechanism: Cash is trapped in the working-capital cycle — stretched receivables (DSO), payables timing, or a lengthening cash-conversion cycle — not an operating loss.

Missing information requested:
  - Receivables aging by customer segment
  - Payables terms and supplier flexibility
```

**Fixture must_identify (6):**
1. "cash conversion cycle" ✓ matched (in description)
2. "working capital" ✓ matched (in description)
3. "accounts receivable timing" ✗
4. "AR AP mismatch" ✗
5. "payables due before receivables collected" ✗
6. "cash flow gap" ✗

**RCA:** 2/6 matched = 33% → FAIL (need ≥60%)
**MIR:** Engine outputs "Receivables aging by customer segment" and "Payables terms and supplier flexibility". Fixture requests "full AR aging report broken down by client" (anchor: "aging report broken"). Anchor not matched because engine says "Receivables aging by customer segment" which doesn't contain "aging report broken" as substring → FAIL (0/5)
**FAQ:** Expected: "Build a 13-week rolling cash flow forecast and map exact AR/AP timing mismatches". Key tokens: "build","13-week","rolling","forecast","timing","mismatches". Engine output has none → FAIL
**BRA:** PASS
**Total:** 0.38

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies WORKING_CAPITAL_STRESS. Engine description/mechanism are archetype-level templates: they cover the concept of working capital but not the case-specific vocabulary ("AR/AP mismatch", "payables due before receivables collected", "cash flow gap"). MODERATE confidence (DSO=60 is below HIGH threshold of 70) is architecturally correct but leaves the case vulnerable to output being deprioritized.

**Additional finding:** MIR fails on lexical mismatch only — engine DOES request receivables aging and payables terms but uses different phrasing than fixture anchors extract.

---

## SMB-002

**Expected root cause:** `inventory_cash_trap`
**Engine diagnosis:** `INVENTORY_FORECASTING_MISMATCH` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: inventory_forecasting_mismatch
Description: Inventory / forecasting mismatch: stock misallocated against demand (stockouts + overstock)
Confidence: HIGH

Mechanism: Forecast error misallocates stock — stockouts on fast lines alongside overstock on slow lines — trapping cash and forcing markdowns; the issue is planning, not demand or cost.

Missing information requested:
  - Forecast accuracy by SKU/ABC class
  - Demand variability and lead-time data
```

**Fixture must_identify (5):**
1. "inventory cash trap" ✗
2. "working capital locked in inventory" ✗
3. "inventory turnover" ✗
4. "slow-moving stock" ✗
5. "cash tied up in unsold inventory" ✗

**RCA:** 0/5 matched = 0% → FAIL
**MIR:** Engine outputs "Forecast accuracy by SKU/ABC class". Fixture requests "SKU-level sell-through velocity" (anchor: "level sell-through velocity"). No match → FAIL (0/5)
**FAQ:** Expected: "Run a full inventory age and velocity analysis by SKU to identify cash locked in slow-moving stock". Key tokens: "inventory","velocity","analysis","identify","locked","slow-moving". None in engine output → FAIL
**BRA:** PASS
**Total:** 0.27

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies INVENTORY_FORECASTING_MISMATCH. However, the fixture's `must_identify` vocabulary is cash-flow framing ("inventory cash trap", "cash tied up in unsold inventory", "working capital locked in inventory") while the engine's archetype description uses forecasting-accuracy framing ("forecast error", "stockouts on fast lines", "overstock on slow lines"). These are complementary framings of the same problem — the engine's framing is technically correct but uses zero terms from the fixture's specific vocabulary list.

---

## SMB-003

**Expected root cause:** `negative_unit_economics_paid_acquisition`
**Engine diagnosis:** `UNIT_ECONOMICS_FAILURE` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: unit_economics_failure
Description: Per-unit / per-customer economics are unprofitable
Confidence: HIGH

Mechanism: Contribution margin is negative or acquisition cost exceeds customer value, so growth deepens losses rather than building value.

Missing information requested:
  - Cohort-level contribution margin
  - CAC payback period
  - Variable vs fixed cost split
```

**Fixture must_identify (6):**
1. "contribution margin" ✓ matched (in mechanism)
2. "customer acquisition cost" ✗
3. "LTV to CAC ratio" ✗
4. "unit economics" ✓ matched (in scoring allTerms from primary_root_cause)
5. "negative contribution after CAC" ✓ matched (from scoring allTerms)
6. "paid channel is loss-making at scale" ✗

**RCA:** Matched "contribution margin" + terms from allTerms expansion (primary_root_cause, secondary_causes). Scoring shows matched=4 out of allTerms but only 2/6 must_identify directly: ratio=0.47 → FAIL (need ≥0.60). Score=0.47*(4/allTerms+0.5) → 0.45.
**MIR:** Engine outputs "Cohort-level contribution margin" and "CAC payback period". Fixture requests "lifetime value by customer cohort" (anchor: "value customer cohort"). No exact match → FAIL (0/5)
**FAQ:** Expected: "Calculate true contribution margin per order per channel". Key tokens: "calculate","contribution","margin","order","channel". Engine mentions "contribution margin" and "CAC" in mechanism but not in action format → FAIL (0.33)
**BRA:** PASS
**Total:** 0.45

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies UNIT_ECONOMICS_FAILURE with HIGH confidence. Engine mechanism ("contribution margin is negative or acquisition cost exceeds customer value") covers the category correctly. Fixture must_identify requires specific paid-acquisition vocabulary: "LTV to CAC ratio", "customer acquisition cost", "paid channel is loss-making at scale". Engine does mention "acquisition cost" in the mechanism but scoring requires the full phrase "customer acquisition cost" as contiguous substring. Closest of all 9 cases to passing (0.45 total, 47% must_identify coverage) but falls short.

---

## SMB-004

**Expected root cause:** `prime_cost_margin_erosion`
**Engine diagnosis:** `MARGIN_EROSION` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: margin_erosion
Description: Margin erosion driven by cost inflation or declining profitability
Confidence: HIGH

Mechanism: Costs are rising faster than price, or operating profitability is declining, compressing margin over time.

Missing information requested:
  - Multi-period margin trend
  - Cost-driver decomposition (COGS vs labor vs overhead)
  - Pricing headroom
```

**Fixture must_identify (5):**
1. "prime cost" ✗ (allTerms expansion from `prime_cost_margin_erosion` → "prime cost margin erosion" IS in allTerms, and matched=1, but must_identify term "prime cost" as contiguous phrase: engine output has no "prime cost")
2. "food cost percentage" ✗
3. "labor cost percentage" ✗
4. "prime cost above industry target" ✗
5. "occupancy is not the problem" ✗

**RCA:** 0/5 must_identify matched (score shows "prime cost margin erosion" from allTerms matched, giving score=0 for must_identify ratio) → FAIL
**MIR:** Engine outputs "Cost-driver decomposition (COGS vs labor vs overhead)". Fixture requests "weekly prime cost tracking data" (anchor: "prime cost tracking"). No match → FAIL (0/5)
**FAQ:** Expected: "Implement weekly prime cost tracking immediately — calculate combined food and labor cost". Key tokens: "implement","weekly","prime","tracking","immediately","calculate". None in engine output → FAIL
**BRA:** PASS
**Total:** 0.20

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies MARGIN_EROSION (HIGH). The engine's archetype template uses domain-agnostic cost/margin language ("cost inflation", "cost-driver decomposition", "COGS vs labor vs overhead"). The fixture must_identify vocabulary is restaurant-industry-specific ("prime cost", "food cost percentage", "labor cost percentage"). The engine cannot produce industry-specific vocabulary from a general archetype description without per-case analysis. All 5 must_identify terms are zero-matched.

---

## SMB-006

**Expected root cause:** `fixed_cost_overextension_below_breakeven`
**Engine diagnosis:** `UNIT_ECONOMICS_FAILURE` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: unit_economics_failure
Description: Per-unit / per-customer economics are unprofitable
Confidence: HIGH

Mechanism: Contribution margin is negative or acquisition cost exceeds customer value, so growth deepens losses rather than building value.

Missing information requested:
  - Cohort-level contribution margin
  - CAC payback period
  - Variable vs fixed cost split
```

**Fixture must_identify (5):**
1. "fixed cost overextension" ✗
2. "below breakeven" ✗
3. "lease burden" ✗
4. "breakeven occupancy" ✗
5. "fixed costs exceed revenue at current volume" ✗

**RCA:** 0/5 matched → FAIL
**MIR:** FAIL (0/5 — engine missing_evidence is generic UE list, not fixture's breakeven/churn/variable-cost list)
**FAQ:** Expected: "Calculate exact breakeven member count required to cover fixed costs". Tokens: "calculate","exact","breakeven","member","count","required". None → FAIL
**BRA:** PASS
**Total:** 0.20

**Failure classification:** **(1) Wrong diagnosis angle — archetype match is ambiguous.** The engine fires `UNIT_ECONOMICS_FAILURE` because `variableCost=35000 > price=22000` (contribution margin < 0). However, the fixture's root cause is `fixed_cost_overextension_below_breakeven` — a lease/fixed-overhead problem. The case is a fitness studio with a large lease where contribution per member IS positive but total revenue does not cover fixed costs. The engine's UE diagnosis fires on the right numeric signals but misidentifies the mechanism: contribution-margin-negative here reflects fixed-cost overextension, not per-unit variable cost excess. The must_identify vocabulary ("fixed cost overextension", "lease burden", "breakeven occupancy") is structurally incompatible with the engine's UE archetype description ("Per-unit / per-customer economics are unprofitable", "acquisition cost exceeds customer value"). There is no engine archetype for FIXED_COST_OVEREXTENSION / BELOW_BREAKEVEN as a distinct pattern — the nearest is UNIT_ECONOMICS_FAILURE (wrong framing) or MARGIN_EROSION.

---

## SMB-007

**Expected root cause:** `owner_capacity_bottleneck_revenue_ceiling`
**Engine diagnosis:** `OPERATIONAL_BOTTLENECK` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: operational_bottleneck
Description: Operational bottleneck limiting speed of service delivery
Confidence: HIGH

Mechanism: High turnaround time prevents customers from using service frequently, driving them to alternatives. Bottleneck creates queue, which increases errors and complaints.

Missing information requested:
  - Root cause of turnaround delay (equipment vs labor vs process)
  - Customer awareness of speed-to-market from competitors
```

**Fixture must_identify (5):**
1. "capacity ceiling" ✗
2. "owner bottleneck" ✗
3. "revenue ceiling tied to personal hours" ✗
4. "delegation gap" ✗
5. "non-billable time consuming capacity" ✗

**RCA:** 0/5 matched → FAIL
**MIR:** FAIL (0/5 — engine requests turnaround delay and competitor speed; fixture requests non-billable hour breakdown, delegation options, rate testing)
**FAQ:** Expected: "Map all 27 non-billable hours by activity and identify which can be eliminated, systematized, or delegated". Key tokens: "27","non-billable","hours","activity","identify","eliminated". None in output → FAIL
**BRA:** PASS
**Total:** 0.23

**Failure classification:** **(1) Wrong diagnosis angle — archetype fires on correct pattern but wrong sub-type.** Engine's OPERATIONAL_BOTTLENECK archetype describes a throughput bottleneck in service delivery (queue, turnaround time, competitors). This case is a solo consultant bottlenecked by owner time, not a throughput/queue problem. The mechanism ("High turnaround time prevents customers from using service frequently") is structurally incorrect for a solo-practitioner capacity ceiling. The must_identify vocabulary ("capacity ceiling", "revenue ceiling tied to personal hours", "delegation gap", "non-billable time consuming capacity") requires personal-capacity and delegation framing. The engine has no OWNER_CAPACITY_CEILING or KEY_PERSON_BOTTLENECK archetype — closest is KEY_PERSON_RISK but that fires on succession/dependency patterns, not revenue ceilings. Engine fires the closest available archetype, which is the wrong sub-type.

---

## SMB-008

**Expected root cause:** `accounts_receivable_cash_flow_gap`
**Engine diagnosis:** `WORKING_CAPITAL_STRESS` (MODERATE confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: working_capital_stress
Description: Working-capital stress from receivables / payables / cash-conversion cycle
Confidence: MODERATE

Mechanism: Cash is trapped in the working-capital cycle — stretched receivables (DSO), payables timing, or a lengthening cash-conversion cycle — not an operating loss.

Missing information requested:
  - Receivables aging by customer segment
  - Payables terms and supplier flexibility
```

**Fixture must_identify (6):**
1. "accounts receivable" ✗ (not contiguous in output — description says "receivables" but not "accounts receivable")
2. "days sales outstanding" ✗
3. "DSO" ✓ matched (appears in mechanism as "(DSO)")
4. "cash flow gap" ✗
5. "billed vs collected" ✗
6. "collection process failure" ✗

**RCA:** 1/6 matched = 17% → FAIL
**MIR:** Engine outputs "Receivables aging by customer segment". Fixture requests "AR aging report broken down by client" (anchor: "aging report broken"). No contiguous match → FAIL (0/5)
**FAQ:** Expected: "Produce an AR aging report by client, identify the three 90+ day accounts". Key tokens: "produce","aging","report","client","identify","three". None in engine output → FAIL
**BRA:** PASS
**Total:** 0.27

**Failure classification:** **(2) Correct diagnosis, generic output + MODERATE confidence.** Engine correctly identifies WORKING_CAPITAL_STRESS. DSO=47 (from fixture metric) is below the HIGH confidence threshold of ≥70, so engine fires at MODERATE. The mechanism mentions "stretched receivables (DSO)" which matches only the abbreviation "DSO" but not "days sales outstanding", "accounts receivable", "cash flow gap", "billed vs collected", or "collection process failure". The engine's generic WC description is receivables/payables/cash-conversion framing; fixture vocabulary is AR-collection-process specific. Note: sidecar finding[4] was changed from "days sales outstanding 67 days" to "average invoice-to-payment lag 67 days" during leakage remediation — removing the DSO exact phrase from inputs. Engine still outputs DSO from its own mechanism text.

---

## SMB-010

**Expected root cause:** `input_cost_margin_compression_without_pricing_response`
**Engine diagnosis:** `MARGIN_EROSION` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: margin_erosion
Description: Margin erosion driven by cost inflation or declining profitability
Confidence: HIGH

Mechanism: Costs are rising faster than price, or operating profitability is declining, compressing margin over time.

Missing information requested:
  - Multi-period margin trend
  - Cost-driver decomposition (COGS vs labor vs overhead)
  - Pricing headroom
```

**Fixture must_identify (5):**
1. "input cost margin compression" ✗
2. "commodity cost increase" ✗
3. "pricing power" ✗
4. "margin compression without pricing response" ✗
5. "price has not been raised despite cost increase" ✗

**RCA:** 0/5 matched → FAIL
**MIR:** FAIL (0/5 — engine missing_evidence is generic margin list; fixture requests competitor pricing, menu engineering, commodity trajectory, price testing)
**FAQ:** Expected: "Run a menu engineering analysis to identify the highest-margin and lowest-margin items". Key tokens: "engineering","analysis","identify","highest-margin","lowest-margin","items". None → FAIL
**BRA:** PASS
**Total:** 0.23

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies MARGIN_EROSION (HIGH, profitChangePercent=-13). The archetype mechanism ("Costs are rising faster than price") is directionally accurate. The must_identify vocabulary is commodity/pricing-response specific: "input cost margin compression", "commodity cost increase", "pricing power", "margin compression without pricing response". The engine description doesn't go to commodity-level or pricing-response language. Same structural failure as SMB-004: domain-agnostic archetype description vs. case-specific industry vocabulary.

---

## SMB-012

**Expected root cause:** `unit_economics_failure_premature_expansion`
**Engine diagnosis:** `UNIT_ECONOMICS_FAILURE` (HIGH confidence)

**Engine output:**
```
PRIMARY ROOT CAUSE: unit_economics_failure
Description: Per-unit / per-customer economics are unprofitable
Confidence: HIGH

Mechanism: Contribution margin is negative or acquisition cost exceeds customer value, so growth deepens losses rather than building value.

Missing information requested:
  - Cohort-level contribution margin
  - CAC payback period
  - Variable vs fixed cost split
```

**Fixture must_identify (5):**
1. "unit economics" ✓ matched
2. "per-location contribution margin" ✓ matched (scoring allTerms expansion from primary_root_cause)
3. "loss-making expansion locations" ✗
4. "profitable original location subsidizing expansion" ✗
5. "premature expansion before unit economics proven" ✗

**RCA:** must_identify ratio = 1/5 = 20% (only "unit economics" directly). allTerms expansion adds "per-location contribution margin" from primary_root_cause but must_identify ratio still 1/5 → score=0.30 → FAIL
**MIR:** FAIL (0/5 — engine requests CAC payback and variable cost; fixture requests per-location P&L, enrollment rate, breakeven per location)
**FAQ:** Expected: "Freeze location 4 planning and run a full per-location P&L". Key tokens: "freeze","location","planning","full","per-location","P&L". None in engine output → FAIL
**BRA:** PASS
**Total:** 0.32

**Failure classification:** **(2) Correct diagnosis, generic output.** Engine correctly identifies UNIT_ECONOMICS_FAILURE (HIGH, contribution=-8000). The engine fires correctly on contribution margin negative for location 2. The must_identify vocabulary requires multi-location expansion framing: "loss-making expansion locations", "profitable original location subsidizing expansion", "premature expansion before unit economics proven". The engine's generic mechanism ("acquisition cost exceeds customer value") is wrong framing for a multi-location expansion — this is a location economics problem, not a customer acquisition problem. Engine has one archetype for all UE failure patterns; fixture has case-specific expansion vocabulary.

---

## Summary

| Case | Expected root cause | Engine diagnosis | RCA% | Total | Failure type |
|------|-------------------|-----------------|------|-------|-------------|
| SMB-001 | working_capital_cash_flow_trap | WORKING_CAPITAL_STRESS (MODERATE) | 33% | 0.38 | 2 — correct diagnosis, generic output |
| SMB-002 | inventory_cash_trap | INVENTORY_FORECASTING_MISMATCH (HIGH) | 0% | 0.27 | 2 — correct diagnosis, generic output |
| SMB-003 | negative_unit_economics_paid_acquisition | UNIT_ECONOMICS_FAILURE (HIGH) | 47% | 0.45 | 2 — correct diagnosis, generic output |
| SMB-004 | prime_cost_margin_erosion | MARGIN_EROSION (HIGH) | 0% | 0.20 | 2 — correct diagnosis, generic output |
| SMB-006 | fixed_cost_overextension_below_breakeven | UNIT_ECONOMICS_FAILURE (HIGH) | 0% | 0.20 | 1 — wrong diagnosis angle |
| SMB-007 | owner_capacity_bottleneck_revenue_ceiling | OPERATIONAL_BOTTLENECK (HIGH) | 0% | 0.23 | 1 — wrong diagnosis angle |
| SMB-008 | accounts_receivable_cash_flow_gap | WORKING_CAPITAL_STRESS (MODERATE) | 17% | 0.27 | 2 — correct diagnosis, generic output |
| SMB-010 | input_cost_margin_compression_without_pricing_response | MARGIN_EROSION (HIGH) | 0% | 0.23 | 2 — correct diagnosis, generic output |
| SMB-012 | unit_economics_failure_premature_expansion | UNIT_ECONOMICS_FAILURE (HIGH) | 20% | 0.32 | 2 — correct diagnosis, generic output |

```
Supported cases:                      9
Passed:                               0
Failed:                               9
  Wrong diagnosis angle:              2  (SMB-006, SMB-007)
  Correct diagnosis, generic output:  7  (SMB-001, SMB-002, SMB-003, SMB-004, SMB-008, SMB-010, SMB-012)
  Missing action output:              9  (all — runner has no action section; FAQ fails for all)
  Missing input-request mismatch:     9  (all — MIR fails for all on lexical anchor mismatch)
  Scoring contract too strict:        0  (thresholds are appropriate; the gap is in engine output)
  Unsupported archetype misclassified: 0
```

---

## Root Cause of Failure

**The structural gap is between ARCHETYPE TEMPLATE LANGUAGE and CASE-SPECIFIC DIAGNOSTIC VOCABULARY.**

The engine's `description` and `mechanismDescription` fields are static strings defined once per archetype. They describe the CATEGORY of problem in industry-agnostic terms. The fixture's `must_identify` terms are the SPECIFIC DIAGNOSTIC VOCABULARY an expert consultant would use for this particular case — industry-specific, scenario-specific, framing-specific.

Examples of the gap:

| Engine archetype text | Fixture must_identify vocabulary |
|-----------------------|----------------------------------|
| "Cash is trapped in the working-capital cycle" | "AR AP mismatch", "payables due before receivables collected", "cash flow gap" |
| "Forecast error misallocates stock" | "inventory cash trap", "working capital locked in inventory", "inventory turnover" |
| "Contribution margin is negative or acquisition cost exceeds customer value" | "customer acquisition cost", "LTV to CAC ratio", "paid channel is loss-making at scale" |
| "Costs are rising faster than price" | "prime cost", "food cost percentage", "labor cost percentage" |
| "High turnaround time prevents customers using service" | "capacity ceiling", "revenue ceiling tied to personal hours", "delegation gap" |

The engine produces one fixed description per archetype. The fixture requires the engine to produce vocabulary calibrated to the specific business context, industry, and failure mechanism of each individual case.

---

## Scoring Dimension Failures (All 9 cases)

| Dimension | Failure pattern |
|-----------|----------------|
| ROOT_CAUSE_ALIGNMENT | Engine description/mechanism matches 0–47% of must_identify terms (needs ≥60%). All fail. |
| MISSING_INPUT_REQUESTS | Engine missing_evidence list uses archetype-generic categories; fixture expects case-specific data requests. Lexical anchor mismatch causes 0/5 matches in most cases even where the intent overlaps. |
| FIRST_ACTION_QUALITY | Runner format includes no recommended action section. Engine does not produce `expected_first_action`-style output. All fail. |
| BAD_RECOMMENDATION_AVOIDANCE | Engine output is clean. All pass. |

---

## Recommended Next Architectural Fix

This audit is READ-ONLY. However, for reference, the gap points to one of three architectural directions:

1. **Case-specific description generation:** Engine produces a case-specific narrative using the actual evidence values (DSO value, contribution margin value, specific industry context) rather than a static archetype template. Requires per-evidence-item interpolation in the diagnosis output layer.

2. **Action recommendation layer:** Add a separate output section (recommended first action) driven by archetype + evidence context. The runner must include this section for MIR and FAQ to have any chance of passing.

3. **Sub-archetype granularity:** Add sub-types under existing archetypes (e.g., UNIT_ECONOMICS_FAILURE → UE_PAID_ACQUISITION, UE_FIXED_COST_BREAKEVEN, UE_PREMATURE_EXPANSION) with distinct description templates. Resolves SMB-006 and SMB-007 wrong-diagnosis-angle cases. Does not resolve the static-vs-dynamic vocabulary gap for the remaining 7.

**Decision:** No code changes made. Engine output quality failure is documented. The honest score (0/9) reflects the gap between static archetype templates and case-specific diagnostic vocabulary. Removing hand-mapping was correct — the 0/9 result is the ground truth.
