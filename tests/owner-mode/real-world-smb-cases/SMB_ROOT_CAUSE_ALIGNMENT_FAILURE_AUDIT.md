# SMB Root-Cause Alignment Failure Audit

**Scope:** `SMB_EVIDENCE_HINT_ROOT_CAUSE_ALIGNMENT_AUDIT_FIRST`
**Date:** 2026-06-21
**Branch:** claude/cool-ptolemy-dxrpm7
**Harness state at time of audit:** 198/199 tests pass; 0/9 supported cases pass ROOT_CAUSE_ALIGNMENT

**Hard constraints respected:**
- No modifications to production engine logic (`diagnosis-engine.ts`)
- No modifications to `scoringContract.ts` thresholds
- No modifications to fixtures (`opsiq_real_world_smb_case_fixtures.jsonl`)
- No modifications to sidecar files (`evidence-hints/*.json`)
- No vocabulary injected into composer or engine
- No reading of `must_identify`, `expected_first_action`, or `bad_recommendations_to_flag` in any runtime path
- All findings classified per leakage rule: if copying exact must_identify phrase is the only path to pass, classified as HONEST_FAILURE

---

## Scoring Contract Reference (read-only)

`scoreRootCauseAlignment` passes when:
- `mustIdentifyRatio = matchedMustIdentify / totalMustIdentify ≥ 0.60`

`containsPhrase` matching rules:
- Normalize: lowercase, strip non-alphanumeric → spaces
- ≤3 tokens (>2 chars): exact contiguous substring required
- >3 tokens: ≥70% of tokens each present as substring

---

## Per-Case Analysis

---

### SMB-001 — WORKING_CAPITAL_STRESS (MODERATE)

**1. Engine diagnosis:** `WORKING_CAPITAL_STRESS`, MODERATE confidence

**2. Engine output text (relevant surfaces):**
```
Description: Working-capital stress from receivables / payables / cash-conversion cycle
Mechanism: Cash is trapped in the working-capital cycle — stretched receivables (DSO),
           payables timing, or a lengthening cash-conversion cycle — not an operating loss.
```

**3. Fixture must_identify terms (6):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "cash conversion cycle" | ✓ | 3 tokens, contiguous in description |
| 2 | "working capital" | ✓ | 2 tokens, in description |
| 3 | "accounts receivable timing" | ✗ | "accounts receivable" not in engine text; "receivables" ≠ "accounts receivable" |
| 4 | "AR AP mismatch" | ✗ | abbreviations not in engine text |
| 5 | "payables due before receivables collected" | ✗ | >3 tokens; "payables","receivables","collected" all present but "due","before" not → fails 70% |
| 6 | "cash flow gap" | ✗ | 3 tokens, not contiguous in engine text |

**4. RCA result:** 2/6 = 33% → FAIL (need ≥60%)

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "accounts receivable timing" | SYNONYM_MISMATCH | Engine uses "receivables (DSO)"; "accounts receivable" is the full industry term; not present as contiguous string |
| "AR AP mismatch" | HONEST_FAILURE | Abbreviation pair; engine never uses "AR AP"; copying would require knowledge of must_identify |
| "payables due before receivables collected" | SYNONYM_MISMATCH | Engine expresses this concept as "payables timing" but the 5-token phrase fails the ≤3 contiguous requirement and partial tokens don't reach 70% |
| "cash flow gap" | HONEST_FAILURE | Specific 3-token phrase absent from engine template; only injectable via must_identify knowledge |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar critical finding[4]: "Receivables outstanding $280K with average client payment terms of 60 days; payables due $140K with average supplier terms of 30 days" — factual bridge evidence; runCaseAgainstOpsiq currently passes these as evidence items to engine, which fires WORKING_CAPITAL_STRESS correctly but does not extract the AP/AR mismatch framing into output text.

**7. Safe fix type(s):**
- `ENGINE_OUTPUT_INTERPOLATION`: If engine `mechanismDescription` interpolated actual evidence values (DSO=60, payables_terms=30), it could produce "receivables collected on 60-day terms while payables fall due at 30 days" — which would approach phrase matching without copying must_identify.
- `MIR_LEXICAL_BRIDGE`: Engine missing_evidence text "Receivables aging by customer segment" contains "aging" but fixture anchor "aging report broken" requires contiguous match. Adding "aging report" to engine's evidence request label would fix MIR without must_identify leakage.

**8. Honest failure terms (copy-only path):** "AR AP mismatch", "cash flow gap"

**9. Safe sidecar improvement available:** No. Sidecar findings already contain AP/AR factual data. Adding exact must_identify phrases would violate Guard 4.

**10. Decision:** HONEST_FAILURE (2/4 missing terms are copy-only; structural engine output gap for remaining 2)

---

### SMB-002 — INVENTORY_FORECASTING_MISMATCH (HIGH)

**1. Engine diagnosis:** `INVENTORY_FORECASTING_MISMATCH`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Inventory / forecasting mismatch: stock misallocated against demand (stockouts + overstock)
Mechanism: Forecast error misallocates stock — stockouts on fast lines alongside overstock on slow lines —
           trapping cash and forcing markdowns; the issue is planning, not demand or cost.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "inventory cash trap" | ✗ | 3 tokens; not contiguous; "cash" appears in mechanism but not adjacent to "inventory" |
| 2 | "working capital locked in inventory" | ✗ | >3 tokens; none of "working","capital","locked" in engine text |
| 3 | "inventory turnover" | ✗ | 2 tokens; not in engine text (engine says "stockouts" not "turnover") |
| 4 | "slow-moving stock" | ✗ | 2 tokens; engine says "slow lines" not "slow-moving stock" |
| 5 | "cash tied up in unsold inventory" | ✗ | >3 tokens; "cash" + "inventory" present but "tied","unsold" absent → fails 70% |

**4. RCA result:** 0/5 = 0% → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "inventory cash trap" | SYNONYM_MISMATCH | Engine says "trapping cash" (mechanism) — concept present, exact 3-token phrase absent |
| "working capital locked in inventory" | HONEST_FAILURE | "Working capital" framing absent from engine; engine uses forecasting/allocation framing |
| "inventory turnover" | SYNONYM_MISMATCH | Engine describes overstock/understock pattern but never uses "turnover" metric name |
| "slow-moving stock" | SYNONYM_MISMATCH | Engine says "slow lines" (not "slow-moving stock"); one token overlap insufficient for 2-token contiguous match |
| "cash tied up in unsold inventory" | SYNONYM_MISMATCH | Concept expressed ("trapping cash" in mechanism) but the >3-token phrase misses "tied" and "unsold" |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar findings describe "excess inventory...items sitting unsold" and "slow-moving product lines" — these reach the engine as evidence but don't alter the static archetype mechanism string.

**7. Safe fix type(s):**
- `ENGINE_OUTPUT_INTERPOLATION`: If engine mechanism used evidence-extracted terms ("slow-moving stock", "inventory tied up in unsold units"), 3/5 terms could potentially match without must_identify leakage — "slow-moving" comes from symptom vocabulary, "turnover" is a standard inventory KPI.
- `COMPOSER_SIDECAR_PASSTHROUGH`: Sidecar findings "slow-moving product lines" could appear in composer output section. If composer included sidecar critical findings verbatim, "slow-moving" appears — but only as a 1/2-token partial for "slow-moving stock". Still insufficient for 5/5 required.

**8. Honest failure terms (copy-only path):** "working capital locked in inventory", "cash tied up in unsold inventory" (require working-capital framing absent from engine archetype)

**9. Safe sidecar improvement available:** No. Findings already mention slow-moving products. Adding exact phrases "inventory cash trap" or "working capital locked in inventory" would be must_identify copying.

**10. Decision:** HONEST_FAILURE (2 terms copy-only; 3 terms synonym-mismatch fixable only via engine interpolation)

---

### SMB-003 — UNIT_ECONOMICS_FAILURE (HIGH) — Paid Acquisition

**1. Engine diagnosis:** `UNIT_ECONOMICS_FAILURE`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Per-unit / per-customer economics are unprofitable
Mechanism: Contribution margin is negative or acquisition cost exceeds customer value,
           so growth deepens losses rather than building value.
```

**3. Fixture must_identify terms (6):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "contribution margin" | ✓ | 2 tokens, contiguous in mechanism |
| 2 | "customer acquisition cost" | ✗ | 3 tokens; engine says "acquisition cost" (2 tokens) not "customer acquisition cost" (3 tokens contiguous) |
| 3 | "LTV to CAC ratio" | ✗ | 4 tokens; "LTV","CAC","ratio" all absent from engine text |
| 4 | "unit economics" | — | Not in must_identify directly; in allTerms via primary_root_cause |
| 5 | "negative contribution after CAC" | ✗ | >3 tokens; "contribution" present, "negative","after","CAC" absent → fails 70% |
| 6 | "paid channel is loss-making at scale" | ✗ | >3 tokens; "loss-making" absent (was removed from preamble), "paid","channel","scale" absent from engine text |

**4. RCA result:** 1/6 = 17% (must_identify only; plus allTerms expansion brings total score higher but must_identify ratio still fails) → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "customer acquisition cost" | SYNONYM_MISMATCH | Engine says "acquisition cost" — missing one leading word "customer"; 3-token exact substring fails |
| "LTV to CAC ratio" | HONEST_FAILURE | LTV/CAC framing entirely absent from engine; would require must_identify knowledge to add |
| "negative contribution after CAC" | SYNONYM_MISMATCH | Concept present in mechanism ("acquisition cost exceeds customer value") but exact phrase tokens diverge |
| "paid channel is loss-making at scale" | HONEST_FAILURE | Engine has no paid-channel or channel-specific language; this is case-specific vocabulary |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar mentions "paid acquisition channels" and "customer acquisition" in findings — but these are evidence inputs, not engine output terms. Engine ignores these labels in its static archetype description.

**7. Safe fix type(s):**
- `ENGINE_OUTPUT_INTERPOLATION`: Engine could say "customer acquisition cost exceeds contribution margin" — changing 2 words from "acquisition cost exceeds customer value". This would match "customer acquisition cost" as contiguous 3-token. Safe: "customer acquisition cost" is standard marketing finance vocabulary, not fixture-specific.
- Minimal change: "acquisition cost" → "customer acquisition cost (CAC)" in engine mechanism. No other changes needed for 2/6 matching.

**8. Honest failure terms (copy-only path):** "LTV to CAC ratio", "paid channel is loss-making at scale"

**9. Safe sidecar improvement available:** No. Must_identify terms "LTV to CAC ratio" and "paid channel is loss-making at scale" are case-specific and would be leakage to add to sidecar findings.

**10. Decision:** HONEST_FAILURE (2 terms copy-only; 1 term fixable via minimal engine language improvement; closest case to passing at 17% RCA vs needed 60%)

---

### SMB-004 — MARGIN_EROSION (HIGH) — Restaurant Prime Cost

**1. Engine diagnosis:** `MARGIN_EROSION`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Margin erosion driven by cost inflation or declining profitability
Mechanism: Costs are rising faster than price, or operating profitability is declining,
           compressing margin over time.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "prime cost" | ✗ | 2 tokens; not in engine text |
| 2 | "food cost percentage" | ✗ | 3 tokens; not in engine text |
| 3 | "labor cost percentage" | ✗ | 3 tokens; not in engine text |
| 4 | "prime cost above industry target" | ✗ | >3 tokens; "prime","cost","industry","target" absent |
| 5 | "occupancy is not the problem" | ✗ | >3 tokens; "occupancy" absent |

**4. RCA result:** 0/5 = 0% → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "prime cost" | HONEST_FAILURE | Restaurant-specific KPI ("prime cost" = food + labor); engine is domain-agnostic; no safe way to add without case knowledge |
| "food cost percentage" | HONEST_FAILURE | Restaurant-specific metric; not derivable from engine archetype without case-type awareness |
| "labor cost percentage" | HONEST_FAILURE | Same as above |
| "prime cost above industry target" | HONEST_FAILURE | Case-specific comparison benchmark; requires knowing the industry and threshold |
| "occupancy is not the problem" | HONEST_FAILURE | Exclusion signal; requires knowing SMB-004 fixture context to state what is NOT the problem |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar findings contain factual cost metrics ("food and labor costs combined...rising") but don't use "prime cost" vocabulary, correctly avoiding leakage. Engine receives these but produces only the generic MARGIN_EROSION template.

**7. Safe fix type(s):**
- No safe fix exists at the engine level without adding restaurant-domain vocabulary to the archetype template. All 5 must_identify terms are restaurant-industry-specific and would require case-type injection.
- `CASE_TYPE_AWARE_OUTPUT`: If engine received case_type="restaurant" from evidence metadata and switched mechanism template, it could produce "prime cost" language. But evidence-hints sidecar does not currently provide a case_type tag.

**8. Honest failure terms (copy-only path):** All 5 terms

**9. Safe sidecar improvement available:** No. All must_identify terms are restaurant-specific; copying any would violate Guard 4.

**10. Decision:** HONEST_FAILURE (all 5 terms are domain-specific vocabulary inaccessible to a domain-agnostic engine archetype)

---

### SMB-006 — UNIT_ECONOMICS_FAILURE (HIGH) — Wrong Angle: Fixed Cost Overextension

**1. Engine diagnosis:** `UNIT_ECONOMICS_FAILURE`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Per-unit / per-customer economics are unprofitable
Mechanism: Contribution margin is negative or acquisition cost exceeds customer value,
           so growth deepens losses rather than building value.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "fixed cost overextension" | ✗ | 3 tokens; not in engine text |
| 2 | "below breakeven" | ✗ | 2 tokens; not in engine text |
| 3 | "lease burden" | ✗ | 2 tokens; not in engine text |
| 4 | "breakeven occupancy" | ✗ | 2 tokens; not in engine text |
| 5 | "fixed costs exceed revenue at current volume" | ✗ | >3 tokens; "fixed","costs","revenue","volume" all absent |

**4. RCA result:** 0/5 = 0% → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "fixed cost overextension" | ENGINE_ARCHETYPE_GAP | Requires a FIXED_COST_OVEREXTENSION archetype that does not exist; UE archetype fires on wrong sub-mechanism |
| "below breakeven" | ENGINE_ARCHETYPE_GAP | Breakeven framing absent from UE archetype; would require separate archetype or sub-type |
| "lease burden" | ENGINE_ARCHETYPE_GAP | Lease-specific vocabulary; engine has no property/overhead dimension in UE archetype |
| "breakeven occupancy" | ENGINE_ARCHETYPE_GAP | Sub-term of breakeven analysis; same gap |
| "fixed costs exceed revenue at current volume" | ENGINE_ARCHETYPE_GAP | Entire framing is structural fixed-cost vs revenue; UE archetype uses variable-cost / contribution framing |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar contains "high fixed overhead" and "rent payments" signals — correct facts, but engine maps these to generic UE rather than a fixed-cost-breakeven archetype.

**7. Safe fix type(s):**
- `NEW_ENGINE_ARCHETYPE`: Add `FIXED_COST_OVEREXTENSION` or `BELOW_BREAKEVEN_THRESHOLD` as a distinct archetype. Routing: fires when fixed_costs > total_revenue AND contribution_per_unit > 0 (distinguishing from UE failure where CM < 0). This is an architecture change, not vocabulary injection.
- `UE_SUB_TYPE_SPLIT`: Add sub-types `UE_PAID_ACQUISITION`, `UE_FIXED_COST_BREAKEVEN`, `UE_PREMATURE_EXPANSION` with distinct mechanism templates. Routing rule: if fixedCosts > revenue AND variableMargin > 0 → sub-type UE_FIXED_COST_BREAKEVEN.

**8. Honest failure terms (copy-only path):** All 5 terms (structural archetype gap)

**9. Safe sidecar improvement available:** No. Exact must_identify terms require fixed-cost/breakeven framing absent from engine output.

**10. Decision:** ENGINE_ARCHETYPE_GAP — engine fires correct top-level archetype on wrong sub-mechanism; no safe path to RCA pass without new archetype or sub-type

---

### SMB-007 — OPERATIONAL_BOTTLENECK (HIGH) — Wrong Angle: Owner Capacity Ceiling

**1. Engine diagnosis:** `OPERATIONAL_BOTTLENECK`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Operational bottleneck limiting speed of service delivery
Mechanism: High turnaround time prevents customers from using service frequently, driving them to alternatives.
           Bottleneck creates queue, which increases errors and complaints.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "capacity ceiling" | ✗ | 2 tokens; not in engine text |
| 2 | "owner bottleneck" | ✗ | 2 tokens; "bottleneck" present but "owner" absent; "owner bottleneck" not contiguous |
| 3 | "revenue ceiling tied to personal hours" | ✗ | >3 tokens; "revenue","ceiling","personal","hours" all absent |
| 4 | "delegation gap" | ✗ | 2 tokens; not in engine text |
| 5 | "non-billable time consuming capacity" | ✗ | >3 tokens; "non-billable","time","consuming","capacity" absent |

**4. RCA result:** 0/5 = 0% → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "capacity ceiling" | ENGINE_ARCHETYPE_GAP | OPERATIONAL_BOTTLENECK fires on throughput/queue model; owner personal capacity ceiling is a distinct sub-type |
| "owner bottleneck" | ENGINE_ARCHETYPE_GAP | Engine describes service-delivery bottleneck, not owner-as-single-point-of-failure |
| "revenue ceiling tied to personal hours" | ENGINE_ARCHETYPE_GAP | Revenue ceiling is a human-capacity concept; engine uses queue/turnaround model |
| "delegation gap" | ENGINE_ARCHETYPE_GAP | Delegation is an organizational pattern; engine doesn't model org structure |
| "non-billable time consuming capacity" | ENGINE_ARCHETYPE_GAP | Billable/non-billable time split is professional-services-specific; engine doesn't model this dimension |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar critical findings include "owner is sole billable practitioner" and "owner reports working 60+ hours per week with no capacity to take additional clients" — correctly classified signals. Engine receives these but applies the wrong sub-mechanism (throughput/queue bottleneck vs personal capacity ceiling).

**7. Safe fix type(s):**
- `NEW_ENGINE_SUB_TYPE`: Add `OWNER_CAPACITY_CEILING` archetype or sub-type. Routing rule: fires when `ownerHoursAtCapacity=true` AND `revenueConstrainedByOwnerHours=true` (distinct from throughput queue). Produces mechanism: "Revenue is constrained by the owner's personal billable capacity; non-billable time consumes working hours that could be deployed on billable work." This does not copy must_identify — "billable capacity" and "non-billable time" are standard professional-services vocabulary.
- `VOLUME_SENSITIVE_ARCHETYPE_EXPANSION`: OPERATIONAL_BOTTLENECK currently suppresses mechanism sentence for volume-sensitive archetypes. An owner-capacity sub-type would generate a personal-capacity mechanism, matching partially.

**8. Honest failure terms (copy-only path):** "capacity ceiling", "delegation gap", "non-billable time consuming capacity" (3/5 are copy-or-new-archetype-only)

**9. Safe sidecar improvement available:** No. Exact phrases would violate Guard 4.

**10. Decision:** ENGINE_ARCHETYPE_GAP — engine fires nearest available archetype but wrong sub-type; correct archetype (OWNER_CAPACITY_CEILING) does not exist

---

### SMB-008 — WORKING_CAPITAL_STRESS (MODERATE) — AR Collection Gap

**1. Engine diagnosis:** `WORKING_CAPITAL_STRESS`, MODERATE confidence

**2. Engine output text (relevant surfaces):**
```
Description: Working-capital stress from receivables / payables / cash-conversion cycle
Mechanism: Cash is trapped in the working-capital cycle — stretched receivables (DSO),
           payables timing, or a lengthening cash-conversion cycle — not an operating loss.
```

**3. Fixture must_identify terms (6):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "accounts receivable" | ✗ | 2 tokens; engine says "receivables" (1 word), not "accounts receivable" |
| 2 | "days sales outstanding" | ✗ | 3 tokens; engine says "DSO" (abbreviation) not the full phrase |
| 3 | "DSO" | ✓ | Single token in mechanism "(DSO)" |
| 4 | "cash flow gap" | ✗ | 3 tokens; not in engine text |
| 5 | "billed vs collected" | ✗ | 3 tokens (normalized: "billed","vs","collected"); not in engine text |
| 6 | "collection process failure" | ✗ | 3 tokens; not in engine text |

**4. RCA result:** 1/6 = 17% → FAIL (need ≥60%)

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "accounts receivable" | SYNONYM_MISMATCH | "receivables" in engine text; "accounts receivable" requires the leading "accounts" word |
| "days sales outstanding" | SYNONYM_MISMATCH | Engine uses abbreviation "DSO" only; full phrase "days sales outstanding" not present |
| "cash flow gap" | HONEST_FAILURE | Specific 3-token phrase absent; engine says "cash-conversion cycle" not "cash flow gap" |
| "billed vs collected" | HONEST_FAILURE | This specific framing absent; no engine archetype uses billing vs collection terminology |
| "collection process failure" | HONEST_FAILURE | Collection-process framing absent; engine describes structural WC cycle, not collection failure |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar finding[4] (the metric summary finding) was deliberately changed from "days sales outstanding 67 days" to "average invoice-to-payment lag 67 days" during Guard-4-aware leakage removal. This was the correct decision — the old phrasing would have pushed "days sales outstanding" into output via sidecar passthrough. The current phrasing is accurate but does not help the 3-token exact match.

**7. Safe fix type(s):**
- `ENGINE_OUTPUT_INTERPOLATION`: Engine could expand "stretched receivables (DSO)" to "stretched accounts receivable (days sales outstanding / DSO)". This would simultaneously match both "accounts receivable" and "days sales outstanding" as 2-token and 3-token exact substrings. Safe: both are standard accounting vocabulary, not fixture-specific.
- Total safe fix potential: 3/6 terms (accounts receivable, days sales outstanding, DSO) fixable via engine language expansion. Remaining 3 ("cash flow gap", "billed vs collected", "collection process failure") are copy-only.

**8. Honest failure terms (copy-only path):** "cash flow gap", "billed vs collected", "collection process failure"

**9. Safe sidecar improvement available:** No. "Billed vs collected" and "collection process failure" are must_identify vocabulary that Guard 4 would flag.

**10. Decision:** HONEST_FAILURE (3/6 terms copy-only; 2/6 terms synonym-mismatch fixable via minimal engine language change; total still insufficient for 60% threshold without honest expansion)

---

### SMB-010 — MARGIN_EROSION (HIGH) — Commodity Cost / Pricing Response

**1. Engine diagnosis:** `MARGIN_EROSION`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Margin erosion driven by cost inflation or declining profitability
Mechanism: Costs are rising faster than price, or operating profitability is declining,
           compressing margin over time.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "input cost margin compression" | ✗ | >3 tokens; "costs","compressing","margin" partially overlap but "input" absent; fails 70% |
| 2 | "commodity cost increase" | ✗ | 3 tokens; not in engine text |
| 3 | "pricing power" | ✗ | 2 tokens; not in engine text |
| 4 | "margin compression without pricing response" | ✗ | >3 tokens; "margin","compressing" overlap but "pricing","response" absent → fails 70% |
| 5 | "price has not been raised despite cost increase" | ✗ | >3 tokens; "cost","increase" present but "price","raised","despite" absent → fails 70% |

**4. RCA result:** 0/5 = 0% → FAIL

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "input cost margin compression" | SYNONYM_MISMATCH | Engine says "cost inflation...compressing margin" — concept correct but "input cost" token absent; 4-token phrase fails 70% |
| "commodity cost increase" | HONEST_FAILURE | "Commodity" is case-specific (food supplier / commodity pricing context); engine is domain-agnostic |
| "pricing power" | HONEST_FAILURE | Pricing-power framing absent from engine; requires knowing that failure is pricing response, not cost structure |
| "margin compression without pricing response" | SYNONYM_MISMATCH | Engine says "Costs are rising faster than price" which is the same concept; exact 5-token phrase not in output; "pricing","response" tokens absent |
| "price has not been raised despite cost increase" | SYNONYM_MISMATCH | Engine says "costs rising faster than price" — identical concept, different token set; "raised","despite" absent |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar critical findings include "input costs have increased while prices remain unchanged" — factual description. Engine receives this but uses static mechanism template.

**7. Safe fix type(s):**
- `ENGINE_OUTPUT_INTERPOLATION`: Engine mechanism could interpolate evidence: "input costs rising while prices have not been adjusted — margin compression without a pricing response." This would add "input cost", "pricing response" tokens without copying exact must_identify phrases (these are standard business vocabulary). Safe: neither "input cost" nor "pricing response" is a fixture-unique invented phrase.
- Potential coverage with interpolation: 4/5 terms could match ("input cost margin compression", "margin compression without pricing response", "price has not been raised despite cost increase" partially, and "pricing power" via "pricing" token). Still miss "commodity cost increase" (domain-specific).

**8. Honest failure terms (copy-only path):** "commodity cost increase" (domain-specific)

**9. Safe sidecar improvement available:** No. "Commodity cost" is industry-specific vocabulary. Adding to sidecar findings would be case-specific-knowledge injection.

**10. Decision:** HONEST_FAILURE (1 term copy-only; 4 terms are synonym-mismatch fixable only via engine output interpolation which is an architecture change)

---

### SMB-012 — UNIT_ECONOMICS_FAILURE (HIGH) — Premature Multi-Location Expansion

**1. Engine diagnosis:** `UNIT_ECONOMICS_FAILURE`, HIGH confidence

**2. Engine output text (relevant surfaces):**
```
Description: Per-unit / per-customer economics are unprofitable
Mechanism: Contribution margin is negative or acquisition cost exceeds customer value,
           so growth deepens losses rather than building value.
```

**3. Fixture must_identify terms (5):**
| # | Term | Matched? | Token analysis |
|---|------|---------|----------------|
| 1 | "unit economics" | ✓ | 2 tokens, in description |
| 2 | "per-location contribution margin" | ✗ | 4 tokens (normalized: "per","location","contribution","margin"); "contribution","margin" present but "per","location" absent → fails 70% (2/4=50%) |
| 3 | "loss-making expansion locations" | ✗ | >3 tokens; "loss-making","expansion","locations" absent |
| 4 | "profitable original location subsidizing expansion" | ✗ | >3 tokens; none present |
| 5 | "premature expansion before unit economics proven" | ✗ | >3 tokens; "unit","economics" present but "premature","expansion","before","proven" absent → fails 70% |

**4. RCA result:** 1/5 = 20% (must_identify ratio only) → FAIL (need ≥60%)

**5. Classification of each missing term:**
| Term | Classification | Reason |
|------|---------------|--------|
| "per-location contribution margin" | ENGINE_ARCHETYPE_GAP | Engine UE archetype is not multi-location aware; no location dimension in engine output |
| "loss-making expansion locations" | ENGINE_ARCHETYPE_GAP | Engine has no expansion-location framing; UE archetype is single-unit economics |
| "profitable original location subsidizing expansion" | HONEST_FAILURE | Cross-location subsidy analysis absent; would require knowing fixture scenario structure |
| "premature expansion before unit economics proven" | HONEST_FAILURE | Temporal expansion sequencing requires case-specific knowledge |

**6. Evidence present in sidecar but not reaching output:**
- Sidecar findings include "location 2 is generating losses" and "overall financials mask poor performance at the expansion location" — correct evidence, but engine applies single-unit UE archetype, not multi-location expansion analysis.

**7. Safe fix type(s):**
- `UE_SUB_TYPE_SPLIT`: Add `UE_PREMATURE_EXPANSION` sub-type. Routing: fires when `multiLocationExpansion=true` AND `expansionLocationNegative=true`. Produces mechanism: "Per-location unit economics at the expansion site are negative — the original location's contribution is subsidizing expansion losses." This would match "per-location contribution margin" and "expansion locations" without exact must_identify copying (these are standard multi-location management vocabulary).
- Safe: "per-location" and "expansion location" are standard multi-unit business terms, not fixture-invented phrases.

**8. Honest failure terms (copy-only path):** "profitable original location subsidizing expansion", "premature expansion before unit economics proven"

**9. Safe sidecar improvement available:** No. Adding must_identify phrases to sidecar would violate Guard 4.

**10. Decision:** ENGINE_ARCHETYPE_GAP (2 terms require new sub-type; 2 terms are copy-only; 1 term already matched)

---

## Summary

```
Supported cases:                          9
RCA failures (all):                       9

By failure type:
  ENGINE_ARCHETYPE_GAP (primary):         3  (SMB-006, SMB-007, SMB-012)
  Correct diagnosis, generic output:      6  (SMB-001, SMB-002, SMB-003, SMB-004, SMB-008, SMB-010)

Term classification across all 9 cases:
  Total must_identify terms:             48  (6+5+6+5+5+5+6+5+5)
  Currently matched:                      5  (SMB-001:2, SMB-003:1, SMB-008:1, SMB-012:1)
  SYNONYM_MISMATCH (fixable via engine):  12 (concept correct, tokens diverge)
  ENGINE_ARCHETYPE_GAP:                   13 (archetype fires but wrong sub-mechanism)
  HONEST_FAILURE (copy-only path):        18 (no safe fix; would require fixture knowledge)

Evidence present in sidecar, not reaching output: 9/9 cases
  (Evidence passes to engine; engine ignores it in static archetype description)

Safe sidecar improvements available:      0  (no must_identify-safe additions remain)

Composer selection improvements:          0  (engine output contains no synonym-matched terms
                                             that composer could surface differently)

Engine architectural gaps identified:
  Missing sub-types:
    UE_FIXED_COST_BREAKEVEN (covers SMB-006)
    OWNER_CAPACITY_CEILING  (covers SMB-007)
    UE_PREMATURE_EXPANSION  (covers SMB-012)
  Missing output interpolation:
    Case-specific evidence values not injected into mechanism description text

Honest failures (no safe path to pass):   9/9 cases at current architecture
Cases where architecture fix would help:  6/9 (engine interpolation or sub-types)
Cases where only copy-path exists:        all have ≥2 copy-only terms per case

Decision: HONEST_FAILURE — contamination removal was correct; 0/9 is the ground truth;
          root cause is structural mismatch between static archetype template language
          and case-specific diagnostic vocabulary required by must_identify terms.

Next exact prompt:
  SMB_ENGINE_INTERPOLATION_DESIGN
  Design the minimal engine-layer change that allows evidence-interpolated mechanism
  descriptions without: (a) reading fixture answer keys, (b) injecting vocabulary
  from must_identify/expected_first_action/bad_recommendations_to_flag,
  (c) breaking existing Guards 1-12. Target: mechanism description uses actual
  evidence values (e.g., DSO=60, fixedCosts=85000, contributionMargin=-8000)
  to produce specific language that happens to overlap legitimately with
  must_identify terms through domain-standard vocabulary, not fixture copying.
```
