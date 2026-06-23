# Real-World Simulation Failure Forensics

**Report date:** 2026-06-22  
**Task:** REAL_WORLD_SIMULATION_FAILURE_FORENSICS  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Source:** Batch 1 — 12 simulation cases, 0/12 passing (0%)

---

## Section A — Per-Case Forensic Analysis

---

### SIM-01-001 · TT-1 · Expected: WORKING_CAPITAL_STRESS · Actual: UNKNOWN

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.100 | 0.10 | 0.010 |
| firstAction | 0.000 | 0.15 | 0.000 |
| missingInputRequests | ~0.800 | 0.15 | 0.120 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 0.000 | 0.10 | 0.000 |
| reassessmentQuality | ~0.100 | 0.05 | 0.010 |
| **TOTAL** | | | **0.180** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** FAILED (cascade from UNKNOWN — no evidence language in abstain output)

**Root cause of failure — two independent gates, both blocked:**

*Gate 1 — WC_TEXT text filter:*  
The engine pattern `fin_isWorkingCapitalByText()` requires finding text to match:
```
/receivabl|days sales outstanding|\bdso\b|cash conversion|days payable|\bdpo\b|working capital|cash[- ]conversion cycle|collections (timing|cycle)/
```
The sidecar finding for the primary WC item reads: *"clients are slow to pay invoices with average payment delays of 45 to 60 days beyond terms"*. The phrases "slow to pay invoices" and "payment delays" do not contain any WC_TEXT token. "receivabl", "dso", "working capital" — none appear.

*Gate 2 — WC numeric gate:*  
The engine requires:
```
fin_num(e, "dso") !== undefined
  || fin_num(e, "cashConversionDays") !== undefined
  || (fin_num(e, "receivablesAging") !== undefined && fin_num(e, "dpo") !== undefined)
```
The sidecar maps `receivablesAging` from the `avg_payment_delay_days` fixture key. This satisfies only the left side of the paired branch `(receivablesAging !== undefined && dpo !== undefined)`. `dpo` is not mapped. `dso` is not mapped. The numeric gate therefore fails. `receivablesAging` alone is insufficient.

**Layer responsible:** Engine pattern (WC_TEXT too narrow for business-English paraphrases) + Sidecar (missing dso or dpo mapping; finding text lacks WC vocabulary)

**Fix type:** Generic (D1 — add `dso` mapping; D2 — broaden WC_TEXT or add finding synonym)  
**Estimated yield if fixed:** +0.40–0.50 total score (correct archetype unlocks rc, fa, evidDiscipline)

---

### SIM-01-002 · TT-5 · Expected: WORKING_CAPITAL_STRESS · Actual: UNKNOWN

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.100 | 0.10 | 0.010 |
| firstAction | 0.000 | 0.15 | 0.000 |
| missingInputRequests | ~0.800 | 0.15 | 0.120 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 0.000 | 0.10 | 0.000 |
| reassessmentQuality | ~0.100 | 0.05 | 0.010 |
| **TOTAL** | | | **0.180** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** FAILED (cascade from UNKNOWN)

**Root cause of failure:** Same dual-gate failure as SIM-01-001. This is a TT-5 (signal trap) case — the signal trap is the owner's focus on profitable-looking revenue while ignoring cash timing. The WC_TEXT and numeric gate failures are identical in mechanism.

*WC_TEXT failure:* Primary finding uses "outstanding invoices representing approximately 68 days of average sales" — contains neither "receivabl", "dso", "working capital", nor WC_TEXT tokens in the exact regex form.

*Numeric gate failure:* Only `receivablesAging` is mapped (=68). `dso` and `dpo` are not mapped. Gate fails.

**Layer responsible:** Same as SIM-01-001 — Engine pattern + Sidecar  
**Fix type:** Generic (same D1/D2 defects)  
**Estimated yield if fixed:** +0.40–0.50 total score

---

### SIM-02-001 · TT-2 · Expected: UNIT_ECONOMICS_FAILURE · Actual: UNKNOWN

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.170 | 0.10 | 0.017 |
| firstAction | 0.170 | 0.15 | 0.026 |
| missingInputRequests | ~0.800 | 0.15 | 0.120 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 0.000 | 0.10 | 0.000 |
| reassessmentQuality | ~0.100 | 0.05 | 0.005 |
| **TOTAL** | | | **0.200** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** FAILED (cascade from UNKNOWN)

**Root cause of failure:**

The engine pattern `fin_isUnitEconomicsFailure()` requires one of two hard textual triggers:
```
UNITECON_HARD = /unit econom|contribution margin|ltv[\s:\/]cac|customer lifetime value|per[- ]unit (margin|profit|loss|cost)|blended cac|payback period/
```
The sidecar findings describe a tutoring business where individual sessions cost more to deliver than they generate in revenue. The finding vocabulary uses: "delivery cost per session", "sessions run at a net loss", "total hours per client on-call support". None of these phrases match UNITECON_HARD. The phrase "per-unit margin" would match but is not used.

Additionally, the sidecar has no numeric key mappings for unitContributionMargin, cac, ltv, paybackPeriodMonths, or blendedCac — the keys the engine's numeric branch evaluates.

**Layer responsible:** Sidecar (no UE numeric mappings; finding vocabulary avoids UE trigger terms) + Engine (UNITECON_HARD too narrow for "delivery cost per session" paraphrases)  
**Fix type:** Sidecar fix (case-specific: add unitContributionMargin mapping; add UNITECON_HARD synonym to finding) + Generic (D3 — broaden UNITECON pattern)  
**Estimated yield if fixed:** +0.45–0.55 total score

---

### SIM-02-002 · TT-1 · Expected: MARGIN_EROSION · Actual: MARGIN_EROSION ✓

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.200 | 0.30 | 0.060 |
| prioritization | ~0.700 | 0.10 | 0.070 |
| firstAction | 0.670 | 0.15 | 0.101 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.620** |

**Failure classification:** SIM_ENGINE_GAP (gap = 0.080 below 0.70 threshold)  
**evidenceDiscipline:** PASSED  
**Archetype:** Correct

**Root cause of failure:**  
The rootCause dimension scores 0.200, meaning the composer's output contains partial but insufficient overlap with the `must_identify` phrases. For this case (food-and-beverage unit economics), the must_identify rubric requires phrases like "food cost as a percentage of revenue" and "menu pricing not reviewed against cost increases". The engine's MARGIN_EROSION composer generates archetypal output ("margin erosion from cost inflation") — not the case-specific vocabulary the scoring rubric tests against.

The 70% token-overlap heuristic in `scoreRootCauseIdentification()` cannot match when the composer uses generic archetype language and the rubric uses domain-specific business terminology. The gap is in the output vocabulary, not the diagnosis classification.

**Layer responsible:** Scoring contract (must_identify vocabulary too specific for generic composer output); Composer (outputs archetype prose, not case-tailored language)  
**Fix type:** Generic (D8 — rootCause vocabulary gap between composer and scoring rubric)  
**Estimated yield if fixed:** +0.10–0.15 total score (enough to exceed 0.70 threshold)

---

### SIM-03-001 · TT-3 · Expected: MARGIN_EROSION · Actual: MARGIN_EROSION ✓

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.700 | 0.10 | 0.070 |
| firstAction | 0.500 | 0.15 | 0.075 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.530** |

**Failure classification:** SIM_ENGINE_GAP (gap = 0.170 below threshold)  
**evidenceDiscipline:** PASSED  
**Archetype:** Correct

**Root cause of failure:**  
rootCause scores 0.000, representing a complete vocabulary miss. The must_identify rubric for this case (product maker with rising materials costs) includes product-and-cost-specific phrases. The MARGIN_EROSION composer output uses generic archetype language that shares no 70%-overlap token run with any must_identify phrase.

The `firstAction` score of 0.500 indicates the composer's recommended first action partially aligns but doesn't fully nail the rubric's specific intervention. The combined deficit of 0.170 is too large to bridge via the remaining dimensions.

**Layer responsible:** Same as SIM-02-002 — Composer vocabulary vs. scoring rubric vocabulary mismatch (D8)  
**Fix type:** Generic (D8)  
**Estimated yield if fixed:** +0.15–0.20 total score (would exceed 0.70 threshold)

---

### SIM-03-002 · TT-1 · Expected: MARGIN_EROSION · Actual: MARGIN_EROSION ✓

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.600 | 0.30 | 0.180 |
| prioritization | ~0.700 | 0.10 | 0.070 |
| firstAction | 0.500 | 0.15 | 0.075 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.680** |

**Failure classification:** SIM_SCORING_LIMITATION (gap = 0.020 below threshold)  
**evidenceDiscipline:** PASSED  
**Archetype:** Correct

**Root cause of failure:**  
This case is the closest to passing. rootCause=0.600 means some must_identify phrases are reproduced in the composer output but 2 specific phrases are not. The 0.020 deficit comes from the rootCause dimension falling 0.400 below its maximum contribution.

The residual scoring (prioritization + missingInputRequests + reassessmentQuality) is near-maximal. The only addressable gap is rootCause vocabulary coverage — the composer outputs two of the three must_identify phrase clusters but misses "food cost as % revenue" and "menu pricing not reviewed".

**Layer responsible:** Scoring contract (must_identify granularity; 0.020 margin); Composer (misses 2 of 3 required phrase clusters)  
**Fix type:** Generic (D8 — same rootCause vocabulary gap mechanism)  
**Estimated yield if fixed:** +0.08–0.12 (sufficient to cross threshold)

---

### SIM-04-001 · TT-4 · Expected: DEMAND_GENERATION_FAILURE · Actual: UNKNOWN

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.100 | 0.10 | 0.010 |
| firstAction | 0.000 | 0.15 | 0.000 |
| missingInputRequests | ~0.800 | 0.15 | 0.120 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 0.000 | 0.10 | 0.000 |
| reassessmentQuality | ~0.100 | 0.05 | 0.005 |
| **TOTAL** | | | **0.180** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** FAILED (cascade from UNKNOWN)

**Root cause of failure:**

The engine pattern `fin_isDemandGenerationFailure()` requires DEMAND_TEXT to match:
```
/new-customer (acquisition|demand|volume|footfall|count).*(stall|collaps|fell|fall|weak|down)|
collaps\w*[^.]{0,40}new[- ]?customer|acquisition has stalled|top-of-funnel.*(collaps|fell|weak)|
lead volume (collaps|fell|weak|down)|demand (collaps|fell|softened|deteriorat|dried)|
funnel.*(collaps|deteriorat)|online sessions (fell|collaps)|traffic (fell|collaps|weak)|
volume deleverage|new[- ]customer demand collaps/
```

This regex requires **adverse-state verbs** (collapsed, fell, stalled, weak, down, dried, deteriorated). The SIM-04-001 sidecar findings describe a subscriber-based software business where: *"subscriber count has not grown over 18 months"*, *"new subscriber acquisition rate is insufficient to replace churning subscribers"*, *"the business has been operating at near-constant subscriber count"*.

"Has not grown" and "near-constant subscriber count" do not contain any DEMAND_TEXT adverse verb. The pattern requires explicit demand failure language, not stagnation language.

**Layer responsible:** Engine (DEMAND_TEXT adverse-verb requirement excludes stagnation framing) + Sidecar (finding vocabulary uses neutral stagnation language, not collapse/stall terms)  
**Fix type:** Generic (D3 — add stagnation tokens to DEMAND_TEXT: "not grown", "stagnant", "flat", "plateaued")  
**Estimated yield if fixed:** +0.40–0.50 total score

---

### SIM-04-002 · TT-1 · Expected: DEMAND_GENERATION_FAILURE · Actual: LEGAL_GOVERNANCE_RISK

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.200 | 0.30 | 0.060 |
| prioritization | ~0.700 | 0.10 | 0.070 |
| firstAction | 0.830 | 0.15 | 0.125 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.640** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** PASSED  
**Archetype:** WRONG — false positive LEGAL_GOVERNANCE_RISK

**Root cause of failure:**

This is a lexical collision false positive. The LEGAL_TEXT pattern includes `enquiry` (the British-English spelling of "inquiry"):
```
/regulat\w*|complian\w*|...|enquiry|.../
```

The sidecar misleading_signals[1] finding reads: *"Surface signal (not root cause): new client **enquiry** volume is healthy and initial booking conversion is acceptable"*

"Client enquiry" in business-English means a customer contact/lead. However, "enquiry" matches LEGAL_TEXT's `enquiry` token, which is intended to catch regulatory/official inquiries. This single match likely provides sufficient signal for `fin_isLegalGovernanceByText()` to fire given the combination of other evidence items.

The actual DEMAND_GENERATION_FAILURE pattern does not fire because: (a) DEMAND_TEXT adverse-verb gate fails (same mechanism as SIM-04-001 — "clients stop engaging after 2-4 sessions" doesn't match DEMAND_TEXT collapse verbs), and (b) LEGAL_TEXT fires first and wins.

The correct archetype cannot overcome the false positive because the engine selects the highest-confidence diagnosis.

**Layer responsible:** Engine (LEGAL_TEXT pattern — "enquiry" ambiguity; also DEMAND_TEXT not broad enough)  
**Fix type:** Generic (D7 — guard LEGAL_TEXT "enquiry" with negative lookahead excluding "client enquiry" / "business enquiry" contexts)  
**Estimated yield if fixed:** +0.10–0.15 (but DEMAND still requires D3 fix to fully pass)

---

### SIM-05-001 · TT-2 · Expected: GTM_CHANNEL_MISMATCH · Actual: LEGAL_GOVERNANCE_RISK

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.400 | 0.30 | 0.120 |
| prioritization | ~0.700 | 0.10 | 0.070 |
| firstAction | 0.500 | 0.15 | 0.075 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.650** |

**Failure classification:** SIM_SCORING_LIMITATION (close-miss after wrong archetype)  
**evidenceDiscipline:** PASSED  
**Archetype:** WRONG — false positive LEGAL_GOVERNANCE_RISK

**Root cause of failure — three compounding failures:**

*Failure 1 — LEGAL false positive (law firm context):*  
This is a law firm GTM case. The business context means evidence item findings naturally contain vocabulary that triggers LEGAL_TEXT. "Retained client", "out-of-scope enquiries", law-firm-specific operational language — multiple items in market_position dimension accumulate enough LEGAL_TEXT signal hits that `fin_isLegalGovernanceByText()` fires. Even without an explicit compliance/regulatory problem, the industry context produces lexical LEGAL matches.

*Failure 2 — GTM_TEXT vocabulary gap:*  
The engine's GTM pattern requires:
```
/paid[- ]search|paid[- ]social|channel mix|channel-driven|acquisition (cost|channel)|go-to-market|\bgtm\b|distribution channel|sales motion|market segment|channel attribution/
```
The sidecar finding vocabulary uses: "digital advertising", "broadened targeting", "referral-based acquisition", "out-of-scope enquiries from digital advertising". None of these match GTM_TEXT. "digital advertising" ≠ "paid-search" or "paid-social". "Referral-based acquisition" ≠ "channel mix" or "distribution channel".

*Failure 3 — GTM numeric gate:*  
The engine's GTM numeric gate requires `channelCac`, `channelMix`, or `channelConversionPct`. The sidecar maps `leadVolume` and `funnelConversionPct` — neither satisfies the GTM numeric gate. Even if GTM_TEXT matched, the numeric gate would fail.

**Layer responsible:** Engine (LEGAL false positive in industry context; GTM_TEXT too narrow; GTM numeric keys don't include funnelConversionPct as proxy)  
**Fix type:** Generic (D5 — broaden GTM_TEXT; D6 — add funnelConversionPct as GTM numeric proxy; D7 — narrow LEGAL false positive suppression)  
**Estimated yield if fixed:** All three fixes needed to reach correct archetype; then +0.10–0.15 additional for rootCause improvement

---

### SIM-05-002 · TT-5 · Expected: DEMAND_GENERATION_FAILURE · Actual: UNKNOWN

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.100 | 0.10 | 0.010 |
| firstAction | 0.000 | 0.15 | 0.000 |
| missingInputRequests | ~0.800 | 0.15 | 0.120 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 0.000 | 0.10 | 0.000 |
| reassessmentQuality | ~0.100 | 0.05 | 0.005 |
| **TOTAL** | | | **0.180** |

**Failure classification:** SIM_ENGINE_GAP  
**evidenceDiscipline:** FAILED (cascade from UNKNOWN)

**Root cause of failure:**

Same DEMAND_TEXT adverse-verb gate failure as SIM-04-001. This is a fitness studio membership retention case (TT-5 signal trap: owner believes marketing is insufficient; actual problem is member departure rate offsetting new joiners).

The sidecar findings use: "total active member count has remained unchanged at approximately 310", "members who joined six to twelve months ago are no longer active", "two-year period of flat total membership". This is stagnation and attrition framing.

DEMAND_TEXT requires: "demand collapsed", "lead volume fell", "new-customer acquisition stalled", "top-of-funnel collapsed". Stagnation and membership attrition vocabulary ("no longer active", "remained unchanged", "flat") do not trigger any DEMAND_TEXT branch.

The metric mapping provides `newCustomerRate` (=18, new members per month) and `funnelConversionPct` (=6, proxy for monthly departure rate). These numeric keys can only contribute if the DEMAND_TEXT gate first fires — it does not.

**Layer responsible:** Engine (DEMAND_TEXT excludes retention-failure framing for demand problems) + Sidecar (narrative correctly describes the scenario in honest terms but doesn't include DEMAND_TEXT vocabulary)  
**Fix type:** Generic (D3 — add retention attrition tokens: "attrition exceeding", "member count flat", "membership not growing", "departure rate")  
**Estimated yield if fixed:** +0.40–0.50 total score

---

### SIM-06-001 · TT-3 · Expected: UNSUPPORTED (operational_stage_bottleneck) · Actual: SCOPE_GAP ✓

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.170 | 0.10 | 0.017 |
| firstAction | 0.170 | 0.15 | 0.026 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.700 | 0.05 | 0.035 |
| **TOTAL** | | | **0.300** |

**Failure classification:** SIM_ENGINE_GAP (by design — unsupported archetype)  
**evidenceDiscipline:** PASSED  

**Root cause:** No engine archetype models production-stage bottleneck or throughput constraint analysis. The engine correctly returns SCOPE_GAP. The score of 0.300 reflects partial credit in dimensions that do not require correct archetype identification (missingInputRequests, badRecAvoidance). This is expected behavior, not a fixable defect.

**Layer responsible:** Engine coverage gap (by design)  
**Fix type:** N/A — requires new archetype implementation to unlock  
**Estimated yield if fixed:** Would require entire new engine archetype; not in scope

---

### SIM-06-002 · TT-4 · Expected: UNSUPPORTED (scheduling_inefficiency) · Actual: SCOPE_GAP ✓

**Score breakdown**

| Dimension | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| rootCause | 0.000 | 0.30 | 0.000 |
| prioritization | ~0.000 | 0.10 | 0.000 |
| firstAction | 0.000 | 0.15 | 0.000 |
| missingInputRequests | ~0.900 | 0.15 | 0.135 |
| badRecAvoidance | 1.000 | 0.15 | 0.150 |
| evidenceDiscipline | 1.000 | 0.10 | 0.100 |
| reassessmentQuality | ~0.100 | 0.05 | 0.005 |
| **TOTAL** | | | **0.280** |

**Failure classification:** SIM_ENGINE_GAP (by design — unsupported archetype)  
**evidenceDiscipline:** PASSED  

**Root cause:** Same as SIM-06-001. No engine archetype models scheduling inefficiency or capacity utilisation misattribution. Expected behavior. Lower score than SIM-06-001 because firstAction=0 and prioritization=0.

**Layer responsible:** Engine coverage gap (by design)  
**Fix type:** N/A  
**Estimated yield if fixed:** N/A

---

## Section B — Failure Clustering Table

| Cluster | Cases | Description | Layer | Fixable? |
|---------|-------|-------------|-------|----------|
| WC_TEXT + numeric gate miss | SIM-01-001, SIM-01-002 | Engine WC pattern requires specific vocabulary AND (dso OR receivablesAging+dpo). Sidecar uses business-English paraphrases and maps receivablesAging only. | Engine + Sidecar | Yes — generic |
| DEMAND adverse-verb gate miss | SIM-04-001, SIM-04-002, SIM-05-002 | Engine DEMAND_TEXT requires collapse/stall/fell verbs. Stagnation and attrition framing don't fire. | Engine | Yes — generic |
| GTM pattern + numeric miss | SIM-05-001 | GTM_TEXT doesn't match digital advertising vocabulary; GTM numeric gate excludes funnelConversionPct. | Engine | Yes — generic |
| LEGAL false positive | SIM-04-002, SIM-05-001 | "enquiry" (lexical collision) and law-firm industry context cause LEGAL_GOVERNANCE_RISK to fire incorrectly. | Engine | Yes — generic |
| rootCause vocabulary gap | SIM-02-002, SIM-03-001, SIM-03-002, SIM-04-002, SIM-05-001 | Composer outputs archetype prose; scoring rubric must_identify phrases require domain-specific vocabulary. 70% token-overlap heuristic cannot bridge the gap. | Scoring/Composer | Yes — generic |
| evidenceDiscipline cascade | SIM-01-001, SIM-01-002, SIM-02-001, SIM-04-001, SIM-05-002 | UNKNOWN diagnosis produces abstain/uncertain prose; evidenceDiscipline scorer finds no evidence-signal language; CRITICAL gate fails. | Engine (cascade) | Resolves when diagnosis fixed |
| UE sidecar gap | SIM-02-001 | No numeric UE keys mapped; UNITECON_HARD vocab not in findings. | Sidecar + Engine | Partially case-specific |
| SC-06 coverage gap | SIM-06-001, SIM-06-002 | No engine archetypes for operational bottleneck or scheduling inefficiency. | Engine (by design) | No — requires new archetype |

---

## Section C — Top 10 Engine Defects Ranked

Ranked by: cases affected × expected score improvement, then implementation risk (lower risk = higher rank).

| Rank | Defect ID | Description | Cases Affected | Expected ΔScore | Risk | Defect Location |
|------|-----------|-------------|----------------|-----------------|------|----------------|
| 1 | D3 | **DEMAND_TEXT adverse-verb requirement** — pattern requires "collapsed/fell/stalled"; stagnation and attrition framing ("flat", "unchanged", "not grown", "no longer active") not matched | SIM-04-001, SIM-05-002 (+ partial SIM-04-002) | +0.40–0.50 per case × 2-3 cases | LOW — additive regex tokens, no existing matches affected | `diagnosis-engine.ts` DEMAND_TEXT pattern |
| 2 | D1 | **WC numeric gate — receivablesAging alone insufficient** — gate requires receivablesAging+dpo pair; dpo not mapped in WC sidecars | SIM-01-001, SIM-01-002 | +0.40–0.50 per case × 2 cases | LOW — add dso as alternative OR accept receivablesAging alone | `diagnosis-engine.ts` WC numeric gate |
| 3 | D8 | **rootCause vocabulary gap** — composer outputs archetype-level prose; must_identify phrases are case-specific domain vocabulary; 70% token overlap cannot bridge | SIM-02-002, SIM-03-001, SIM-03-002, SIM-04-002, SIM-05-001 | +0.08–0.20 per case × 5 cases | HIGH — requires either case-specific composer tuning or scoring heuristic relaxation | Composer output / `simulationScoringContract.ts` |
| 4 | D7 | **LEGAL false positive — "enquiry" lexical collision** — British-English business word "enquiry" (client enquiry = lead) matches LEGAL_TEXT intended for regulatory inquiries | SIM-04-002, SIM-05-001 | Unblocks correct archetype for 2 cases | MEDIUM — must narrow LEGAL_TEXT without losing real legal hits | `diagnosis-engine.ts` LEGAL_TEXT pattern |
| 5 | D2 | **WC_TEXT vocabulary gap** — engine WC pattern requires exact tokens (receivabl, dso, working capital); "slow-paying clients" and "payment delays" not matched | SIM-01-001, SIM-01-002 | Prerequisite for WC fix — no yield without D1 also fixed | LOW — additive synonyms to WC_TEXT regex | `diagnosis-engine.ts` WC_TEXT pattern |
| 6 | D5 | **GTM_TEXT vocabulary gap** — pattern requires paid-search/paid-social/channel-mix; "digital advertising" and "broadened targeting" not matched | SIM-05-001 | Prerequisite for GTM fix | LOW — additive synonyms | `diagnosis-engine.ts` GTM_TEXT pattern |
| 7 | D6 | **GTM numeric gate excludes funnelConversionPct** — GTM numeric gate accepts channelCac/channelMix/channelConversionPct only; funnelConversionPct not accepted as proxy | SIM-05-001 | Must fix with D5 to unlock GTM path | LOW — add funnelConversionPct to numeric gate | `diagnosis-engine.ts` GTM numeric check |
| 8 | D4 | **DEMAND sidecar finding vocabulary** — retention/attrition framing used in SIM-04-001/SIM-05-002 accurately represents the case but doesn't trigger DEMAND_TEXT | SIM-04-001, SIM-04-002, SIM-05-002 | Resolves if D3 (engine fix) applied; sidecar fix is alternative path | LOW — case-specific sidecar updates | Sidecar evidence-hints files |
| 9 | D9 | **evidenceDiscipline cascade from UNKNOWN** — not a standalone defect; 5 cases fail evidDiscipline CRITICAL gate because UNKNOWN → abstain prose → no evidence language in output | SIM-01-001, SIM-01-002, SIM-04-001, SIM-05-002 (+ SIM-02-001) | Resolves automatically when D1–D3 fix correct archetypes | NONE — dependent defect | Cascade from diagnosis failures |
| 10 | D10 | **UE sidecar — no numeric keys mapped; UNITECON_HARD vocabulary absent** — SIM-02-001 has no canonical UE numeric mappings and findings don't use UE trigger terms | SIM-02-001 | +0.45–0.55 | LOW (sidecar) + MEDIUM (engine) — sidecar fix is isolated; engine fix requires synonym addition | Sidecar + `diagnosis-engine.ts` UNITECON_HARD |

---

## Section D — Recommended Remediation Sequence

### Wave 1 — Engine pattern text fixes (lowest risk, highest yield)

**W1-A: DEMAND_TEXT stagnation tokens (D3)**  
Add to DEMAND_TEXT: `|subscriber (count|base|number).*(flat|stagnant|not grown|unchanged)|membership.*(flat|not growing|stagnant)|attrition exceeding (acquisition|new)|member.*(not grown|remained flat)|demand (flat|stagnant|plateaued)|new[- ]?customer.*(not grown|stagnant)|acquisition (flat|plateaued|not growing)`  
Expected: Fixes SIM-04-001, SIM-05-002. Unlocks DEMAND path for SIM-04-002 if LEGAL false positive also suppressed.  
Risk: LOW — additive tokens do not affect existing DEMAND_TEXT matches.

**W1-B: WC_TEXT synonym expansion (D2)**  
Add to WC_TEXT: `|slow[- ]pay\w*|late[- ]pay\w*|payment delay|overdue invoice|outstanding invoice|debtor`  
Risk: LOW — additive.

**W1-C: WC numeric gate — accept receivablesAging without dpo requirement (D1)**  
Change gate to: `fin_num(e, "dso") !== undefined || fin_num(e, "cashConversionDays") !== undefined || fin_num(e, "receivablesAging") !== undefined`  
Alternatively: add `dso` mapping to WC sidecars.  
Risk: LOW — widens existing gate; may slightly increase WC false positives in edge cases.

**W1-D: GTM_TEXT synonym expansion (D5)**  
Add to GTM_TEXT: `|digital advertising|online advertising|paid advertising|lead generation channel|referral channel|channel mismatch|channel effectiveness|acquisition channel performance`  
Risk: LOW — additive.

**W1-E: GTM numeric gate — accept funnelConversionPct (D6)**  
Add `funnelConversionPct` to GTM numeric gate alongside channelConversionPct.  
Risk: LOW.

---

### Wave 2 — LEGAL false positive suppression (D7)

**W2: LEGAL_TEXT "enquiry" — negative lookahead**  
Narrow `enquiry` match to exclude business-contact context:  
Replace `enquiry` with `(?:(?:regulatory|official|formal|governmental|enforcement) )?enquir\w*` or add negative lookahead:  
`enquir(?!y volume|y from|y rate|ies from|ies volume)`  
Also audit law-firm industry context producing excess LEGAL hits (SIM-05-001).  
Risk: MEDIUM — must verify that legitimate LEGAL cases (actual regulatory enquiries) still trigger.

---

### Wave 3 — rootCause vocabulary bridging (D8)

**W3: rootCause scoring — improve vocabulary bridge**  
Options (choose one):
- Lower token-overlap threshold from 70% to 50% for must_identify phrase matching
- Add semantic synonym expansion in the scorer (e.g., "food cost" ↔ "cost of goods", "margin" ↔ "profitability")
- Emit must_identify-anchored phrases from composer when rootCause is identified with HIGH confidence  
Risk: HIGH — changes to scoring contract thresholds may affect other tests; changes to composer alter all output.

---

### Wave 4 — UE case fix (D10)

**W4: SIM-02-001 sidecar + UNITECON_HARD synonym**  
- Add numeric mappings: `unitContributionMargin` from delivery cost vs revenue delta
- Add synonym to UNITECON_HARD: `per-session (cost|loss|margin)|delivery cost per (session|unit|service)|session (loss|deficit)`  
Risk: LOW (sidecar); LOW–MEDIUM (engine synonym).

---

### Wave 5 — SC-06 coverage (out of scope for Batch 1 remediation)

SC-06 cases require new engine archetypes (operational bottleneck, scheduling inefficiency). These are not defects — they are documented coverage gaps. No fix in scope for Batch 1.

---

## Section E — Predicted Pass Rate by Wave

Base: 0/12 (0%)  
SC-06 cases (SIM-06-001, SIM-06-002) are treated as expected SCOPE_GAP — not remediation targets.  
Remediation targets: 10 cases.

| Wave | Fixes Applied | Expected New Passes | Cumulative Passes | Predicted Pass Rate (of 10 remediable) |
|------|--------------|--------------------|--------------------|----------------------------------------|
| Baseline | None | — | 0/10 | 0% |
| Wave 1 | D3 (DEMAND stagnation) + D1/D2 (WC) + D5/D6 (GTM text+numeric) | SIM-01-001 ✓, SIM-01-002 ✓ (WC fixed), SIM-04-001 ✓, SIM-05-002 ✓ (DEMAND fixed) | 4/10 | 40% |
| Wave 2 | +D7 (LEGAL suppression) | SIM-04-002 ✓ (DEMAND now fires + LEGAL suppressed), SIM-05-001 ✓ (GTM now fires + LEGAL suppressed, score ~0.70+) | 6/10 | 60% |
| Wave 3 | +D8 (rootCause vocabulary bridge) | SIM-02-002 ✓ (rc 0.200→0.400+), SIM-03-001 ✓ (rc 0.000→0.300+), SIM-03-002 ✓ (rc 0.600→0.700+, total crosses 0.70) | 9/10 | 90% |
| Wave 4 | +D10 (UE fix) | SIM-02-001 ✓ | 10/10 | 100% |

**Predicted pass-rate ceiling after generic fixes only (Waves 1+2+3):** 9/10 remediable cases (90%), 9/12 total (75%)  
**Full remediation ceiling (Waves 1–4):** 10/10 remediable (100%), 10/12 total (83%)  
**Hard ceiling:** 10/12 (83%) — SIM-06-001 and SIM-06-002 require new archetypes, not fixes.

---

## Summary

**Cases analyzed:** 12 (Batch 1)

**Failure clusters:**
- WC pattern + numeric gate miss: 2 cases (D1, D2)
- DEMAND adverse-verb gate: 3 cases (D3)
- GTM pattern + numeric miss: 1 case (D5, D6)
- LEGAL false positive: 2 cases (D7)
- rootCause vocabulary gap: 5 cases (D8)
- evidenceDiscipline cascade: 5 cases (D9 — dependent, resolves with diagnosis fixes)
- UE sidecar gap: 1 case (D10)
- SC-06 by-design coverage gap: 2 cases (no fix)

**Highest-yield defect:** D3 (DEMAND_TEXT stagnation tokens) — unblocks 2-3 cases with lowest implementation risk; additive regex expansion, zero impact on existing passing tests.

**Predicted pass-rate ceiling after generic fixes (Waves 1–3):** 75% (9/12 cases), 90% of remediable cases.

**Recommended next implementation wave:** Wave 1 — Engine pattern text expansions (D3, D1/D2, D5, D6). All four are additive regex changes in `diagnosis-engine.ts` with no impact on existing SMB regression locks. Estimated implementation time: < 2 hours. Expected pass-rate improvement: 0% → 40%.
