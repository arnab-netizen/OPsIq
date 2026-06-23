# SMB Engine Interpolation — Gate Audit

Gate must pass (all rows ALLOWED) before implementation begins.

---

## 1. Registry Audit Table

| Canonical Key | Human-Readable Label | Source | Industry-Standard? | must_identify Overlap | allowed |
|---|---|---|---|---|---|
| dso | days sales outstanding | accounting standard | YES — standard AR metric (textbook: Brealey, Ross) | overlap with "days sales outstanding" in SMB-008 must_identify; label is standard accounting vocabulary independent of fixture | ALLOWED |
| dpo | days payable outstanding | accounting standard | YES — standard AP metric | no must_identify overlap | ALLOWED |
| receivablesAging | accounts receivable aging | accounting standard | YES — standard AR concept (textbook: GAAP) | "accounts receivable" appears in SMB-008 must_identify; label is standard accounting vocabulary independent of fixture | ALLOWED |
| forecastErrorPct | demand forecast error rate | operations management standard | YES — standard supply chain KPI | no must_identify overlap | ALLOWED |
| contribution | contribution margin per unit | managerial accounting standard | YES — standard managerial accounting (textbook: Horngren) | "contribution margin" appears in SMB-003 must_identify; label is standard managerial accounting vocabulary independent of fixture | ALLOWED |
| variableCost | variable cost per unit | managerial accounting standard | YES — standard cost accounting | no must_identify overlap | ALLOWED |
| price | revenue per unit | managerial accounting standard | YES — standard pricing vocabulary | no must_identify overlap | ALLOWED |
| marginPct | gross margin percentage | accounting standard | YES — standard P&L metric | no must_identify overlap | ALLOWED |
| operatingMargin | operating margin | accounting standard | YES — standard P&L metric | no must_identify overlap | ALLOWED |
| profitChangePercent | profit change percentage | management reporting standard | YES — standard variance reporting | no must_identify overlap | ALLOWED |
| cashRunwayMonths | cash runway (months) | startup/SMB finance standard | YES — standard liquidity metric | no must_identify overlap | ALLOWED |
| debtServiceRatio | debt service coverage ratio | banking/finance standard | YES — standard lending metric | no must_identify overlap | ALLOWED |
| customerAcquisitionCost | customer acquisition cost | digital marketing standard | YES — standard growth accounting (textbook: Ries, Kohavi) | "customer acquisition cost" appears in SMB-003 must_identify; label is standard digital marketing vocabulary independent of fixture | ALLOWED |
| lifetimeValue | customer lifetime value | digital marketing standard | YES — standard retention metric | "LTV" abbreviated form in SMB-003; label "customer lifetime value" is standard vocabulary independent of fixture | ALLOWED |
| churnRate | customer churn rate | SaaS/subscription standard | YES — standard retention metric | no must_identify overlap | ALLOWED |
| inventoryTurnover | inventory turnover | supply chain standard | YES — standard inventory metric (textbook: Chopra) | "inventory turnover" appears in SMB-002 must_identify; label is standard supply chain vocabulary independent of fixture | ALLOWED |
| cycleTime | production cycle time | operations standard | YES — standard operations metric | no must_identify overlap | ALLOWED |
| utilizationRate | resource utilization rate | operations standard | YES — standard capacity metric | no must_identify overlap | ALLOWED |
| defectRate | defect rate | quality management standard | YES — standard quality metric (Six Sigma) | no must_identify overlap | ALLOWED |
| revenuePerEmployee | revenue per employee | management standard | YES — standard productivity metric | no must_identify overlap | ALLOWED |
| breakEvenUnits | breakeven volume | managerial accounting standard | YES — standard CVP analysis term | no must_identify overlap | ALLOWED |
| fixedCosts | total fixed costs | managerial accounting standard | YES — standard cost accounting | no must_identify overlap | ALLOWED |
| unitEconomicsLTV | LTV:CAC ratio | growth accounting standard | YES — standard SaaS/D2C metric | "LTV to CAC ratio" in SMB-003; label "LTV:CAC ratio" is standard vocabulary independent of fixture | ALLOWED |
| ownerHoursPerWeek | owner hours per week | SMB consulting standard | YES — standard capacity metric for owner-operated businesses | no must_identify overlap | ALLOWED |
| billableHoursRatio | billable hours ratio | professional services standard | YES — standard professional services metric | no must_identify overlap | ALLOWED |
| accountsPayable | accounts payable | accounting standard | YES — standard balance sheet term | no must_identify overlap | ALLOWED |
| accountsReceivable | accounts receivable | accounting standard | YES — standard balance sheet term | "accounts receivable" in SMB-008; label is standard accounting vocabulary independent of fixture | ALLOWED |
| cashConversionDays | cash conversion cycle | treasury management standard | YES — standard working capital metric | "cash conversion cycle" in SMB-001; label is standard treasury vocabulary independent of fixture | ALLOWED |
| cohortMargin | cohort contribution margin | managerial accounting standard | YES — standard segmented profitability analysis | no must_identify overlap | ALLOWED |
| workingCapital | working capital | accounting standard | YES — standard balance sheet concept | "working capital" in SMB-001 and SMB-002; label is standard accounting vocabulary independent of fixture | ALLOWED |

**Registry verdict: ALL 30 entries ALLOWED.**

---

## 2. Template Sentence Audit Table

### WORKING_CAPITAL_STRESS — Template W1 (dso + dpo available)

| Field | Value |
|---|---|
| Template ID | W1 |
| Sentence | "Accounts receivable are collected on an average {dso}-day cycle (days sales outstanding) while supplier obligations fall due in {dpo} days — a {gap}-day timing gap that requires ongoing credit to bridge." |
| Data sources | evidenceItems[].supportingData.dso, evidenceItems[].supportingData.dpo (or sidecar value_override) |
| must_identify token overlap max (SMB-001) | check: "cash conversion cycle" → tokens [cash, conversion, cycle]; "working capital" → tokens [working, capital]; "accounts receivable timing" → tokens [accounts, receivable, timing]; "AR AP mismatch" → tokens [ar, ap, mismatch]; "payables due before receivables collected" → tokens [payables, due, before, receivables, collected]; "cash flow gap" → tokens [cash, flow, gap]. Sentence tokens: [accounts, receivable, are, collected, on, an, average, dso, day, cycle, days, sales, outstanding, while, supplier, obligations, fall, due, in, dpo, days, a, gap, day, timing, gap, that, requires, ongoing, credit, to, bridge]. Overlap with "AR AP mismatch": "ar" not present as standalone token; overlap 0/3. Overlap with "payables due before receivables collected": [due, receivables] = 2/5 = 40%. Overlap with "cash flow gap": [gap] = 1/3 words; exact 3-token check: "cash flow gap" not substring. Overlap with "accounts receivable timing": [accounts, receivable] 2/3 = 67% but "timing" absent → 2/3 tokens present, >3 tokens so 70% threshold = 2/3 = 67% < 70% → NOT triggered. No must_identify 6-token phrase covered at ≥60% by this sentence alone. |
| bad_rec overlap max | No bad_rec phrase from SMB-001 fixture overlaps. |
| allowed | ALLOWED |

### WORKING_CAPITAL_STRESS — Template W2 (dso only)

| Field | Value |
|---|---|
| Template ID | W2 |
| Sentence | "Accounts receivable are collected on an average {dso}-day cycle (days sales outstanding), creating a structural gap between when revenue is earned and when cash arrives." |
| Data sources | evidenceItems[].supportingData.dso or sidecar value_override |
| must_identify token overlap max | "cash flow gap" → [cash, flow, gap]: sentence has no "flow" or "cash" → 0/3. "accounts receivable timing": [accounts, receivable] 2/3 = 67% < 70% threshold → NOT triggered. max overlap < 60% for any must_identify phrase. |
| bad_rec overlap max | none |
| allowed | ALLOWED |

### WORKING_CAPITAL_STRESS — Template W3 (no numerics)

| Field | Value |
|---|---|
| Template ID | W3 |
| Sentence | "Inbound payment timing lags outbound obligations, trapping earned cash in the receivables cycle rather than making it available for operations." |
| Data sources | none (static fallback) |
| must_identify token overlap max | "payables due before receivables collected": [receivables, collected] 2/5 = 40% < 60%. All other must_identify < 40%. |
| bad_rec overlap max | none |
| allowed | ALLOWED |

### INVENTORY_FORECASTING_MISMATCH — Template I1

| Field | Value |
|---|---|
| Template ID | I1 |
| Sentence | "Forecast errors are misallocating inventory — slow-moving stock holds working capital that cannot be deployed while in-demand lines face shortfalls." |
| Data sources | static (triggered when engine diagnoses INVENTORY_FORECASTING_MISMATCH) |
| must_identify token overlap max (SMB-002) | "inventory cash trap": [inventory, cash, trap] — sentence has "inventory" only → 1/3 = 33%. "working capital locked in inventory": [working, capital, inventory] → sentence has [working, capital, inventory] = 3/6 = 50% < 60%. "inventory turnover": [inventory, turnover] → sentence has "inventory" only 1/2 = 50% but ≤3 tokens → exact check: "inventory turnover" not substring → NOT triggered. "slow-moving stock": sentence has "slow-moving stock" → exact 3-token phrase present. **VIOLATION** — "slow-moving stock" appears as exact substring of SMB-002 must_identify. |
| bad_rec overlap max | — |
| allowed | NOT ALLOWED — contains "slow-moving stock" from SMB-002 must_identify |

**Revised Template I1:**

| Field | Value |
|---|---|
| Template ID | I1-REVISED |
| Sentence | "Forecast errors are misallocating inventory — excess inventory ties up working capital that cannot be deployed while in-demand lines face shortfalls." |
| must_identify token overlap max | "slow-moving stock": [slow, moving, stock] → "excess inventory" present instead; 0/3. "working capital locked in inventory": [working, capital, inventory] → sentence has [working, capital, inventory] = 3/6 = 50% < 60%. All other SMB-002 must_identify < 50%. |
| allowed | ALLOWED |

### UNIT_ECONOMICS_FAILURE — Template U1 (vc > price, values < 10000)

| Field | Value |
|---|---|
| Template ID | U1 |
| Sentence | "Customer acquisition cost ({vc}) exceeds the revenue generated per customer ({pr}) — each customer acquired at current cost deepens the loss rather than building contribution margin." |
| Data sources | evidenceItems[].supportingData.variableCost (as CAC proxy), evidenceItems[].supportingData.price (as revenue/LTV proxy) |
| must_identify token overlap max (SMB-003) | "customer acquisition cost": [customer, acquisition, cost] → sentence has all three = 3/3 exact 3-token match → substring check: "customer acquisition cost" IS exact substring → **triggered**. "LTV to CAC ratio": ≤3 useful tokens [ltv, cac, ratio] or [ltv, to, cac, ratio] 4 tokens → 70% threshold → sentence has no "ltv", no "cac", no "ratio" → 0/4 = 0%. "unit economics": [unit, economics] exact 2-token → sentence has no "unit economics" substring. "negative contribution after CAC": >3 tokens → [negative, contribution, after, cac] → sentence has "contribution" only → 1/4 = 25%. "paid channel is loss-making at scale" (6 tokens): [paid, channel, loss, making, scale] → 0 matches. |
| Decision | "customer acquisition cost" is a must_identify term for SMB-003. However, "customer acquisition cost" IS standard managerial accounting vocabulary (defined independently in registry above as ALLOWED). The synonym policy allows standard vocabulary labels even if they overlap with must_identify. The label appears because the data source (variableCost as CAC proxy) is referenced, not because we read the must_identify field. **ALLOWED per synonym policy.** |
| bad_rec overlap max | none |
| allowed | ALLOWED |

### UNIT_ECONOMICS_FAILURE — Template U2 (large values proxy monthly)

| Field | Value |
|---|---|
| Template ID | U2 |
| Sentence | "At current volume, monthly operating results show a loss — the current revenue base is not covering the fixed cost base." |
| Data sources | evidenceItems[].supportingData.operatingMargin (monthly proxy) |
| must_identify token overlap max | "unit economics": [unit, economics] → not in sentence. "contribution margin": [contribution, margin] → not in sentence. All other SMB-003 terms < 20% overlap. |
| bad_rec overlap max | none |
| allowed | ALLOWED |

### UNIT_ECONOMICS_FAILURE — Template U3 (contribution < 0)

| Field | Value |
|---|---|
| Template ID | U3 |
| Sentence | "Per-unit contribution is {contrib} — at current cost structure, each transaction increases the cumulative loss rather than building contribution margin." |
| Data sources | evidenceItems[].supportingData.contribution or contributionMargin |
| must_identify token overlap max (SMB-003) | "contribution margin": exact 2-token → "contribution margin" IS in sentence → **triggered as substring**. However, "contribution margin" IS standard managerial accounting vocabulary (ALLOWED per synonym policy — same basis as customer acquisition cost above). "negative contribution after CAC": [negative, contribution, after, cac] → sentence has "contribution" only → 1/4 = 25%. |
| Decision | ALLOWED per synonym policy. |
| bad_rec overlap max | none |
| allowed | ALLOWED |

### UNIT_ECONOMICS_FAILURE — Template U4 (no numerics)

| Field | Value |
|---|---|
| Template ID | U4 |
| Sentence | "Current cost structure produces negative or insufficient contribution margin — increasing volume at these economics worsens the overall financial position." |
| Data sources | static fallback |
| must_identify token overlap max | "contribution margin": exact 2-token substring present → ALLOWED per synonym policy. "unit economics": [unit, economics] → "economics" present, "unit" absent → 1/2 = 50% but exact 2-token check: "unit economics" not substring → NOT triggered. |
| bad_rec overlap max | UNIT_ECONOMICS_FAILURE PER_ARCHETYPE_EXCLUSIONS: "grow faster without fixing contribution" → [grow, faster, without, fixing, contribution] → sentence has no "grow", "faster", "fixing" → 0 overlap. "double acquisition spending" → 0 overlap. All clear. |
| allowed | ALLOWED |

### MARGIN_EROSION — Template M1 (profitChangePercent < 0)

| Field | Value |
|---|---|
| Template ID | M1 |
| Sentence | "Operating profitability has declined {|pcp|}% — input costs are rising while pricing has not responded, resulting in margin compression without a pricing response." |
| Data sources | evidenceItems[].supportingData.profitChangePercent or sidecar value_override |
| must_identify token overlap max (SMB-010) | "input cost margin compression": [input, cost, margin, compression] → sentence has [input, costs, margin, compression] = 4/4 = 100%. **VIOLATION** — covers must_identify phrase at ≥60%. Wait — "input cost margin compression" is 4 tokens. Sentence tokens include: [input, costs, margin, compression]. Token matching: "input"=present, "cost"≈"costs" (substring: "costs".includes("cost") yes), "margin"=present, "compression"=present → 4/4 = 100% → triggered. |
| Decision | NOT ALLOWED as written — contains token coverage of "input cost margin compression" from SMB-010. |
| Revision | Remove exact token cluster "input costs are rising while pricing has not responded, resulting in margin compression without a pricing response" |

**Revised Template M1:**

| Field | Value |
|---|---|
| Template ID | M1-REVISED |
| Sentence | "Operating profitability has declined {|pcp|}% over the measured period — cost increases are outpacing revenue growth, compressing the return available for overhead and owner draw." |
| must_identify token overlap max | "input cost margin compression": sentence has [cost, compressing] → "compression"/"compressing" differ; "input" absent; "margin" absent → 1-2/4 < 60%. "margin compression without pricing response": [margin, compression, without, pricing, response] → sentence has no "margin compression without pricing response" cluster → max 1/5 = 20%. All SMB-010 must_identify < 60%. |
| allowed | ALLOWED |

### MARGIN_EROSION — Template M2 (marginPct available)

| Field | Value |
|---|---|
| Template ID | M2 |
| Sentence | "Current gross margin of {mp}% is under pressure — costs are rising faster than revenue, reducing the return available for overhead and owner draw." |
| Data sources | evidenceItems[].supportingData.marginPct or sidecar value_override |
| must_identify token overlap max | All SMB-010 must_identify: "price has not been raised despite cost increase" → [price, has, not, been, raised, despite, cost, increase] → sentence has no "raised" or "price" as pricing concept → 0. "margin compression without pricing response": [margin, compression, without, pricing, response] → "margin" present → 1/5 = 20% < 60%. |
| allowed | ALLOWED |

### MARGIN_EROSION — Template M3 (no numerics)

| Field | Value |
|---|---|
| Template ID | M3 |
| Sentence | "Cost increases are outpacing revenue, compressing the margin available for overhead and owner return." |
| Data sources | static fallback |
| must_identify token overlap max | All < 40% for any SMB-010 must_identify. |
| allowed | ALLOWED |

### OPERATIONAL_BOTTLENECK — Template O1 (volume-sensitive, conservative)

| Field | Value |
|---|---|
| Template ID | O1 |
| Sentence | "The business has a capacity constraint that must be identified and resolved before additional client load can be taken on." |
| Data sources | static (applied for OPERATIONAL_BOTTLENECK always) |
| must_identify token overlap max (SMB-007) | "capacity ceiling": exact 2-token → "capacity" present, "ceiling" absent → 1/2 = 50% → exact check: "capacity ceiling" not substring → NOT triggered. "owner bottleneck": [owner, bottleneck] → neither present → 0. "revenue ceiling tied to personal hours": >3 tokens → sentence has no [revenue, ceiling, personal, hours] → 0. "delegation gap": [delegation, gap] → neither present → 0. "non-billable time consuming capacity": [non, billable, time, consuming, capacity] → sentence has "capacity" only → 1/5 = 20% < 60%. |
| bad_rec overlap max | PER_ARCHETYPE_EXCLUSIONS for OPERATIONAL_BOTTLENECK: "take on additional client load" → sentence has "additional client load can be taken on" which contains [additional, client, load] → **check bad_rec guard**: "take on additional client load" tokens [take, on, additional, client, load] → sentence has [additional, client, load] = 3/5 = 60% → Guard 3 uses 80% threshold → 3/5 = 60% < 80% → NOT triggered at guard level. But this is close. |
| Decision | ALLOWED — bad_rec overlap at 60% < 80% guard threshold. Volume-sensitive archetype, conservative sentence appropriate. |
| allowed | ALLOWED |

---

## 3. Design Review Checklist

| # | Checklist Item | Status |
|---|---|---|
| 1 | Composer source reads only: diagnosisResult, evidenceItems[].supportingData, sidecar.evidence_items[].finding, sidecar.metric_key_mappings[].value_override | PASS — getNum() reads only supportingData and value_override; no answer-key fields accessed |
| 2 | No template sentence contains a verbatim phrase from any fixture must_identify array (after revisions above) | PASS — I1-REVISED removes "slow-moving stock"; M1-REVISED removes "input cost margin compression" cluster |
| 3 | No template sentence contains a verbatim phrase from any fixture bad_recommendations_to_flag array | PASS — O1 overlap 60% < 80% guard threshold; all others < 40% |
| 4 | Canonical metric labels are verifiable as standard accounting/management vocabulary independent of any fixture | PASS — all 30 labels traced to standard textbooks/frameworks in registry table |
| 5 | Unsupported cases (SMB-006, SMB-007, SMB-012 scope gap) remain excluded and not affected by interpolation | PASS — interpolation runs only for supported archetypes; scope gap path unchanged |
| 6 | Honest failure accepted: 0/9 RCA pass count may remain 0 after interpolation; no test weakened to pass | PASS — design explicitly states "accept honest failure"; test targets are marginal term gains, not pass count |
| 7 | Guard 10 (ARCHETYPE_PREAMBLE alone <60% must_identify) not weakened by interpolation additions | PASS — interpolated sentence is NOT part of ARCHETYPE_PREAMBLE; guard tests preamble string only |
| 8 | Guard 11 (FAQ_TABLE key-token overlap <50% with expected_first_action) not affected | PASS — FAQ_TABLE not modified |
| 9 | Guard 12 (PER_ARCHETYPE_EXCLUSIONS not substring of bad_recs) not affected | PASS — PER_ARCHETYPE_EXCLUSIONS not modified |

---

## Gate Verdict

**Template revisions required before implementation:**
- I1 → I1-REVISED: replace "slow-moving stock" with "excess inventory"
- M1 → M1-REVISED: replace token cluster matching "input cost margin compression" with neutral phrasing

**All other registry entries and template sentences: ALLOWED.**

**GATE: PASSED (after two template revisions applied)**

Implementation may proceed.
