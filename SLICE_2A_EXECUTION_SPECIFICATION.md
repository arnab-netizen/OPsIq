# Slice 2A Execution Specification

**Business Root Cause and Action Reasoning Layer**

**Date:** 2026-06-16  
**Slice:** 2A (new primary slice per REMEDIATION_STRATEGY_DECISION_CORRECTION)  
**Purpose:** Improve root-cause accuracy (15% → 50%+) and first-action accuracy (0% → 30%+) by expanding reasoning engine to diagnose 7 missing business problem categories and select case-specific first actions.

---

## 1. Target Failure Mode

**Primary Failure:** DIAGNOSIS_COVERAGE_GAP

**Root Cause:** Pattern library contains only 3 archetypes:
- OPERATIONAL_BOTTLENECK
- QUALITY_CONTROL_FAILURE
- CUSTOMER_RETENTION_EROSION

**Missing Categories (7+ archetypes):**
1. BRAND_EROSION / MARKET_POSITION_CRISIS
2. DEMAND_FORECASTING_MISMATCH / INVENTORY_MISALIGNMENT
3. UNIT_ECONOMICS_BREAKDOWN / OVEREXPANSION
4. GO_TO_MARKET_MISALIGNMENT / CHANNEL_FIT
5. STRATEGIC_PRICING_ERROR / PACKAGING_MISMATCH
6. GOVERNANCE_COMPLIANCE_FAILURE
7. TRUST_QUALITY_CRISIS (non-operational QC)
8. CASH_RUNWAY_CRISIS (advanced)

**Target Cases:** 15 real-world cases (RW-001–RW-015) from Round 1

---

## 2. Evidence Requirements Per Archetype

### Archetype 1: BRAND_EROSION / MARKET_POSITION_CRISIS

**Definition:** Loss of market position due to perception/reputation damage, brand weakness, market share erosion.

**Evidence Signals (all OR):**
- Customer perception shift (NPS drop, sentiment change, brand value decline)
- Market share loss despite stable product
- Reputation crisis (public incident, social media backlash, trust violation)
- Competitive displacement (customer migration to competitor for brand reasons)
- Premium position loss (downtrading, price sensitivity increase)

**Cases Matching Pattern:**
- RW-001 (Domino's): "Quality of pizza declining" → brand/perception erosion (not just QC)
- RW-003: Market position vulnerability

**First Action Template:**
- Diagnostic: Brand health audit (perception study, competitive positioning, customer sentiment)
- Strategic: Brand repositioning OR transparency initiative OR product quality reset
- Metric: NPS recovery, brand value index, market share stabilization

**False-Positive Guards:**
- Do NOT diagnose BRAND_EROSION if product quality is provably fine and customer perception aligns with reality
- Do NOT diagnose if issue is temporary (1-2 weeks) vs structural erosion (3+ months)
- Do NOT conflate operational QC with brand perception damage

**Evidence Confidence Threshold:**
- HIGH confidence: market data + customer perception data + competitive context
- MEDIUM confidence: customer sentiment + market share trend
- LOW confidence: single mention of "brand" or "reputation" without supporting evidence → INSUFFICIENT_EVIDENCE instead

---

### Archetype 2: DEMAND_FORECASTING_MISMATCH / INVENTORY_MISALIGNMENT

**Definition:** Supply-demand imbalance due to forecast error, demand signal misinterpretation, or inventory planning failure. Includes bullwhip effect, seasonal mismatch, demand shock.

**Evidence Signals (all OR):**
- Excess inventory despite flat/declining demand
- Stockouts despite adequate inventory (misallocation/distribution failure)
- Demand growth not met by supply (supply-chain constraint)
- Cyclical mismatch (seasonal product, demand timing misalignment)
- Bullwhip: small demand variation → large inventory swing

**Cases Matching Pattern:**
- RW-005: Inventory imbalance, supply-demand mismatch

**First Action Template:**
- Diagnostic: Demand planning audit (forecast accuracy, safety stock model, lead time review)
- Strategic: Demand planning reset OR safety stock rebalancing OR supplier/logistics alignment
- Metric: Inventory turns, stockout frequency, forecast accuracy

**False-Positive Guards:**
- Do NOT diagnose DEMAND_FORECASTING if demand is actually stable and inventory issue is due to cost-cutting or storage constraints
- Do NOT confuse demand surge with forecast error (surge predictable → forecast error; surge unpredictable → business opportunity or external shock)
- Require evidence of mismatch duration (3+ months) to diagnose vs short-term anomaly

**Evidence Confidence Threshold:**
- HIGH confidence: demand trend + inventory level + supply-lead-time data
- MEDIUM confidence: inventory level + sales trend
- LOW confidence: single mention of "inventory" or "stockout" → INSUFFICIENT_EVIDENCE

---

### Archetype 3: UNIT_ECONOMICS_BREAKDOWN / OVEREXPANSION

**Definition:** Business unit profitability collapse due to margin compression, fixed-cost burden, or expansion beyond economic scale. Includes overhiring, over-build, excess overhead.

**Evidence Signals (all OR):**
- Gross margin declining despite stable prices (cost inflation)
- Operating loss increasing despite stable revenue
- Per-unit cost rising (scale not reducing cost)
- Fixed-cost burden rising faster than revenue growth
- Expansion to new locations/segments unprofitable
- Headcount growing faster than revenue

**Cases Matching Pattern:**
- RW-006: Unit economics breakdown, overexpansion
- RW-008: Cost structure unsustainable
- RW-013: Margin pressure, fixed-cost burden

**First Action Template:**
- Diagnostic: Unit economics audit (COGS breakdown, OpEx allocation, contribution margin by unit/segment)
- Strategic: Cost rationalization OR pricing increase OR expansion reversal OR operational efficiency program
- Metric: Gross margin, unit contribution, OpEx/revenue ratio, breakeven per unit

**False-Positive Guards:**
- Do NOT diagnose UNIT_ECONOMICS if margin decline is due to temporary cost spike (commodity inflation) vs structural issue
- Do NOT confuse revenue decline with unit economics (if revenue down but margin stable, issue is demand, not economics)
- Require evidence of structural cost issue (3+ months) vs temporary variance

**Evidence Confidence Threshold:**
- HIGH confidence: margin trend + cost breakdown + revenue growth comparison
- MEDIUM confidence: margin decline + expansion timeline
- LOW confidence: single mention of "costs" or "expansion" → INSUFFICIENT_EVIDENCE

---

### Archetype 4: GO_TO_MARKET_MISALIGNMENT / CHANNEL_FIT

**Definition:** Failure to reach target customer or align channel strategy with customer needs. Includes wrong channel, wrong positioning, wrong customer segment, misaligned GTM.

**Evidence Signals (all OR):**
- Customer acquisition cost rising (channel saturation, customer segment mismatch)
- Channel shift needed (current channel losing efficacy)
- Customer segment wrong (attracting wrong buyer)
- GTM timing misaligned (market not ready, or competitor moved first)
- Distribution/logistics misaligned with customer expectation
- Go-to-market execution delayed (slow adoption)

**Cases Matching Pattern:**
- RW-004: GTM misalignment, wrong customer segment
- RW-009: Channel strategy failure
- RW-014: Positioning mismatch
- RW-015: Market timing or distribution issue

**First Action Template:**
- Diagnostic: Market positioning audit (GTM fit, customer segment validation, channel performance)
- Strategic: Channel shift OR customer segment refocus OR GTM timeline reset OR positioning change
- Metric: CAC trend, customer segment LTV, channel adoption, go-to-market milestone achievement

**False-Positive Guards:**
- Do NOT diagnose GO_TO_MARKET if the product itself is uncompetitive (issue is product, not GTM)
- Do NOT confuse execution delay with strategic misalignment
- Require evidence of channel/segment mismatch (not just growth slowdown)

**Evidence Confidence Threshold:**
- HIGH confidence: CAC data + customer segment performance + channel data
- MEDIUM confidence: CAC trend + market feedback
- LOW confidence: single mention of "sales" or "marketing" → INSUFFICIENT_EVIDENCE

---

### Archetype 5: STRATEGIC_PRICING_ERROR / PACKAGING_MISMATCH

**Definition:** Pricing or packaging strategy misaligned with customer willingness-to-pay, value perception, or competitive position. Includes price too high, price too low, package mismatch.

**Evidence Signals (all OR):**
- Price elasticity evidence (demand sensitive to price change)
- Customer willingness-to-pay below current price
- Competitor pricing undercut (customer choosing competitor on price)
- Packaging not aligned with customer segment (too premium, too basic)
- Revenue per customer flat/declining despite volume growth (pricing power loss)
- Margin compression from discounting to win deals

**Cases Matching Pattern:**
- RW-004, RW-009, RW-014, RW-015 may include pricing/packaging elements

**First Action Template:**
- Diagnostic: Pricing audit (WTP analysis, elasticity modeling, competitor comparison, packaging optimization)
- Strategic: Price adjustment (up/down) OR packaging restructure OR value communication reset
- Metric: Price realization, margin by customer segment, deal size, close rate

**False-Positive Guards:**
- Do NOT diagnose PRICING_ERROR if price is competitive and issue is product quality or brand
- Do NOT lower price as reflex; diagnose whether issue is price or value perception
- Require evidence of pricing power loss or competitive pressure

**Evidence Confidence Threshold:**
- HIGH confidence: pricing data + customer feedback + competitive comparison
- MEDIUM confidence: pricing trend + deal/close rate
- LOW confidence: single mention of "price" → INSUFFICIENT_EVIDENCE

---

### Archetype 6: GOVERNANCE_COMPLIANCE_FAILURE

**Definition:** Internal control failure, regulatory violation, fraud risk, or governance breakdown enabling loss/liability.

**Evidence Signals (all OR):**
- Regulatory violation or compliance gap discovered
- Internal control failure (unauthorized transaction, data breach, process bypass)
- Fraud or misappropriation detected
- Audit finding or material weakness
- Policy violation enabling financial loss
- Governance structure inadequate for risk level

**Cases Matching Pattern:**
- RW-011: Governance/compliance crisis

**First Action Template:**
- Diagnostic: Compliance/control audit (regulatory requirements, control gaps, risk assessment)
- Strategic: Control implementation OR policy reset OR governance restructure
- Metric: Remediation milestone, compliance closure, control testing

**False-Positive Guards:**
- Do NOT diagnose GOVERNANCE if the issue is strategic oversight (board engagement) vs control failure
- Require evidence of material control gap or regulatory issue

**Evidence Confidence Threshold:**
- HIGH confidence: compliance data + control documentation + regulatory context
- MEDIUM confidence: control gap evidence
- LOW confidence: single mention of "compliance" → INSUFFICIENT_EVIDENCE

---

### Archetype 7: TRUST_QUALITY_CRISIS (Non-Operational QC)

**Definition:** Quality or trust issue that erodes customer confidence/retention, distinct from operational bottleneck or brand erosion. Includes product quality failure, service reliability failure, data/security trust issue.

**Evidence Signals (all OR):**
- Product quality failure (defect, failure rate, durability)
- Service reliability failure (uptime, SLA miss, consistency)
- Data/security breach eroding customer trust
- Quality decline over time (regression from prior standard)
- Customer satisfaction collapse tied to quality (NPS drop from quality issue)

**Cases Matching Pattern:**
- RW-012: Quality/trust crisis
- Distinct from RW-001: RW-001 is brand perception; RW-012 is actual quality issue eroding trust

**First Action Template:**
- Diagnostic: Quality root cause analysis (failure mode, defect tracking, customer impact)
- Strategic: Quality remediation OR product redesign OR service reliability improvement
- Metric: Defect rate, quality score, customer satisfaction, return rate

**False-Positive Guards:**
- Do NOT diagnose TRUST_QUALITY_CRISIS if perception is wrong (brand issue) vs actual quality issue
- Require evidence of actual quality failure (defect data, failure rate, SLA miss)

**Evidence Confidence Threshold:**
- HIGH confidence: quality metric + customer feedback + failure data
- MEDIUM confidence: quality trend + complaint data
- LOW confidence: single mention of "quality" without data → INSUFFICIENT_EVIDENCE

---

### Archetype 8: CASH_RUNWAY_CRISIS

**Definition:** Immediate financial distress due to cash depletion, negative cash flow, or inability to fund operations. Critical/advanced.

**Evidence Signals (all OR):**
- Runway <6 months (cash depletion timeline known)
- Burn rate unsustainable (revenue < burn)
- No clear path to profitability or funding
- Access to credit/financing blocked
- Mandatory expense reductions (payroll, inventory) required

**Cases Matching Pattern:**
- Not in current Round 1, but included for completeness

**First Action Template:**
- Diagnostic: Cash flow analysis (runway, burn rate, recovery path)
- Strategic: Fundraising OR burn reduction OR business model reset
- Metric: Runway months, cash balance, burn trajectory

**False-Positive Guards:**
- Do NOT diagnose CASH_RUNWAY if business is profitable (operating issue, not financial crisis)
- Require evidence of actual runway pressure

**Evidence Confidence Threshold:**
- HIGH confidence: cash statement + burn rate + revenue forecast
- LOW confidence: single mention of "cash" → INSUFFICIENT_EVIDENCE

---

## 3. First-Action Selection Rules

**Rule 1: Match Archetype → Select Case-Specific Action**

If diagnosis = BRAND_EROSION:
  - Gather: customer perception data, competitive analysis, market research
  - Select action: brand audit OR transparency initiative OR product quality reset (choose based on root cause: perception gap vs actual quality)

If diagnosis = DEMAND_FORECASTING:
  - Gather: demand signal, supply lead times, inventory levels
  - Select action: demand planning reset OR safety stock rebalancing OR supplier alignment (choose based on failure point: forecast accuracy vs inventory model vs supply chain)

If diagnosis = UNIT_ECONOMICS:
  - Gather: COGS breakdown, OpEx allocation, contribution by unit/segment
  - Select action: cost rationalization OR pricing increase OR expansion reversal (choose based on burden: cost inflation vs margin compression vs scale)

If diagnosis = GO_TO_MARKET:
  - Gather: CAC trend, customer segment performance, channel data
  - Select action: channel shift OR customer segment refocus OR GTM reset (choose based on failure: saturation vs wrong segment vs timing)

If diagnosis = PRICING:
  - Gather: customer WTP, competitor pricing, margin by customer
  - Select action: price adjustment OR packaging restructure OR value communication (choose based on issue: power loss vs packaging vs perception)

If diagnosis = GOVERNANCE:
  - Gather: compliance requirements, control gap, risk assessment
  - Select action: control implementation OR policy reset OR governance restructure (choose based on gap)

If diagnosis = TRUST_QUALITY:
  - Gather: quality metrics, failure mode, customer impact
  - Select action: quality root cause fix OR product redesign OR service reliability improvement (choose based on failure type)

If diagnosis = CASH_RUNWAY:
  - Gather: cash flow, burn rate, revenue path
  - Select action: fundraising OR burn reduction OR business model reset (choose based on outlook)

**Rule 2: If Evidence Insufficient for Confident Diagnosis → Return INSUFFICIENT_EVIDENCE**

- Do not force archetype match
- Return INSUFFICIENT_EVIDENCE with flags for what additional data is needed
- Owner preference: conservative default over false-positive

---

## 4. False-Positive Guards

**Guard 1: Symptom vs Root Cause Separation**

If evidence points to SYMPTOM only (e.g., "sales declining"), do NOT diagnose underlying archetype until root cause clear:
- BRAND_EROSION: require perception data, not just sales decline
- DEMAND_FORECASTING: require demand signal + inventory data, not just sales decline
- UNIT_ECONOMICS: require cost/margin data, not just sales decline
- GO_TO_MARKET: require CAC/channel data, not just sales decline

**Guard 2: Archetype Overlap Detection**

Some cases may have MULTIPLE archetypes. Example:
- RW-006: UNIT_ECONOMICS (margin collapse) + DEMAND_FORECASTING (inventory issue)

Rule: Diagnose PRIMARY failure mode first (highest impact on cash/owner decision), flag secondary modes.

**Guard 3: Confidence Threshold Enforcement**

| Confidence | Diagnosis | Action |
|---|---|---|
| HIGH | Multiple evidence signals, >3 months duration | Confident recommendation |
| MEDIUM | Evidence signals present, timeline confirmed | Recommend with caveats |
| LOW | Single signal or unclear pattern | INSUFFICIENT_EVIDENCE |

**Guard 4: Evidence Recency and Duration**

- Temporary fluctuation (1-2 weeks): do not diagnose
- Emerging trend (1-2 months): flag as INSUFFICIENT_EVIDENCE unless pattern clear
- Structural issue (3+ months): diagnose confidently

**Guard 5: External Shock vs Internal Failure**

If failure coincides with external event (economic downturn, competitor entry, supply chain disruption):
- Acknowledge external context
- Diagnose business response adequacy (not the external event itself)
- Example: demand decline in economic downturn → diagnose if business response is inadequate (should have adjusted pricing, cost structure, etc.)

---

## 5. Targeted Benchmark Cases

**Slice 2A Success Criteria:**

- Root-cause accuracy: 15% → 50%+ on RW-001–RW-015
- First-action accuracy: 0% → 30%+ on RW-001–RW-015
- Safety: 0 new dangerous recommendations, confidence calibration maintained

**Target Case Map:**

| Case | Suspected Root Cause (per Round 1 analysis) | Target Diagnosis | Evidence Required | First Action Metric |
|------|---|---|---|---|
| RW-001 | Brand perception erosion (not QC) | BRAND_EROSION | Customer perception, market position | Brand audit + transparency |
| RW-002 | Customer retention/churn (secondary to RW-001 pattern) | CUSTOMER_RETENTION | Churn data, cohort analysis | Churn postmortem + metrics |
| RW-003 | Brand/market position crisis | BRAND_EROSION | Market share, competitive position | Brand repositioning |
| RW-004 | Go-to-market misalignment | GO_TO_MARKET | CAC, customer segment, channel | Market positioning audit |
| RW-005 | Demand forecasting / inventory mismatch | DEMAND_FORECASTING | Demand signal, inventory level, supply lead time | Demand planning reset |
| RW-006 | Unit economics breakdown | UNIT_ECONOMICS | Margin trend, cost structure, expansion context | Unit economics audit |
| RW-007 | Operational bottleneck | OPERATIONAL_BOTTLENECK | Process failure, resource constraint, execution | Process audit |
| RW-008 | Unit economics / overexpansion | UNIT_ECONOMICS | Fixed-cost burden, margin, scale | Cost rationalization |
| RW-009 | Go-to-market / channel failure | GO_TO_MARKET | CAC, channel performance, segment | Channel shift audit |
| RW-010 | Operational bottleneck (variant) | OPERATIONAL_BOTTLENECK | Execution failure, timeline | Process/execution audit |
| RW-011 | Governance / compliance failure | GOVERNANCE_COMPLIANCE | Control gap, regulatory requirement | Compliance audit |
| RW-012 | Quality / trust crisis | TRUST_QUALITY | Quality metric, failure rate, customer impact | Quality root cause fix |
| RW-013 | Unit economics / margin pressure | UNIT_ECONOMICS | Margin, cost, revenue growth | Unit audit + pricing |
| RW-014 | Go-to-market / positioning | GO_TO_MARKET | Positioning, customer fit, adoption | GTM reset |
| RW-015 | Go-to-market / distribution / pricing | GO_TO_MARKET or PRICING | GTM data, pricing context | Market audit |

---

## 6. Adversarial Regression Tests

**Regression Test Set:** Ensure new archetypes do NOT break existing 3 archetypes (OPERATIONAL_BOTTLENECK, QUALITY_CONTROL_FAILURE, CUSTOMER_RETENTION_EROSION)

**Test Case 1:** OPERATIONAL_BOTTLENECK Still Diagnoses Correctly
- Input: Clear process failure, resource constraint, execution bottleneck
- Expected: OPERATIONAL_BOTTLENECK diagnosed confidently
- Regression Guard: Do not misclassify as GO_TO_MARKET or other archetype

**Test Case 2:** QUALITY_CONTROL_FAILURE Still Diagnoses Correctly (Actual QC Issue)
- Input: Defect rate rising, quality declining, QC process failure
- Expected: QUALITY_CONTROL_FAILURE diagnosed
- Regression Guard: Do not misclassify as BRAND_EROSION (actual QC vs perception)

**Test Case 3:** CUSTOMER_RETENTION_EROSION Still Diagnoses Correctly
- Input: Churn spike, NPS drop, engagement decline
- Expected: CUSTOMER_RETENTION_EROSION diagnosed
- Regression Guard: Do not misclassify as BRAND_EROSION or other archetype

**Test Case 4:** Adversarial Trap Cases (ADV-001–ADV-010)
- Ensure new archetypes do NOT increase false confidence on adversarial traps
- Example: ADV-004 (missing critical data) should still return INSUFFICIENT_EVIDENCE, not force diagnosis

**Test Case 5:** Overlap Handling
- Input: Case with MULTIPLE archetypes (e.g., UNIT_ECONOMICS + DEMAND_FORECASTING)
- Expected: Primary archetype diagnosed with secondary flags
- Regression Guard: Correct prioritization (not random archetype selection)

---

## 7. Implementation Boundary

**In Scope for Slice 2A:**

1. ✅ Expand `DiagnosisType` enum with 7 new archetypes
2. ✅ Add evidence-dimension mapping per archetype (which signals → which archetype)
3. ✅ Add first-action selection logic (if diagnosis = X, select action per rules)
4. ✅ Add false-positive guards (confidence threshold, symptom vs root cause filtering)
5. ✅ Unit tests for each archetype (happy path + false-positive guards)
6. ✅ Regression tests for existing 3 archetypes
7. ✅ Targeted benchmark on RW-001–RW-015

**Out of Scope (Deferred):**

1. ❌ Numeric layer (Slice 2, deferred)
2. ❌ Public-dataset cases (PD-001–PD-010, require numeric layer)
3. ❌ Synthetic cases (SYN-001–SYN-010, may require additional archetypes)
4. ❌ Adversarial cases (ADV-001–ADV-010, regression testing only)
5. ❌ Blind-outcome cases (BLND-001–BLND-005, forward-looking reasoning, deferred)
6. ❌ Intervention specificity improvement (Slice 3, secondary priority)

---

## 8. Success Criteria (Promotion Gate)

**Slice 2A passes if ALL:**

1. ✅ Static gates pass (npm ci, tsc, build, prisma validate)
2. ✅ Unit tests pass (100% archetype coverage)
3. ✅ Regression tests pass (existing 3 archetypes not degraded)
4. ✅ Targeted benchmark: RW-001–RW-015 scored and manually reviewed
5. ✅ Root-cause accuracy: 15% → 50%+ (at least 8/15 RW cases correct)
6. ✅ First-action accuracy: 0% → 30%+ (at least 4-5/15 RW cases correct)
7. ✅ No new dangerous recommendations (0 count)
8. ✅ No confidence regression (false confidence does not increase)
9. ✅ No immutable artifact modification
10. ✅ Manual review complete (locked answer keys aligned)

**If any criterion fails:**
- Status: SLICE_2A_BLOCKED_WITH_EVIDENCE
- Reason: documented in benchmark analysis
- Next: diagnose failure, revise implementation, or defer to architecture review

---

## 9. Timeline and Effort Estimate

**Estimated Implementation Effort:** 40-60 hours

- Archetype definition and evidence mapping: 10-15 hours
- Engine code changes (enum, pattern detection, action selection): 15-20 hours
- Unit tests and regression tests: 10-15 hours
- Targeted benchmark execution and scoring: 5-10 hours
- Manual review and adjustment: 5-10 hours

**Estimated Timeline:** 5-8 calendar days (1 week)

---

## 10. Files to Create/Modify

**Files to Create:**
- `SLICE_2A_ARCHETYPE_EVIDENCE_MATRIX.md` (detailed evidence mapping)
- `SLICE_2A_UNIT_TESTS.ts` (unit tests per archetype)
- `SLICE_2A_REGRESSION_TESTS.ts` (regression tests for existing archetypes)
- `SLICE_2A_BENCHMARK_RESULTS.md` (targeted RW-001–RW-015 benchmark)

**Files to Modify:**
- `src/domain/consulting/types.ts` (extend DiagnosisType enum)
- `src/services/diagnosis-engine.ts` (add archetype pattern detection)
- `src/services/action-selector.ts` (add first-action selection logic)
- `src/services/confidence-validator.ts` (add false-positive guards)

**Files NOT to Modify:**
- Any Round 1 immutable artifacts
- Simulation case packs
- Benchmark harness or scoring logic

---

## 11. Success Definition (Final Closeout)

When Slice 2A implementation is complete, produce:

```
SLICE_2A_CLOSEOUT:
  status: [PASS | BLOCKED_WITH_EVIDENCE]
  root_cause_accuracy: [X%] (target: 50%+)
  first_action_accuracy: [X%] (target: 30%+)
  static_gates: [PASS | FAIL]
  unit_tests: [PASS | FAIL]
  regression_tests: [PASS | FAIL]
  targeted_benchmark: [PASS | FAIL]
  new_dangerous_recommendations: [0 | N]
  confidence_regression: [none | details]
  immutable_artifacts: [UNCHANGED | MODIFIED]
  manual_review_complete: [yes | no]
  next_step: [AUTHORIZE_SLICE_3 | REVISE_SLICE_2A | BLOCKED]
```

---

**Specification Approved By:** Execution Contract (execution_consultant_engine_v2.md §10)  
**Specification Status:** READY_FOR_IMPLEMENTATION_APPROVAL  
**Next Gate:** User review and approval before implementation begins

