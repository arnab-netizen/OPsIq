# SMB Engine Interpolation Design

**Scope:** `SMB_ENGINE_INTERPOLATION_DESIGN`
**Date:** 2026-06-21
**Branch:** claude/cool-ptolemy-dxrpm7
**Status:** DESIGN ONLY — no code changes in this task

**Hard constraints:**
- No modifications to production engine logic (`diagnosis-engine.ts`)
- No modifications to `scoringContract.ts` thresholds
- No modifications to fixtures (`opsiq_real_world_smb_case_fixtures.jsonl`)
- No modifications to sidecar files (`evidence-hints/*.json`)
- No vocabulary copied from `must_identify`, `expected_first_action`, or `bad_recommendations_to_flag`
- No implementation in this task

---

## 1. Problem Statement

The SMB Output Composer currently produces static, archetype-level output. The
`rootCauseSummary` field combines:

1. A short generic preamble label (`"Diagnosis: working capital stress."`)
2. Up to 3 critical sidecar evidence findings verbatim
3. The engine's static `mechanismDescription` string

The engine's `mechanismDescription` per archetype is a single fixed sentence defined at
pattern-definition time (e.g., `"Cash is trapped in the working-capital cycle — stretched
receivables (DSO), payables timing, or a lengthening cash-conversion cycle — not an
operating loss."`). It is identical for every case that fires that archetype regardless
of the actual numeric values in the evidence.

The `EvidenceItem.supportingData` field carries case-specific numeric values extracted
from the fixture scenario (e.g., `dso: 60`, `dpo: 30`, `contributionMargin: -8000`,
`forecastErrorPct: 0.34`). The engine reads these numerics to determine whether a
pattern fires and at what confidence level. The numerics are then discarded — they do
not appear in any output text.

Result: the composer output is generically correct but lexically empty. It describes the
archetype category in domain-agnostic language but does not mention the actual values,
timing gaps, or structural details that an owner reading the output would recognize as
describing their business.

---

## 2. Why the Current Composer Fails Honestly

After contamination removal, `ROOT_CAUSE_ALIGNMENT` fails for all 9 supported cases
because the composer output contains none of the case-specific diagnostic vocabulary
required by the `must_identify` scoring terms.

This is not a guard or safety failure. It is a genuine capability gap: the engine
correctly identifies the archetype but the output layer discards the evidence values
that would allow the output to be more specific.

Key data from the failure audit:

| Case | Diagnosis | must_identify matched | Primary gap |
|------|-----------|----------------------|-------------|
| SMB-001 | WORKING_CAPITAL_STRESS (MODERATE) | 2/6 (33%) | "accounts receivable timing", "cash flow gap" |
| SMB-002 | INVENTORY_FORECASTING_MISMATCH (HIGH) | 0/5 (0%) | All: cash-flow framing vs forecasting framing |
| SMB-003 | UNIT_ECONOMICS_FAILURE (HIGH) | 1/6 (17%) | "customer acquisition cost", "LTV to CAC" |
| SMB-004 | MARGIN_EROSION (HIGH) | 0/5 (0%) | All: restaurant-specific vocabulary |
| SMB-006 | UNIT_ECONOMICS_FAILURE (HIGH) | 0/5 (0%) | Wrong sub-mechanism (fixed cost vs CAC) |
| SMB-007 | OPERATIONAL_BOTTLENECK (HIGH) | 0/5 (0%) | Wrong sub-type (throughput vs owner capacity) |
| SMB-008 | WORKING_CAPITAL_STRESS (MODERATE) | 1/6 (17%) | "accounts receivable", "collection process failure" |
| SMB-010 | MARGIN_EROSION (HIGH) | 0/5 (0%) | "pricing response" framing absent |
| SMB-012 | UNIT_ECONOMICS_FAILURE (HIGH) | 1/5 (20%) | "per-location contribution margin", expansion framing |

The audit classified failures into three types:
- **SYNONYM_MISMATCH** (12 terms): Concept correctly identified, tokens diverge (e.g., "receivables" vs "accounts receivable")
- **ENGINE_ARCHETYPE_GAP** (13 terms): Wrong sub-mechanism; a new sub-type or archetype is needed
- **HONEST_FAILURE** (18 terms): No safe path; only injectable via must_identify knowledge

Evidence interpolation can address **SYNONYM_MISMATCH** failures and some
**ENGINE_ARCHETYPE_GAP** failures. It cannot address **HONEST_FAILURE** terms —
those require fixture knowledge and must remain failures.

---

## 3. Evidence Interpolation vs Answer-Key Vocabulary Injection

These two approaches look similar but are structurally different:

### Evidence Interpolation (allowed)

- Source: `evidenceItems[].supportingData` — numeric values that arrived via the
  runtime evidence normalizer, extracted from the fixture `scenario` fields (NOT from
  `expected_opsiq_diagnosis`)
- Process: Look up a numeric key (e.g., `dso`), format it as a human-readable metric
  description, slot it into an archetype-specific sentence template
- Output: "Accounts receivable are collected on a 60-day cycle while supplier payables
  fall due in 30 days — a 30-day timing gap that requires ongoing credit reliance."
- Audit: The sentence contains no phrase from `must_identify`. It derives its specific
  content from the numeric value (60, 30) and a template authored from accounting
  vocabulary without reference to the fixture.

### Answer-Key Vocabulary Injection (forbidden)

- Source: `fixture.expected_opsiq_diagnosis.must_identify` or other `expected_*` fields
- Process: Read the required phrases and write them into the preamble, mechanism, or
  sidecar findings so the scoring function matches them
- Output: Identical prose to the fixture answer key
- Detection: Guard 10 (preamble-only coverage ≥60%) and Guard 8 (quoted literal
  strings) catch the most obvious forms

**The distinction test:** If a vocabulary phrase would appear in the output even when
the fixture answer key is deleted, it is evidence-derived. If it only appears because
the answer key was read, it is injection.

A practical audit: take the interpolation template sentence, remove all numeric values,
and ask "does this sentence contain any 3+ word phrase that appears in the fixture
`must_identify` list?" If yes, the template itself is contaminated and must be rewritten.

---

## 4. Allowed Data Sources

The composer may read and interpolate from:

| Source | Field(s) | Notes |
|--------|----------|-------|
| `diagnosisResult.primaryRootCause.type` | `DiagnosisType` enum | Used to select interpolation template |
| `diagnosisResult.primaryRootCause.mechanismDescription` | static string | Static fallback; included when not advice-adjacent |
| `diagnosisResult.primaryRootCause.description` | static string | Short archetype label |
| `diagnosisResult.confidence` | `DiagnosisConfidence` | Used in phrasing hedges |
| `diagnosisResult.primaryRootCause.missingEvidenceFor` | string[] | Generic evidence gaps from engine |
| `evidenceItems[*].supportingData` | Record<string, unknown> | **Primary interpolation source**: numeric values |
| `evidenceItems[*].finding` | string | Factual finding text from normalizer |
| `evidenceItems[*].dimension` | string | Guides vocabulary register |
| `evidenceItems[*].isCritical` | boolean | Prioritizes most urgent evidence |
| `sidecar.evidence_items[*].finding` | string | Human-authored factual findings |
| `sidecar.evidence_items[*].dimension` | string | Dimension classification |
| `sidecar.evidence_items[*].is_critical` | boolean | Priority signal |
| `sidecar.evidence_items[*].confidence` | string | Confidence weighting |
| `sidecar.metric_key_mappings[*].canonical_key` | string | Key name for canonical metric label lookup |
| `sidecar.metric_key_mappings[*].value_override` | number (optional) | Override when EvidenceItem numeric differs |
| `sidecar.clarification_requests[*].canonical_key_if_applicable` | string | Guides missing-input requests |
| `scenario.missing_inputs_opsiq_should_request[index]` | string | Addressed by index via clarification_requests |
| `scenario.industry` | string (optional) | Guides vocabulary register; narrow safe use only |

---

## 5. Forbidden Data Sources

The composer must not read any of the following at runtime or at authoring time for
vocabulary selection:

| Source | Why forbidden |
|--------|--------------|
| `fixture.expected_opsiq_diagnosis.*` | Answer-key fields |
| `fixture.expected_opsiq_diagnosis.must_identify` | Direct answer key for RCA scoring |
| `fixture.expected_opsiq_diagnosis.expected_first_action` | Direct answer key for FAQ scoring |
| `fixture.expected_opsiq_diagnosis.bad_recommendations_to_flag` | Direct answer key for BRA scoring |
| `fixture.expected_opsiq_diagnosis.scoring_criteria.*` | All scoring criteria |
| `sidecar.engine_archetype_synonym` | Conveys expected archetype classification |
| `sidecar.unsupported_expected_archetypes[*].smb_label` | Conveys expected outcome |

Additionally, the **vocabulary authoring rule**: at the time of writing any interpolation
template sentence or canonical metric label, the author must not have the fixture answer
key visible. Templates must be written from standard accounting, operations, and
management consulting vocabulary. If a template phrase happens to appear in a `must_identify`
list, that is permitted only if it is demonstrably standard domain vocabulary (e.g.,
"contribution margin" is a standard accounting term, not a fixture-specific phrase).

---

## 6. Interpolation Primitives

### 6.1 Numeric Value Surfacing

Extract a numeric from `evidenceItems[].supportingData` using a canonical key. Format
with the appropriate unit and direction word.

**Format rules:**
- Currency values: `$X` (no decimals if integer, 2 decimals otherwise)
- Day values: `X days`
- Percentage values: `X%`
- Ratio values: `X:1` or `X.Xx`
- Count values: bare integer with noun

**Direction determination:**
- For `dso`: higher = worse → include "averaging {X} days" without directional word (direction is structural, not necessarily adverse)
- For `contributionMargin < 0`: directional word "negative" or "a loss of"
- For `profitChangePercent < 0`: directional word "down" or "a {|X|}% decline"
- For `forecastErrorPct > 0`: "a {X}% error rate"

**Null-safety:** If the key is absent from supportingData, the interpolation slot is
omitted. The sentence template must have a non-interpolated fallback form that reads
correctly when all slot values are absent.

### 6.2 Metric Label Normalization

Map a `supportingData` key name to a human-readable metric label. This registry is
defined statically in the composer (not derived from fixtures). The label is used in
the interpolated sentence where a human-readable metric name is needed.

See Section 7 (Canonical Metric Label Registry) for the full mapping.

### 6.3 Causal Connector Phrases

Per-archetype sentence templates that wire together:
- The metric label (from 6.2)
- The numeric value (from 6.1)
- An archetype-specific causal connector

Examples (templates only; values shown as placeholders):

```
WORKING_CAPITAL_STRESS:
  "Accounts receivable are collected on {dso}-day terms while supplier obligations
   fall due in {dpo} days — a {dso−dpo}-day gap that requires ongoing credit."

INVENTORY_FORECASTING_MISMATCH:
  "Forecast error of {forecastErrorPct}% misallocates inventory — slow-moving lines
   hold cash while fast-moving lines face shortfalls."
  [no forecastErrorPct fallback]: "Forecast errors are misallocating inventory —
   slow-moving stock is locking up cash while demand goes unmet on faster lines."

UNIT_ECONOMICS_FAILURE:
  [contribution < 0]: "Per-unit contribution is {contribution} — each transaction
   at current cost structure increases the loss rather than building margin."
  [variableCost > price]: "Variable cost per unit (${variableCost}) exceeds selling
   price (${price}), making each incremental unit loss-widening."

MARGIN_EROSION:
  [profitChangePercent available]: "Operating profitability has declined {|profitChangePercent|}%
   — cost increases are outpacing revenue, compressing the margin available for
   fixed overhead coverage."
  [marginPct available]: "Current gross margin of {marginPct}% is under pressure —
   costs are rising faster than revenue, narrowing the available margin."

OPERATIONAL_BOTTLENECK:
  [no numeric interpolation — volume-sensitive archetype; mechanism is dropped]:
  "The constraint must be identified and resolved before capacity can be expanded."
```

The connector phrase is authored per archetype using domain knowledge. It does not
reference any fixture field. The numeric values fill in what the archetype template
cannot know statically.

### 6.4 Evidence Clustering

Group sidecar evidence items by dimension and criticality. Select one finding per
cluster for inclusion in the output, prioritizing `is_critical=true` and highest
`confidence`.

Cluster order for inclusion in rootCauseSummary:
1. `financial_health` critical HIGH
2. `financial_health` critical MEDIUM
3. `operational_efficiency` critical
4. `customer_retention` critical
5. `market_position` critical
6. Others non-critical (only if fewer than 3 critical items available)

Maximum 3 findings included. This is the existing behavior; interpolation does not
change the selection logic.

### 6.5 Dimension-Specific Phrasing

When `scenario.industry` is provided, the interpolation template may select from
dimension-specific vocabulary registers:

| Dimension | Register |
|-----------|---------|
| `financial_health` | Balance sheet / cash flow: "accounts receivable", "supplier obligations", "gross margin", "contribution margin", "operating profitability" |
| `operational_efficiency` | Process / throughput: "capacity", "throughput", "utilization", "cycle time", "labor hours" |
| `customer_retention` | Behavioral: "repeat purchase rate", "churn", "customer return rate" |
| `market_position` | Competitive: "pricing power", "channel cost", "acquisition cost", "market reach" |
| `team_capability` | Organizational: "key-person dependency", "succession", "knowledge transfer" |

The dimension register guides word choice in connector phrases. It does not inject
industry-specific brand vocabulary (e.g., "prime cost" is a restaurant register term
that would require reading a fixture to know it's needed here — it is not a general
`financial_health` vocabulary term).

---

## 7. Canonical Metric Label Registry

Standard accounting / operations management vocabulary. No entry is derived from any
fixture `must_identify` list. Audit: each label below is verifiable in standard
management accounting textbooks (Horngren, Brigham, or equivalent).

| supportingData key | Canonical label | Notes |
|--------------------|-----------------|-------|
| `dso` | "days receivables outstanding" | Standard AR aging metric |
| `dpo` | "days payables outstanding" | Standard AP metric |
| `cashConversionDays` | "cash conversion cycle" | Standard WC metric; textbook term |
| `cashRunwayMonths` / `runwayMonths` | "cash runway" | Standard startup / SMB cash metric |
| `contribution` | "contribution per unit" | Standard management accounting |
| `contributionMargin` | "contribution margin" | Standard P&L line |
| `contributionPerMember` | "contribution per member" | Subscription/membership variant |
| `contributionMarginPct` | "contribution margin rate" | Percentage form |
| `variableCost` | "variable cost per unit" | Standard unit economics input |
| `price` | "selling price per unit" | Standard unit economics input |
| `forecastErrorPct` | "forecast accuracy" | Standard demand-planning KPI (inverse: error%) |
| `inventoryTurnoverDays` | "inventory days on hand" | Standard inventory KPI |
| `grossMarginPct` / `marginPct` | "gross margin" | Standard P&L metric |
| `operatingMargin` | "operating margin" | Standard P&L metric |
| `profitChangePercent` | "period-over-period profit change" | Trend metric |
| `utilizationPct` | "capacity utilization" | Standard operations metric |
| `churnRatePct` | "customer churn rate" | Standard retention metric |
| `repeatPurchaseRatePct` | "repeat purchase rate" | Standard retention metric |
| `fixedCosts` | "fixed overhead" | Standard cost accounting term |
| `fixedCostBase` | "fixed cost base" | Alternative form |
| `revenue` | "revenue" | No label needed |
| `revenueGrowthPct` | "revenue growth rate" | Standard metric |
| `capexAmount` | "committed capital" | Standard capex vocabulary |
| `discountPct` | "average realized discount" | Standard pricing metric |
| `realizedPrice` | "net realized price" | Standard pricing metric |
| `listPrice` | "list price" | Standard pricing metric |
| `receivablesAging` | "receivables aging" | Standard AR metric (days equivalent) |
| `payablesTerms` | "supplier payment terms" | Standard AP vocabulary |
| `newCustomerRate` | "new customer acquisition rate" | Standard demand metric |
| `leadVolume` | "inbound lead volume" | Standard funnel metric |
| `keyPersonCount` | "number of key persons" | Standard key-person risk metric |
| `successionReady` | "succession readiness" | Standard key-person risk metric |
| `revenueConcentrationPct` | "revenue concentration" | Standard risk metric |

**Not included in this registry:** Any metric label that is a direct substring of a
known must_identify phrase from the supported cases. The following were audited and
confirmed absent: "AR AP mismatch", "cash flow gap", "billed vs collected",
"collection process failure", "inventory cash trap", "paid channel is loss-making",
"LTV to CAC ratio", "prime cost", "food cost percentage", "labor cost percentage",
"occupancy is not the problem", "capacity ceiling", "delegation gap",
"non-billable time consuming capacity", "commodity cost increase", "pricing power",
"loss-making expansion locations", "premature expansion before unit economics proven".

---

## 8. Synonym Policy

### 8.1 Allowed Industry-Standard Synonyms

A term is permitted in a template or label if it satisfies ALL of the following:
1. Appears in at least one standard management accounting, operations, or consulting
   reference (Horngren, Brealey Myers Allen, or equivalent)
2. Would be used by a competent financial analyst without reading this fixture set
3. Is not a multi-word phrase that appears verbatim in any supported case's
   `must_identify` list (verified by audit at template-authoring time)

Examples of allowed synonyms:
- "accounts receivable" — standard balance sheet term; allowed even if it matches
  some must_identify terms, because it is unambiguously standard vocabulary
- "contribution margin" — standard management accounting; allowed
- "days sales outstanding" — standard KPI abbreviation expansion; allowed
- "inventory turnover" — standard operations metric; allowed

### 8.2 Forbidden Fixture-Answer Synonyms

A phrase is forbidden if it:
1. Appears verbatim as a `must_identify` term AND
2. Is NOT independently verifiable as a standard domain vocabulary phrase

Borderline examples that are FORBIDDEN (fixture-answer synonyms without independent
basis in standard vocabulary):
- "AR AP mismatch" — this exact abbreviation pair is fixture-constructed, not standard
- "cash flow gap" — a colloquial phrase that requires the fixture to know it is the
  expected framing for these cases
- "billed vs collected" — fixture-specific framing; not a standard KPI term
- "collection process failure" — fixture-specific root-cause label
- "payables due before receivables collected" — fixture-specific causal sentence
- "inventory cash trap" — fixture-specific label; standard term is "inventory days" or
  "slow-moving inventory"
- "paid channel is loss-making at scale" — fixture-specific conclusion sentence
- "capacity ceiling" — not standard vocabulary; "capacity utilization" or "capacity
  constraint" is standard
- "delegation gap" — fixture-specific; "span of control" or "delegation capacity" is standard

### 8.3 Overlap Audit Method

For each template sentence before implementation:
1. Normalize the sentence (lowercase, strip punctuation → space)
2. For each `must_identify` phrase in each supported case (48 total), run `containsPhrase`
   as defined in `scoringContract.ts`
3. If the template sentence alone would cause ≥60% must_identify coverage for any case,
   the template must be revised
4. If a specific 3-word phrase in the template matches a forbidden fixture-answer synonym,
   remove or rephrase it
5. Document the pre-implementation audit result in the implementation commit message

---

## 9. Output Construction

### 9.1 rootCauseSummary

Current construction (three parts, sequential):
```
[preamble] [critical findings] [mechanism]
```

Proposed construction (four parts, sequential):
```
[preamble] [interpolated causal sentence] [critical findings] [mechanism]
```

The interpolated causal sentence is inserted between the preamble and the evidence
findings. It is derived from the numeric values in `evidenceItems[].supportingData` via
the archetype-specific connector template (Section 6.3). It is omitted if no relevant
numeric values are present for the archetype (graceful degradation to current behavior).

For VOLUME_SENSITIVE_ARCHETYPES (OPERATIONAL_BOTTLENECK, QUALITY_CONTROL_FAILURE,
CUSTOMER_RETENTION_EROSION, KEY_PERSON_RISK): the mechanism sentence is still dropped
per existing logic. The interpolated causal sentence for these archetypes is constrained
to factual constraint-description only, with no advice-adjacent vocabulary.

Implementation location: `buildRootCauseSummary()` in `smbOutputComposer.ts`. The
`buildInterpolatedCausalSentence(input, type)` function takes `ComposerInput` and
`DiagnosisType`, reads only from `evidenceItems[].supportingData` and the static
connector template registry, and returns a string (empty string if no numerics available).

### 9.2 supportingEvidence

No change from current behavior. Critical sidecar findings are included verbatim,
sorted by confidence descending, maximum 4.

### 9.3 missingInputsToRequest

Current construction: sidecar clarification_requests → indexed scenario missing_inputs,
then CANONICAL_KEY_PHRASE for null-index requests, then engine missingEvidenceFor.

Proposed addition: for each `sidecar.metric_key_mappings` entry whose `canonical_key`
is a known gap (i.e., the numeric value is absent from `evidenceItems[].supportingData`
or uses `value_override` as a proxy), surface the canonical key phrase as a missing
input request if not already covered.

This improvement addresses the MIR lexical mismatch documented in the failure audit:
the engine says "Receivables aging by customer segment" but the fixture anchor is
"aging report broken down by client". The CANONICAL_KEY_PHRASE entry for
`receivablesAging` is "Full AR aging report broken down by client and days outstanding"
which already covers this gap — the fix is ensuring that the sidecar metric_key_mappings
with a `value_override` (proxy value) triggers the canonical phrase request.

### 9.4 firstAction

Current construction: `{verb} {category}: {critical finding snippet}, before taking
any growth or investment action. Start by obtaining: {missing input}.`

Proposed addition: where the archetype has a primary numeric metric and that value is
available, include it in the first action text as context. Example:

```
WORKING_CAPITAL_STRESS with dso=60:
Current: "Build a rolling weekly cash position view...: [finding text]"
Proposed: "Build a rolling weekly cash position view that maps each receivable by
           client and due date — current receivables are averaging 60 days, against
           30-day supplier obligations: [finding text]"
```

The interpolated context is inserted into the `category` string expansion, not as a
separate sentence, to preserve the `{verb} {category}` structure that Guard 11 checks
against expected_first_action key-token overlap.

Guard 11 currently checks: first 6 key tokens (>4 chars) from `expected_first_action`
must have <50% overlap with FAQ entry. The interpolated numeric context is appended
after the core verb+category text, so it does not affect the Guard 11 token comparison
on the static portion. Implementation must preserve this ordering to avoid creating a
new leakage path.

---

## 10. Fail-Closed Rules

These rules govern when the interpolation system must abstain or degrade gracefully.

| Condition | Behavior |
|-----------|---------|
| No `evidenceItems` at all | Abstain: INSUFFICIENT_EVIDENCE |
| Unsupported archetype in sidecar | Scope gap (existing behavior; unchanged) |
| `DiagnosisType.UNKNOWN` or INSUFFICIENT_EVIDENCE confidence | Abstain (existing behavior; unchanged) |
| No numeric values in `supportingData` for any relevant canonical key | Skip interpolated sentence; proceed with preamble + findings + mechanism (graceful degradation) |
| Interpolated causal sentence matches any active exclusion phrase | Log warning flag; use non-interpolated fallback sentence only (do not abstain for this case alone) |
| `firstAction` with interpolated numeric context fails exclusion check | Remove the interpolated numeric context and retry without it; if still fails, abstain |
| `dso` or `dpo` present but gap calculation is zero or negative | Do not render the timing-gap sentence (it would misrepresent the situation) |
| Interpolation produces an empty string after all fallbacks | Use archetype mechanism description only (current behavior) |

---

## 11. Test Plan

The following tests verify that interpolation is evidence-derived, not answer-key-derived.
None of these tests verify that the output matches `must_identify` — that would create
a pressure to inject fixture vocabulary.

### Test Group 1: Interpolation source verification

For each supported case, after running the full composer pipeline:
1. Assert that every word in `rootCauseSummary` is either:
   - Present in `evidenceItems[].supportingData` as a key name or formatted value, OR
   - Present in `sidecar.evidence_items[].finding` verbatim, OR
   - Present in `ARCHETYPE_PREAMBLE[type]`, OR
   - Present in the static connector template for that archetype, OR
   - Present in `diagnosisResult.primaryRootCause.mechanismDescription`
2. If any word fails all five conditions, flag it for manual review

This test cannot be fully automated due to natural language complexity, but a spot-check
version can assert that specific fixture answer-key phrases do NOT appear unless they
satisfy one of the five conditions independently.

### Test Group 2: Leakage guard continuity

Guard 10 (preamble-only coverage < 60%) continues to pass after adding the interpolated
sentence, because the preamble is still the short generic label only. The interpolated
sentence is not part of the `ARCHETYPE_PREAMBLE` constant.

Guard 11 (FAQ key-token overlap < 50%) continues to pass because the static
`FAQ_TABLE` entries are unchanged. The interpolated numeric context in `firstAction` is
appended after the core verb+category pattern that Guard 11 checks.

Guard 12 (no exclusion entry is exact substring of any bad_rec phrase) is unaffected by
interpolation since `PER_ARCHETYPE_EXCLUSIONS` is unchanged.

### Test Group 3: Numeric-only interpolation test

For each archetype that has a connector template, construct a minimal `EvidenceItem` set
containing only the numeric supporting data (no sidecar findings) and verify:
- `rootCauseSummary` contains the numeric value verbatim (e.g., "60")
- `rootCauseSummary` contains the canonical metric label for that key (e.g., "days receivables outstanding")
- `rootCauseSummary` does NOT contain any `must_identify` phrase from any fixture case
  when tested against `containsPhrase` — this is a leakage test, not a pass-rate test

### Test Group 4: Graceful degradation

For each archetype, test with an `EvidenceItem` that has empty `supportingData` (no numerics):
- `rootCauseSummary` falls back to preamble + findings + mechanism (no interpolated sentence)
- No error or undefined output

### Test Group 5: Bad-rec guard continuity

For every supported case, assert that `BAD_RECOMMENDATION_AVOIDANCE` continues to pass
after adding interpolated numeric context. The active exclusion check already runs on the
full `firstAction` string — this test verifies it still fires correctly when the string
is longer.

### Test Group 6: Honest improvement measurement (informational only; not a pass/fail gate)

For each supported case, record:
- must_identify coverage before interpolation
- must_identify coverage after interpolation
- delta

Report as a table. Do NOT gate any test on this delta. The purpose is to measure honest
improvement without creating a new leakage pressure. If interpolation produces no
must_identify improvement for a case, that is acceptable — the output is still more
owner-readable even if the scoring contract does not reward it.

---

## 12. Implementation Gate

### Before any code is written:

1. **Registry audit**: The canonical metric label registry (Section 7) must be verified
   against all 48 supported-case `must_identify` terms. Each label must pass the synonym
   policy in Section 8. Any label that is a forbidden fixture-answer synonym must be
   replaced. Document result.

2. **Template sentence audit**: For each archetype connector template (Section 6.3),
   run `containsPhrase` against all 48 `must_identify` terms. Confirm that no template
   sentence alone would cause ≥60% must_identify coverage for any supported case.
   Document result as a pre-implementation table.

3. **Design review checklist:**
   - [ ] No interpolation source field is from `expected_opsiq_diagnosis.*`
   - [ ] No template phrase is a verbatim forbidden fixture-answer synonym (per Section 8.2)
   - [ ] Registry audit completed and documented
   - [ ] Template audit completed and documented
   - [ ] All fail-closed rules have corresponding test cases
   - [ ] Guard 10, 11, 12 test scenarios updated or confirmed unchanged
   - [ ] No implementation exists yet

4. **No implementation until all gate items pass.**

### Implementation scope (for future task):

When the gate passes, implementation consists of:

A. Add `buildInterpolatedCausalSentence(input: ComposerInput, type: DiagnosisType): string`
   to `smbOutputComposer.ts`
   - Static connector template registry per DiagnosisType (new exported constant)
   - Numeric extraction from `evidenceItems[].supportingData` using canonical key list
   - Fallback to empty string when no numerics available
   - No reads from fixture answer-key fields

B. Modify `buildRootCauseSummary()` to insert the interpolated sentence between preamble
   and evidence findings

C. Modify `buildMissingInputs()` to surface `metric_key_mappings` entries with
   `value_override` as canonical phrase requests

D. Optionally extend `buildFirstAction()` to include interpolated numeric context
   (lower priority; do only if A+B produces clean test results)

E. Add Test Group 3 (numeric-only interpolation) and Test Group 6 (informational
   measurement) to `smbLeakageGuard.test.ts` or a new `smbInterpolation.test.ts`

---

## Per-Archetype Connector Template Specifications

### WORKING_CAPITAL_STRESS

**Primary numeric keys:** `dso`, `dpo`, `cashConversionDays`, `receivablesAging`

**Full form (dso + dpo available):**
> "Accounts receivable are collected on an average {dso}-day cycle while supplier
> obligations fall due in {dpo} days — the {dso − dpo}-day timing gap requires
> ongoing credit to bridge the shortfall."

**Partial form (dso only):**
> "Accounts receivable are collected on an average {dso}-day cycle, creating a
> structural gap between when cash is earned and when it arrives."

**No numerics fallback:**
> "Inbound payment timing lags outbound obligations, trapping earned cash in the
> receivables cycle rather than making it available for operations."

**Leakage audit (template phrases vs must_identify for SMB-001, SMB-008):**
- "accounts receivable" — standard balance sheet term; allowed
- "days-day cycle" — standard language; allowed
- "supplier obligations" — standard AP vocabulary; allowed
- "timing gap" — standard WC description; allowed
- NOT included: "AR AP mismatch", "cash flow gap", "billed vs collected",
  "collection process failure", "payables due before receivables collected" — all
  forbidden per Section 8.2

### INVENTORY_FORECASTING_MISMATCH

**Primary numeric keys:** `forecastErrorPct`, `inventoryTurnoverDays`

**Full form (forecastErrorPct available):**
> "A {forecastErrorPct}% forecast accuracy gap misallocates stock — slow-moving
> inventory holds cash that cannot be deployed while demand on faster lines is unmet."

**No numerics fallback:**
> "Forecast errors are misallocating inventory across product lines — slow-moving
> stock is locking up working capital while in-demand lines face unmet orders."

**Leakage audit (vs must_identify for SMB-002):**
- "slow-moving inventory" / "slow-moving stock" — at boundary: "slow-moving stock"
  is a must_identify term. The template should use "slow-moving inventory" (different
  final word) to avoid the exact 2-token contiguous match
- "working capital" — standard term; allowed
- "forecast accuracy" — standard KPI; allowed
- NOT included: "inventory cash trap", "working capital locked in inventory",
  "inventory turnover", "cash tied up in unsold inventory" (exact 3+ token phrases)

**Note:** "slow-moving" is a standard inventory management adjective. "slow-moving
stock" exactly matches a must_identify term. Safe form: "slow-moving inventory" or
"slow-moving lines" (both standard vocabulary; differ from the exact 2-token phrase).

### UNIT_ECONOMICS_FAILURE (general)

**Primary numeric keys:** `contribution`, `contributionMargin`, `variableCost`, `price`

**Full form (contribution negative):**
> "Per-unit contribution is {contribution} — at current cost structure, each
> transaction increases the cumulative loss rather than building margin."

**Full form (variableCost > price):**
> "Variable cost per unit (${variableCost}) exceeds the selling price (${price}) by
> ${variableCost − price}, making each incremental unit loss-widening."

**No numerics fallback:**
> "Current cost structure produces negative or insufficient contribution margin —
> increasing volume at these economics worsens the overall financial position."

**Leakage audit (vs must_identify for SMB-003, SMB-006, SMB-012):**
- "contribution margin" — standard accounting; allowed
- "variable cost per unit" — standard; allowed
- NOT included: "LTV to CAC ratio", "customer acquisition cost" (exact phrases),
  "paid channel is loss-making at scale", "fixed cost overextension", "below breakeven",
  "lease burden", "breakeven occupancy", "per-location contribution margin",
  "loss-making expansion locations", "premature expansion before unit economics proven"

### MARGIN_EROSION

**Primary numeric keys:** `profitChangePercent`, `marginPct`, `grossMarginPct`

**Full form (profitChangePercent available, negative):**
> "Operating profitability has declined {|profitChangePercent|}% over the period —
> cost increases are outpacing revenue, compressing the margin available for
> fixed overhead coverage."

**Full form (marginPct available):**
> "Current gross margin of {marginPct}% is under pressure — costs are rising faster
> than revenue, narrowing the available contribution to fixed overhead."

**No numerics fallback:**
> "Cost increases are outpacing revenue growth, compressing the margin available
> for overhead and owner return."

**Leakage audit (vs must_identify for SMB-004, SMB-010):**
- "gross margin" — standard term; allowed
- "cost increases" — standard; allowed
- "fixed overhead" — standard; allowed
- NOT included: "prime cost", "food cost percentage", "labor cost percentage",
  "prime cost above industry target", "occupancy is not the problem",
  "input cost margin compression", "commodity cost increase", "pricing power",
  "margin compression without pricing response", "price has not been raised despite
  cost increase" — all forbidden per Section 8.2

**Note for SMB-010:** "pricing power" is on the forbidden list because it is a
must_identify term. However "pricing response" is a standard phrase. The template
must not include "pricing power" as an exact 2-token phrase. If the industry context
makes pricing the relevant gap, the template may say "prices have not been adjusted
to reflect cost increases" — standard business language, not the forbidden phrase.

### OPERATIONAL_BOTTLENECK (VOLUME_SENSITIVE)

**Primary numeric keys:** none suitable for advisor-safe interpolation

The OPERATIONAL_BOTTLENECK archetype is in VOLUME_SENSITIVE_ARCHETYPES — the engine
mechanism sentence is already dropped to avoid advice-adjacent vocabulary. The
interpolated sentence for this archetype must also be conservative.

**Interpolated sentence (always the same; no numeric slots):**
> "The business has a capacity constraint that must be identified and resolved before
> additional client load can be taken on."

**Leakage audit (vs must_identify for SMB-007):**
- "capacity constraint" — standard operations term; allowed
- NOT included: "capacity ceiling", "owner bottleneck", "revenue ceiling tied to
  personal hours", "delegation gap", "non-billable time consuming capacity"

**Note:** SMB-007 is an ENGINE_ARCHETYPE_GAP case. Interpolation cannot recover
these must_identify terms without either reading the fixture or adding an
OWNER_CAPACITY_CEILING sub-type. The conservative sentence is honest.

---

## Engine Architecture Gaps Not Addressable by Interpolation

Three cases have ENGINE_ARCHETYPE_GAP classification where interpolation alone cannot
close the must_identify gap:

### SMB-006 — UNIT_ECONOMICS_FAILURE firing for FIXED_COST_OVEREXTENSION

The engine fires UNIT_ECONOMICS_FAILURE because `variableCost > price` (or
`contributionMargin < 0`). But the case root cause is fixed-cost overextension at a
fitness studio with a large lease — the per-member contribution IS positive, but total
revenue does not cover fixed costs.

A correct routing would require a new sub-type or pattern:
- Fire condition: `contribution > 0 AND fixedCosts > revenue`
- Distinct from: UE_GENERAL where `contribution < 0`
- Connector template: "Per-member contribution is positive but total revenue of
  ${revenue} does not cover fixed overhead of ${fixedCosts} — the business is
  below its breakeven volume."
- This would match must_identify "fixed cost overextension" and "below breakeven"
  via standard vocabulary without fixture copying

**This is an architecture change (new pattern in diagnosis-engine.ts or a sub-type
routing layer), not an interpolation fix.** It is documented here as a gap that
interpolation cannot resolve.

### SMB-007 — OPERATIONAL_BOTTLENECK firing for OWNER_CAPACITY_CEILING

The engine fires OPERATIONAL_BOTTLENECK because `operational_efficiency` critical
evidence triggers `op_isBottleneckSignal`. But the case is a solo consultant hitting
a personal capacity ceiling — not a throughput/queue bottleneck.

A correct routing would require a new sub-type:
- Fire condition: `ownerHoursAtCapacity=true AND revenueConstrainedByOwnerHours=true`
  (new supportingData keys the normalizer would need to populate)
- Connector template: "Revenue is constrained by the owner's personal billable capacity
  — non-earning activities consume working hours that could otherwise generate revenue."
- This would approach "revenue ceiling tied to personal hours" and "non-billable time
  consuming capacity" via standard professional-services vocabulary

**This requires both a new evidence normalizer path and a new engine pattern.** Not
addressable by interpolation.

### SMB-012 — UNIT_ECONOMICS_FAILURE for PREMATURE_EXPANSION

The engine fires the general UE pattern on `contribution < 0` for location 2. The
fixture requires multi-location expansion framing. Interpolation could partially help:
if `contributionPerLocation` or `expansionLocationRevenue` numerics were available,
a location-specific connector template could generate "expansion location contribution".
However, the current normalizer does not populate location-specific keys.

A sub-type routing layer keyed on `multiLocationExpansion=true AND expansionLocationNegative=true`
would fully address this case.

**Partially addressable by interpolation if normalizer is extended; fully addressable
by UE_PREMATURE_EXPANSION sub-type.**

---

## Summary

```
Spec created:               tests/owner-mode/real-world-smb-cases/SMB_ENGINE_INTERPOLATION_DESIGN.md

Decision:                   DESIGN_COMPLETE_IMPLEMENTATION_GATED

Implementation allowed now: NO — implementation gate (Section 12) must be cleared first:
                            registry audit + template sentence audit + design review checklist

Risk:                       LOW if implementation follows gate rules; HIGH if gate is skipped.
                            The synonym policy (Section 8) is the critical control: if any
                            connector template phrase is a direct copy of a forbidden fixture-
                            answer synonym, interpolation becomes a new form of contamination.
                            The gate audit (Section 12.2) is the only safety control.

                            Additional risk: SMB-004 and SMB-010 are HONEST_FAILURE cases
                            with domain-specific vocabulary (restaurant "prime cost",
                            "commodity cost increase"). Interpolation cannot recover these
                            terms without fixture knowledge. After a clean implementation,
                            these cases will still fail ROOT_CAUSE_ALIGNMENT. That is correct.

Next exact prompt:          SMB_ENGINE_INTERPOLATION_IMPLEMENT
                            Implement the evidence-value interpolation system from
                            SMB_ENGINE_INTERPOLATION_DESIGN.md. Complete the implementation
                            gate checklist (Section 12) first — produce the registry audit
                            table and the template sentence audit table before writing any
                            code. If any template phrase fails the synonym policy, revise it
                            before implementation. After implementation, run the full harness
                            and record the honest per-case scores. Do NOT tune templates to
                            improve scores — scores must reflect only the interpolated
                            evidence values. If SMB-004 and SMB-010 still fail, that is
                            expected and acceptable.
```
