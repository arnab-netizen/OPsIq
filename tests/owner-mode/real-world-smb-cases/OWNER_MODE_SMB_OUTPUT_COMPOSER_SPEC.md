# Owner Mode SMB Output Composer — Design Specification

**Status:** SPEC UPDATED — R-BRA exclusion lists added; pending final wiring plan review before implementation
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

1. Define a static per-archetype exclusion list in the composer source (specified in §9a below).
   The list contains generic advice known to be incorrect for each archetype. It is defined
   from domain knowledge, NOT derived from any fixture field.

2. Before emitting `firstAction`, check it against the archetype's exclusion list using
   normalized substring matching. If any excluded phrase is present, do not silently correct —
   instead return `ABSTAIN_BAD_RECOMMENDATION_RISK` (see §9a fail-closed rule).

3. After serializing the full output string, run a secondary normalized substring check for each
   phrase in the archetype's exclusion list across the entire output. If a match is found in
   any field other than `firstAction` (e.g., in `rootCauseSummary`), replace the offending
   phrase with a neutral alternative before returning. Never expose excluded phrases to the
   caller.

4. The self-audit exclusion list is archetype-level. It does NOT contain the specific phrase
   text from any fixture's `bad_recommendations_to_flag`. If a fixture-specific bad
   recommendation happens to match an archetype-level exclusion, that is coincidental and
   acceptable. The exclusion list is defined without reading fixtures.

**Fail-closed guarantee:** When `confidence` is INSUFFICIENT_EVIDENCE or the diagnosis type is
UNKNOWN, the composer emits only the abstention output — no `rootCauseSummary`, no `firstAction`,
no archetype-specific content. No guessing when the engine has abstained.

---

## 9a. R-BRA — Bad Recommendation Avoidance Exclusion Lists

This section defines the complete per-archetype exclusion lists required before the composer
may be implemented.

### Leakage constraint (non-negotiable)

These lists are defined from **general consulting domain knowledge** about each archetype.
They are NOT derived from any fixture's `bad_recommendations_to_flag` field. The fixture
field is not read by the composer. Overlap between an archetype exclusion phrase and a
fixture's bad_recommendations_to_flag entry is coincidental and acceptable. The composer
implementation must not import or reference `bad_recommendations_to_flag` in any form.

### Fail-closed rule

If the composer's candidate `firstAction` contains a phrase from the active archetype's
exclusion list (normalized substring match), the composer MUST return:

```typescript
{
  firstAction: "ABSTAIN_BAD_RECOMMENDATION_RISK",
  rootCauseSummary: "",          // cleared
  supportingEvidence: [],        // cleared
  missingInputsToRequest: [],    // cleared
  confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
  warningFlags: ["Composer abstained: proposed first action matched bad-recommendation exclusion list for archetype {type}"]
}
```

This is a hard failure. The runner must treat `ABSTAIN_BAD_RECOMMENDATION_RISK` as an
unsupported result and report it as a scope gap, not as a diagnosis.

### Universal exclusions (all archetypes, all confidence levels)

These phrases are excluded regardless of archetype:

| Excluded phrase pattern | Reason |
|------------------------|--------|
| "raise a funding round" / "raise funding" | Growth financing before root cause is resolved accelerates cash burn |
| "go viral" / "viral marketing" | Not an operational action; not within owner control |
| "pivot the business" | Scope change; not within a diagnosis-stage first action |
| "sell the business" | Exit advice; outside the intervention scope |
| "do nothing" / "wait and see" | Contradicts intervention obligation |

### Evidence-triggered universal exclusions

These apply when specific evidence signals are present, regardless of archetype:

| Evidence signal | Excluded phrase patterns |
|----------------|-------------------------|
| `fin_runwayMonths ≤ 3` OR `SURVIVAL_HARD` text in any evidence item | "expand", "open new", "hire now", "invest in growth", "increase marketing", "take on more clients", "launch new" |
| `contribution < 0` OR `variableCost > price` in any evidence item | "scale", "grow faster", "increase volume", "add more customers", "double down on acquisition" |
| `marginPct < 0` OR `operatingMargin < 0` in any evidence item | "run a promotion", "offer discounts", "reduce prices to compete", "drive more volume" |

---

### WORKING_CAPITAL_STRESS

**Root cause:** Cash trapped in the AR/AP/CCC timing cycle. The business has positive operating
margin but cash leaves before it is collected.

**Core insight for exclusion design:** More revenue creates more receivables, which deepens the
trap. More staff or expansion adds outflow obligations before the inflow cycle closes. The only
correct first response is to understand and restructure the timing gap.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Revenue growth as first response | "grow revenue", "acquire more clients", "increase sales", "take on larger accounts", "win more business" |
| Staff additions before timing is fixed | "hire a sales representative", "hire staff", "add headcount" |
| Expansion before cash cycle is resolved | "open a second location", "expand", "add a new offering" |
| Debt as a primary fix | "take a business loan to fund operations", "draw more credit" (as a strategic recommendation, not an interim measure) |
| Product/range expansion | "expand product line", "add more SKUs", "diversify offerings" |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `dso ≥ 60` AND `cashConversionDays` undefined | "the cash problem will resolve when revenue increases" |
| Bank balance < monthly payroll | "investment", "expansion", "marketing spend increase" |

#### Allowed first actions

- "Build a rolling cash flow forecast mapping AR inflow timing and AP due dates"
- "Produce an AR aging report and identify the largest overdue balances"
- "Request extended payment terms from suppliers while accelerating client collection"
- "Calculate the cash conversion cycle to quantify the structural gap"

---

### INVENTORY_FORECASTING_MISMATCH

**Root cause:** Demand forecasting failure misallocates stock — simultaneous overstock and
stockout. Cash is locked in slow-moving inventory while fast lines are empty.

**Core insight:** Buying more inventory (of any kind) deepens the cash trap. Marketing to
move more units accelerates sell-through on some lines but does not fix the forecasting
process that will re-create the problem. The only correct first response is to understand
which specific SKUs are misallocated before making any purchasing or marketing decision.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| More inventory before forecasting is fixed | "buy more inventory", "restock", "place new orders" (before velocity analysis) |
| Broadening assortment | "expand product range", "add more varieties", "diversify suppliers", "add more SKUs" |
| Marketing before stock alignment | "increase marketing to move units", "run a promotion to clear stock", "advertise more" |
| Staffing before process change | "hire more staff to manage the warehouse", "add inventory staff" |
| Revenue growth as solution | "grow sales to reduce inventory days", "acquire more customers to turn stock faster" |
| Debt for inventory | "take a loan to buy more inventory", "increase the credit line to fund purchasing" |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `forecastErrorPct ≥ 50` | "the buying process is sound and needs more data" |
| Simultaneous overstock AND stockout evidence | "the problem is insufficient demand" |

#### Allowed first actions

- "Run an inventory age and velocity analysis by SKU to identify which lines are cash traps"
- "Produce a sell-through rate by SKU over the past 6 months before placing any new orders"
- "Identify the top 20 slow-moving SKUs and calculate the cash value locked in each"
- "Pause all non-committed reorders until the velocity analysis is complete"

---

### UNIT_ECONOMICS_FAILURE

**Root cause:** Contribution margin per unit or per customer is negative. Growth at negative
contribution margin deepens losses in direct proportion to volume.

**Core insight:** Any action that increases the number of units sold or customers acquired while
contribution margin is negative makes the financial position worse, not better. The only correct
first response is to measure and understand the contribution margin breakdown before any growth
or acquisition action.

Note: this archetype covers multiple sub-types in the SMB fixture set — paid-acquisition
negative unit economics, fixed-cost overextension below breakeven, and premature multi-location
expansion. All share the same fundamental exclusion logic: do not scale before the per-unit
economics are positive.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Scaling before margin is fixed | "scale up", "grow faster", "double down", "increase volume", "expand customer base" |
| Acquisition spend before margin | "increase ad spend", "spend more on marketing", "launch more campaigns", "hire a marketing agency" |
| Sales headcount before margin | "hire salespeople", "hire a business development manager", "add a sales team" |
| Opening new units before per-unit economics proven | "open a new location", "expand to new markets", "open another site" |
| Fundraising to fuel negative-margin growth | "raise funding to scale", "bring in investors to accelerate growth" |
| Discounting to drive volume | "offer discounts to drive volume", "reduce prices to acquire customers" |
| Adding product/service scope at negative margin | "launch new products", "add premium tiers", "diversify the offering" |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `contribution < 0` AND paid channel evidence present | "improve ROAS", "optimize ad targeting", "test more creatives" (these optimize a loss-generating channel, not fix the unit economics) |
| `variableCost > price` | "the problem is insufficient revenue" (price is below variable cost; volume cannot fix this) |
| Multi-location evidence with negative per-location contribution | "the network effect will improve with more locations" |

#### Allowed first actions

- "Calculate contribution margin per unit per channel before making any further acquisition or growth decisions"
- "Identify which channel or customer segment, if any, has positive contribution margin"
- "Freeze all growth spend on channels with negative contribution until the margin structure is fixed"
- "Produce a per-location P&L to determine which locations are contributing positively"

---

### MARGIN_EROSION

**Root cause:** Costs rising faster than price, or operating profitability declining over time,
compressing margin. The business is not unprofitable per unit but the margin gap is closing.

**Core insight:** Volume increases at a compressed margin produce proportionally less cash per
unit. Promotions and discounts further reduce revenue per unit while costs stay fixed. The
correct first response is to understand the cost driver and evaluate pricing headroom before
any volume or promotion action.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Volume increase before repricing | "serve more customers to spread fixed cost", "increase volume", "grow revenue to offset cost" |
| Promotional response to margin compression | "run a promotion", "offer a discount to drive traffic", "introduce a price promotion" |
| Adding capacity before margin is stable | "add seating", "extend hours", "open longer", "add more shifts" |
| Staff additions before cost structure is controlled | "hire more staff to handle more volume", "add more delivery capacity" |
| Marketing as primary fix | "advertise more to bring in more customers", "increase marketing spend" |
| New offerings before core margin is fixed | "add premium services to increase revenue per customer", "launch new menu items" |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `marginPct < 0` | "cut staff as the primary cost action" (addresses symptom without diagnosing cost driver) |
| Input cost evidence (`marginPct` declining + operational finding referencing cost inflation) | "reduce prices to compete" (further compresses margin under cost inflation) |
| `profitChangePercent < -20` | "the problem is insufficient revenue" |

#### Allowed first actions

- "Implement weekly cost tracking to measure the specific cost driver compressing margin"
- "Run a cost-driver decomposition to identify whether COGS, labor, or overhead is the primary compression source"
- "Test a targeted price increase on key items to measure actual customer price sensitivity"
- "Produce a contribution by product/service line to identify which lines are most affected"

---

### OPERATIONAL_BOTTLENECK

**Root cause:** A capacity constraint limits throughput. The constraint may be owner time,
equipment, process, or team. Revenue is capped by the bottleneck, not by demand.

**Core insight:** Adding more work to a bottlenecked system worsens the constraint. Hiring
without understanding the bottleneck structure may add cost without removing the constraint.
The correct first response is to map where the capacity is consumed before any capacity
expansion decision.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Adding workload before bottleneck is resolved | "take on more clients", "accept more work", "add more orders", "serve more customers now" |
| Unsustainable personal effort as a strategy | "work harder", "extend working hours", "work more hours to meet demand", "sacrifice more time" |
| Premature hiring without process understanding | "hire immediately to add capacity" (without first identifying where the bottleneck is) |
| Pricing reduction to fill capacity | "reduce prices to fill the pipeline", "discount to keep the operation busy" |
| Adding product/service complexity | "launch new service lines to use spare capacity" (if there is no spare capacity) |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `finding` contains "owner" AND `dimension=operational_efficiency` AND `is_critical=true` | "hire a junior employee immediately and bill them out at full rate" (hiring rate assumption before process is analyzed) |
| Total hours worked evidence near or above personal limit | "immediately raise rates to reduce demand" (as the first action without capacity mapping) |

#### Allowed first actions

- "Map where time is consumed by activity type to identify which non-value activities can be eliminated or delegated"
- "Identify the specific bottleneck step in the service delivery process before any capacity change"
- "Quantify how much owner time is consumed by non-revenue-generating activity each week"
- "Determine whether the constraint is process, delegation gap, or true capacity ceiling"

---

### CASH_LIQUIDITY_CRISIS

**Root cause:** Cash outflows are outpacing inflows; runway is short; the business faces
immediate obligation risk. This is an acute condition requiring cash preservation first.

**Core insight:** Any action that increases cash burn — growth, hiring, expansion, inventory —
worsens the crisis. The only correct first response is to understand the exact cash position
and manage outflows before any other decision.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Growth spend during liquidity crisis | "invest in growth", "increase marketing", "launch a campaign", "grow the customer base" |
| Staff additions | "hire now", "add headcount", "bring on staff" |
| Inventory or capex | "buy inventory", "invest in equipment", "make capital improvements" |
| Expansion | "open a new location", "expand the operation", "take on new space" |
| Debt as primary fix without addressing burn | "take a loan to cover operations" (as the sole recommendation without burn-rate analysis) |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| `fin_runwayMonths ≤ 3` | All growth-category phrases (see universal evidence-triggered exclusions) |
| `SURVIVAL_HARD` text | "the business just needs more time" |

#### Allowed first actions

- "Produce a 13-week cash flow forecast showing exact inflow and outflow obligations before any other decision"
- "Identify and defer all discretionary outflows immediately"
- "Contact lenders or creditors to assess available runway extensions"
- "Map committed vs discretionary obligations to identify the minimum cash needed to operate"

---

### DEBT_SOLVENCY_PRESSURE

**Root cause:** Balance-sheet structural stress — leverage, covenant headroom, maturity wall,
or interest burden — constraining the business's financial flexibility.

**Core insight:** Actions that increase debt, consume remaining liquidity, or add operational
complexity before the debt structure is understood worsen the position. The correct first
response is to understand the exact debt structure and obligations.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Additional debt before structure is understood | "take on more debt", "draw additional credit", "secure new financing" |
| Growth that increases operating cash demand | "invest in new capacity", "expand operations", "hire aggressively" |
| Marketing or revenue-growth actions before debt stabilization | "grow revenue to service the debt" (as a first action before understanding covenant position) |
| Capex | "invest in equipment", "upgrade facilities" |

#### Allowed first actions

- "Obtain the full debt schedule, covenant test dates, and current headroom before any other decision"
- "Assess lender appetite for covenant waiver or refinancing before taking operational action"
- "Prepare a cash flow bridge to the next covenant test date"

---

### PRICING_POWER_FAILURE

**Root cause:** Realized price is below comparable market rate, list price, or profitable
level — through under-pricing, uncontrolled discounting, or pricing model transition risk.

**Core insight:** Brand or marketing investment that does not address price realization does
not fix the underlying problem. Adding volume at a price-realization gap widens the total
revenue shortfall. The correct first response is to understand the specific gap mechanism.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Rebranding as primary fix | "rebrand to justify higher prices", "invest in brand identity to command a premium" |
| Marketing volume at underpriced margin | "increase marketing spend to acquire more customers", "grow customer volume" |
| Feature additions before price fix | "add more features to justify the price" |
| Discounting to retain at-risk customers | "offer discounts to prevent churn", "run promotions to keep customers" |

#### Evidence-triggered exclusions

| Trigger | Additional exclusions |
|---------|-----------------------|
| Pricing model transition evidence (PRICING_MODEL_CHANGE + PRICING_CUSTOMER_RISK) | "maintain the current pricing model and add more value" |
| `discountPct ≥ 15` | "give sales team more discount authority" |

#### Allowed first actions

- "Map realized price per transaction against list price to quantify the discount leakage"
- "Identify which customer segment or rep is driving the largest discount gap"
- "Test a price increase on a single product or service line to measure actual price sensitivity"

---

### KEY_PERSON_RISK

**Root cause:** Critical knowledge, relationships, or revenue are concentrated in one
undocumented person with no succession.

**Core insight:** Growth that increases the key person's load deepens the dependency. Hiring
junior staff without documentation does not reduce the single point of failure. The correct
first response is to understand and document what the key person holds.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Adding client load before dependency is reduced | "take on more clients", "grow the client base", "expand to new accounts" |
| Staff additions without documentation | "hire junior staff to support the key person" (without knowledge transfer plan) |
| Growth before dependency is documented | "expand to new markets", "add new service lines" |

#### Allowed first actions

- "Document the critical knowledge, relationships, and processes held only by the key person"
- "Identify the minimum viable cross-training needed to reduce single-point-of-failure risk"
- "Map which client relationships are portable to a second person and begin the transition"

---

### LEGAL_GOVERNANCE_RISK

**Root cause:** Regulatory, compliance, governance, or conduct exposure requiring containment
and qualified counsel.

**Core insight:** Growth, fundraising, or expansion before the legal exposure is assessed and
contained creates additional liability. The correct first response is to obtain qualified
counsel and understand scope of exposure.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Growth before legal remediation | "expand to new markets", "launch new products or services", "open new locations" |
| Fundraising before disclosure | "raise funding", "bring in investors", "pursue a strategic partnership" |
| Hiring before exposure is assessed | "grow headcount", "add staff to scale operations" |
| Ignoring the exposure | "monitor the situation", "wait for the regulator to act" |

#### Allowed first actions

- "Engage qualified counsel to assess the scope of regulatory exposure and remediation timeline"
- "Pause any action that increases regulatory surface area until counsel has assessed the position"
- "Document the known breach, its timeline, and all parties with knowledge of it"

---

### QUALITY_CONTROL_FAILURE

**Root cause:** Absence of quality assurance checkpoints or process standards causing defects
to reach customers.

**Core insight:** Adding volume while a quality failure is active scales the reputational
damage. Pricing reductions to compensate for quality issues devalue the service without fixing
the process. The correct first response is to define the quality standard and add a checkpoint.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Volume growth before QC is fixed | "take on more clients", "accept more orders", "grow customer volume" |
| Price reduction as compensation | "reduce prices to retain unhappy customers", "offer refunds as standard practice" |
| Marketing to replace churned customers | "increase marketing to replace customers lost to quality issues" |

#### Allowed first actions

- "Define the quality standard explicitly and add a checkpoint before delivery to the customer"
- "Identify the specific step in the process where defects are introduced"
- "Implement a defect tracking log to measure quality failure rate before any other intervention"

---

### CUSTOMER_RETENTION_EROSION

**Root cause:** Absence of a systematic retention mechanism causes one-time purchasing
behavior — customers are not being kept.

**Core insight:** Acquisition investment when retention is broken wastes money filling a leaky
bucket. Referral programs built on retained customers fail when customers do not return.
The correct first response is to understand why customers do not return.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Acquisition before retention | "increase customer acquisition spend", "run paid campaigns to add new customers" |
| Referral programs before retention | "launch a referral program", "build a loyalty program" (before understanding why customers leave) |
| Feature additions before churn cause is known | "add more features to increase stickiness", "add more product variety" |

#### Allowed first actions

- "Identify the primary reason customers do not return through direct outreach to lapsed customers"
- "Calculate the repeat purchase rate and compare it against the break-even rate for the business model"
- "Map the post-purchase customer journey to identify where the relationship ends"

---

### DEMAND_GENERATION_FAILURE

**Root cause:** Top-of-funnel demand or new-customer acquisition has collapsed or stalled.

**Core insight:** Spending more on channels that have already collapsed is not a first action.
The correct first response is to diagnose which channel failed and why.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| More spend on collapsing channels | "increase spend on the channel", "add more budget to the underperforming channel" |
| Hiring before demand cause is known | "hire a sales team", "add business development staff" |

#### Allowed first actions

- "Audit lead source attribution by channel to identify where demand has collapsed"
- "Separate paid vs organic demand to identify which stream is declining"

---

### GTM_CHANNEL_MISMATCH

**Root cause:** Acquisition concentrated in an underperforming channel with poor CAC or
conversion.

**Core insight:** Moving more budget to a mismatched channel deepens the problem. The correct
first response is to separate channel-level economics before any reallocation.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| More spend before channel audit | "increase spend across all channels", "add more budget to current channels" |
| Channel broadening before per-channel diagnosis | "launch on additional platforms", "add more distribution channels" |

#### Allowed first actions

- "Separate CAC, conversion rate, and LTV by channel before reallocating any budget"
- "Identify the highest-CAC channel and pause spend on it while the data is analyzed"

---

### STRATEGIC_CAPEX_RISK

**Root cause:** Large irreversible capital commitment weighed against demand whose durability
is unproven.

**Core insight:** Committing capital before demand durability is validated risks a value-
destroying, irreversible loss. The correct first response is to model the downside before any
commitment is made.

#### Generic exclusions

| Category | Excluded phrase patterns |
|----------|-------------------------|
| Immediate commitment | "proceed with the investment now", "commit the capital before the window closes", "accelerate the timeline" |
| Optimism as risk mitigation | "the demand is clearly durable", "the market is clearly growing" |

#### Allowed first actions

- "Model the downside scenario in which demand does not persist and quantify the irreversible loss"
- "Identify whether a reversible or staged alternative exists before committing the full capital"

---

### UNKNOWN / INSUFFICIENT_EVIDENCE

**No first action is produced.** The composer emits only:

```
Insufficient evidence to produce a diagnosis. OpsIQ will not recommend an action
without a confident root cause identification.
```

All archetype-specific exclusions and allowed first actions are irrelevant for this case.
The fail-closed guarantee applies: no `firstAction` field in the output; no
`rootCauseSummary`; no `supportingEvidence`.

---

### R-BRA Test Requirements

These tests must be implemented in `composerIntegration.test.ts` as Suite I.

#### Suite I-1: Composer rejects excluded first action

For each archetype with a defined exclusion list:
- Construct a `ComposerInput` with minimal valid evidence that triggers the archetype
- Inject a synthetic candidate `firstAction` that contains an excluded phrase
- Assert the composer returns `ABSTAIN_BAD_RECOMMENDATION_RISK`
- Assert the warning flag contains the archetype name

#### Suite I-2: Evidence-triggered exclusion fires

- Construct a `ComposerInput` where `fin_runwayMonths ≤ 3` (or equivalent `SURVIVAL_HARD`
  finding) is present
- Assert that any candidate `firstAction` containing "expand", "hire now", "increase
  marketing", or "invest in growth" causes `ABSTAIN_BAD_RECOMMENDATION_RISK`
- Assert this behavior is archetype-independent (test against at least MARGIN_EROSION and
  UNIT_ECONOMICS_FAILURE to confirm the evidence-triggered exclusion applies across archetypes)

#### Suite I-3: Allowed first action passes

For each archetype with a defined exclusion list:
- Construct a `ComposerInput` with minimal valid evidence that triggers the archetype
- Assert the composer produces a non-empty `firstAction` that does NOT trigger the
  `ABSTAIN_BAD_RECOMMENDATION_RISK` path
- Assert the `firstAction` begins with an imperative verb from the R-FAQ table

#### Suite I-4: UNKNOWN diagnosis abstains

- Construct a `ComposerInput` that produces `DiagnosisType.UNKNOWN` from the engine
- Assert the composer produces no `firstAction` field (or an empty string)
- Assert the composer produces no `rootCauseSummary`
- Assert the output contains the insufficient-evidence abstention statement

#### Suite I-5: Exclusion list does not use fixture bad_recommendations_to_flag text

This is a source-level test (Suite A extension), not a runtime test:
- Read the composer source file
- For each fixture's `bad_recommendations_to_flag` entry, assert the EXACT phrase does not
  appear as a string literal in the composer source
- This confirms the exclusion lists were independently derived, not copied from fixtures

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
- [x] Updated spec (this document) reviewed and accepted
- [x] Evidence-first approach for R-RCA confirmed: concatenate critical sidecar findings with
  archetype preamble sentence and engine mechanism appended
- [x] R-FAQ verb/category table confirmed as the complete set (all 16 DiagnosisType entries)
- [x] R-BRA exclusion lists for all archetypes drafted in §9a: WORKING_CAPITAL_STRESS,
  INVENTORY_FORECASTING_MISMATCH, UNIT_ECONOMICS_FAILURE, MARGIN_EROSION,
  OPERATIONAL_BOTTLENECK, CASH_LIQUIDITY_CRISIS, DEBT_SOLVENCY_PRESSURE,
  PRICING_POWER_FAILURE, KEY_PERSON_RISK, LEGAL_GOVERNANCE_RISK,
  QUALITY_CONTROL_FAILURE, CUSTOMER_RETENTION_EROSION, DEMAND_GENERATION_FAILURE,
  GTM_CHANNEL_MISMATCH, STRATEGIC_CAPEX_RISK, UNKNOWN
- [x] Universal exclusions defined (all archetypes)
- [x] Evidence-triggered universal exclusions defined (runway, contribution, margin signals)
- [x] R-BRA test requirements drafted (Suite I-1 through I-5) in §9a
- [x] Fail-closed rule defined: ABSTAIN_BAD_RECOMMENDATION_RISK on firstAction violation
- [ ] Test plan (§13 + §9a Suite I) confirmed; test file location agreed:
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
over per-archetype templates. Templates rejected as higher overfit risk. R-BRA exclusion lists
complete: 15 DiagnosisType archetypes covered plus UNKNOWN abstention, universal exclusions,
and evidence-triggered universal exclusions. Fail-closed rule defined: ABSTAIN_BAD_RECOMMENDATION_RISK.
Implementation remains blocked pending wiring plan confirmation and test file location approval.

**Implementation allowed now:** NO

**Remaining blocker:** Wiring plan and test file location must be confirmed (two unchecked
items in §14). Once confirmed, implementation is authorized.

**Next exact prompt:**
`OWNER_MODE_SMB_OUTPUT_COMPOSER_IMPLEMENT` — implement the composer function at
`tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts`, extend Guard 1 and Guard 2 in
`smbLeakageGuard.test.ts` to cover the composer source, implement
`composerIntegration.test.ts` Suites A–I, wire the composer into `runCaseAgainstOpsiq.ts`
between the `diagnoseRootCause()` call and output serialization, make no changes to
`scoringContract.ts`, harness test thresholds, engine, fixtures, or sidecars, and run the
full test suite honestly reporting the result.
