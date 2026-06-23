# Evidence Hint Sidecar Specification

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Status:** DESIGN ONLY — no sidecar files created, no code changed
**Depends on:** `OWNER_MODE_INPUT_NORMALIZATION_LAYER_SPEC.md`

---

## 1. Purpose

This spec defines the exact schema, naming convention, validation rules, authoring guidance, and implementation gate for evidence-hint sidecar files. Sidecars are the **one-time prerequisite** that unlocks SMB harness Part B engine integration. They annotate existing SMB fixtures with the explicit metadata (`dimension`, `isCritical`, canonical `supportingData` key mappings) that the normalization layer requires and that cannot be derived generically from narrative text.

A sidecar is a **declarative evidence annotation file**. It contains no procedural logic, no per-case transformation functions, and no adapter code. It is pure JSON. It is authored by a human once per fixture and validated automatically on every CI run.

---

## 2. File Naming Convention

```
tests/owner-mode/real-world-smb-cases/evidence-hints/
├── SMB-001.evidence-hints.json
├── SMB-002.evidence-hints.json
├── SMB-003.evidence-hints.json
├── SMB-004.evidence-hints.json
├── SMB-005.evidence-hints.json
├── SMB-006.evidence-hints.json
├── SMB-007.evidence-hints.json
├── SMB-008.evidence-hints.json
├── SMB-009.evidence-hints.json
├── SMB-010.evidence-hints.json
├── SMB-011.evidence-hints.json
└── SMB-012.evidence-hints.json
```

**Rules:**
- Filename MUST be `{case_id}.evidence-hints.json` where `{case_id}` exactly matches the fixture's `case_id` field.
- Directory MUST be `tests/owner-mode/real-world-smb-cases/evidence-hints/`.
- No subdirectories.
- No other file extensions.
- When the normalization layer or test harness looks up a sidecar for a case, a missing file is a hard failure — not a warning, not a skip.

---

## 3. Top-Level Sidecar Schema

```typescript
interface EvidenceHintSidecar {
  // ── Identity ─────────────────────────────────────────────────────────────────
  /** Must exactly match the fixture's case_id field. Validated on load. */
  case_id: string;

  /**
   * Semantic version of the fixture this sidecar was authored against.
   * Increment the patch version when the corresponding fixture changes.
   * Format: "YYYY-MM-DD" (date of sidecar authorship or last update).
   */
  fixture_version: string;

  // ── Evidence items ────────────────────────────────────────────────────────────
  /**
   * Ordered list of evidence items to be constructed from this fixture's content.
   * Each item maps to one EvidenceItem that the normalization layer will create.
   * The normalization layer iterates this array in order; index determines the
   * deterministic UUID suffix (inputId + "#ev#" + index).
   */
  evidence_items: EvidenceHintItem[];

  // ── Metric key mappings ───────────────────────────────────────────────────────
  /**
   * Maps facts_known_to_owner keys to canonical supportingData keys.
   * Every entry is attached to an evidence_item by matching evidence_item_index.
   * The normalization layer reads these and populates supportingData on the
   * corresponding EvidenceItem.
   * Metric keys not listed here are NOT silently forwarded — they are dropped
   * and logged as METRIC_UNMAPPED_DROPPED in the normalization audit.
   */
  metric_key_mappings: MetricKeyMapping[];

  // ── Archetype gap declaration ─────────────────────────────────────────────────
  /**
   * Explicitly declares SMB root-cause labels that have no corresponding
   * engine DiagnosisType. Must be present and accurate for every case.
   * - If the fixture's primary_root_cause has no engine equivalent,
   *   this array MUST contain it.
   * - If the fixture's primary_root_cause maps to an engine DiagnosisType,
   *   this array MUST be empty ([]).
   * Cases with a non-empty unsupported_expected_archetypes are treated as
   * abstention_eligible: a INSUFFICIENT_EVIDENCE engine result is scored PASS.
   */
  unsupported_expected_archetypes: UnsupportedArchetypeEntry[];

  // ── Diagnosis type synonym ────────────────────────────────────────────────────
  /**
   * Maps the fixture's primary_root_cause string to the closest engine
   * DiagnosisType enum value. Used ONLY for scoring output comparison —
   * NEVER used to influence which evidence items are created or how they
   * are worded. Required for covered archetypes; null for archetype-gap cases.
   */
  engine_archetype_synonym: string | null;

  // ── Clarification requests ────────────────────────────────────────────────────
  /**
   * Records which of the fixture's missing_inputs_opsiq_should_request entries
   * correspond to each canonical metric key that the engine would need to
   * elevate diagnosis confidence. Used by the scoring harness to verify the
   * engine correctly requests missing information. Informational only — does
   * not affect EvidenceItem construction.
   */
  clarification_requests: ClarificationRequestHint[];

  // ── Authoring notes ───────────────────────────────────────────────────────────
  /**
   * Plain-text notes from the sidecar author documenting:
   * - Why each dimension assignment was made
   * - Any ambiguous cases and how they were resolved
   * - Metric mappings that required judgment calls
   * - Known limitations of this sidecar
   * Not validated beyond non-blank.
   */
  validation_notes: string;
}
```

---

## 4. `evidence_items[]` Schema

```typescript
interface EvidenceHintItem {
  /**
   * JSONPath-like reference to the source of this finding within the fixture.
   * Validated: the referenced path must exist and be non-blank in the fixture.
   *
   * Allowed patterns:
   *   "scenario.symptoms[0]"           — a specific symptom by index
   *   "scenario.symptoms[1]"
   *   "scenario.misleading_signals[0]" — a misleading signal
   *   "scenario.business"              — the business description
   *   "scenario.facts_known_to_owner"  — entire facts block (for dimension assignment)
   *
   * NOT allowed:
   *   "expected_opsiq_diagnosis.*"     — no outcome-side fields permitted (leakage rule)
   *   Any path that does not resolve in the actual fixture
   */
  source_path: string;

  /**
   * The finding string that will become EvidenceItem.finding.
   * For symptom sources: should match or closely paraphrase the symptom text.
   * For fact sources: should be a diagnostic sentence derived from the fact block,
   *   e.g., "Working capital position: receivables of $280K outstanding against
   *   payables due of $140K with net bank balance of $14K."
   * For misleading_signal sources: MUST begin with the prefix
   *   "Surface signal (not root cause): " to clearly distinguish from real evidence.
   *
   * Must be non-blank. Must not contain any content from expected_opsiq_diagnosis
   * (no root cause names, no expected action text, no must_identify terms).
   * The no_outcome_leakage field confirms this.
   */
  finding: string;

  /**
   * Canonical engine dimension. Must be one of the 7 allowed values.
   * This is the only field the normalization layer cannot derive generically —
   * the author must assign it here.
   */
  dimension: EvidenceDimension;

  /**
   * Whether this item represents a critical adverse signal.
   * Must be explicitly declared — the normalization layer does not infer it.
   * Critical items trigger engine patterns for operational_bottleneck,
   * quality_delivery, customer_retention, and key_person archetypes.
   */
  is_critical: boolean;

  /**
   * Confidence level for this evidence item.
   * "MEDIUM" is the safe default when confidence in the finding is moderate.
   * Use "HIGH" only when the finding is based on a confirmed numeric or
   * unambiguous observation (e.g., "DSO is 67 days per the AR report").
   * Use "LOW" for estimates or inferred signals.
   * Use "PROVISIONAL" for signals that require confirmation before acting.
   */
  confidence: "LOW" | "MEDIUM" | "HIGH" | "PROVISIONAL";

  /**
   * Declares that this finding contains NO information from the fixture's
   * expected_opsiq_diagnosis section. The validator checks this:
   * - If false, the sidecar fails validation with OUTCOME_LEAKAGE_DECLARED.
   * - If true, the validator performs a surface check for known outcome terms
   *   (primary_root_cause, must_identify terms). If found, fails with
   *   OUTCOME_LEAKAGE_DETECTED.
   * This flag must always be true for every item. Its presence is a forcing
   * function: the author consciously attests there is no leakage.
   */
  no_outcome_leakage: true;

  /**
   * Authoring rationale for this item's dimension and criticality assignment.
   * Required. Minimum 10 characters. Not used by the normalization layer —
   * used by reviewers to audit the sidecar author's reasoning.
   */
  rationale: string;
}
```

---

## 5. `metric_key_mappings[]` Schema

```typescript
interface MetricKeyMapping {
  /**
   * The key name as it appears in fixture.scenario.facts_known_to_owner.
   * Validated: must exist in the fixture's facts_known_to_owner object.
   */
  fixture_key: string;

  /**
   * The canonical supportingData key from the Metric Key Registry
   * (OWNER_MODE_INPUT_NORMALIZATION_LAYER_SPEC.md, Section 6).
   * Validated: must be in the approved canonical key list.
   * Unknown canonical keys fail with UNKNOWN_CANONICAL_KEY.
   */
  canonical_key: string;

  /**
   * Which evidence_item (by index into evidence_items[]) this metric
   * is attached to. The metric's value will be placed in
   * evidence_items[evidence_item_index].supportingData[canonical_key].
   * Validated: index must be in range; referenced item's dimension must be
   * compatible with the canonical key (see Section 5.1).
   */
  evidence_item_index: number;

  /**
   * Optional: explicit numeric value override if the fixture value requires
   * a simple deterministic transformation (e.g., converting days to months:
   * 60 days → ~2.0 months). If provided, the normalization layer uses this
   * value instead of the raw fixture value.
   * If omitted, the raw fixture value is used as-is.
   *
   * RULE: transforms are only permitted for unit conversions (days→months,
   * pct→decimal, inverse). No business logic transforms are permitted
   * (no computed profitability, no derived LTV, no modeled metrics).
   * The transform_note field MUST explain the conversion when value_override is used.
   */
  value_override?: number;

  /** Required when value_override is present. Explains the unit conversion. */
  transform_note?: string;
}
```

### 5.1 Canonical-Key-to-Dimension Compatibility

The following table defines which canonical key is compatible with which engine dimension. The validator enforces this — a metric mapped to an incompatible dimension fails with `METRIC_DIMENSION_MISMATCH`.

| Canonical Key | Required Dimension |
|---|---|
| `cashRunwayMonths`, `runwayMonths`, `dso`, `cashConversionDays`, `contribution`, `contributionMargin`, `contributionPerMember`, `variableCost`, `price`, `profitChangePercent`, `marginPct`, `operatingMargin`, `leverageRatio`, `covenantHeadroom`, `interestCoverage`, `discountPct`, `realizedPrice`, `listPrice`, `capexAmount`, `reversibility`, `receivablesAging`, `dpo` | `financial_health` |
| `newCustomerRate`, `leadVolume`, `pipelineValue`, `funnelConversionPct`, `channelCac`, `channelMix`, `channelConversionPct`, `demandDurabilityMonths` | `market_position` |
| `forecastErrorPct` | `operational_efficiency` |
| `keyPersonCount`, `successionReady`, `revenueConcentrationPct` | `team_capability` |
| `complianceGapCount`, `regulatoryDeadlineDays`, `exposureAmount` | `process_maturity` |

---

## 6. `unsupported_expected_archetypes[]` Schema

```typescript
interface UnsupportedArchetypeEntry {
  /**
   * The SMB fixture's primary_root_cause or secondary_causes label that
   * has no corresponding engine DiagnosisType.
   */
  smb_label: string;

  /**
   * Why this label has no engine archetype. Must be one of:
   * - "NO_ENGINE_ARCHETYPE" — the engine has no DiagnosisType for this concept
   * - "ARCHETYPE_REQUIRES_UNPROVIDABLE_NUMERIC" — the archetype exists but
   *   requires a supportingData numeric the fixture cannot supply without
   *   a case-specific computation
   */
  gap_reason: "NO_ENGINE_ARCHETYPE" | "ARCHETYPE_REQUIRES_UNPROVIDABLE_NUMERIC";

  /**
   * The closest engine DiagnosisType, if any. "none" if there is no close match.
   * Used for documentation only — not used for scoring or routing.
   */
  closest_engine_archetype: string;

  /**
   * What engine archetype extension would be needed to cover this case.
   * Plain text. Required — forces the author to think about the gap.
   */
  recommended_extension: string;
}
```

**Pre-populated gap entries for the three known gap cases:**

```json
// SMB-005
{
  "smb_label": "revenue_concentration_single_client_dependency",
  "gap_reason": "NO_ENGINE_ARCHETYPE",
  "closest_engine_archetype": "key_person_risk",
  "recommended_extension": "Add REVENUE_CONCENTRATION_RISK DiagnosisType to cover single-client or single-channel dependency scenarios where the concentration is financial rather than knowledge-based."
}

// SMB-009
{
  "smb_label": "staff_turnover_cost_spiral",
  "gap_reason": "NO_ENGINE_ARCHETYPE",
  "closest_engine_archetype": "none",
  "recommended_extension": "Add STAFF_TURNOVER_COST_SPIRAL DiagnosisType covering high-frequency field-staff churn with measurable training/recruiting cost drain and service quality deterioration."
}

// SMB-011
{
  "smb_label": "product_market_fit_gap_audience_engagement_without_paid_validation",
  "gap_reason": "ARCHETYPE_REQUIRES_UNPROVIDABLE_NUMERIC",
  "closest_engine_archetype": "demand_generation_failure",
  "recommended_extension": "The existing demand_generation_failure archetype requires newCustomerRate or leadVolume numerics. Extend it or add a PRODUCT_MARKET_FIT_GAP archetype that triggers on low paid_conversion_rate numeric alongside engagement metrics (email open rate, free user count) without requiring new-customer volume data."
}
```

---

## 7. `clarification_requests[]` Schema

```typescript
interface ClarificationRequestHint {
  /**
   * Index into fixture.scenario.missing_inputs_opsiq_should_request[].
   * Validated: must be in range.
   */
  missing_input_index: number;

  /**
   * The canonical metric key this missing input would provide, if it maps
   * to one. Used to cross-reference with metric_key_mappings — if a metric
   * is missing from metric_key_mappings AND appears here, it confirms the
   * metric is genuinely unknown (not just unmapped).
   * Null if the missing input is qualitative with no canonical key.
   */
  canonical_key_if_applicable: string | null;

  /**
   * The engine pattern this metric would improve, if provided.
   * E.g., "fin_isWorkingCapital (requires dso numeric for HIGH confidence)".
   * Informational only.
   */
  would_improve_pattern: string | null;
}
```

---

## 8. Allowed Dimension Values

The `dimension` field in `evidence_items[].dimension` and `metric_key_mappings[].evidence_item_index` (via dimension compatibility) must be exactly one of these 7 values:

```
"financial_health"
"operational_efficiency"
"quality_delivery"
"process_maturity"
"team_capability"
"market_position"
"customer_retention"
```

Any other value fails validation with `INVALID_DIMENSION: "{value}"`. Strings with extra whitespace, incorrect case, or underscores replaced by spaces all fail.

---

## 9. Fail-Closed Validation Rules

All rules are hard failures. There are no warnings in sidecar validation — every rule is binary pass/fail.

| Rule | Error Code | Condition |
|---|---|---|
| Sidecar file missing | `SIDECAR_MISSING` | File `evidence-hints/{case_id}.evidence-hints.json` does not exist |
| `case_id` mismatch | `CASE_ID_MISMATCH` | `sidecar.case_id !== fixture.case_id` |
| `case_id` format invalid | `INVALID_CASE_ID` | Does not match `/^SMB-\d{3}$/` |
| `fixture_version` blank | `MISSING_FIXTURE_VERSION` | `fixture_version` is absent or empty string |
| `evidence_items` empty | `NO_EVIDENCE_ITEMS` | `evidence_items` array is empty or missing |
| `evidence_items[i].dimension` invalid | `INVALID_DIMENSION` | Value not in the 7-value enum |
| `evidence_items[i].source_path` invalid | `SOURCE_PATH_NOT_FOUND` | Path does not resolve to a non-blank string in the fixture |
| `evidence_items[i].source_path` references outcome fields | `OUTCOME_PATH_FORBIDDEN` | Path starts with `expected_opsiq_diagnosis` |
| `evidence_items[i].no_outcome_leakage` is not `true` | `OUTCOME_LEAKAGE_DECLARED` | Field is `false`, absent, or any non-`true` value |
| `evidence_items[i].finding` contains known outcome terms | `OUTCOME_LEAKAGE_DETECTED` | Finding text contains the fixture's `primary_root_cause` string, any `must_identify` term verbatim, or any `expected_first_action` substring longer than 6 words |
| `evidence_items[i].finding` is blank | `BLANK_FINDING` | Empty string or whitespace-only |
| `evidence_items[i].rationale` too short | `RATIONALE_TOO_SHORT` | Fewer than 10 characters |
| `evidence_items[i].is_critical` absent | `MISSING_IS_CRITICAL` | Field not present (no default allowed) |
| `evidence_items[i].confidence` invalid | `INVALID_CONFIDENCE` | Not one of `LOW`, `MEDIUM`, `HIGH`, `PROVISIONAL` |
| `metric_key_mappings[j].fixture_key` not in fixture | `FIXTURE_KEY_NOT_FOUND` | Key does not exist in `fixture.scenario.facts_known_to_owner` |
| `metric_key_mappings[j].canonical_key` not in registry | `UNKNOWN_CANONICAL_KEY` | Key not in the canonical metric key registry from Section 6 of normalization spec |
| `metric_key_mappings[j].evidence_item_index` out of range | `METRIC_INDEX_OUT_OF_RANGE` | Index ≥ `evidence_items.length` |
| `metric_key_mappings[j]` dimension mismatch | `METRIC_DIMENSION_MISMATCH` | `canonical_key` requires a different dimension than `evidence_items[evidence_item_index].dimension` |
| `metric_key_mappings[j].value_override` present without `transform_note` | `TRANSFORM_NOTE_REQUIRED` | `value_override` is set but `transform_note` is absent or blank |
| `clarification_requests[k].missing_input_index` out of range | `CLARIFICATION_INDEX_OUT_OF_RANGE` | Index ≥ `fixture.scenario.missing_inputs_opsiq_should_request.length` |
| `unsupported_expected_archetypes` absent | `MISSING_ARCHETYPE_DECLARATION` | Field is absent (must be `[]` for covered cases, non-empty for gap cases) |
| Gap case `engine_archetype_synonym` not null | `SYNONYM_MUST_BE_NULL_FOR_GAP` | A case with `unsupported_expected_archetypes.length > 0` has a non-null `engine_archetype_synonym` |
| Covered case `engine_archetype_synonym` null or invalid | `INVALID_SYNONYM` | A case with `unsupported_expected_archetypes.length === 0` has null or a value not in DiagnosisType enum values |
| `validation_notes` blank | `MISSING_VALIDATION_NOTES` | Absent or empty string |
| Any metric's `misleading_signal` source_path item does not have `finding` prefixed `"Surface signal (not root cause): "` | `MISLEADING_SIGNAL_MISSING_PREFIX` | Finding for a `scenario.misleading_signals[i]` source does not start with the required prefix |

---

## 10. No Case-Specific Adapter Rule

**This is an absolute constraint on every sidecar file.**

A sidecar file MUST contain only declarative evidence annotation. It MUST NOT contain:

- Procedural logic (functions, if/else, loops)
- Per-case transformation code
- Engine trigger vocabulary engineering (wording `finding` to match specific regex patterns)
- Metric values computed from other metric values using business logic
- Hardcoded assumptions about which engine archetype should fire
- Any field whose value was chosen to make the engine output match the fixture's `expected_opsiq_diagnosis`

**The distinction:**
- **Allowed:** "DSO is 67 days" (a fact from the fixture, mapped to `canonical_key: "dso"`)
- **Forbidden:** Choosing `finding: "cash crunch and liquidity crisis"` because you know `LIQUIDITY_HARD` regex matches "cash crunch" and you want `CASH_LIQUIDITY_CRISIS` to fire

**Enforcement mechanism:** The sidecar validator performs outcome-leakage detection (rule `OUTCOME_LEAKAGE_DETECTED`) by checking whether `finding` text contains verbatim `must_identify` terms from the fixture. Additionally, sidecar PR reviews must include a human attestation in `validation_notes` that the `finding` text was derived from the fixture scenario, not from the expected diagnosis.

**The normalization layer must also not perform vocabulary engineering.** It takes `finding` strings verbatim from the sidecar and passes them as `EvidenceItem.finding`. It does not rephrase, enrich, or augment findings.

---

## 11. Authoring Guidance

### 11.1 Converting `scenario.symptoms` into Evidence Items

Each symptom in `scenario.symptoms[]` should become one `EvidenceHintItem` with:

- `source_path`: `"scenario.symptoms[i]"` (where `i` is the symptom's index)
- `finding`: the symptom text verbatim (or a close paraphrase that adds no new information)
- `dimension`: the dimension the symptom belongs to — see the mapping table in Section 4.2 of the Normalization Spec
- `is_critical`: `true` if the symptom represents an acute operational, cash, or quality failure; `false` for softer signals
- `confidence`: `MEDIUM` for most symptoms (owner-reported observations); `HIGH` only if the symptom is backed by a confirmed numeric in `facts_known_to_owner`

**Dimension assignment guide for symptoms:**
- Symptoms about cash, receivables, profitability, margin, cost → `financial_health`
- Symptoms about throughput, capacity, turnaround, inventory, supply chain → `operational_efficiency`
- Symptoms about complaints, quality, defects, NPS → `quality_delivery`
- Symptoms about team, key people, skills, turnover, training → `team_capability`
- Symptoms about market, customers, acquisition, channel, demand → `market_position`
- Symptoms about retention, churn, repeat purchase, loyalty → `customer_retention`
- Symptoms about compliance, governance, legal, controls → `process_maturity`

**When a symptom spans two dimensions:** Create two items with the same `source_path` but different `dimension` values. This is explicitly allowed and expected for complex symptoms.

### 11.2 Converting `scenario.facts_known_to_owner` into a Supporting Evidence Item

Facts are not evidence items by themselves — they are `supportingData` numerics attached to a relevant evidence item. The recommended pattern:

1. Create one `EvidenceHintItem` per dimension that has facts in it. The `finding` for this item is a summary sentence describing the financial or operational picture, e.g.:
   - `"Working capital position: $280K receivables outstanding against $140K payables due with net bank balance of $14K"`
   - `"Unit economics: CAC of $95 against 12-month LTV of $82 yields negative contribution of -$13 per customer"`

2. Map each relevant fact to a `metric_key_mappings` entry pointing at that item's index.

3. The `source_path` for the summary evidence item should be `"scenario.facts_known_to_owner"` (the whole facts block — the finding is a synthesis). The validator checks that this path resolves to a non-empty object.

**Metric key mapping examples:**

| `facts_known_to_owner` key | `canonical_key` | Notes |
|---|---|---|
| `receivables_outstanding_usd` | `receivablesAging` | Receivables amount in USD, not days — value_override may be needed if aging data in days is available |
| `average_client_payment_terms_days` | `dso` | Client payment terms in days approximates DSO |
| `days_sales_outstanding` | `dso` | Direct match — no transform needed |
| `contribution_margin_after_cac_usd` | `contribution` | Contribution margin per customer in USD |
| `estimated_cac_usd` | (no canonical key) | CAC as a standalone value has no canonical key; include in finding text instead |
| `gross_margin_pct` | `marginPct` | Gross margin in percent — confirm whether it is negative or declining |
| `monthly_loss_usd` | (no canonical key) | Use in finding text; no direct canonical key |
| `blended_roas` | (no canonical key) | ROAS is not a canonical engine key; include in finding text |
| `breakeven_occupancy_pct` | (no canonical key) | Not a canonical key; include in finding text |
| `annual_turnover_rate_pct` | (no canonical key) | Not a canonical key; include in finding text |

When a fact key has no canonical key, include the value in the `finding` text for that evidence item instead of as a metric entry.

### 11.3 Converting `scenario.misleading_signals` into Evidence Items

Misleading signals are NOT root-cause evidence — they are observations that could distract the engine or confuse the diagnosis. Include them as non-critical evidence items so the engine sees them, but prefix the finding to make their nature unambiguous:

```json
{
  "source_path": "scenario.misleading_signals[0]",
  "finding": "Surface signal (not root cause): revenue is up 18% year-over-year and appears healthy",
  "dimension": "financial_health",
  "is_critical": false,
  "confidence": "LOW",
  "no_outcome_leakage": true,
  "rationale": "Revenue growth is present but is a misleading signal masking the working capital trap. Included as non-critical financial_health item so the engine does not use it as evidence of health."
}
```

**Rules for misleading signals:**
- `is_critical` MUST be `false`
- `confidence` MUST be `LOW`
- `finding` MUST start with `"Surface signal (not root cause): "`
- Should be assigned to the same dimension as the most relevant non-misleading evidence item

### 11.4 Converting `missing_inputs_opsiq_should_request` into Clarification Requests

Missing inputs do not become evidence items — they become `clarification_requests[]` entries. For each missing input that corresponds to a canonical metric key, create an entry:

```json
{
  "missing_input_index": 2,
  "canonical_key_if_applicable": "cashConversionDays",
  "would_improve_pattern": "fin_isWorkingCapital (requires cashConversionDays numeric for HIGH confidence)"
}
```

For qualitative missing inputs (e.g., "exit interview data"), set `canonical_key_if_applicable: null` and `would_improve_pattern: null`.

### 11.5 Handling Archetype-Gap Cases (SMB-005, SMB-009, SMB-011)

For cases with no engine archetype:

1. Still author all evidence items normally using the `finding` text, dimension, criticality, and metrics approach above
2. Set `unsupported_expected_archetypes` to the pre-populated entry from Section 6
3. Set `engine_archetype_synonym: null`
4. The normalization layer will still produce valid `EvidenceItem[]` and call the engine
5. The engine will return `DiagnosisType.UNKNOWN` or `INSUFFICIENT_EVIDENCE`
6. The scoring harness treats this as PASS (abstention_eligible)
7. Document in `validation_notes` that the case is archetype-gap and what the engine correctly identifies despite not matching the primary label

---

## 12. Validation Test Plan

These tests belong in `tests/owner-mode/real-world-smb-cases/evidenceHintSidecar.test.ts`.

| Test name | What it does | Expected result |
|---|---|---|
| `valid SMB-001 sidecar passes all rules` | Load a valid sidecar matching the schema exactly | PASS — no errors |
| `case_id mismatch fails` | Sidecar has `case_id: "SMB-002"` but filename is `SMB-001.evidence-hints.json` | FAIL: `CASE_ID_MISMATCH` |
| `missing sidecar file fails` | Request sidecar for a case_id with no file | FAIL: `SIDECAR_MISSING` |
| `invalid dimension fails` | `evidence_items[0].dimension = "finances"` | FAIL: `INVALID_DIMENSION: "finances"` |
| `dimension not in enum fails` | `evidence_items[0].dimension = "financial health"` (space instead of underscore) | FAIL: `INVALID_DIMENSION: "financial health"` |
| `unknown canonical key fails` | `metric_key_mappings[0].canonical_key = "bank_balance_usd"` | FAIL: `UNKNOWN_CANONICAL_KEY: "bank_balance_usd"` |
| `source_path not in fixture fails` | `evidence_items[0].source_path = "scenario.symptoms[99]"` | FAIL: `SOURCE_PATH_NOT_FOUND` |
| `outcome path forbidden fails` | `evidence_items[0].source_path = "expected_opsiq_diagnosis.primary_root_cause"` | FAIL: `OUTCOME_PATH_FORBIDDEN` |
| `no_outcome_leakage false fails` | `evidence_items[0].no_outcome_leakage = false` | FAIL: `OUTCOME_LEAKAGE_DECLARED` |
| `no_outcome_leakage absent fails` | `evidence_items[0]` has no `no_outcome_leakage` field | FAIL: `OUTCOME_LEAKAGE_DECLARED` |
| `finding contains primary_root_cause string fails` | `finding` contains the fixture's `primary_root_cause` verbatim | FAIL: `OUTCOME_LEAKAGE_DETECTED` |
| `finding contains must_identify term fails` | `finding` contains a term from `scoring_criteria.must_identify` | FAIL: `OUTCOME_LEAKAGE_DETECTED` |
| `blank finding fails` | `evidence_items[0].finding = ""` | FAIL: `BLANK_FINDING` |
| `rationale too short fails` | `evidence_items[0].rationale = "ok"` | FAIL: `RATIONALE_TOO_SHORT` |
| `is_critical absent fails` | `evidence_items[0]` has no `is_critical` field | FAIL: `MISSING_IS_CRITICAL` |
| `invalid confidence fails` | `evidence_items[0].confidence = "CERTAIN"` | FAIL: `INVALID_CONFIDENCE: "CERTAIN"` |
| `fixture_key not in fixture facts fails` | `metric_key_mappings[0].fixture_key = "nonexistent_key"` | FAIL: `FIXTURE_KEY_NOT_FOUND` |
| `metric index out of range fails` | `metric_key_mappings[0].evidence_item_index = 999` | FAIL: `METRIC_INDEX_OUT_OF_RANGE` |
| `metric dimension mismatch fails` | `canonical_key: "dso"` assigned to item with `dimension: "market_position"` | FAIL: `METRIC_DIMENSION_MISMATCH` |
| `value_override without transform_note fails` | `value_override: 2.0` with no `transform_note` | FAIL: `TRANSFORM_NOTE_REQUIRED` |
| `unsupported_expected_archetypes absent fails` | Sidecar has no `unsupported_expected_archetypes` field | FAIL: `MISSING_ARCHETYPE_DECLARATION` |
| `gap case with non-null synonym fails` | SMB-005 sidecar with `engine_archetype_synonym: "key_person_risk"` | FAIL: `SYNONYM_MUST_BE_NULL_FOR_GAP` |
| `covered case with null synonym fails` | SMB-001 sidecar with `engine_archetype_synonym: null` | FAIL: `INVALID_SYNONYM` |
| `misleading signal without prefix fails` | Misleading signal item's finding does not start with `"Surface signal (not root cause): "` | FAIL: `MISLEADING_SIGNAL_MISSING_PREFIX` |
| `misleading signal with is_critical true fails` | Misleading signal item has `is_critical: true` | FAIL (via `is_critical` contradiction — must be enforced in validator) |
| `blank validation_notes fails` | `validation_notes: ""` | FAIL: `MISSING_VALIDATION_NOTES` |
| `clarification index out of range fails` | `clarification_requests[0].missing_input_index = 999` | FAIL: `CLARIFICATION_INDEX_OUT_OF_RANGE` |
| `valid gap sidecar (SMB-005) passes` | SMB-005 sidecar with `unsupported_expected_archetypes` populated, `engine_archetype_synonym: null` | PASS |
| `all 12 sidecar files present when directory exists` | When all 12 files exist, count check passes | PASS — all 12 loaded |
| `any missing sidecar when 12 expected` | Only 11 files present | FAIL: `SIDECAR_MISSING` for the absent case_id |

---

## 13. Implementation Gate

**No normalization layer code may be implemented until all 12 sidecar files exist and pass all validation tests.**

This gate is enforced by:

1. **A count gate in the sidecar validator:** The validator checks that exactly 12 sidecar files exist in `evidence-hints/`, one per case in the fixture JSONL. If any is missing, the gate fails with `SIDECAR_MISSING`.

2. **A CI step:** The `owner-real-world-smb-cases.yml` workflow (or a new step in it) runs the sidecar validator before any normalization layer tests. If the validator fails, the CI job fails.

3. **Documentation rule:** The normalization layer spec (`OWNER_MODE_INPUT_NORMALIZATION_LAYER_SPEC.md`) states the implementation gate explicitly. No PR implementing the normalization layer may be merged before the sidecar count and validation gates pass.

**Rationale:** The normalization layer without sidecars has no valid test inputs for engine integration tests. Implementing the layer before sidecars exist means implementing untestable code. The sidecars are not optional enrichment — they are the only valid inputs to the integration test path.

---

## Canonical DiagnosisType Synonym Table

For sidecar `engine_archetype_synonym` field — covered cases only.

| SMB `primary_root_cause` | `engine_archetype_synonym` | Engine `DiagnosisType` value |
|---|---|---|
| `working_capital_cash_flow_trap` | `working_capital_stress` | `"working_capital_stress"` |
| `inventory_cash_trap` | `inventory_forecasting_mismatch` | `"inventory_forecasting_mismatch"` |
| `negative_unit_economics_paid_acquisition` | `unit_economics_failure` | `"unit_economics_failure"` |
| `prime_cost_margin_erosion` | `margin_erosion` | `"margin_erosion"` |
| `revenue_concentration_single_client_dependency` | null (gap) | N/A |
| `fixed_cost_overextension_below_breakeven` | `unit_economics_failure` | `"unit_economics_failure"` |
| `owner_capacity_bottleneck_revenue_ceiling` | `operational_bottleneck` | `"operational_bottleneck"` |
| `accounts_receivable_cash_flow_gap` | `working_capital_stress` | `"working_capital_stress"` |
| `staff_turnover_cost_spiral` | null (gap) | N/A |
| `input_cost_margin_compression_without_pricing_response` | `margin_erosion` | `"margin_erosion"` |
| `product_market_fit_gap_audience_engagement_without_paid_validation` | null (gap) | N/A |
| `unit_economics_failure_premature_expansion` | `unit_economics_failure` | `"unit_economics_failure"` |

---

## Annotated Skeleton for SMB-001 (Reference Only)

The following skeleton shows the structure an author should fill in for SMB-001. It is not a valid sidecar — values are placeholders.

```json
{
  "case_id": "SMB-001",
  "fixture_version": "2026-06-20",
  "engine_archetype_synonym": "working_capital_stress",
  "unsupported_expected_archetypes": [],
  "evidence_items": [
    {
      "source_path": "scenario.symptoms[0]",
      "finding": "owner cannot make payroll without credit line draw",
      "dimension": "financial_health",
      "is_critical": true,
      "confidence": "HIGH",
      "no_outcome_leakage": true,
      "rationale": "Payroll inability is an acute liquidity signal. Assigned financial_health; is_critical=true because this matches LIQUIDITY_HARD pattern requirements. Confidence HIGH because owner confirms this is current reality."
    },
    {
      "source_path": "scenario.symptoms[1]",
      "finding": "bank balance declining each month despite revenue growth",
      "dimension": "financial_health",
      "is_critical": false,
      "confidence": "MEDIUM",
      "no_outcome_leakage": true,
      "rationale": "Declining bank balance is a financial health signal but softer than payroll inability. Revenue growth makes this a working-capital signal, not a demand signal. financial_health dimension correct."
    },
    {
      "source_path": "scenario.symptoms[2]",
      "finding": "supplier relationships strained by late payments",
      "dimension": "operational_efficiency",
      "is_critical": false,
      "confidence": "MEDIUM",
      "no_outcome_leakage": true,
      "rationale": "Supplier strain is an operational consequence of the cash flow problem. Assigned operational_efficiency because it affects supply chain and operations, not purely financial structure."
    },
    {
      "source_path": "scenario.symptoms[3]",
      "finding": "owner reports feeling confused — sales are up but business feels financially stressed",
      "dimension": "financial_health",
      "is_critical": false,
      "confidence": "LOW",
      "no_outcome_leakage": true,
      "rationale": "Owner-perception signal. Low confidence because it is subjective. Assigned financial_health because the confusion concerns financial performance, not operations or market."
    },
    {
      "source_path": "scenario.facts_known_to_owner",
      "finding": "Working capital position: receivables of $280K outstanding with average client payment terms of 60 days; payables of $140K due with average supplier terms of 30 days; net bank balance $14K; credit line drawn $85K",
      "dimension": "financial_health",
      "is_critical": true,
      "confidence": "HIGH",
      "no_outcome_leakage": true,
      "rationale": "Structured fact summary for working-capital metrics. is_critical=true and HIGH confidence because these are confirmed owner-known figures, not estimates. The 60-day client / 30-day supplier mismatch is the structural working-capital gap. Finding text synthesizes the facts without using outcome vocabulary."
    },
    {
      "source_path": "scenario.misleading_signals[0]",
      "finding": "Surface signal (not root cause): revenue is up 18% year-over-year and appears healthy",
      "dimension": "financial_health",
      "is_critical": false,
      "confidence": "LOW",
      "no_outcome_leakage": true,
      "rationale": "Revenue growth is a misleading signal — it masks the working capital trap. Included as non-critical LOW confidence so the engine sees it but does not weight it as distress evidence."
    },
    {
      "source_path": "scenario.misleading_signals[1]",
      "finding": "Surface signal (not root cause): gross margin of 38% looks acceptable for the category",
      "dimension": "financial_health",
      "is_critical": false,
      "confidence": "LOW",
      "no_outcome_leakage": true,
      "rationale": "Gross margin is not the problem — it is adequate. This is a misleading signal that could cause the engine to dismiss financial distress. Included as non-critical."
    },
    {
      "source_path": "scenario.misleading_signals[2]",
      "finding": "Surface signal (not root cause): business has been operating for 6 years and appears profitable on paper",
      "dimension": "financial_health",
      "is_critical": false,
      "confidence": "LOW",
      "no_outcome_leakage": true,
      "rationale": "Business longevity and paper profitability are misleading — they do not indicate healthy cash flow."
    }
  ],
  "metric_key_mappings": [
    {
      "fixture_key": "average_client_payment_terms_days",
      "canonical_key": "dso",
      "evidence_item_index": 4
    },
    {
      "fixture_key": "receivables_outstanding_usd",
      "canonical_key": "receivablesAging",
      "evidence_item_index": 4,
      "value_override": 60,
      "transform_note": "receivables_outstanding_usd is a dollar amount not days; using average_client_payment_terms_days (60 days) as the DSO proxy since aging-in-days is not available. value_override set to the payment terms days figure."
    }
  ],
  "clarification_requests": [
    {
      "missing_input_index": 0,
      "canonical_key_if_applicable": "receivablesAging",
      "would_improve_pattern": "fin_isWorkingCapital (requires dso or cashConversionDays numeric for HIGH confidence)"
    },
    {
      "missing_input_index": 2,
      "canonical_key_if_applicable": "cashConversionDays",
      "would_improve_pattern": "fin_isWorkingCapital (cashConversionDays directly triggers HIGH confidence path)"
    },
    {
      "missing_input_index": 3,
      "canonical_key_if_applicable": null,
      "would_improve_pattern": null
    },
    {
      "missing_input_index": 4,
      "canonical_key_if_applicable": null,
      "would_improve_pattern": null
    }
  ],
  "validation_notes": "SMB-001 is a classic working-capital trap. All evidence items derived from fixture scenario — no outcome vocabulary used. The facts_known_to_owner item (index 4) synthesizes the payment-terms mismatch into a single finding without naming the diagnosis. DSO is approximated from payment terms (60 days) since actual receivables-aging-in-days is not a fixture field — this is a known imprecision documented in the transform_note. Misleading signals included as non-critical LOW-confidence items to test engine resilience."
}
```

---

## Final Output

**Spec created:** `tests/owner-mode/real-world-smb-cases/EVIDENCE_HINT_SIDECAR_SPEC.md`

**Decision:** Sidecars must be authored before normalization layer implementation. The spec is complete. No code is written.

**Implementation allowed now:** NO

Implementation is gated behind:
1. All 12 sidecar files authored and individually passing every validation rule in Section 9
2. Sidecar validator code (`evidenceHintSidecar.test.ts`) passing 100% in CI
3. Count gate confirming 12 files present

**Next exact prompt:**

```
AUTHOR_SMB_EVIDENCE_HINT_SIDECARS

Read:
- tests/owner-mode/real-world-smb-cases/EVIDENCE_HINT_SIDECAR_SPEC.md
- tests/owner-mode/real-world-smb-cases/opsiq_real_world_smb_case_fixtures.jsonl
- src/services/consulting-engine/diagnosis-engine.ts (pattern predicates only)

Mission:
Author all 12 evidence-hint sidecar files exactly conforming to
EVIDENCE_HINT_SIDECAR_SPEC.md.

Create:
  tests/owner-mode/real-world-smb-cases/evidence-hints/SMB-001.evidence-hints.json
  through
  tests/owner-mode/real-world-smb-cases/evidence-hints/SMB-012.evidence-hints.json

Rules:
- No outcome leakage (no must_identify terms in finding text)
- No case-specific adapter logic
- misleading_signals must use required prefix
- Unsupported archetypes must be declared: SMB-005, SMB-009, SMB-011
- All 12 must pass sidecar validator before this task is considered complete

After authoring, run validation tests and report:
  - Files created
  - Validation pass/fail per file
  - Any errors found and corrected
  - Gap cases identified
  - Implementation gate status
```
