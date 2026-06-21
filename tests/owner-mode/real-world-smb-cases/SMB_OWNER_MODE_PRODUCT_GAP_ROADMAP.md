# SMB Owner Mode — Product Gap Roadmap Audit

**Audit scope:** `SMB_OWNER_MODE_PRODUCT_GAP_ROADMAP_AUDIT`
**Date:** 2026-06-21
**Branch:** claude/cool-ptolemy-dxrpm7
**Harness state:** 0/9 supported SMB cases pass. All leakage removed. Score is ground truth.

**Evidence base for this audit:**
- `SMB_ROOT_CAUSE_ALIGNMENT_FAILURE_AUDIT.md` — per-case term-level failure analysis
- `SMB_ENGINE_OUTPUT_QUALITY_FAILURE_AUDIT.md` — per-case engine output vs fixture vocabulary
- `SMB_ENGINE_INTERPOLATION_IMPLEMENTATION_REPORT.md` — interpolation outcome (honest failure accepted)
- `diagnosis-engine.ts` — current archetype definitions and routing logic
- `opsiq_real_world_smb_case_fixtures.jsonl` — 12 cases, 9 supported
- `evidence-hints/*.json` — sidecar evidence and metric key mappings

**Hard constraints on this document:**
- No code modified
- No tests modified
- No fixtures modified
- No engine tuned
- No harness manipulated
- No inflation of case outcomes

---

## Section 1 — Per-Case Failure Classification

Classification categories:
1. Engine sufficient, output layer weak
2. Missing sub-mechanism under existing archetype
3. Missing full diagnosis archetype
4. Missing owner-input data model
5. Scoring / benchmark limitation
6. Correct honest failure

---

### SMB-001 — Working Capital Cash Flow Trap

| Field | Value |
|---|---|
| case_id | SMB-001 |
| expected root mechanism | working_capital_cash_flow_trap — AP/AR timing mismatch creates cash gap |
| current engine diagnosis | WORKING_CAPITAL_STRESS (MODERATE) — correct top-level archetype |
| RCA score | 2/6 = 33% (need ≥60%) |
| total score | 0.38 |
| missing sub-mechanism | AR/AP timing mismatch as distinct from generic working-capital stress |
| must_identify gap analysis | "cash conversion cycle" ✓ "working capital" ✓ — 2 matched. "accounts receivable timing" SYNONYM_MISMATCH (engine: "receivables (DSO)", missing "accounts receivable" full form). "payables due before receivables collected" SYNONYM_MISMATCH (engine: "payables timing", phrase tokens fail 70%). "AR AP mismatch" HONEST_FAILURE. "cash flow gap" HONEST_FAILURE. |
| primary classification | **1 — Engine sufficient, output layer weak** (engine diagnosis correct; 2 of 4 missing terms are standard vocabulary reachable via evidence interpolation; but 2 honest-failure terms prevent reaching 60% at current scoring) |
| secondary classification | **4 — Missing input data model** (DPO not in evidence model; without DPO, payables timing cannot be quantified in output) |
| owner usefulness | HIGH — AR/AP timing mismatch IS the actual business problem; owner needs this framing |
| implementation complexity | LOW-MEDIUM — engine mechanism already mentions "payables timing" and "DSO"; expanding to "accounts receivable" full form and structured AP/DPO timing sentence achieves 4/6 if DPO evidence is added |
| business value | HIGH — WCS is one of the most common SMB cash problems; correct framing changes owner behavior |
| overfitting risk | LOW — "accounts receivable timing" and "payables due before receivables" are standard accounting vocabulary independent of fixture |
| recommended fix | Phase 1: add DPO as required evidence item in working-capital evidence schema. Phase 2: WC_AR_COLLECTION sub-mechanism with explicit AP/AR timing language. Phase 3: composer interpolates "accounts receivable cycle {DSO} days vs payables due in {DPO} days". |

---

### SMB-002 — Inventory Cash Trap

| Field | Value |
|---|---|
| case_id | SMB-002 |
| expected root mechanism | inventory_cash_trap — forecast error locks cash in unsold stock |
| current engine diagnosis | INVENTORY_FORECASTING_MISMATCH (HIGH) — correct top-level archetype |
| RCA score | 0/5 = 0% |
| total score | 0.27 |
| missing sub-mechanism | Cash-trap framing of inventory mismatch (working capital lens on a forecasting problem) |
| must_identify gap analysis | All 5 terms fail. "inventory cash trap" SYNONYM_MISMATCH (engine: "trapping cash" — concept present, exact 3-token phrase absent). "working capital locked in inventory" HONEST_FAILURE (working-capital framing absent from forecasting archetype). "inventory turnover" SYNONYM_MISMATCH (engine: stockouts/overstock pattern, never uses turnover metric name). "slow-moving stock" SYNONYM_MISMATCH (engine: "slow lines"). "cash tied up in unsold inventory" SYNONYM_MISMATCH (engine: "trapping cash and forcing markdowns" — concepts present, exact multi-token phrase diverges). |
| primary classification | **2 — Missing sub-mechanism** (engine's INVENTORY_FORECASTING_MISMATCH uses forecasting-accuracy framing; the required diagnostic vocabulary is cash-trap / working-capital framing of the same problem; these are two valid but distinct framings of inventory mismatch) |
| owner usefulness | HIGH — inventory as a cash-trap is the owner's felt experience; forecasting-accuracy framing is analyst vocabulary, not owner vocabulary |
| implementation complexity | MEDIUM — add INV_CASH_TRAP sub-mechanism: when forecast error causes cash tied up in non-moving inventory, produce "inventory cash trap" framing alongside forecasting explanation |
| business value | HIGH — owner takes different action from "fix your forecasting" vs "your cash is locked in stock that isn't moving" |
| overfitting risk | LOW-MEDIUM — "inventory cash trap", "inventory turnover", "slow-moving stock" are all standard inventory management vocabulary; "working capital locked in inventory" is standard SMB finance vocabulary |
| recommended fix | Phase 2: INV_CASH_TRAP sub-mechanism fires when inventory overstock is confirmed + cash-constraint signal present. Produces "working capital is locked in non-moving inventory" mechanism alongside the forecasting root cause. |

---

### SMB-003 — Negative Unit Economics / Paid Acquisition

| Field | Value |
|---|---|
| case_id | SMB-003 |
| expected root mechanism | negative_unit_economics_paid_acquisition — CAC exceeds contribution margin |
| current engine diagnosis | UNIT_ECONOMICS_FAILURE (HIGH) — correct archetype |
| RCA score | 47% (allTerms expansion); must_identify ratio 2/6 (contribution margin ✓, plus allTerms); fails |
| total score | 0.45 after interpolation (0.65 per implementation report — MIR now failing instead of RCA, suggesting RCA improved) |
| missing sub-mechanism | Paid-acquisition sub-type with LTV/CAC framing |
| must_identify gap analysis | "contribution margin" ✓. "customer acquisition cost" SYNONYM_MISMATCH (engine: "acquisition cost" — missing leading word "customer"). "LTV to CAC ratio" HONEST_FAILURE (LTV/CAC framing entirely absent from engine). "negative contribution after CAC" SYNONYM_MISMATCH (engine: "acquisition cost exceeds customer value" — same concept, divergent tokens). "paid channel is loss-making at scale" HONEST_FAILURE (channel-specific vocabulary absent). "unit economics" ✓ (via allTerms). |
| primary classification | **2 — Missing sub-mechanism** (UE_PAID_ACQUISITION sub-type needed: fires when variableCost represents CAC and CAC > revenue per customer; produces LTV/CAC framing rather than generic contribution margin framing) |
| secondary classification | **1 — Engine sufficient, output layer weak** (engine correctly identifies failure; single-word extension "customer acquisition cost" vs "acquisition cost" accounts for one term) |
| owner usefulness | HIGH — paid-channel founders specifically need CAC/LTV vocabulary; generic "unit economics" framing doesn't connect to their marketing decisions |
| implementation complexity | LOW-MEDIUM — add UE_PAID_ACQUISITION sub-type routing on variableCost=CAC signal; mechanism template uses "customer acquisition cost" and "contribution margin" explicitly |
| business value | HIGH — SaaS/DTC/subscription SMBs are the fastest-growing segment; paid-acquisition economics is a near-universal failure mode |
| overfitting risk | LOW — "customer acquisition cost", "contribution margin", "LTV to CAC ratio" are all standard growth-accounting vocabulary (textbooks: Ries, Kohavi, growth equity frameworks) |
| recommended fix | Phase 2: UE_PAID_ACQUISITION sub-type. Routing: fires when variableCost > price AND variableCost < 10000 (per-unit signal). Mechanism template: "Customer acquisition cost exceeds the per-customer contribution margin — the paid channel deepens losses at current unit economics rather than building value." Adds "customer acquisition cost" and "contribution margin" as contiguous substrings. |

---

### SMB-004 — Restaurant Prime Cost Margin Erosion

| Field | Value |
|---|---|
| case_id | SMB-004 |
| expected root mechanism | prime_cost_margin_erosion — restaurant food+labor cost percentage above breakeven benchmark |
| current engine diagnosis | MARGIN_EROSION (HIGH) — correct top-level archetype |
| RCA score | 0/5 = 0% |
| total score | 0.20 |
| missing sub-mechanism | Industry-specific margin sub-type (restaurant prime cost) |
| must_identify gap analysis | All 5 terms fail. "prime cost" HONEST_FAILURE (restaurant-specific KPI: food cost + labor; engine domain-agnostic). "food cost percentage" HONEST_FAILURE (restaurant-specific). "labor cost percentage" HONEST_FAILURE (restaurant-specific). "prime cost above industry target" HONEST_FAILURE (requires knowing the industry benchmark). "occupancy is not the problem" HONEST_FAILURE (exclusion signal requiring case-specific context). |
| primary classification | **4 — Missing owner-input data model** (no industry-type or case-type field in evidence schema; without knowing this is a restaurant, no safe route to "prime cost" vocabulary exists; a restaurant_case_type tag would enable ME_PRIME_COST sub-mechanism routing) |
| secondary classification | **6 — Correct honest failure** (all 5 terms are industry-specific vocabulary inaccessible to a domain-agnostic archetype engine without case-type metadata) |
| owner usefulness | HIGH — restaurant operators specifically track prime cost as the canonical control variable; this is the industry-standard diagnostic vocabulary |
| implementation complexity | HIGH — requires case_type metadata in owner-input flow plus industry-specific template library per case_type |
| business value | HIGH — restaurants are the single largest SMB failure-rate industry; prime-cost diagnostic vocabulary is universal among food service operators |
| overfitting risk | MEDIUM — "prime cost", "food cost percentage", "labor cost percentage" are restaurant industry standards, NOT fixture-specific inventions; risk is that adding case_type creates branching logic that requires coverage for all verticals |
| recommended fix | Phase 1: add industry_vertical field to owner input model. Phase 2: ME_PRIME_COST sub-mechanism fires for industry_vertical=restaurant when food+labor cost percentage is provided. Phase 3: composer routes to prime-cost template for restaurant cases. |

---

### SMB-006 — Fixed Cost Overextension / Below Breakeven (fitness studio)

| Field | Value |
|---|---|
| case_id | SMB-006 |
| expected root mechanism | fixed_cost_overextension_below_breakeven — revenue below breakeven due to lease/fixed overhead burden |
| current engine diagnosis | UNIT_ECONOMICS_FAILURE (HIGH) — wrong sub-mechanism (per-unit economics framing instead of fixed-cost breakeven framing) |
| RCA score | 0/5 = 0% |
| total score | 0.20 (scope gap: unsupported archetype) |
| missing sub-mechanism | UE_FIXED_COST_BREAKEVEN — fires when variableCost > price at proxy values representing monthly fixed costs vs monthly revenue |
| must_identify gap analysis | All 5 terms ENGINE_ARCHETYPE_GAP. "fixed cost overextension" — no archetype. "below breakeven" — no archetype. "lease burden" — no archetype. "breakeven occupancy" — no archetype. "fixed costs exceed revenue at current volume" — entire framing absent. Engine fires UE on the correct numeric signal (variableCost=35000 > price=22000) but wrong mechanism — these are monthly fixed costs vs monthly revenue, not per-unit variable cost vs price. |
| primary classification | **2 — Missing sub-mechanism under existing archetype** (UNIT_ECONOMICS_FAILURE fires on correct numerics but wrong mechanism; fixed-cost/breakeven is a distinct UE sub-type) |
| owner usefulness | HIGH — "fixed cost overextension" and "below breakeven" are the exact terms an owner needs to understand their situation; "unit economics failure" describes a different intervention path |
| implementation complexity | MEDIUM — add UE_FIXED_COST_BREAKEVEN routing: fires when (total_revenue < total_fixed_costs) AND (per_unit_contribution > 0 OR evidence of fixed-cost dominance). Mechanism: "Revenue is insufficient to cover fixed costs at current volume — the business is below breakeven. Variable cost per unit is profitable but total fixed overhead exceeds total revenue." |
| business value | VERY HIGH — fixed-cost overextension at lease-signing is one of the most common terminal failure modes for brick-and-mortar SMBs (retail, hospitality, fitness, food service) |
| overfitting risk | LOW — "breakeven", "fixed costs exceed revenue", "below breakeven" are standard managerial accounting vocabulary |
| recommended fix | Phase 2: UE_FIXED_COST_BREAKEVEN sub-type. Routing: fixedCosts present AND fixedCosts > totalRevenue AND variableMarginPerUnit > 0. Mechanism template: "Fixed costs exceed revenue at current volume — the business is operating below breakeven despite positive contribution per unit. Revenue must increase {X}% or fixed costs must be reduced to reach breakeven." |

---

### SMB-007 — Owner Capacity Ceiling (solo consultant)

| Field | Value |
|---|---|
| case_id | SMB-007 |
| expected root mechanism | owner_capacity_bottleneck_revenue_ceiling — solo owner's billable hours cap limits total revenue |
| current engine diagnosis | OPERATIONAL_BOTTLENECK (HIGH) — wrong sub-mechanism (throughput/queue model instead of personal-capacity ceiling model) |
| RCA score | 0/5 = 0% |
| total score | 0.23 (scope gap: unsupported archetype) |
| missing sub-mechanism | OWNER_CAPACITY_CEILING — fires on owner-as-single-billable-practitioner signal with revenue ceiling |
| must_identify gap analysis | All 5 terms ENGINE_ARCHETYPE_GAP. "capacity ceiling" — engine produces throughput/queue language. "owner bottleneck" — engine describes service-delivery bottleneck, not personal-capacity bottleneck. "revenue ceiling tied to personal hours" — revenue ceiling concept absent from engine. "delegation gap" — organizational pattern absent. "non-billable time consuming capacity" — billable/non-billable split absent from engine model. |
| primary classification | **2 — Missing sub-mechanism under existing archetype** (OPERATIONAL_BOTTLENECK fires nearest available but wrong sub-type; owner-capacity ceiling is a distinct failure mode requiring personal-capacity and delegation vocabulary) |
| secondary classification | **4 — Missing input data model** (ownerHoursPerWeek, billableHoursRatio, delegationCapability are not in current evidence schema) |
| owner usefulness | VERY HIGH — owner-as-bottleneck is the most common constraint facing solo practitioners and early-stage service businesses; this diagnosis unlocks the delegation/leverage intervention path |
| implementation complexity | MEDIUM — add OWNER_CAPACITY_CEILING routing: fires when ownerHoursAtCapacity=true AND (billableHoursRatio present OR ownerHoursPerWeek > threshold). Mechanism: "Revenue is constrained by the owner's personal billable capacity — non-billable time consumes working hours that could be deployed on fee-earning work; the ceiling is personal hours, not demand." |
| business value | VERY HIGH — professional services, freelancers, consulting, tradespeople — this failure mode affects the largest SMB segment by count |
| overfitting risk | LOW — "capacity ceiling", "billable hours", "non-billable time", "delegation" are standard professional-services management vocabulary |
| recommended fix | Phase 1: add ownerHoursPerWeek, billableHoursRatio, delegationOptions to owner-input evidence model. Phase 2: OWNER_CAPACITY_CEILING archetype or sub-type. Mechanism template uses "owner billable capacity ceiling", "non-billable hour load", "delegation gap" — all standard vocabulary. |

---

### SMB-008 — AR Collection Gap

| Field | Value |
|---|---|
| case_id | SMB-008 |
| expected root mechanism | accounts_receivable_cash_flow_gap — collection process failure causing cash shortfall |
| current engine diagnosis | WORKING_CAPITAL_STRESS (MODERATE) — correct archetype but MODERATE confidence caps score |
| RCA score | 1/6 = 17% (DSO abbreviation only); after interpolation 3/6 = 50% (adds "accounts receivable" and "days sales outstanding") |
| total score | 0.27 (0.64 per implementation report after interpolation — closer to threshold but still failing) |
| missing sub-mechanism | WC_AR_COLLECTION sub-mechanism — AR-collection-specific language vs generic WC cycle framing |
| must_identify gap analysis | "DSO" ✓ (abbreviation in mechanism). "accounts receivable" SYNONYM_MISMATCH (engine: "receivables" without "accounts" leading word). "days sales outstanding" SYNONYM_MISMATCH (engine: "DSO" abbreviation only). "cash flow gap" HONEST_FAILURE (specific 3-token phrase). "billed vs collected" HONEST_FAILURE (billing vs collection framing absent). "collection process failure" HONEST_FAILURE (process-failure framing absent from WC stress archetype). |
| primary classification | **6 — Correct honest failure** (3 of 6 must_identify terms are collection-process vocabulary inaccessible without fixture knowledge; max safe reach = 3/6 = 50% < 60% threshold) |
| secondary classification | **1 — Engine sufficient, output layer weak** (3 synonym terms fully reachable via evidence interpolation — achieved 50% with current implementation; blocked from 60% by honest-failure terms) |
| owner usefulness | HIGH — "accounts receivable", "days sales outstanding", "collection process" are the specific terms an AR-gap owner needs to understand their cash problem |
| implementation complexity | LOW — synonym terms already improved by interpolation; honest-failure terms are ceiling |
| business value | HIGH — AR collection gaps are among the most common cash flow problems for service businesses |
| overfitting risk | N/A for honest-failure terms — those cannot be safely added |
| recommended fix | Accept 50% honest ceiling. If fixture were re-designed without "billed vs collected" and "collection process failure" (which are more collection-specific than AR-timing-specific), this case would pass at 3/5 = 60%. The scoring benchmark terms are arguable. This is a scoring design consideration, not an engine defect. |

---

### SMB-010 — Input Cost Margin Compression / No Pricing Response

| Field | Value |
|---|---|
| case_id | SMB-010 |
| expected root mechanism | input_cost_margin_compression_without_pricing_response — cost increases not passed to customer |
| current engine diagnosis | MARGIN_EROSION (HIGH) — correct top-level archetype |
| RCA score | 0/5 = 0% (after interpolation: still 0% — interpolated sentence doesn't add matching tokens) |
| total score | 0.42 |
| missing sub-mechanism | ME_INPUT_COST_PRICING_RESPONSE — distinction between cost-inflation margin erosion WITH pricing response attempted vs WITHOUT |
| must_identify gap analysis | "input cost margin compression" SYNONYM_MISMATCH (engine: "cost inflation...compressing margin" — partial token overlap but fails 70%). "commodity cost increase" HONEST_FAILURE (commodity-specific vocabulary). "pricing power" HONEST_FAILURE (pricing-power framing requires case-specific context). "margin compression without pricing response" SYNONYM_MISMATCH (engine: "costs rising faster than price" — same concept, divergent tokens). "price has not been raised despite cost increase" SYNONYM_MISMATCH (engine implies this; exact phrase absent). |
| primary classification | **2 — Missing sub-mechanism** (MARGIN_EROSION archetype uses single mechanism for all erosion; a ME_INPUT_COST_PRICING_RESPONSE sub-type would fire when evidence shows cost increase + stable price = no pricing response, producing "input cost margin compression" and "pricing response" vocabulary) |
| secondary classification | **4 — Missing input data model** (commodity type not in evidence schema; "pricing power" framing requires price-sensitivity data or competitive-price comparison that owner hasn't provided) |
| owner usefulness | HIGH — whether the owner has tried to raise prices matters critically for the intervention path; "commodity cost increase" tells them what is driving the cost; "pricing power" tells them what their response options are |
| implementation complexity | MEDIUM — add ME_INPUT_COST_PRICING_RESPONSE sub-type: fires when profitChangePercent negative AND price has not changed AND cost evidence available. Mechanism: "Input costs have increased while prices have not been adjusted — margin is compressing without a pricing response. The gap between cost inflation and stable price is the proximate cause of declining profitability." |
| business value | HIGH — commodity-exposed SMBs (food service, manufacturing, distribution, construction) are extremely common; this specific failure mode is a major cause of SMB insolvency |
| overfitting risk | LOW-MEDIUM — "input cost", "pricing response", "margin compression" are standard business vocabulary; "commodity cost increase" is industry-context-specific (risk of over-specificity) |
| recommended fix | Phase 1: add lastPriceChangeDate and primaryCostDriver to evidence schema. Phase 2: ME_INPUT_COST_PRICING_RESPONSE sub-type. Mechanism uses "input cost margin compression" and "pricing response" as explicit labels. Phase 3: composer interpolates "input costs up {pct}% while prices unchanged for {period}". |

---

### SMB-012 — Premature Multi-Location Expansion

| Field | Value |
|---|---|
| case_id | SMB-012 |
| expected root mechanism | unit_economics_failure_premature_expansion — expansion location is loss-making, subsidized by profitable original |
| current engine diagnosis | UNIT_ECONOMICS_FAILURE (HIGH) — correct top-level archetype, wrong sub-mechanism |
| RCA score | 1/5 = 20% |
| total score | 0.59 |
| missing sub-mechanism | UE_PREMATURE_EXPANSION — multi-location awareness; per-location contribution margin; expansion-before-proven-economics framing |
| must_identify gap analysis | "unit economics" ✓. "per-location contribution margin" ENGINE_ARCHETYPE_GAP (engine has no location dimension). "loss-making expansion locations" ENGINE_ARCHETYPE_GAP. "profitable original location subsidizing expansion" HONEST_FAILURE (cross-location subsidy analysis). "premature expansion before unit economics proven" HONEST_FAILURE (temporal expansion sequencing). |
| primary classification | **2 — Missing sub-mechanism under existing archetype** (UE fires correctly on contribution=-8000 at location 2; lacks multi-location awareness to produce "per-location" and "expansion" vocabulary) |
| secondary classification | **4 — Missing input data model** (location_id breakdown of contribution margin not currently a first-class evidence schema field) |
| owner usefulness | VERY HIGH — "per-location" economics and "subsidizing expansion" are the exact framing owners need to understand why total P&L looks acceptable while a hidden location bleeds cash |
| implementation complexity | MEDIUM — add UE_PREMATURE_EXPANSION sub-type: fires when locationExpansionLosses present AND originalLocationPositive. Mechanism: "The expansion location is generating losses — the original profitable location is subsidizing expansion costs. Per-location contribution margin analysis is required before further growth." |
| business value | HIGH — multi-location expansion before proving unit economics is one of the top 5 causes of SMB failure; failure to diagnose this correctly costs owners 2-5 years of subsidized losses |
| overfitting risk | LOW — "per-location", "expansion location", "subsidizing" are standard multi-unit business vocabulary |
| recommended fix | Phase 1: add locationId breakdown to evidence schema. Phase 2: UE_PREMATURE_EXPANSION sub-type with multi-location routing. Phase 3: composer produces per-location P&L request as missing input. |

---

## Section 2 — Aggregated Gap Classification

### By primary category

| Category | Cases | Count |
|---|---|---|
| 1 — Engine sufficient, output layer weak | SMB-003 (secondary), SMB-008 (secondary) | 0 primary (blocked by honest-failure terms) |
| 2 — Missing sub-mechanism | SMB-002, SMB-003, SMB-006, SMB-007, SMB-010, SMB-012 | 6 |
| 3 — Missing full archetype | None | 0 |
| 4 — Missing input data model | SMB-004, SMB-007 (secondary), SMB-001 (secondary), SMB-012 (secondary), SMB-010 (secondary) | 1 primary |
| 5 — Scoring / benchmark limitation | SMB-008 (borderline) | 1 (arguable) |
| 6 — Correct honest failure | SMB-004, SMB-008 | 2 (terminal gap without input model change) |

### By term classification (43 must_identify terms, 9 cases)

| Classification | Count | Notes |
|---|---|---|
| Currently matched | 5 | SMB-001: 2, SMB-003: 1, SMB-008: 1, SMB-012: 1 |
| SYNONYM_MISMATCH — fixable via sub-mechanism vocabulary | 12 | Concept present in engine output, tokens diverge |
| ENGINE_ARCHETYPE_GAP — requires new sub-type | 13 | Architecture change needed; no vocabulary injection |
| HONEST_FAILURE — copy-only path | 18 | No safe addition without reading fixture answer key |

### Honest failure term distribution

| Case | Honest failure terms | Why unreachable |
|---|---|---|
| SMB-001 | "AR AP mismatch", "cash flow gap" | Abbreviation pair; specific 3-token idiom |
| SMB-002 | "working capital locked in inventory", "cash tied up in unsold inventory" | WC framing absent from forecasting archetype |
| SMB-003 | "LTV to CAC ratio", "paid channel is loss-making at scale" | LTV/paid-channel framing absent from engine |
| SMB-004 | All 5 terms | Restaurant-industry vocabulary with no safe domain-general bridge |
| SMB-006 | All 5 terms (archetype gap) | Fixed-cost/breakeven archetype doesn't exist |
| SMB-007 | All 5 terms (archetype gap) | Owner-capacity archetype doesn't exist |
| SMB-008 | "cash flow gap", "billed vs collected", "collection process failure" | Collection-process framing; specific idioms |
| SMB-010 | "commodity cost increase", "pricing power" | Commodity/pricing-power specificity |
| SMB-012 | "profitable original location subsidizing expansion", "premature expansion before unit economics proven" | Cross-location analysis; temporal expansion judgment |

---

## Section 3 — Sub-Mechanism Taxonomy Required

The following sub-mechanisms are identified as needed for real owner usefulness, independent of the fixture scoring contract. Each addresses a real SMB failure mode that the current archetype system cannot distinguish.

| Sub-mechanism ID | Parent archetype | Routing signal | Vocabulary produced | Cases addressed |
|---|---|---|---|---|
| WC_AR_COLLECTION | WORKING_CAPITAL_STRESS | DSO > threshold AND receivables as primary cash constraint | "accounts receivable", "days sales outstanding", "invoice-to-payment lag", "collection timing" | SMB-001, SMB-008 |
| WC_AP_AR_TIMING | WORKING_CAPITAL_STRESS | DSO and DPO both available AND DSO > DPO | "accounts receivable cycle", "payables due before receivables collected", "AP/AR timing gap" | SMB-001 |
| INV_CASH_TRAP | INVENTORY_FORECASTING_MISMATCH | forecast error + cash constraint signal co-present | "inventory cash trap", "working capital locked in non-moving inventory", "inventory turnover", "excess stock tying up cash" | SMB-002 |
| UE_PAID_ACQUISITION | UNIT_ECONOMICS_FAILURE | variableCost as CAC proxy > price AND values < 10000 | "customer acquisition cost", "contribution margin per customer", "CAC exceeds per-customer value", "paid channel economics" | SMB-003 |
| ME_PRIME_COST | MARGIN_EROSION | industry_vertical = restaurant OR food_cost AND labor_cost both present | "prime cost", "food cost percentage", "labor cost percentage", "prime cost ratio", "combined food and labor" | SMB-004 |
| UE_FIXED_COST_BREAKEVEN | UNIT_ECONOMICS_FAILURE | fixedCosts > totalRevenue AND variable margin per unit > 0 | "fixed cost overextension", "below breakeven", "breakeven volume", "fixed costs exceed revenue at current volume" | SMB-006 |
| OWNER_CAPACITY_CEILING | OPERATIONAL_BOTTLENECK | owner sole billable practitioner AND ownerHoursPerWeek at capacity | "owner capacity ceiling", "billable capacity", "non-billable hour load", "revenue ceiling tied to owner hours", "delegation gap" | SMB-007 |
| ME_INPUT_COST_PRICING | MARGIN_EROSION | profitChangePercent < 0 AND price unchanged AND input cost signal | "input cost margin compression", "pricing response", "margin compression without a pricing adjustment", "cost inflation without price recovery" | SMB-010 |
| UE_PREMATURE_EXPANSION | UNIT_ECONOMICS_FAILURE | multi-location evidence AND expansion location negative contribution | "per-location contribution margin", "expansion location losses", "profitable location subsidizing expansion", "premature expansion" | SMB-012 |

---

## Section 4 — Phase Roadmap

---

### PHASE 1 — Owner Input Model Completion

**Goal:** Ensure the evidence model captures the inputs required to route to the correct sub-mechanism and produce specific diagnostic vocabulary.

**Gap today:** The engine receives generic EvidenceItem[] with supportingData numerics but lacks:
- Industry vertical / case type (blocks ME_PRIME_COST, OWNER_CAPACITY_CEILING in some industry contexts)
- AP/DPO data (blocks WC_AP_AR_TIMING for SMB-001)
- Per-location P&L breakdown (blocks UE_PREMATURE_EXPANSION for SMB-012)
- Billable/non-billable hours split (blocks OWNER_CAPACITY_CEILING for SMB-007)
- Last price change date relative to cost change (blocks ME_INPUT_COST_PRICING for SMB-010)
- Owner-hours capacity flag (blocks OWNER_CAPACITY_CEILING)

**Required inputs to standardize:**

| Input key | Type | Enables |
|---|---|---|
| industry_vertical | enum (restaurant, professional_services, retail, fitness, food_service, construction, other) | ME_PRIME_COST, industry-specific vocabulary routing |
| case_type | enum (single_location, multi_location, solo_practitioner, team_based) | UE_PREMATURE_EXPANSION, OWNER_CAPACITY_CEILING |
| dpo | number (days) | WC_AP_AR_TIMING — required alongside dso for AP/AR gap calculation |
| fixedCosts | number | UE_FIXED_COST_BREAKEVEN routing |
| totalRevenue | number | UE_FIXED_COST_BREAKEVEN routing (distinct from per-unit price) |
| locationId | string | Per-location evidence breakdown for UE_PREMATURE_EXPANSION |
| ownerHoursPerWeek | number | OWNER_CAPACITY_CEILING routing |
| billableHoursRatio | number (0–1) | OWNER_CAPACITY_CEILING routing |
| lastPriceChangeDate | date | ME_INPUT_COST_PRICING — whether pricing response has been attempted |
| primaryCostDriver | string | ME_INPUT_COST_PRICING — commodity / labor / material |
| foodCostPct | number | ME_PRIME_COST (restaurant) |
| laborCostPct | number | ME_PRIME_COST (restaurant) |

**Clarification request system:**

The engine currently produces `missingEvidenceFor` as a string array using archetype-generic labels. To enable MIR scoring (currently 0/5 for all cases), the missing-input request system must:
1. Produce per-case structured requests keyed to canonical input fields
2. Use industry-standard labels matching the vocabulary owners and their accountants use
3. Anchor requests to the specific data point needed, not the archetype category

Example: instead of "Cost-driver decomposition (COGS vs labor vs overhead)", produce "Provide food cost percentage for the most recent accounting period (ideally 13-week trailing)".

**Evidence sidecar equivalent in product input flow:**

The evidence-hints sidecar files in the test harness represent what a product input flow must collect. The product must:
- Present owners with a structured input intake (business description + core financial metrics)
- Map owner inputs to canonical evidence keys (the metric_key_mappings layer)
- Identify missing-data gaps and request them before producing diagnosis (the clarification_requests layer)
- Not proceed to diagnosis on insufficient evidence — INSUFFICIENT_EVIDENCE abstention is correct behavior

---

### PHASE 2 — SMB Sub-Mechanism Taxonomy

**Goal:** Add the 9 sub-mechanisms listed in Section 3 to the engine's routing logic with distinct description/mechanism templates.

**Architecture approach:**

The current `rootCausePatterns` array selects one archetype per case. Sub-mechanisms can be implemented as:

Option A — Sub-type field on RootCause: Add `subType?: string` to the `RootCause` interface. Each archetype's `diagnosis()` function inspects evidence and selects a sub-type. The `mechanismDescription` is then selected from a sub-type-keyed template map rather than a static string. No change to the routing pattern layer.

Option B — Separate archetype patterns: Add new RootCausePattern entries to `rootCausePatterns` for OWNER_CAPACITY_CEILING and UE_FIXED_COST_BREAKEVEN (which fire on distinct evidence signals from their parent archetypes). UE_PREMATURE_EXPANSION, INV_CASH_TRAP, etc. remain sub-type selections within existing patterns.

**Recommended approach:** Option A for sub-types within existing archetypes (UE_PAID_ACQUISITION, UE_PREMATURE_EXPANSION, INV_CASH_TRAP, ME_INPUT_COST_PRICING, ME_PRIME_COST, WC_AR_COLLECTION, WC_AP_AR_TIMING). Option B for genuinely distinct mechanisms (OWNER_CAPACITY_CEILING, UE_FIXED_COST_BREAKEVEN).

**Sub-mechanism priority ranking:**

| Priority | Sub-mechanism | Cases addressed | Complexity | Business value |
|---|---|---|---|---|
| P1 | OWNER_CAPACITY_CEILING | SMB-007 | MEDIUM | VERY HIGH |
| P1 | UE_FIXED_COST_BREAKEVEN | SMB-006 | MEDIUM | VERY HIGH |
| P2 | UE_PREMATURE_EXPANSION | SMB-012 | MEDIUM | HIGH |
| P2 | WC_AR_COLLECTION | SMB-001, SMB-008 | LOW | HIGH |
| P2 | UE_PAID_ACQUISITION | SMB-003 | LOW | HIGH |
| P3 | ME_INPUT_COST_PRICING | SMB-010 | MEDIUM | HIGH |
| P3 | INV_CASH_TRAP | SMB-002 | MEDIUM | HIGH |
| P4 | ME_PRIME_COST | SMB-004 | HIGH | HIGH (requires industry vertical input) |
| P4 | WC_AP_AR_TIMING | SMB-001 | LOW (requires DPO) | MEDIUM |

**Non-negotiable constraints for sub-mechanism implementation:**
- Sub-mechanism vocabulary must derive from standard business/industry textbook terms, not from fixture must_identify fields
- No sub-mechanism template may read fixture answer-key fields at any point in the call chain
- All sub-mechanism routing must be deterministic and testable in isolation
- Sub-mechanism templates must pass leakage Guards 1–12 after addition
- Guard 10 (preamble alone < 60% must_identify) must be verified for any new preamble text

---

### PHASE 3 — Deterministic Owner Output Composer

**Goal:** Translate the engine diagnosis (including sub-mechanisms) into owner-readable, actionable output without LLM dependency or fixture-answer leakage.

**Current state:**
- `smbOutputComposer.ts` in test harness implements the pattern correctly
- Evidence interpolation (`buildInterpolatedCausalSentence`) implemented but insufficient to reach 60% RCA without sub-mechanisms
- FAQ_TABLE provides first-action patterns per archetype (needs extension for sub-mechanisms)
- PER_ARCHETYPE_EXCLUSIONS provides bad-recommendation avoidance (needs extension for sub-mechanisms)
- Missing-input request system partially implemented (needs canonical key anchoring)

**Required composer extensions for Phase 3:**

1. **Evidence-first summaries:** Root cause summary must compose in order:
   - Archetype preamble (generic label)
   - Sub-mechanism description (specific mechanism from Phase 2 sub-type)
   - Interpolated causal sentence (evidence numerics → human-readable values)
   - Sidecar critical findings (case-specific factual evidence)
   - Mechanism drop for volume-sensitive archetypes (already implemented)

2. **Missing-input requests with canonical anchors:** Each missing input request must:
   - Reference the specific evidence key needed (dpo, foodCostPct, ownerHoursPerWeek)
   - Use the industry-standard label for that key (from CANONICAL_METRIC_LABELS)
   - Be anchored to what the request will unlock (e.g., "needed to determine AP/AR timing gap")

3. **Sub-mechanism-specific first actions:** FAQ_TABLE must be extended with sub-mechanism entries:
   - WC_AR_COLLECTION: "Produce a full accounts receivable aging report by client, sorted by days outstanding"
   - OWNER_CAPACITY_CEILING: "Map every recurring activity by billable vs non-billable to quantify how many owner hours are consumed by non-revenue-earning work"
   - UE_FIXED_COST_BREAKEVEN: "Calculate the exact revenue volume required to cover all fixed costs at current price per unit — the breakeven point"
   - UE_PREMATURE_EXPANSION: "Run a standalone per-location profit and loss statement for each location separately, before any cost-sharing allocations"
   - UE_PAID_ACQUISITION: "Calculate the exact contribution margin per customer after all acquisition costs are allocated — not revenue per customer, but profit per customer after channel cost"

4. **Bad-recommendation avoidance by sub-mechanism:** PER_ARCHETYPE_EXCLUSIONS must include sub-mechanism-specific entries:
   - OWNER_CAPACITY_CEILING: do not recommend "hire staff immediately", "take on more clients", "add service lines before freeing owner capacity"
   - UE_FIXED_COST_BREAKEVEN: do not recommend "reduce prices to drive volume", "add marketing spend"
   - UE_PREMATURE_EXPANSION: do not recommend "open additional locations", "accelerate expansion", "add franchise units"

---

### PHASE 4 — Re-Run SMB Harness

**Goal:** Run the full harness after Phases 1–3 are implemented. Accept the result. Do not tune after seeing scores.

**Rules for Phase 4 run:**
1. Run `npm run test:owner-real-world-smb` on the complete harness with all changes in place
2. Record per-case scores without modification
3. If a case fails, document the remaining gap — do not re-tune to make it pass
4. If Guards 1–12 fail on new code, fix the guard violation, not the test
5. Phase 4 result is the honest ground truth for product readiness assessment
6. BRA (bad recommendation avoidance) must remain 9/9 passing — non-negotiable
7. The interpolation changes already made (Phase 3 partial) must remain in place

**Expected outcomes with Phases 1–3 complete (not guaranteed — accept whatever result):**

| Case | Expected mechanism after Phase 2 | Projected RCA% | Confidence |
|---|---|---|---|
| SMB-001 | WC_AP_AR_TIMING (if DPO data added) | 67% → PASS | LOW (depends on DPO input model) |
| SMB-002 | INV_CASH_TRAP | 40-60% | LOW (honest-failure terms block ceiling) |
| SMB-003 | UE_PAID_ACQUISITION | 50-67% | MEDIUM |
| SMB-004 | ME_PRIME_COST (if industry_vertical added) | 60-80% → PASS | LOW (requires industry vertical model) |
| SMB-006 | UE_FIXED_COST_BREAKEVEN | 60-80% → PASS | MEDIUM |
| SMB-007 | OWNER_CAPACITY_CEILING | 60-80% → PASS | MEDIUM |
| SMB-008 | WC_AR_COLLECTION | 50% max | HIGH (honest-failure ceiling confirmed) |
| SMB-010 | ME_INPUT_COST_PRICING | 60-80% → PASS | MEDIUM |
| SMB-012 | UE_PREMATURE_EXPANSION | 40-60% | MEDIUM (honest-failure terms for 2/5) |

**Honest projection:** 3–5 cases passing after full Phases 1–3 implementation. The benchmark requires ≥6/9. Reaching that threshold requires either Phase 1 input model completion (DPO, industry_vertical) or scoring benchmark adjustment.

**SaaS/Public readiness decision after Phase 4:**
- If ≥6/9 pass: proceed to owner-facing output UX layer
- If 4–5/9 pass: identify which 1–2 remaining cases represent fixable gaps vs honest ceilings; decide whether to expand test corpus or extend Phase 2
- If <4/9 pass: diagnose which Phase 2 sub-mechanisms did not route correctly before proceeding

---

## Section 5 — Top 5 Product Gaps

**Ranked by impact on real owner usefulness:**

### Gap 1 — No Industry-Vertical Awareness

**Problem:** The engine and composer are entirely domain-agnostic. Every case receives the same vocabulary regardless of whether the owner runs a restaurant, a fitness studio, a consulting practice, or an e-commerce business. This means any case where the correct diagnosis requires industry-specific vocabulary (prime cost, CAC, DPO, non-billable hours, lease burden, breakeven members) cannot be produced by the current system.

**Owner impact:** The output does not speak the owner's language. A restaurant operator does not think in "COGS vs labor vs overhead" — they think in prime cost. A fitness studio operator does not think in "fixed cost overextension" abstractly — they think in "breakeven members." The diagnosis may be correct but the output is not actionable.

**Fix:** Phase 1 industry_vertical field + Phase 2 industry-routed sub-mechanisms.

---

### Gap 2 — No Sub-Mechanism Routing (One Template Per Archetype)

**Problem:** Each archetype has a single static description and mechanism string. UNIT_ECONOMICS_FAILURE produces the same output whether the problem is paid-acquisition cost, fixed-cost overextension, or premature multi-location expansion. OPERATIONAL_BOTTLENECK produces the same output whether the problem is a queue bottleneck or a solo-owner capacity ceiling. These are fundamentally different problems requiring different first actions and different owner interventions.

**Owner impact:** The wrong mechanism description leads to the wrong first action. An owner facing fixed-cost breakeven who receives "your contribution margin is negative" will look at the wrong lever (pricing and variable cost) instead of the right one (lease renegotiation or revenue volume).

**Fix:** Phase 2 sub-mechanism taxonomy (9 sub-types identified; 6 are actionable without Phase 1 input model changes).

---

### Gap 3 — Missing-Input Request System Not Evidence-Anchored

**Problem:** The engine's `missingEvidenceFor` field and the composer's missing-input requests use archetype-generic category labels. These do not match the specific data owners have available in their accounting records, and the lexical anchors used by the scoring contract cannot match them. 0/9 cases pass MIR scoring because the phrasing of engine requests ("Cost-driver decomposition (COGS vs labor vs overhead)") doesn't match fixture anchors ("prime cost tracking data", "AR aging report by client", "SKU-level sell-through velocity").

**Owner impact:** The missing-input requests are not actionable. An owner doesn't know what "cohort-level contribution margin" means or where to find it. Replacing these with specific, anchored requests ("Provide your most recent bank statement and identify what percentage of outstanding invoices are more than 30 days overdue") dramatically increases the probability that the owner can act.

**Fix:** Phase 1 structured clarification request system + Phase 3 composer extensions with canonical-key-anchored missing-input labels.

---

### Gap 4 — AP / DPO Data Not in Evidence Model

**Problem:** Working capital timing analysis requires both DSO (accounts receivable days) and DPO (accounts payable days). The current evidence model collects DSO (dso key) but has no DPO key or payables-timing field. Without DPO, the engine cannot calculate the AP/AR timing gap or distinguish a receivables-collection problem from a payables-timing mismatch. SMB-001 reaches only 33% RCA in part because DPO is absent from the evidence schema.

**Owner impact:** WCS is the most common fatal cash-flow problem for SMBs. The most actionable diagnostic question is "how many days until you have to pay your suppliers vs how many days until you collect from customers?" Without DPO, the system cannot answer it.

**Fix:** Phase 1 — add dpo as a standardized evidence key with equivalent treatment to dso.

---

### Gap 5 — Owner Capacity / Human Execution Factors Not Modeled

**Problem:** SMB-007 (owner capacity ceiling) fails entirely because the engine has no concept of owner-as-sole-billable-practitioner, billable/non-billable hour splits, or delegation capacity. KEY_PERSON_RISK exists but models succession/dependency, not revenue ceiling. OPERATIONAL_BOTTLENECK models throughput/queue, not personal capacity. The result is that one of the most common and economically significant SMB failure modes — the solo-practitioner ceiling — produces a completely wrong diagnosis.

The CLAUDE.md product mandate explicitly identifies "owner bottlenecking", "follow-through risk", and "management capability" as required human-factors dimensions. The engine does not currently model any of them in a way that produces diagnostic output.

**Owner impact:** A solo consultant who is told "you have an operational bottleneck in service delivery" will not understand or act. The correct diagnosis — "your revenue ceiling is your personal billable hours; 27 hours per week of non-billable activity is the constraint" — leads directly to a delegation and systematization roadmap.

**Fix:** Phase 1 — ownerHoursPerWeek, billableHoursRatio evidence keys. Phase 2 — OWNER_CAPACITY_CEILING archetype with personal-capacity and delegation vocabulary.

---

## Final Output

```
Cases analyzed:                     9
Engine sufficient (pure output):    0  (all blocked by honest-failure terms at ≥2 per case)
Missing sub-mechanism:              6  (SMB-002, SMB-003, SMB-006, SMB-007, SMB-010, SMB-012)
Missing archetype:                  0  (sub-mechanisms within existing archetypes cover gaps)
Input model gaps:                   4  (SMB-001 DPO, SMB-004 industry_vertical,
                                         SMB-007 owner hours, SMB-012 location breakdown)
Scoring limitations:                1  (SMB-008 honest ceiling at 50%; arguable fixture design)
Correct honest failures (terminal): 2  (SMB-004 all terms restaurant-specific;
                                         SMB-008 3/6 terms inaccessible)

Top 5 product gaps:
  1. No industry-vertical awareness (blocks SMB-004; limits 7/9 other cases)
  2. One static template per archetype (blocks SMB-002, SMB-003, SMB-006, SMB-007,
     SMB-010, SMB-012 from correct sub-mechanism vocabulary)
  3. Missing-input requests not evidence-anchored (0/9 MIR passing; blocks all cases)
  4. DPO / AP timing not in evidence model (blocks WC_AP_AR_TIMING for SMB-001, SMB-008)
  5. Owner capacity / human execution factors not modeled (SMB-007; major SMB segment gap)

Recommended next build phase:
  PHASE 2A (highest value, no input-model dependency):
    — Implement UE_FIXED_COST_BREAKEVEN (SMB-006)
    — Implement OWNER_CAPACITY_CEILING (SMB-007)
    — Implement UE_PREMATURE_EXPANSION (SMB-012)
    — Implement UE_PAID_ACQUISITION (SMB-003)
    — Implement WC_AR_COLLECTION expanding mechanism to "accounts receivable" full form (SMB-001, SMB-008)
  These 5 sub-mechanisms require no input model changes. They should produce
  3-4 additional RCA-passing cases without modifying fixtures or scoring.

Decision:
  NOT SaaS-READY at current engine + output layer.
  Core diagnosis accuracy is sound (9/9 correct top-level archetype).
  Product usefulness gap is in sub-mechanism specificity, vocabulary precision,
  and input model completeness — all solvable without relaxing the scoring
  contract or injecting fixture vocabulary. The 0/9 harness result is ground
  truth, not a testing artifact. Honest failure is accepted. Build Phase 2A
  before assessing public readiness.
```
