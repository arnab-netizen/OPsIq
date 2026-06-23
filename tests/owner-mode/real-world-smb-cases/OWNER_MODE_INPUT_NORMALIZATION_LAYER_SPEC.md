# Owner Mode Input Normalization Layer — Design Specification

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Status:** DESIGN ONLY — no code changed
**Decision:** See Section 12

---

## 1. Problem Statement

The OpsIQ diagnosis engine (`diagnoseRootCause`) operates on a structured `EvidenceItem[]` input: typed canonical dimensions, regex-searchable `finding` strings, named numeric `supportingData` keys, and explicit criticality flags. Real SMB owners do not speak in engine vocabulary. They describe their business with narrative facts, symptom sentences, and business-context key names (e.g., `receivables_outstanding_usd`) rather than canonical engine names (e.g., `dso`).

The SMB Integration Feasibility Report (`SMB_INTEGRATION_FEASIBILITY_REPORT.md`) classified this as `INTEGRATION_BLOCKED_BY_INPUT_MODEL_MISMATCH` with three independent blockers:

1. No `dimension` field in narrative owner input
2. `supportingData` key name vocabulary mismatch
3. Three SMB root-cause labels with no engine archetype

This spec designs a generic normalization layer that converts messy SMB owner narratives into valid `EvidenceItem[]` without case-specific rules, case-specific logic, or engine changes. It does not solve the three missing archetypes — those require a separate engine extension decision.

---

## 2. Current Mismatch Summary

| Gap | SMB Fixture Format | Engine Requirement | Resolvable Without Case Rules? |
|---|---|---|---|
| Dimension classification | Not present | Required on every `EvidenceItem` | **Yes** — if owner provides explicit dimension hints |
| `supportingData` key names | Human-readable (`receivables_outstanding_usd`) | Canonical (`dso`) | **Yes** — via a canonical metric registry |
| `isCritical` flag | Not present | Optional but triggers many patterns | **Yes** — via explicit criticality declaration |
| `confidence` level | Not present | Required enum | **Yes** — defaults to `MEDIUM` when absent; owner can override |
| Root-cause label mapping | Narrative labels | Engine `DiagnosisType` enum | **Partially** — synonym table for covered types; unsupported types declared as gaps |
| Missing inputs | `missing_inputs_opsiq_should_request` | Engine cannot request inputs mid-run | **Yes** — clarification-request layer runs before evidence is submitted |
| Misleading signals | `misleading_signals` | Not an engine concept | **Yes** — converted to non-critical evidence items with explicit framing |

---

## 3. Proposed Normalized Owner-Input Schema

This schema is what the normalization layer accepts from an owner or fixture. It is **not** the engine's `EvidenceItem[]` — it is the layer's input contract. The layer converts it into `EvidenceItem[]`.

```typescript
/**
 * NormalizedOwnerInput — the contract between an SMB owner (or fixture)
 * and the normalization layer. Fields map explicitly to engine requirements
 * without requiring the owner to know EvidenceItem vocabulary.
 */
interface NormalizedOwnerInput {
  // ── Identity ────────────────────────────────────────────────────────────
  /** Stable case or session identifier. Used for deterministic UUID generation. */
  inputId: string;

  /** Free-text business description (becomes `businessProblem` for the engine). */
  businessDescription: string;

  /** Segment tag (e.g., "retail_smb", "solopreneur"). Used for context, not routing. */
  segment?: string;

  // ── Evidence items (owner-authored, pre-classified) ─────────────────────
  /**
   * Each evidence item must carry an explicit dimension. The layer NEVER guesses
   * dimension from content. If dimension is absent or unrecognized, the layer
   * MUST emit a clarification request and MUST NOT fabricate a dimension.
   */
  evidenceItems: NormalizedEvidenceItem[];

  // ── Metrics (optional structured facts) ─────────────────────────────────
  /**
   * Structured metrics using canonical keys from the Metric Key Registry (Section 6).
   * The layer maps these to EvidenceItem.supportingData[canonicalKey].
   * Metrics with unknown keys MUST be reported, not silently dropped.
   */
  metrics?: NormalizedMetricEntry[];

  // ── Context ─────────────────────────────────────────────────────────────
  clientContext?: {
    industry: string;
    size: string;
    revenueImpactUrgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };

  ownerConstraintProfile?: {
    budgetBand?: string;
    timeHorizonDays?: number;
    staffCapacity?: string;
    cashRunwayMonths?: number | null;
    legalComplianceSensitive?: boolean;
  };
}

/**
 * An evidence item from the owner's perspective.
 * `dimension` is REQUIRED — the layer cannot infer it.
 */
interface NormalizedEvidenceItem {
  /** REQUIRED. Must match one of the 7 canonical engine dimension values. */
  dimension: EvidenceDimension;

  /** The finding in plain language. Will be used verbatim as EvidenceItem.finding. */
  finding: string;

  /**
   * Whether this item represents a critical adverse signal.
   * Owner MUST declare this explicitly. The layer defaults to false but emits
   * a warning when isCritical is absent on findings containing critical-signal
   * vocabulary (see Section 7 — Clarification Request Policy).
   */
  isCritical?: boolean;

  /** Optional confidence override. Defaults to MEDIUM when absent. */
  confidence?: "LOW" | "MEDIUM" | "HIGH" | "PROVISIONAL";

  /** Optional source attribution. Defaults to "owner-input". */
  source?: string;
}

/**
 * A structured metric with a canonical key for supportingData mapping.
 * The `dimension` here is the dimension this metric belongs to — it MUST be
 * provided; the layer does not guess it from the key name.
 */
interface NormalizedMetricEntry {
  /** The canonical supportingData key (from Section 6 registry). */
  canonicalKey: string;

  /** The numeric value. */
  value: number;

  /**
   * Which dimension's EvidenceItem this metric should be attached to.
   * Must match an existing evidenceItem's dimension in the same input,
   * OR must be provided as a standalone finding in addition to this metric.
   */
  dimension: EvidenceDimension;

  /**
   * Optional human-readable label (e.g., "Receivables Outstanding"). Not
   * used by the engine. Stored for audit and clarification-request generation.
   */
  label?: string;
}

type EvidenceDimension =
  | "financial_health"
  | "operational_efficiency"
  | "quality_delivery"
  | "process_maturity"
  | "team_capability"
  | "market_position"
  | "customer_retention";
```

---

## 4. Evidence Dimension Taxonomy

### 4.1 The Seven Canonical Dimensions

| Dimension | Covers | SMB Examples |
|---|---|---|
| `financial_health` | Cash, liquidity, working capital, debt, unit economics, margin, pricing realization | Bank balance, receivables, gross margin, CAC/LTV, contribution margin |
| `operational_efficiency` | Throughput, capacity, speed, inventory, supply chain, forecasting | Bottlenecks, turnaround time, stockouts, lead times |
| `quality_delivery` | Defects, complaints, SLA, NPS, recall, consistency | Quality complaints, return rates, service failures |
| `process_maturity` | Governance, compliance, legal, controls, documentation | Regulatory exposure, contract controls, founder-death |
| `team_capability` | Key-person dependency, skills gaps, succession, turnover | Sole operator, rainmaker, undocumented knowledge |
| `market_position` | Strategy, demand, channels, competitive dynamics, pricing power | Paid acquisition, GTM, new-customer demand, market disruption |
| `customer_retention` | Repeat rate, churn, loyalty, NPS trajectory, referral | One-time buyers, churn rate, repeat purchase rate |

### 4.2 Dimension Assignment Rules for the Normalization Layer

1. **The layer NEVER assigns a dimension from content.** Dimension must come from the owner-input schema or from an explicit fixture `evidenceHints` array (see Section 11 — Migration Path).
2. **Ambiguous dimension is a clarification request, not a guess.** If an owner provides a finding without dimension, the layer asks which dimension applies; it does not proceed.
3. **Same finding, multiple dimensions:** A finding that is relevant to two dimensions must be split into two `NormalizedEvidenceItem` entries, each with its own explicit dimension and criticality flag.
4. **Dimension validation is strict:** Any dimension value not in the 7-value enum causes an immediate `INVALID_DIMENSION` error with the exact unrecognized value reported.

### 4.3 Dimension Hints for Existing SMB Fixtures

Existing SMB fixtures (`opsiq_real_world_smb_case_fixtures.jsonl`) do not carry dimension labels. To migrate them (Section 11), each fixture must be enriched with an `evidence_hints` array — one entry per symptom/fact group — declaring:

- Which dimension each symptom belongs to
- Whether it should be flagged as `isCritical`
- Which `facts_known_to_owner` keys map to canonical metric keys (Section 6)

This is a **one-time enrichment** per fixture, not a per-case rule embedded in the normalization layer. The normalization layer itself remains generic.

---

## 5. What Each Field Does and Does Not Require

### 5.1 Fields That Can Be Derived Deterministically (no user input required)

| Field | Derivation Rule | Evidence |
|---|---|---|
| `EvidenceItem.id` | `uuidv5(inputId + "#ev#" + index, STABLE_NAMESPACE)` | Historical replay adapter uses this pattern exactly (`run-historical-validation.ts:186-188`); stable, reproducible, no collision if `inputId` is unique |
| `EvidenceItem.timestamp` | `new Date(0)` | Engine never consults `timestamp` in any pattern predicate; historical replay uses `new Date(0)` |
| `EvidenceItem.source` | `owner-input` (or override from `NormalizedEvidenceItem.source`) | Engine uses `source` only for audit; any non-blank string is valid |
| `EvidenceItem.confidence` | Default `MEDIUM` when absent; use `NormalizedEvidenceItem.confidence` when provided | Historical replay uses `MEDIUM` default; some engine patterns check for `ConfidenceLevel.HIGH` to elevate confidence, so owner SHOULD provide HIGH where known |

### 5.2 Fields That Require Explicit User-Provided Classification (MUST NOT be guessed)

| Field | Why It Cannot Be Guessed | Consequence of Guessing |
|---|---|---|
| `EvidenceItem.dimension` | Every engine pattern gate-checks `e.dimension` first; wrong dimension silently prevents pattern from firing even with perfect `finding` text | Silent false negatives: engine returns `INSUFFICIENT_EVIDENCE` when the correct diagnosis exists |
| `EvidenceItem.isCritical` | Patterns for `operational_bottleneck`, `quality_delivery`, `customer_retention`, and `key_person` require `isCritical=true`; heuristic flagging (on keywords like "critical", "cannot") would be inconsistent and unauditable | Silent pattern misses for operational/quality/retention archetypes |
| `supportingData` canonical key name | Engine confidence elevation uses specific key names (`dso`, `cashRunwayMonths`, `contribution`, `discountPct`); wrong key names mean HIGH confidence is never elevated | Engine always returns MODERATE confidence even when data supports HIGH |

### 5.3 Fields That Must Never Be Inferred Silently

The following fields must NEVER be set by the normalization layer without an explicit owner-provided value:

1. **`dimension`** — the single most important gate in every engine pattern. Silent inference = systematic mis-diagnosis.
2. **`isCritical`** — three engine pattern families require `isCritical=true`. Silent defaulting to `false` suppresses these archetypes entirely.
3. **`supportingData` key names** — must come from the canonical registry or be explicitly provided; the layer must not rename human-readable keys by guessing intent.
4. **Any metric value derived from computation on other metrics** — e.g., computing `contribution = revenue - variableCost` from separate fact fields. This is semantic inference and must not happen without explicit owner authorization.

---

## 6. Canonical Metric Key Registry

This registry is the **only** mechanism for bridging human-readable fact key names to engine `supportingData` key names. The normalization layer consults this registry when processing `NormalizedOwnerInput.metrics[]`. Any fact key not in this registry triggers a clarification request — it is never silently dropped or renamed.

### 6.1 Financial Health Keys

| Canonical Key | Type | Engine Pattern That Uses It | Human-Readable Aliases (examples) |
|---|---|---|---|
| `cashRunwayMonths` | number | `fin_isLiquidityCrisis` (≤6 fires; ≤3 → HIGH) | `runway_months`, `months_of_cash`, `cash_runway_months` |
| `runwayMonths` | number | `fin_runwayMonths()` alias for `cashRunwayMonths` | (secondary alias) |
| `dso` | number | `fin_isWorkingCapital` (≥70 → HIGH) | `days_sales_outstanding`, `ar_days`, `collection_days` |
| `cashConversionDays` | number | `fin_isWorkingCapital` | `cash_conversion_cycle`, `ccc_days` |
| `contribution` | number | `fin_isUnitEconomicsFailure` (<0 fires) | `contribution_margin_usd`, `per_unit_contribution` |
| `contributionMargin` | number | `fin_isUnitEconomicsFailure` (<0 fires) | `contribution_margin`, `contribution_margin_after_cac_usd` |
| `contributionPerMember` | number | `fin_isUnitEconomicsFailure` (<0 fires) | `contribution_per_member`, `per_member_margin` |
| `variableCost` | number | `fin_isUnitEconomicsFailure` (> price fires) | `variable_cost_per_unit`, `cogs_per_unit` |
| `price` | number | `fin_isUnitEconomicsFailure` (variableCost > price fires) | `selling_price`, `average_selling_price`, `average_order_value_usd` |
| `profitChangePercent` | number | `fin_isMarginErosion` (<0 fires) | `profit_change_pct`, `net_income_change_pct` |
| `marginPct` | number | `fin_isMarginErosion` (<0 fires) | `gross_margin_pct`, `net_margin_pct`, `margin_pct` |
| `operatingMargin` | number | `fin_isMarginErosion` (<0 fires) | `operating_margin_pct`, `ebitda_margin_pct` |
| `leverageRatio` | number | `fin_isDebtSolvency` (≥4 → HIGH) | `debt_to_ebitda`, `leverage_multiple` |
| `covenantHeadroom` | number | `fin_isDebtSolvency` (≤0.06 → HIGH) | `covenant_headroom_pct`, `covenant_cushion` |
| `interestCoverage` | number | `fin_isDebtSolvency` (≤1.3 → HIGH) | `interest_coverage_ratio`, `dscr` |
| `discountPct` | number | `fin_isPricingPower` (≥15 → HIGH) | `average_discount_pct`, `discount_rate`, `markdown_pct` |
| `realizedPrice` | number | `fin_isPricingPower` | `actual_selling_price`, `net_realized_price` |
| `listPrice` | number | `fin_isPricingPower` | `list_price`, `msrp`, `rack_rate` |
| `capexAmount` | number | `fin_isStrategicCapex` | `capital_expenditure_usd`, `investment_amount_usd` |
| `reversibility` | number (0 or 1) | `fin_isStrategicCapex` (0 = irreversible) | `is_reversible` (map true→1, false→0) |
| `receivablesAging` | number | `fin_isWorkingCapital` | `receivables_aging_days`, `average_ar_age` |
| `dpo` | number | `fin_isWorkingCapital` | `days_payable_outstanding`, `payable_days` |

### 6.2 Market Position Keys

| Canonical Key | Type | Engine Pattern That Uses It | Human-Readable Aliases |
|---|---|---|---|
| `newCustomerRate` | number | `fin_isDemandFailure` | `new_customer_count`, `new_customer_acquisition_rate` |
| `leadVolume` | number | `fin_isDemandFailure` | `lead_count`, `pipeline_leads`, `lead_volume` |
| `pipelineValue` | number | `fin_isDemandFailure` | `pipeline_qualified_leads_value_usd`, `total_pipeline_usd` |
| `funnelConversionPct` | number | `fin_isDemandFailure` | `conversion_rate_pct`, `funnel_conversion_pct`, `paid_conversion_rate_pct` |
| `channelCac` | number | `fin_isGtmMismatch` | `cac_by_channel`, `channel_customer_acquisition_cost` |
| `channelMix` | number | `fin_isGtmMismatch` | `channel_revenue_pct`, `paid_channel_revenue_pct` |
| `channelConversionPct` | number | `fin_isGtmMismatch` | `channel_conversion_pct`, `paid_channel_conversion_rate` |
| `demandDurabilityMonths` | number | `fin_isStrategicCapex` | `contract_length_months`, `demand_horizon_months` |

### 6.3 Operational Efficiency Keys

| Canonical Key | Type | Engine Pattern That Uses It | Human-Readable Aliases |
|---|---|---|---|
| `forecastErrorPct` | number | `fin_isInventoryMismatch` | `forecast_error_pct`, `demand_plan_accuracy_pct` |

### 6.4 Team Capability Keys

| Canonical Key | Type | Engine Pattern That Uses It | Human-Readable Aliases |
|---|---|---|---|
| `keyPersonCount` | number | `fin_isKeyPerson` | `key_person_count`, `owner_operator_count` |
| `successionReady` | number (0 or 1) | `fin_isKeyPerson` (0 fires) | `has_succession_plan` (map true→1, false→0) |
| `revenueConcentrationPct` | number | `fin_isKeyPerson` | `top_client_revenue_pct`, `primary_client_revenue_pct` |

### 6.5 Legal / Compliance Keys

| Canonical Key | Type | Engine Pattern That Uses It | Human-Readable Aliases |
|---|---|---|---|
| `complianceGapCount` | number | `fin_isLegalGovernance` (≥1 → HIGH) | `regulatory_gaps`, `compliance_issues_count` |
| `regulatoryDeadlineDays` | number | `fin_isLegalGovernance` (≤60 → HIGH) | `days_to_regulatory_deadline`, `compliance_deadline_days` |
| `exposureAmount` | number | `fin_isLegalGovernance` | `regulatory_exposure_usd`, `legal_liability_usd` |

### 6.6 Registry Behavior Rules

1. **Unknown canonical key → clarification request, not silent drop.** The layer emits `UNKNOWN_METRIC_KEY: "{rawKey}" has no canonical mapping. Provide the canonical key from the registry or clarify the metric intent.`
2. **Multiple aliases → owner MUST use canonical key in `NormalizedMetricEntry.canonicalKey`.** Aliases are documentation only; the layer does not perform alias lookup.
3. **The registry is version-controlled and append-only.** Removing a key is a breaking change requiring a migration sweep.

---

## 7. Clarification-Request Policy

The normalization layer must produce explicit, actionable clarification requests when required information is absent or ambiguous. It must **not** proceed with fabricated or guessed values.

### 7.1 Mandatory Clarification Triggers (layer blocks, does not proceed)

| Trigger | Error Code | Required Action from Owner |
|---|---|---|
| `NormalizedEvidenceItem` has no `dimension` | `MISSING_DIMENSION` | Provide dimension from the 7-value enum for this finding: `"{finding substring}..."` |
| `dimension` is not one of the 7 canonical values | `INVALID_DIMENSION: "{value}"` | Use one of: financial_health, operational_efficiency, quality_delivery, process_maturity, team_capability, market_position, customer_retention |
| `NormalizedMetricEntry.canonicalKey` is not in the registry | `UNKNOWN_METRIC_KEY: "{key}"` | Replace with a canonical key from the Metric Key Registry, or flag as unsupported |
| `NormalizedMetricEntry.dimension` does not match any `evidenceItems[].dimension` | `METRIC_ORPHAN: "{key}"` | Add an evidenceItem with this dimension, or correct the metric's dimension field |
| `evidenceItems` is empty or not provided | `NO_EVIDENCE` | Provide at least one evidence item with dimension and finding |
| `businessDescription` is blank or absent | `NO_BUSINESS_DESCRIPTION` | Provide a non-blank business description |
| `inputId` is blank or absent | `NO_INPUT_ID` | Provide a stable, unique identifier for this case or session |

### 7.2 Advisory Warnings (layer proceeds but emits warnings)

| Condition | Warning Code | Meaning |
|---|---|---|
| `isCritical` absent on an item whose finding contains critical-signal vocabulary (`cannot`, `missed payroll`, `out of cash`, `straining`, `critical`) | `ICCRITICAL_ABSENT_CRITICAL_VOCABULARY` | Engine patterns for operational_bottleneck, quality_delivery, customer_retention require `isCritical=true`. Confirm whether this item is critical. |
| `confidence` absent and no metric numeric available to elevate confidence | `CONFIDENCE_DEFAULTED_MEDIUM` | Some engine patterns require `ConfidenceLevel.HIGH`. Default `MEDIUM` used. Provide `confidence: "HIGH"` if the data is confirmed. |
| No `financial_health` dimension item present | `NO_FINANCIAL_HEALTH_EVIDENCE` | 11 of 15 engine archetypes require at least one `financial_health` item. Consider whether any fact or symptom belongs to this dimension. |
| `misleading_signals` present in fixture but not mapped to evidence items | `MISLEADING_SIGNALS_UNMAPPED` | Misleading signals are not an engine concept. Each should be converted to a non-critical evidence item with framing such as `"Surface signal: {signal} — this may not represent the root cause."` |

### 7.3 Clarification-Request Format

```
NORMALIZATION_CLARIFICATION_REQUIRED
inputId: {inputId}
errors: [
  { code: "MISSING_DIMENSION", finding: "owner cannot make payroll without credit line draw" },
  { code: "UNKNOWN_METRIC_KEY", key: "bank_balance_usd" }
]
warnings: [
  { code: "ICCRITICAL_ABSENT_CRITICAL_VOCABULARY", finding: "supplier relationships strained..." }
]
proceed: false
```

When `proceed: false`, the layer returns this structure and does NOT call the engine. The owner must resolve all errors before the layer proceeds. Warnings may be resolved or explicitly acknowledged.

---

## 8. Handling Unsupported SMB Root Causes

Three SMB `primary_root_cause` labels have no corresponding engine `DiagnosisType`:

| SMB Label | Engine Coverage | Handling |
|---|---|---|
| `revenue_concentration_single_client_dependency` | None | `ARCHETYPE_GAP` — layer records the gap; engine will return `INSUFFICIENT_EVIDENCE` or `key_person_risk` as closest; scoring must declare this case `archetype_gap: true` |
| `staff_turnover_cost_spiral` | None | `ARCHETYPE_GAP` — same handling |
| `product_market_fit_gap_audience_engagement_without_paid_validation` | None (closest: `demand_generation_failure` but requires specific numerics) | `ARCHETYPE_GAP` — same handling |

### 8.1 Archetype Gap Policy

When a case's `primary_root_cause` is declared as unsupported:

1. The normalization layer MUST still convert available evidence to `EvidenceItem[]` using the normal process.
2. The layer MUST attach an `archetype_gap` flag to the layer output (not to the engine input — the engine never sees it).
3. The scoring harness MUST treat `archetype_gap: true` cases as `abstention_eligible` — a correct `INSUFFICIENT_EVIDENCE` result from the engine is scored as a PASS, not a FAIL.
4. The layer MUST NOT fabricate evidence designed to force the engine toward an incorrect archetype.
5. The gap MUST be recorded in the layer output's `gaps[]` array: `{ case_id, smb_root_cause, engine_coverage: "none", recommended_archetype_extension: "..." }`.

### 8.2 No Synonym Engineering

The layer is permitted to maintain a `DiagnosisType` synonym table for covered cases (e.g., `working_capital_cash_flow_trap → working_capital_stress`), but this table is used **only** for scoring output comparison — never for evidence construction. The synonym table must not influence which evidence items are created or how they are worded.

---

## 9. Fail-Closed Policy

The normalization layer must fail closed under every error condition. "Fail closed" means: when in doubt, block and request clarification rather than proceed with potentially wrong evidence.

### 9.1 Hard Blocks (layer never proceeds)

- Any `MISSING_DIMENSION` error
- Any `INVALID_DIMENSION` error
- Any `UNKNOWN_METRIC_KEY` error
- `NO_EVIDENCE`
- `NO_BUSINESS_DESCRIPTION`
- `NO_INPUT_ID`
- `METRIC_ORPHAN`

### 9.2 Soft Blocks (layer proceeds with explicit acknowledgement)

Advisory warnings do NOT block the layer. However:

- The layer output MUST list all warnings.
- If the calling harness runs in `strict_mode`, warnings are promoted to hard blocks.
- The SMB test harness MUST run in `strict_mode` so no advisory warning silently passes.

### 9.3 Engine Call Guard

The layer MUST NOT call `diagnoseRootCause` (or any engine path) when:

- Any hard block error is present
- `evidenceItems` produces 0 valid `EvidenceItem[]` entries after normalization
- The layer is operating in `strict_mode` AND any advisory warning is unacknowledged

### 9.4 No Silent Degradation

The layer MUST NOT silently drop fields, silently default critical flags, or silently substitute canonical keys. Every substitution, default, and omission must appear in the layer output's `normalizations[]` audit array:

```typescript
normalizations: [
  { field: "confidence", item_index: 0, action: "DEFAULTED", value: "MEDIUM", reason: "not provided" },
  { field: "source", item_index: 0, action: "DEFAULTED", value: "owner-input", reason: "not provided" },
  { field: "timestamp", item_index: 0, action: "SET", value: "1970-01-01T00:00:00.000Z", reason: "engine does not use timestamp" },
]
```

---

## 10. How This Becomes the Owner Mode Onboarding/Input Module

The normalization layer is designed as the input boundary for Owner Mode — the module that translates what a real business owner says into what the engine understands. This is not a harness-only concern.

### 10.1 The Owner Mode Input Flow (target architecture)

```
Owner Input
(UI / conversational / form)
         │
         ▼
NormalizedOwnerInput Schema
(owner provides explicit dimension, isCritical, canonical metric keys)
         │
         ▼
Normalization Layer
(validates, fills defaults, requests clarifications, produces audit log)
         │
         ├── Clarification Request → Owner (if hard block errors present)
         │
         ▼
EvidenceItem[] (valid, canonical, auditable)
         │
         ▼
diagnoseRootCause(evidence, businessDescription)
         │
         ▼
DiagnosisResult + Intervention Plan
```

### 10.2 UI Integration Path

The normalization layer's clarification requests map directly to UI prompts. When the layer returns `MISSING_DIMENSION` for a finding, the UI presents a dimension selector to the owner: "Is this finding about your finances, operations, team, customers, etc.?"

The 7-dimension taxonomy becomes 7 plain-English categories in the UI:
- **Finances** → `financial_health`
- **Operations & Capacity** → `operational_efficiency`
- **Service or Product Quality** → `quality_delivery`
- **Legal, Compliance & Governance** → `process_maturity`
- **Team & Key People** → `team_capability`
- **Market, Customers & Sales** → `market_position`
- **Customer Retention & Loyalty** → `customer_retention`

### 10.3 Conversational Input Path

A conversational Owner Mode onboarding flow can:

1. Ask the owner to describe their situation (→ `businessDescription`)
2. For each statement, ask "Is this a fact you know, a symptom you're experiencing, or something that confused you?" (→ assigns to `evidenceItems`, `symptoms`, or `misleadingSignals` conceptually)
3. For each statement, ask which of 7 categories it belongs to (→ `dimension`)
4. Ask "Is this a serious / critical issue right now?" (→ `isCritical`)
5. Ask "Can you give me the number?" for any metric mentioned (→ `NormalizedMetricEntry` with canonical key from registry)
6. Run the normalization layer on the collected input
7. If clarification requests are returned, present them as follow-up questions

This flow requires **zero case-specific logic** — it applies identically to any SMB owner in any segment.

### 10.4 What the Normalization Layer Is NOT

- Not an LLM wrapper
- Not a semantic parser
- Not a classifier that guesses dimension from text
- Not a case-specific adapter
- Not an engine extension
- Not a way to bypass clarification

---

## 11. Migration Path from Current SMB Fixtures

The 12 existing SMB fixtures (`opsiq_real_world_smb_case_fixtures.jsonl`) can be migrated to use the normalization layer without changing the fixture schema or the engine. The migration adds an `evidence_hints` sidecar to each fixture.

### 11.1 What an `evidence_hints` Sidecar Looks Like

```jsonc
// opsiq_real_world_smb_case_evidence_hints.jsonl (new file, one JSON per fixture line)
{
  "case_id": "SMB-001",
  "symptom_hints": [
    { "symptom_index": 0, "dimension": "financial_health", "isCritical": true },
    { "symptom_index": 1, "dimension": "financial_health", "isCritical": false },
    { "symptom_index": 2, "dimension": "operational_efficiency", "isCritical": false },
    { "symptom_index": 3, "dimension": "financial_health", "isCritical": false }
  ],
  "metric_hints": [
    { "fixture_key": "receivables_outstanding_usd", "canonical_key": "receivablesAging", "dimension": "financial_health" },
    { "fixture_key": "average_client_payment_terms_days", "canonical_key": "dso", "dimension": "financial_health" },
    { "fixture_key": "bank_balance_usd", "canonical_key": "cashRunwayMonths", "dimension": "financial_health", "transform": "bank_balance_usd / (monthly_burn_usd ?? 1)" }
  ],
  "archetype_gap": false,
  "engine_archetype": "working_capital_stress",
  "smb_label_synonym": "working_capital_cash_flow_trap"
}
```

### 11.2 Migration Rules

1. **Each `symptom_hints[i]`** maps `fixture.scenario.symptoms[i]` to a dimension and criticality flag. The normalization layer uses this to construct `EvidenceItem[]` from the symptoms array without guessing.
2. **Each `metric_hints[j]`** maps a `facts_known_to_owner` key to a canonical `supportingData` key and the dimension it belongs to. Optional `transform` field allows simple arithmetic (e.g., converting `bank_balance_usd` to `cashRunwayMonths` using known burn rate) — but the transform is explicit and auditable, not inferred.
3. **`archetype_gap: true`** flags cases with no engine archetype. The scoring harness treats these as `abstention_eligible`.
4. **`smb_label_synonym`** provides the mapping from SMB narrative label to engine DiagnosisType for scoring only — not for evidence construction.
5. **The sidecar is not the normalization layer.** The sidecar is fixture-level enrichment metadata. The normalization layer processes the `NormalizedOwnerInput` produced by combining the fixture + sidecar hints. The layer's generic logic remains unchanged.

### 11.3 How Many Sidecars Are Needed

All 12 existing SMB fixtures need a sidecar to enable engine integration. Estimated effort: 2–4 hours per fixture for careful dimension assignment and canonical key mapping. The 3 archetype-gap cases (SMB-005, SMB-009, SMB-011) still require sidecars but score as `abstention_eligible`.

---

## 12. Test Plan

### 12.1 Normalization Layer Unit Tests (all deterministic, no engine calls)

| Test | Purpose |
|---|---|
| Valid input with all required fields → produces valid `EvidenceItem[]` | Happy path |
| Missing `dimension` → returns `MISSING_DIMENSION` error, does NOT produce evidence | Fail-closed |
| Invalid `dimension` value → returns `INVALID_DIMENSION` error | Enum enforcement |
| Unknown `canonicalKey` → returns `UNKNOWN_METRIC_KEY` error | Registry enforcement |
| Absent `confidence` → defaults to `MEDIUM`, records in `normalizations[]` | Default auditing |
| Absent `isCritical` with critical-vocabulary finding → records advisory warning | Warning detection |
| `strict_mode` with advisory warning → blocks (does NOT call engine) | Strict mode |
| `archetype_gap: true` case → produces evidence but attaches gap flag | Gap handling |
| Multiple errors in one input → returns all errors, not just first | Complete error reporting |
| Valid metrics with canonical keys → attached to correct `EvidenceItem.supportingData` | Metric mapping |
| Metric with orphaned dimension → returns `METRIC_ORPHAN` error | Dimension consistency |
| `misleading_signals` conversion → produces non-critical evidence items with framing | Misleading signal handling |
| Synonym table: `working_capital_cash_flow_trap → working_capital_stress` → correct scoring | Synonym mapping (scoring only) |

### 12.2 Integration Tests (require engine call)

| Test | Purpose |
|---|---|
| SMB-001 + sidecar → engine → `working_capital_stress` | End-to-end with migration |
| SMB-003 + sidecar → engine → `unit_economics_failure` | End-to-end with migration |
| SMB-005 + sidecar → engine → `INSUFFICIENT_EVIDENCE` → scores as PASS (abstention_eligible) | Archetype gap handling |
| Minimal valid input (1 evidence item) → engine runs without throwing | Minimum viable input |

### 12.3 Regression Tests (must not change)

- All existing `src/__tests__/services/diagnosis-*.test.ts` must pass without modification
- All existing SMB harness Part A tests must pass without modification
- Historical replay results must not change

---

## 13. CI Plan

### 13.1 New CI Workflow: `owner-mode-normalization-layer.yml`

```yaml
name: Owner Mode — Input Normalization Layer
on:
  push:
    paths:
      - "src/services/owner-mode/input-normalization/**"
      - "tests/owner-mode/real-world-smb-cases/**"
  pull_request:
    paths:
      - "src/services/owner-mode/input-normalization/**"
      - "tests/owner-mode/real-world-smb-cases/**"
  workflow_dispatch:

jobs:
  normalization-layer-tests:
    name: Normalization Layer Unit + Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: vitest run tests/owner-mode/real-world-smb-cases
      - run: vitest run src/services/owner-mode/input-normalization
        env:
          TEST_WITH_DB: "false"
```

### 13.2 Existing CI Must Pass

- `owner-real-world-smb-cases.yml` must continue to pass (all 32 tests + 3 skipped)
- The new normalization-layer workflow adds tests but must not break existing ones

### 13.3 Gate Requirements

- All normalization layer unit tests: **100% pass** (no partial pass)
- Engine integration tests (after sidecar migration): **100% pass for covered archetypes; abstention-eligible pass for gap archetypes**
- Zero hard-block errors on any valid `NormalizedOwnerInput` that passes all required fields

---

## 14. Explicit Decision: IMPLEMENT_NOW / DEFER_UNTIL_OWNER_INPUT_MODULE

### Decision: **DEFER_UNTIL_OWNER_INPUT_MODULE**

**Rationale:**

The normalization layer is architecturally correct and well-scoped. Its design does not require case-specific rules and it directly addresses the three blockers identified in the Feasibility Report. However, implementing it now would be premature for the following reasons:

1. **The 12 SMB fixture sidecars must be authored first.** The normalization layer without sidecars cannot be tested against real SMB scenarios — the integration tests in Section 12.2 are empty until sidecar metadata is written. Writing 12 sidecars is the prerequisite, not the layer itself.

2. **Three engine archetypes are missing.** SMB-005, SMB-009, and SMB-011 have no engine archetype. The normalization layer handles these correctly (via `archetype_gap`), but the scoring harness Part B cannot produce a meaningful pass rate until these gaps are either accepted as abstentions or filled. This decision precedes implementation.

3. **The Owner Mode input module is the natural home.** The normalization layer as designed IS the Owner Mode input module. Implementing it as a standalone test utility now and then refactoring it into the Owner Mode input module later creates unnecessary duplication. It should be built once, in the right place.

4. **No urgent harness need.** The existing SMB harness (Part A, 32 tests) is green and deterministic. Part B remains skipped with a clear documented reason. The current state is stable and documented. There is no CI regression risk from deferring.

**What DEFER means:**

- Do not implement the normalization layer code now.
- The spec is complete and design-approved.
- When the Owner Mode input module is scheduled, implement the normalization layer as its core input component using this spec.
- Author the 12 fixture sidecars as the first prerequisite when that work begins.
- The three archetype gaps (SMB-005, SMB-009, SMB-011) should be added to the engine extension backlog as separate items.

---

## Final Output

**Decision:** `DEFER_UNTIL_OWNER_INPUT_MODULE`

**Spec created:** `tests/owner-mode/real-world-smb-cases/OWNER_MODE_INPUT_NORMALIZATION_LAYER_SPEC.md`

**Recommended next step:** Author `evidence_hints` sidecars for all 12 SMB fixtures. This is the prerequisite that unlocks the normalization layer implementation and SMB Part B integration. Estimated effort: 2–4 hours per fixture. Do not implement the layer code before sidecars exist.

**Implementation risk:** Low — the normalization layer design does not touch any production code, engine logic, or existing tests. Its fail-closed policy ensures it cannot silently produce wrong evidence. The only implementation risk is incomplete sidecar authorship leading to false abstentions.

**Why this matters:** The normalization layer is not just a test harness adapter. It is the input boundary for Owner Mode at scale — the mechanism by which a real SMB owner's messy narrative becomes engine-compatible structured evidence without requiring them to understand `EvidenceItem` vocabulary. Every owner-facing input flow (UI, conversational, API) eventually routes through this layer. Getting the design right before implementing removes the need for a breaking-change refactor when Owner Mode onboarding is built.
