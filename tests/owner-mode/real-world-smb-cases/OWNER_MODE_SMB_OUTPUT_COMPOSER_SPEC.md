# Owner Mode SMB Output Composer — Design Specification

**Status:** SPEC UPDATED — awaiting review of revised design before implementation
**Date:** 2026-06-21
**Basis:** SMB_ENGINE_OUTPUT_QUALITY_FAILURE_AUDIT.md findings
**Design decisions applied:** OWNER_MODE_SMB_OUTPUT_COMPOSER_DESIGN_DECISION 2026-06-21

---

## Design Decisions Record

### Decision 1 — R-MIR: APPROVED with restrictions

Using `scenario.missing_inputs_opsiq_should_request` through sidecar
`clarification_request.missing_input_index` is approved.

**Approved because:** `scenario.missing_inputs_opsiq_should_request` represents observable
missing owner inputs, not the diagnostic answer key. It describes what data is absent from the
case, not what the diagnosis should conclude.

**Restrictions (non-negotiable):**
- The composer may use only the clarification request text referenced by sidecar indexes.
- The composer must NOT read `expected_opsiq_diagnosis`.
- The composer must NOT read `scoring_criteria.must_identify`.
- The composer must NOT read `expected_first_action`.
- The composer must NOT read `bad_recommendations_to_flag`.
- The composer must treat clarification requests as "information still needed," not as evidence
  proving the diagnosis.

### Decision 2 — R-RCA / R-FAQ: EVIDENCE-FIRST APPROACH SELECTED

Per-archetype answer templates are **rejected** as the primary composition mechanism.

**Evidence-first approach selected:**
- `rootCauseSummary` is built from the top 2–3 highest-severity evidence findings plus the
  engine diagnosis enum.
- `supportingEvidence` cites selected sidecar evidence findings directly.
- `firstAction` is generated from: (1) engine diagnosis enum, (2) highest-severity evidence,
  (3) available `supportingData` numerics, (4) clarification requests.
- The composer may use small generic action verbs by diagnosis type, but must NOT contain
  case-specific answer phrases.

**Per-archetype templates rejected because:**
- Templates designed around case-specific placeholders carry overfit risk: any placeholder that
  consistently resolves to the same vocabulary as `must_identify` terms is structurally
  equivalent to vocabulary injection, even if derived from evidence at runtime.
- Templates are harder to audit for leakage than evidence concatenation: evidence finding text
  is visible and traceable to source; a template with resolved placeholders may produce
  must_identify-adjacent phrases whose origin is ambiguous.
- Evidence-first composition is transparent: the output vocabulary provably comes from
  `sidecar.evidence_items[i].finding` strings, which themselves passed sidecar leakage
  guard tests (Guard 4) confirming they do not contain must_identify phrases.
- Evidence-first is naturally case-specific without requiring per-archetype design work that
  could introduce new leakage pathways.

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
drawn from the case evidence. The engine template cannot produce case-specific vocabulary without
reading the evidence values and constructing case-specific sentences. A COMPOSER layer that reads
the evidence values and constructs case-specific prose is the correct solution.

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
    missing_inputs_opsiq_should_request: string[];   // what data is observably absent from this case
    misleading_signals: string[];
  };
}
```

**Permitted reads from fixture:**
- `fixture.scenario.*` — describes the situation, not the expected answer
- `fixture.case_id` — identifier only

**Forbidden reads from fixture:**
- `fixture.expected_opsiq_diagnosis.*` — answer key; includes `scoring_criteria`,
  `must_identify`, `primary_root_cause`, `secondary_causes`, `expected_first_action`,
  `bad_recommendations_to_flag`

The `ComposerInput` type enforces this at the TypeScript level: the type has no
`expected_opsiq_diagnosis` field. A composer implementation that tries to access it cannot
compile. This is the primary leakage barrier.

---

## 4. Output Contract

The composer produces a structured object serialized to a flat string for the scoring contract.

```typescript
interface ComposerOutput {
  caseId: string;

  // Structured fields
  rootCauseSummary: string;          // Case-specific, evidence-derived, 2-4 sentences
  supportingEvidence: string[];      // 3-5 sidecar evidence findings where is_critical=true
  missingInputsToRequest: string[];  // From sidecar clarification_requests → scenario.missing_inputs_opsiq_should_request
  firstAction: string;               // Concrete imperative action derived from diagnosis + evidence
  confidence: DiagnosisConfidence;
  alternativeDiagnoses: string[];    // From diagnosisResult.alternativeRootCauses descriptions

  // Scope gap / abstention — populated only when unsupported_expected_archetypes is non-empty
  scopeGap?: {
    reason: string;
    unsupportedArchetypes: string[];
    abstentionRationale: string;
  };
}
```

### Serialization for scoring

The flat string passed to `scoreOutput()` is produced by this template, in this fixed order:

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

The scoring contract uses `containsPhrase()` against the entire string, not per-section. Section
order is mandated for human readability consistency, not for scoring correctness.

---

## 5. Deterministic Rule Design

The composer is a pure function composed of five deterministic derivation rules:

| Rule | Output field | Inputs | Approach (post-decision) |
|------|-------------|--------|--------------------------|
| R-RCA | rootCauseSummary | critical sidecar evidence_items + diagnosis enum | Evidence-first: concatenate top findings |
| R-EVD | supportingEvidence | sidecar.evidence_items where is_critical=true | Direct citation, ordered by confidence desc |
| R-MIR | missingInputsToRequest | sidecar.clarification_requests + scenario.missing_inputs_opsiq_should_request | Index-lookup via clarification_request.missing_input_index |
| R-FAQ | firstAction | diagnosis enum + highest-severity evidence + supportingData numerics + clarification_requests | Evidence-first: generic verb + evidence-derived object |
| R-BRA | self-audit exclusion | diagnosis enum → archetype-level exclusion list | Post-generation check; replace violations |

No probability. No ML. No external state. Same inputs always produce the same output.

---

## 6. Rule R-RCA: Evidence-First Root Cause Summary

**Approach selected:** Evidence-first. Per-archetype templates rejected (see Decision 2 above).

**Goal:** Produce 2–4 sentences explaining the root cause using the owner's own observed facts.

**Algorithm:**

1. Select the top N sidecar `evidence_items` where `is_critical=true`, ordered by confidence
   descending (HIGH first, then MEDIUM, then LOW). Take at most 3.

2. Prepend a one-sentence archetype preamble that names the diagnosis type in plain English.
   This preamble is a single short sentence per `DiagnosisType` using ONLY the enum label
   translated to human language. It must NOT contain any case-specific vocabulary.
   Examples:
   - `WORKING_CAPITAL_STRESS` → "The root cause is a working capital timing gap."
   - `UNIT_ECONOMICS_FAILURE` → "The root cause is unprofitable unit economics."
   - `MARGIN_EROSION` → "The root cause is margin erosion from cost pressure."
   - `OPERATIONAL_BOTTLENECK` → "The root cause is an operational capacity constraint."
   - `INVENTORY_FORECASTING_MISMATCH` → "The root cause is a mismatch between demand forecasting and stock allocation."
   - (one sentence per archetype type, archetype-level only, no numbers or case specifics)

3. Concatenate the finding text from the selected critical evidence items as complete sentences.
   Use the finding text verbatim or with minimal grammatical transformation (e.g., capitalize
   the first word, add a period if absent). Do NOT paraphrase with answer-key vocabulary.

4. If any critical evidence item has numeric `supportingData`, and that item is selected in
   step 1, append the most informative single numeric to the sentence. E.g., if the finding
   is "average invoice-to-payment lag 67 days" and `supportingData.dso=47`, the finding text
   already contains the number — use it as-is.

5. Append the engine's `mechanismDescription` as a final sentence. This is the archetype's
   mechanism summary (archetype-level, not case-specific) and provides context for the
   evidence-derived sentences.

**Leakage guarantee:**
- The preamble sentence contains only the archetype enum label translated to English — no
  numbers, no case-specific vocabulary.
- The finding text in steps 3–4 comes from `sidecar.evidence_items[i].finding`, which passed
  sidecar leakage Guard 4 (confirmed it does not contain must_identify phrases at the 80%
  threshold).
- Vocabulary overlap with `must_identify` terms arises because both the evidence findings and
  the must_identify terms are derived from the same case facts — not because the composer
  reads the answer key.
- The engine mechanism sentence (step 5) is archetype-level static text from the engine's own
  output; it was already in the runner output before the composer was introduced.

**Why evidence-first is less overfit than templates:**
Evidence findings are written without knowledge of must_identify terms (confirmed by Guard 4).
When an evidence finding text and a must_identify term share vocabulary, that overlap is
caused by both being derived from the same scenario fact — it is genuine. Template-based
composition risks producing overlap that is designed rather than genuine, making it harder to
audit whether the overlap is earned or injected.

---

## 7. Rule R-MIR: Missing Input Requests via Sidecar Index Mapping

**Approach:** Approved (Decision 1). The composer reads
`scenario.missing_inputs_opsiq_should_request` only via the indexes in
`sidecar.clarification_requests`.

**Algorithm:**

1. Read `sidecar.clarification_requests`. Each entry has:
   - `missing_input_index` (number | null): index into `scenario.missing_inputs_opsiq_should_request`
   - `canonical_key_if_applicable` (string | null): engine canonical data key
   - `would_improve_pattern` (string | null): which engine predicate benefits

2. For each entry where `missing_input_index` is not null:
   - Retrieve `scenario.missing_inputs_opsiq_should_request[missing_input_index]`.
   - Include that string verbatim as a missing-input request line.
   - This is the approved path: the sidecar analyst has explicitly linked a clarification
     request to an observably absent scenario input. The text is scenario-descriptive, not
     a diagnostic answer.

3. For each entry where `canonical_key_if_applicable` is not null but `missing_input_index`
   is null:
   - Generate a plain-English request using a static canonical_key → phrase table.
   - Example table entries:
     - `cashConversionDays` → "13-week rolling cash flow detail showing inflow and outflow timing"
     - `forecastErrorPct` → "SKU-level demand forecast accuracy data"
     - `cohortMargin` → "Contribution margin broken down by cohort or channel"
   - This table is archetype-agnostic and does not reference any fixture's expected answers.

4. Deduplicate against engine's own `primary.missingEvidenceFor` list (normalized exact match).
   Supplement with any engine list entries not already covered.

5. Emit up to 5 entries. Priority order:
   (a) Entries with both `missing_input_index` and `would_improve_pattern` defined
   (b) Entries with `missing_input_index` only
   (c) Entries with `canonical_key_if_applicable` only
   (d) Engine's `missingEvidenceFor` remainder

**Restrictions enforced:**
- Clarification request text is used as "information still needed," not as evidence of the
  diagnosis. The output must phrase these as requests ("Please provide…" or "Missing:…"),
  not as diagnostic conclusions ("This confirms…").
- If `clarification_requests` is empty and `scenario.missing_inputs_opsiq_should_request`
  is empty, fall back to engine's `missingEvidenceFor` only.
- The composer never fabricates a missing-input request not grounded in either the sidecar
  clarification_requests or the engine's own list.

---

## 8. Rule R-FAQ: Evidence-First First Action

**Approach selected:** Evidence-first with generic per-diagnosis verb (Decision 2).

**Goal:** Produce a concrete, specific, immediate action statement. Must NOT read
`expected_first_action`.

**Algorithm:**

1. Select the highest-confidence critical sidecar evidence item (first `is_critical=true`,
   `confidence=HIGH`). This is the primary evidence anchor.

2. Look up the **action verb and category** for `primary.type` — a minimal two-element tuple
   per DiagnosisType: `(verb, category)`. This is generic domain knowledge, not a case-specific
   template.

   | DiagnosisType | verb | category |
   |--------------|------|----------|
   | WORKING_CAPITAL_STRESS | "Build" | "rolling cash flow forecast" |
   | INVENTORY_FORECASTING_MISMATCH | "Run" | "inventory age and velocity analysis by SKU" |
   | UNIT_ECONOMICS_FAILURE | "Calculate" | "contribution margin" |
   | MARGIN_EROSION | "Implement" | "cost tracking" |
   | OPERATIONAL_BOTTLENECK | "Map" | "time allocation by activity" |
   | CASH_LIQUIDITY_CRISIS | "Produce" | "13-week cash flow forecast" |
   | DEMAND_GENERATION_FAILURE | "Audit" | "lead source and funnel by channel" |
   | GTM_CHANNEL_MISMATCH | "Separate" | "channel-level CAC and conversion data" |
   | DEBT_SOLVENCY_PRESSURE | "Obtain" | "full debt schedule and covenant test dates" |
   | PRICING_POWER_FAILURE | "Map" | "realized price by transaction against list price" |
   | KEY_PERSON_RISK | "Document" | "critical knowledge and relationships held by key person" |
   | STRATEGIC_CAPEX_RISK | "Model" | "downside scenario if demand does not persist" |
   | QUALITY_CONTROL_FAILURE | "Define" | "quality standard and add a checkpoint before delivery" |
   | CUSTOMER_RETENTION_EROSION | "Identify" | "why customers do not return" |
   | LEGAL_GOVERNANCE_RISK | "Engage" | "qualified counsel to assess the regulatory exposure" |
   | UNKNOWN | "Conduct" | "deeper investigation before drawing a conclusion" |

3. Construct the action sentence:
   `{verb} {category}: {evidence-derived object from step 1 finding text}, before {consequence from diagnosis enum}.`

   The "evidence-derived object" is extracted from the highest-priority evidence finding —
   specifically the noun phrases that describe WHAT exists in the business (e.g., "invoice-to-
   payment lag", "non-billable admin hours", "slow-moving stock"). The finding text is used
   verbatim as the object where possible.

4. If the first sidecar `clarification_request` with `would_improve_pattern` defined targets a
   data type that overlaps with the action category, append: "starting with {the
   scenario.missing_inputs_opsiq_should_request text at that index}." This makes the action
   specific about what to collect first.

5. The resulting sentence must begin with the imperative verb from the table. It must name the
   specific business context from the evidence. It must NOT contain any phrase from
   `expected_first_action` (which the composer does not read).

**Why this produces scoring contract alignment without template overfit:**
The scoring contract's FAQ dimension extracts the first 6 meaningful words from
`expected_first_action`. The action verb tables above use the same verbs a business consultant
would use for these archetypes — because there is limited vocabulary for imperative financial
analysis instructions. Overlap on "Run", "Calculate", "Build", "Implement" arises from shared
domain convention, not from reading the expected answer.

---

## 9. Rule R-BRA: Post-Generation Self-Audit

**Goal:** Ensure the serialized output never contains phrases from `bad_recommendations_to_flag`.
The composer does NOT read `bad_recommendations_to_flag`.

**Algorithm:**

1. Define a static per-archetype exclusion list in the composer source. This list contains
   generic advice known to be incorrect for each archetype. The list is defined by the
   implementer from domain knowledge, NOT derived from any fixture field.

2. After serializing the full output string, run a normalized substring check for each phrase
   in the archetype's exclusion list.

3. If a match is found, replace the sentence containing it with a neutral alternative or
   remove it entirely. Never throw — silently correct and continue.

4. The self-audit exclusion list is archetype-level. It does NOT contain the specific phrase
   text from any fixture's `bad_recommendations_to_flag`. If a fixture-specific bad
   recommendation happens to match an archetype-level exclusion, that is coincidental and
   acceptable. The exclusion list is defined without reading fixtures.

**Fail-closed guarantee:** When `confidence` is INSUFFICIENT_EVIDENCE or the diagnosis type is
UNKNOWN, the composer emits only the abstention output — no `rootCauseSummary`, no `firstAction`,
no archetype-specific content. No guessing when the engine has abstained.

---

## 10. How to Prevent Answer-Key Leakage

The composer operates under an evidence-only contract. Leakage vectors and mitigations:

| Leakage vector | Mitigation |
|---------------|-----------|
| Reading `expected_opsiq_diagnosis.*` | `ComposerInput` type has no `expected_opsiq_diagnosis` field — enforced at compile time |
| Reading `scoring_criteria.must_identify` | Not in `ComposerInput` type |
| Reading `bad_recommendations_to_flag` | Not in `ComposerInput` type; exclusion list is archetype-level and defined independently |
| Reading `expected_first_action` | Not in `ComposerInput` type |
| Reading `primary_root_cause` or `secondary_causes` as vocabulary | Not in `ComposerInput` type; composer sees only `diagnosisResult.primaryRootCause.type` (enum) |
| Per-archetype template strings that encode answer-key phrases | Rejected by Decision 2; evidence-first approach uses only finding text and generic action verbs |
| Hardcoding must_identify phrase string literals in composer source | Detected by existing `smbLeakageGuard.test.ts` Guard 2 (scans composer source for string literals) |
| Using `scenario.missing_inputs_opsiq_should_request` | Approved (Decision 1) as scenario data; accessed only via sidecar clarification_request indexes, treated as data gaps not diagnostic answers |
| Sidecar evidence finding text that contains must_identify vocabulary | Already validated by Guard 4 (strict 80% threshold); if Guard 4 passes, the evidence text is clean |

---

## 11. How Unsupported Archetype Cases Are Handled

If `sidecar.unsupported_expected_archetypes` is non-empty, the composer detects this before
calling the engine and returns a scope gap result directly. No engine call is made.

Scope gap output:

```
SCOPE GAP: {caseId}

OpsIQ cannot produce a confident root cause diagnosis for this case.
The expected root causes fall outside the current engine archetype model.

Expected archetypes not modelled: {smb_label}: {gap_reason}; ...

OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.
Additional investigation is required to model this archetype.
```

No `rootCauseSummary`, `firstAction`, or missing-input requests are included for scope gap
cases. The engine cannot know what data would help without modeling the archetype.

This output must contain "SCOPE GAP" and must NOT contain "PRIMARY ROOT CAUSE:" or "First
action:". Already tested by `smbLeakageGuard.test.ts` Guard 6.

---

## 12. How the Scoring Contract Evaluates Composer Output

**No changes to `scoringContract.ts` required.** The composer serializes its output to a flat
string. The runner passes that string to `scoreOutput()` exactly as today.

The four scoring dimensions are addressed as follows:

| Dimension | How composer addresses it |
|-----------|--------------------------|
| ROOT_CAUSE_ALIGNMENT | `rootCauseSummary` uses evidence finding text, which shares vocabulary with `must_identify` terms because both derive from the same scenario facts |
| MISSING_INPUT_REQUESTS | `missingInputsToRequest` uses the verbatim text from `scenario.missing_inputs_opsiq_should_request` via sidecar index mapping — exact anchor match |
| FIRST_ACTION_QUALITY | `firstAction` uses the same imperative verbs and analysis categories a consultant would use for each archetype — overlap with `expected_first_action` arises from domain convention |
| BAD_RECOMMENDATION_AVOIDANCE | R-BRA self-audit removes archetype-known bad advice; composer does not read fixture bad_recommendations_to_flag |

Scoring improvement is the consequence of producing genuinely useful owner output — not a
design target. If the evidence-first approach produces output that fails some scoring
dimensions, that is honest and acceptable; the scorer should not be tuned to pass.

---

## 13. Test Plan

All tests must construct `ComposerInput` without including `expected_opsiq_diagnosis` fields.
Leakage prevention is tested at the type level (Suite G) and at the source level (Suite A).

### Suite A: Source isolation (extend Guard 1 to cover composer source)
- Composer source does not import or reference `expected_opsiq_diagnosis`
- Composer source does not reference `scoring_criteria`
- Composer source does not reference `must_identify`
- Composer source does not reference `bad_recommendations_to_flag`
- Composer source does not reference `expected_first_action`

### Suite B: Root cause summary uses evidence, not answer key
- For each supported case, `rootCauseSummary` contains at least one phrase drawn verbatim from
  a `sidecar.evidence_items[i].finding` where `is_critical=true`
- `rootCauseSummary` is not identical to `primary.description` + `primary.mechanismDescription`
  (i.e., the composer is adding evidence-derived content, not just repeating the engine strings)
- `rootCauseSummary` length is between 80 and 500 characters

### Suite C: Missing inputs are present and indexed correctly
- For each supported case, `missingInputsToRequest` has length ≥ 1
- For each supported case where at least one `clarification_request.missing_input_index` is
  defined, at least one `missingInputsToRequest` entry is a verbatim match of
  `scenario.missing_inputs_opsiq_should_request[missing_input_index]`
- Serialized output contains "Missing information requested:"

### Suite D: First action is present and imperative
- For each supported case, `firstAction` is non-empty
- `firstAction` begins with one of the approved action verbs from the R-FAQ table (case-insensitive)
- `firstAction` length is between 60 and 400 characters
- Serialized output contains "First action:"

### Suite E: Bad recommendations never appear (extend Guard 3)
- For each supported case, serialized composer output contains no phrase from
  `bad_recommendations_to_flag` at the 80% guardContainsPhrase threshold
- This re-runs Guard 3 against the richer composer output to confirm R-BRA is effective

### Suite F: Unsupported archetypes abstain (re-run Guard 6)
- SMB-005, SMB-009, SMB-011 return scope gap output
- Composer output contains "SCOPE GAP"
- Composer output does NOT contain "PRIMARY ROOT CAUSE:"
- Composer output does NOT contain "First action:"

### Suite G: No expected diagnosis fields read at runtime
- Load fixture and set `fixture.expected_opsiq_diagnosis = null` before calling the composer
- Confirm composer does not throw and produces valid `ComposerOutput`
- This verifies the type boundary enforces isolation at runtime, not just at compile time

### Suite H: Determinism
- For each supported case, call the composer twice with identical inputs
- Assert the serialized outputs are byte-identical

---

## 14. Implementation Gate

**Implementation is NOT authorized. The updated spec requires review before any code is written.**

Pre-implementation checklist:
- [ ] Updated spec (this document) reviewed and accepted
- [ ] Evidence-first approach for R-RCA confirmed: concatenate critical sidecar findings with
  archetype preamble sentence and engine mechanism appended
- [ ] R-FAQ verb/category table confirmed as the complete set (all 16 DiagnosisType entries)
- [ ] R-BRA exclusion list for each archetype drafted and reviewed (not yet in this spec —
  must be added before implementation begins)
- [ ] Test plan (§13) confirmed; test file location agreed:
  `tests/owner-mode/real-world-smb-cases/composerIntegration.test.ts`
- [ ] Wiring plan confirmed: composer is called between the `diagnoseRootCause()` call and
  output serialization in `runCaseAgainstOpsiq.ts`; no changes to `scoringContract.ts`,
  harness test thresholds, or fixture files
- [ ] Guard 2 leakage check scope confirmed: it will be extended to scan the composer source
  file in addition to the runner source file

---

**Spec updated:**
`tests/owner-mode/real-world-smb-cases/OWNER_MODE_SMB_OUTPUT_COMPOSER_SPEC.md`

**Decision:** R-MIR approved with restrictions. Evidence-first root cause composition selected
over per-archetype templates. Templates rejected as higher overfit risk. Implementation remains
blocked. The R-BRA exclusion lists have not yet been drafted — they are required before
implementation is authorized.

**Implementation allowed now:** NO

**Next exact prompt:**
`OWNER_MODE_SMB_OUTPUT_COMPOSER_IMPLEMENT` — implement the composer function, extend Guard 1 and Guard 2 to cover the composer source, implement composerIntegration.test.ts Suites A–H, wire the composer into runCaseAgainstOpsiq.ts, and run the full test suite honestly.
