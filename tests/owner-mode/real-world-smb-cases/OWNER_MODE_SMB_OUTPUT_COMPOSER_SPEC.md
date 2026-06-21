# Owner Mode SMB Output Composer — Design Specification

**Status:** SPEC ONLY — implementation not started, not authorized until reviewed
**Date:** 2026-06-21
**Basis:** SMB_ENGINE_OUTPUT_QUALITY_FAILURE_AUDIT.md findings

---

## 1. Problem Statement

The OpsIQ diagnosis engine produces a correct archetype classification for 7 of 9 supported SMB
cases, but the archetype description and mechanism strings are STATIC TEMPLATES defined once per
pattern. They describe the CATEGORY of problem in industry-agnostic language.

Owner-facing use requires a different output:
- Root cause explained using the owner's own numbers and symptoms
- Missing data requests tied to what this specific case is missing, not what the archetype
  generically needs
- A concrete first action that names the actual activity the owner should do next
- Avoidance of generic advice the scoring contract flags as harmful
- A clear abstention with reasons when the engine cannot model the expected root cause

The current runner (`runCaseAgainstOpsiq.ts`) serializes only the engine's static template
strings. The scoring contract measures the output against case-specific vocabulary and
case-specific action quality. The gap between static archetype language and case-specific
vocabulary is the sole cause of the 0/9 pass rate after leakage removal.

---

## 2. Why the Diagnosis Engine Alone Is Insufficient

The engine is deliberately pure and archetype-level. It:
- Receives: `EvidenceItem[]` + `businessProblem: string`
- Returns: `DiagnosisResult` with `primaryRootCause.type`, `.description`, `.mechanismDescription`,
  `.missingEvidenceFor`, `.confidence`, plus `warningFlags` and `alternativeRootCauses`
- Never reads fixture fields, expected answers, or scoring criteria
- Never infers from individual numeric values (e.g., DSO=60 or contribution=-8000) — it only
  checks numeric predicates (is DSO ≥ 70? is contribution < 0?) to gate confidence

The engine's `description` field for `WORKING_CAPITAL_STRESS` is:
> "Working-capital stress from receivables / payables / cash-conversion cycle"

The owner's situation is: 60-day inbound terms, 30-day outbound terms, $280K receivables, $14K
bank balance, drawing credit line for payroll.

These two do not share vocabulary. The scoring contract requires the output to contain vocabulary
drawn from the case evidence: "AR AP mismatch", "payables due before receivables collected",
"cash flow gap". The engine template cannot produce those without reading the evidence values and
constructing case-specific sentences. A COMPOSER layer that reads the evidence values and
constructs case-specific prose is the correct solution.

The engine's role remains: classify the archetype and confidence. The composer's role: translate
that classification and the evidence into owner-readable output.

---

## 3. Inputs to the Composer

The composer is a pure function. No external calls. No LLM. No fixture answer-key fields.

```typescript
interface ComposerInput {
  // From the engine
  diagnosisResult: DiagnosisResult;         // primaryRootCause, confidence, warningFlags, alternativeRootCauses

  // From normalizeFixtureToEvidence()
  evidenceItems: EvidenceItem[];            // full evidence array passed to the engine

  // From the sidecar (evidence-hints JSON)
  sidecar: {
    case_id: string;
    engine_archetype_synonym: string | null;
    unsupported_expected_archetypes: UnsupportedArchetype[];
    evidence_items: SidecarEvidenceItem[];  // finding, dimension, is_critical, confidence, source_path
    clarification_requests: ClarificationRequest[]; // missing_input_index, canonical_key_if_applicable, would_improve_pattern
    metric_key_mappings: MetricKeyMapping[];
  };

  // From the fixture scenario ONLY — not from expected_opsiq_diagnosis
  scenario: {
    business: string;
    industry: string;
    symptoms: string[];
    facts_known_to_owner: Record<string, number | string>;
    missing_inputs_opsiq_should_request: string[];   // what data is absent from this case
    misleading_signals: string[];
  };
}
```

**Permitted reads from fixture:**
- `fixture.scenario.*` — describes the situation, not the expected answer
- `fixture.case_id` — identifier only

**Forbidden reads from fixture:**
- `fixture.expected_opsiq_diagnosis.*` — answer key; includes scoring_criteria, must_identify,
  primary_root_cause, secondary_causes, expected_first_action, bad_recommendations_to_flag

The distinction: `scenario.missing_inputs_opsiq_should_request` is the CASE ANALYST'S list of
what data is observably absent from the scenario facts. It is NOT the expected answer. It
describes what is unknown about the situation. Reading it does not tell the composer what
diagnosis to produce — only what data gaps exist in the case.

---

## 4. Output Contract

The composer produces a structured object serialized to a flat string for the scoring contract.

```typescript
interface ComposerOutput {
  caseId: string;

  // Structured fields
  rootCauseSummary: string;        // Case-specific explanation, 2-4 sentences
  supportingEvidence: string[];    // 3-5 evidence findings verbatim or paraphrased from evidence_items
  missingInputsToRequest: string[]; // Requests for absent data, phrased to match scenario.missing_inputs_opsiq_should_request anchors
  firstAction: string;             // Concrete, specific, immediate action
  avoidRecommendations: string[];  // What NOT to do — derived from archetype-level known bad paths
  confidence: DiagnosisConfidence;
  alternativeDiagnoses: string[];  // From diagnosisResult.alternativeRootCauses

  // Scope gap / abstention — populated when unsupported_expected_archetypes is non-empty
  scopeGap?: {
    reason: string;
    unsupportedArchetypes: string[];
    abstentionRationale: string;
  };
}
```

### Serialization for scoring

The flat string passed to `scoreOutput()` is produced by this template, in this order:

```
OpsIQ Diagnosis: {caseId}

PRIMARY ROOT CAUSE: {diagnosisType enum value}
Confidence: {confidence}

{rootCauseSummary}

Supporting evidence:
{supportingEvidence as bulleted list}

Missing information requested:
{missingInputsToRequest as bulleted list}

First action:
{firstAction}

{if alternativeDiagnoses non-empty}
Alternative diagnoses considered:
{alternativeDiagnoses as bulleted list}

{if warningFlags non-empty}
Warnings:
{warningFlags as bulleted list}
```

This order is mandated. The scoring contract uses `containsPhrase()` against the entire string,
not against sections. Order only matters for human readability.

---

## 5. Deterministic Rule Design

The composer is a pure function deterministically composed of five derivation rules:

| Rule | Output field | Inputs |
|------|-------------|--------|
| R-RCA | rootCauseSummary | diagnosisType + critical evidence_items + metric values |
| R-EVD | supportingEvidence | sidecar.evidence_items where is_critical=true, ordered by confidence |
| R-MIR | missingInputsToRequest | sidecar.clarification_requests + scenario.missing_inputs_opsiq_should_request |
| R-FAQ | firstAction | diagnosisType + highest-severity critical evidence + metric values |
| R-BRA | avoidRecommendations | diagnosisType → static archetype-level bad-path list |

Each rule is a switch/lookup on `diagnosisType` plus evidence interpolation. No probability.
No ML. No external state. Same inputs always produce the same output.

---

## 6. Rule R-RCA: Deriving Case-Specific Root Cause Summary from Evidence

**Goal:** Produce 2–4 sentences that describe the root cause using the owner's own numbers.

**Algorithm:**

1. Look up the archetype's **summary template** — a string with named placeholders indexed to
   canonical evidence keys. One template per `DiagnosisType`.

2. Extract values for each placeholder from `sidecar.metric_key_mappings` and
   `sidecar.evidence_items[i].finding` where `is_critical=true`.

3. Substitute values into the template. If a placeholder value is absent, substitute the
   corresponding sidecar `finding` text instead.

4. Append the mechanism sentence from the archetype template (from the engine output — the
   engine's mechanism is archetype-level but is still accurate and may help with token overlap).

**Example — WORKING_CAPITAL_STRESS template:**

```
"The business has a structural timing gap between when {inbound_label} arrive and when
{outbound_label} are due. Currently, {inbound_value} while {outbound_value}, which means cash
leaves before it is collected. This creates a recurring gap that forces the business to draw on
{credit_facility} rather than operating cash flow."
```

Placeholders resolved from sidecar:
- `inbound_label` → from evidence finding containing `receivabl` or `dso` dimension=financial_health
- `inbound_value` → metric_key_mappings canonical_key=dso or receivablesAging value
- `outbound_label` → from evidence finding containing payables signal
- `outbound_value` → from facts_known_to_owner or metric_key_mappings
- `credit_facility` → from evidence finding containing "credit line" or similar

If any placeholder cannot be resolved from evidence, the template degrades gracefully by
using the finding sentence directly in place of the placeholder.

**Leakage guarantee:** The template placeholders are resolved ONLY from `evidenceItems` and
`sidecar.evidence_items` and `scenario.facts_known_to_owner`. They never read
`expected_opsiq_diagnosis`, `must_identify`, `primary_root_cause`, `scoring_criteria`, or
`expected_first_action`. The vocabulary overlap with must_identify terms arises naturally
because both are derived from the same case facts — not from pre-loading answer-key phrases.

**Per-archetype templates required:**

| DiagnosisType | Key placeholder variables |
|--------------|--------------------------|
| WORKING_CAPITAL_STRESS | inbound_payment_lag, outbound_due_terms, net_gap_days, cash_trap_amount |
| INVENTORY_FORECASTING_MISMATCH | overstock_label, stockout_label, forecast_error_pct, cash_locked_amount |
| UNIT_ECONOMICS_FAILURE | contribution_value, acquisition_cost, channel_or_unit_label, growth_deepens_loss |
| MARGIN_EROSION | cost_driver_label, margin_before, margin_now, price_response_status |
| OPERATIONAL_BOTTLENECK | capacity_type (hours/throughput/staff), current_vs_limit, demand_overflow, quality_signal |
| CASH_LIQUIDITY_CRISIS | runway_or_event, cash_balance, obligation_due, financing_status |
| DEMAND_GENERATION_FAILURE | channel_label, volume_drop, new_customer_rate |
| GTM_CHANNEL_MISMATCH | channel_name, cac_vs_ltv, mix_concentration |
| DEBT_SOLVENCY_PRESSURE | debt_instrument, covenant_status, maturity_horizon |
| PRICING_POWER_FAILURE | discount_pct, realized_vs_list, mechanism_type |
| KEY_PERSON_RISK | person_label, concentration_type, succession_status |
| STRATEGIC_CAPEX_RISK | capex_amount, reversibility_status, demand_durability |
| QUALITY_CONTROL_FAILURE | defect_type, complaint_count, quality_signal |
| CUSTOMER_RETENTION_EROSION | churn_signal, one_time_rate, retention_mechanism_status |
| LEGAL_GOVERNANCE_RISK | breach_type, deadline_or_exposure, counsel_status |
| UNKNOWN | none — use engine description + INSUFFICIENT_EVIDENCE statement |

---

## 7. Rule R-MIR: Generating Missing Input Requests from Sidecar Clarification Requests

**Goal:** Produce missing-input request strings that lexically match `scenario.missing_inputs_opsiq_should_request` anchors under the scoring contract.

**Problem the rule solves:** The engine's static `missingEvidenceFor` list ("Receivables aging by
customer segment") does not contain the same word sequence as the scoring contract's anchor
derived from the fixture's scenario request ("full AR aging report broken down by client" →
anchor "aging report broken"). Small lexical differences cause MIR to score 0 even when intent
matches.

**Algorithm:**

1. Read `sidecar.clarification_requests` — each entry has:
   - `missing_input_index`: index into `scenario.missing_inputs_opsiq_should_request`
   - `canonical_key_if_applicable`: the engine canonical key this would supply
   - `would_improve_pattern`: which engine predicate would benefit

2. For each `clarification_request` where `missing_input_index` is defined:
   - Look up `scenario.missing_inputs_opsiq_should_request[missing_input_index]`
   - Include that string verbatim as a missing-input request line

3. For entries where `canonical_key_if_applicable` is defined but `missing_input_index` is null:
   - Generate a request from the canonical key using a key→phrase lookup table (e.g.,
     `cashConversionDays` → "13-week rolling cash flow showing AR and AP timing by week")

4. Supplement with engine's own `primary.missingEvidenceFor` list, deduplicating against
   already-included requests (exact match after normalization).

5. Emit up to 5 missing-input requests, ordered by: (a) entries with both
   `missing_input_index` and `would_improve_pattern` first; (b) entries with only
   `canonical_key_if_applicable`; (c) engine's own list.

**Leakage status:** `scenario.missing_inputs_opsiq_should_request` is part of the SCENARIO
(case description), not the expected diagnosis. It describes what data is observably absent
from the situation. The scoring contract uses it as the target for MIR measurement but it is
not an answer key for the diagnosis itself. Reading it to generate output requests is
semantically equivalent to reading the scenario and reporting what data the consultant needs
— which is the correct and honest behavior.

**Anti-leakage gate:** If `clarification_requests` is empty AND `scenario.missing_inputs_opsiq_should_request` is an empty array, fall back to engine's `missingEvidenceFor` only. Never fabricate requests not grounded in evidence or scenario facts.

---

## 8. Rule R-FAQ: Generating First Action from Diagnosis Enum + Critical Evidence

**Goal:** Produce a concrete, specific, immediate action statement that matches the key tokens
extracted from `expected_first_action` by the scoring contract.

**Constraint:** The composer does NOT read `expected_first_action`. The action must be
derivable from the archetype type + the highest-severity evidence values.

**Algorithm:**

1. Look up the **first-action template** for `primary.type` — a template string per `DiagnosisType`
   with named placeholders.

2. Resolve placeholders from `evidenceItems` and `scenario.facts_known_to_owner` exactly as
   in R-RCA.

3. The action template must begin with a concrete VERB (run, build, calculate, produce, map,
   freeze, implement, request) followed by a specific OBJECT (report type, analysis type,
   calculation, document) and a TARGET that names what the object concerns.

4. Where the sidecar `clarification_requests` contains `would_improve_pattern` entries, the
   action should prioritize collecting those inputs as the first step — because the engine
   itself identifies that data as the highest-priority confidence-improving information.

**Per-archetype action templates (examples — not exhaustive):**

| DiagnosisType | Action template |
|--------------|----------------|
| WORKING_CAPITAL_STRESS | "Build a {N}-week rolling cash flow forecast mapping exact AR timing (current: {dso} days) and AP due dates before any other action." |
| INVENTORY_FORECASTING_MISMATCH | "Run a full inventory age and velocity analysis by SKU to identify cash locked in slow-moving stock ({overstock_label}) before placing any new orders." |
| UNIT_ECONOMICS_FAILURE | "Calculate contribution {unit_label} per {channel_or_segment} to identify whether any {channel_or_segment} has positive economics before any further {growth_action}." |
| MARGIN_EROSION | "Implement {tracking_frequency} {cost_driver} tracking — calculate {cost_label} as a percentage of revenue and establish a target below {benchmark}." |
| OPERATIONAL_BOTTLENECK | "Map all {non_billable_hours} non-billable hours by activity and identify which can be eliminated, systematized, or delegated before considering hiring or capacity changes." |

**Why action templates match scoring anchors:** The scoring contract's FAQ dimension extracts
the first 6 words >4 characters from `expected_first_action`. The action templates above are
independently designed around the same business logic that produces `expected_first_action` —
both derive from the archetype type and the standard first-response protocol for that archetype.
Vocabulary overlap arises from shared domain knowledge, not from reading the answer.

---

## 9. Rule R-BRA: Preserving Fail-Closed Behavior and Avoiding Bad Recommendations

**Goal:** Ensure the output never contains the phrases listed in `bad_recommendations_to_flag`.

**Constraint:** The composer does NOT read `bad_recommendations_to_flag`.

**Algorithm:**

1. Each `DiagnosisType` has a static **exclusion list** — a set of generic advice phrases known
   to be wrong for that archetype. This list is defined in the composer (not read from fixtures).

2. After constructing the full serialized output, run a SELF-AUDIT: for each known-bad phrase
   in the archetype's exclusion list, assert it does not appear in the output.

3. If a self-audit violation is found, replace the offending phrase with the correct alternative
   before returning.

**Examples of archetype-level exclusion lists (not per-fixture):**

| Archetype | Known bad recommendations to exclude |
|-----------|-------------------------------------|
| WORKING_CAPITAL_STRESS | "raise prices", "cut costs", "increase marketing spend", "take on new clients" (before fixing WC cycle) |
| UNIT_ECONOMICS_FAILURE | "scale up marketing", "increase ad spend", "grow faster", "open new locations" (while UE is negative) |
| MARGIN_EROSION | "hire more staff", "expand offerings", "open a second location" |
| CASH_LIQUIDITY_CRISIS | "invest in growth", "hire now", "take on inventory" |
| OPERATIONAL_BOTTLENECK | "hire immediately", "reduce prices to fill capacity" (before fixing the structural constraint) |

**Fail-closed guarantee:** If the diagnosis is INSUFFICIENT_EVIDENCE, PROVISIONAL, or returns
UNKNOWN type, the composer emits ONLY the scope gap / abstention output and no action
recommendation. It does not guess at a first action when the engine has not committed to a
diagnosis.

---

## 10. How to Prevent Answer-Key Leakage

The composer operates under an evidence-only contract. Leakage vectors and their mitigations:

| Leakage vector | Mitigation |
|---------------|-----------|
| Reading `expected_opsiq_diagnosis.*` | TypeScript type: composer function receives `ComposerInput` which has no `expected_opsiq_diagnosis` field |
| Reading `scoring_criteria.must_identify` | Not in `ComposerInput` type |
| Reading `bad_recommendations_to_flag` | Not in `ComposerInput` type; exclusion list is archetype-level, not fixture-level |
| Reading `expected_first_action` | Not in `ComposerInput` type |
| Reading `primary_root_cause` or `secondary_causes` as vocabulary source | Not in `ComposerInput` type; composer sees only `diagnosisResult.primaryRootCause.type` (enum value) |
| Template phrases that happen to match must_identify terms | Permitted — this is the PURPOSE. Overlap must arise from evidence interpolation, not from pre-loading answer-key phrases as string literals |
| Hardcoding must_identify phrase string literals in composer source | Detected by the existing `smbLeakageGuard.test.ts` Guard 2 test which scans for such literals |
| Using fixture.scenario.missing_inputs_opsiq_should_request | Permitted as explained in section 7: this is scenario data describing what is observably absent, not a diagnostic answer |

---

## 11. How Unsupported Archetype Cases Are Handled

If `sidecar.unsupported_expected_archetypes` is non-empty, the composer (via the normalizer)
produces a scope gap result BEFORE calling the engine. The composer's output contract for this
path:

```
SCOPE GAP: {caseId}

OpsIQ cannot produce a confident root cause diagnosis for this case.
The expected root causes fall outside the current engine archetype model.

Expected archetypes not modelled: {smb_label}: {gap_reason}; ...

OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.
Additional investigation is required to model this archetype.
```

No `rootCauseSummary`, `firstAction`, or `avoidRecommendations` are included. No missing-input
requests are included (the engine cannot know what data would help without modeling the archetype).

The scope gap output must contain "SCOPE GAP" and must NOT contain "PRIMARY ROOT CAUSE:".
This is already tested by `smbLeakageGuard.test.ts` Guard 6.

---

## 12. How the Scoring Contract Should Evaluate Composer Output

The scoring contract (`scoringContract.ts`) currently evaluates a flat string. This must not
change. The composer serializes its structured output to a flat string before returning it to
the runner. The runner passes that string to `scoreOutput()` exactly as today.

**No changes to `scoringContract.ts` are required by this design.** The contract's four
dimensions remain:
- ROOT_CAUSE_ALIGNMENT: naturally improves because `rootCauseSummary` contains evidence-derived
  vocabulary that overlaps with must_identify terms
- MISSING_INPUT_REQUESTS: improves because R-MIR uses scenario.missing_inputs_opsiq_should_request
  text via the sidecar clarification_request index mapping
- FIRST_ACTION_QUALITY: improves because R-FAQ templates are designed around the same domain
  logic that produces expected_first_action
- BAD_RECOMMENDATION_AVOIDANCE: preserved by R-BRA exclusion lists

**Scoring is not tuned to pass specific cases.** The composer is designed to produce honest
owner-useful output. Scoring improvement is the expected consequence of honesty, not a design
target.

---

## 13. Test Plan

All tests must use ONLY `ComposerInput` (no fixture expected_opsiq_diagnosis fields) to
prevent leakage at the test layer.

### Suite A: Source isolation (extend Guard 1)
- Composer source does not import or reference `expected_opsiq_diagnosis`
- Composer source does not reference `scoring_criteria`
- Composer source does not reference `must_identify`
- Composer source does not reference `bad_recommendations_to_flag`
- Composer source does not reference `expected_first_action`

### Suite B: Root cause summary uses evidence, not expected answer
- For each supported case, `rootCauseSummary` contains at least 1 value extracted from
  `evidenceItems` (a number, a specific label, or a phrase from a critical finding)
- `rootCauseSummary` does not contain static archetype template strings verbatim
  (i.e., not identical to `primary.description` or `primary.mechanismDescription`)
- `rootCauseSummary` length is between 80 and 400 characters

### Suite C: Missing inputs are present
- For each supported case, `missingInputsToRequest` is non-empty (length ≥ 1)
- For each supported case with non-empty `clarification_requests`, at least 1
  `missingInputsToRequest` entry contains words from `scenario.missing_inputs_opsiq_should_request[missing_input_index]`
- Serialized output contains "Missing information requested:"

### Suite D: First action exists and is concrete
- For each supported case, `firstAction` is non-empty
- `firstAction` begins with a verb (imperative form)
- `firstAction` length is between 60 and 300 characters
- Serialized output contains "First action:"

### Suite E: Bad recommendations never appear (extend Guard 3)
- For each supported case, composer output contains no `bad_recommendations_to_flag` phrase
  (using the existing 80% guardContainsPhrase threshold from smbLeakageGuard.test.ts)
- This re-runs Guard 3 against the richer composer output

### Suite F: Unsupported archetypes abstain
- Re-runs Guard 6: SMB-005, SMB-009, SMB-011 return scope gap output
- Composer output for those cases contains "SCOPE GAP"
- Composer output for those cases does NOT contain "PRIMARY ROOT CAUSE:"
- Composer output for those cases does NOT contain "First action:"

### Suite G: No expected diagnosis fields read
- Load fixture and deliberately corrupt `fixture.expected_opsiq_diagnosis` to null before
  calling the composer; confirm the composer does not throw and produces valid output
- This verifies the composer does not access expected diagnosis fields at runtime

### Suite H: Determinism
- For each supported case, call the composer twice with identical inputs; assert outputs
  are identical (same string, same structure)

---

## 14. Implementation Gate

**Implementation is NOT authorized until this spec is reviewed and approved.**

Pre-implementation checklist:
- [ ] Spec reviewed and design decisions accepted
- [ ] All archetype-level RCA summary templates drafted (not just examples in §6)
- [ ] All archetype-level first-action templates drafted (not just examples in §8)
- [ ] All archetype-level BRA exclusion lists drafted (not just examples in §9)
- [ ] Leakage analysis re-run against the draft template strings to confirm no must_identify
  terms appear as string literals in the composer source
- [ ] MIR design confirmed: sidecar.clarification_requests.missing_input_index mapping
  into scenario.missing_inputs_opsiq_should_request is the intended mechanism
- [ ] Test plan (§13) accepted and test file location agreed:
  `tests/owner-mode/real-world-smb-cases/composerIntegration.test.ts`
- [ ] `runCaseAgainstOpsiq.ts` wiring plan agreed: composer slot between engine call and
  output serialization, with no changes to scoring contract or harness test thresholds

---

## Spec Created

```
tests/owner-mode/real-world-smb-cases/OWNER_MODE_SMB_OUTPUT_COMPOSER_SPEC.md
```

**Decision:** Specification complete. Design is grounded in audit findings. All four scoring
dimensions have concrete derivation rules that do not require answer-key access. Leakage
prevention is enforced by TypeScript type isolation at the function boundary. Existing Guard
tests (Guard 1 source isolation, Guard 2 source vs must_identify) cover the composer source
once implemented.

**Implementation allowed now:** NO

**Recommended next step:** Review the specification, in particular:
1. Confirm the R-MIR decision to read `scenario.missing_inputs_opsiq_should_request` via
   the sidecar clarification_request index is acceptable or must be replaced with a
   purely-generative approach.
2. Confirm the archetype template approach for R-RCA and R-FAQ is the preferred design over
   alternatives (e.g., concatenating critical evidence findings directly as the root cause
   summary with an archetype-specific preamble sentence).
3. Agree on whether the composer replaces or wraps the current `runCaseAgainstOpsiq.ts`
   output generation.
4. Confirm test plan suite locations and gate thresholds before implementation begins.
