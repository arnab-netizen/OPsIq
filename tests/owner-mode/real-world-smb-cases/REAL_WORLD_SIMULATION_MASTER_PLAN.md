# OpsIQ Real-World Simulation Program — Master Plan

## Purpose

This document defines the complete OpsIQ Real-World Simulation Program. It extends the SMB internal benchmark and holdout validation to a broader set of business conditions, intervention modes, and failure archetypes. Its purpose is to measure whether OpsIQ produces correct, actionable, and safe guidance across the full range of real-world SMB situations it will encounter in production.

This is a specification document. It defines what to build and how to evaluate it. It does not modify any existing benchmark asset (SMB-001 through SMB-012, holdout fixtures, `smbOutputComposer.ts`, `scoringContract.ts`, `smbRegressionLock.test.ts`, `smbLeakageGuard.test.ts`, or any evidence-hint sidecar).

---

## Program Structure Overview

```
Real-World Simulation Program
├── 12 Simulation Categories (SC-01 through SC-12)
├── 5 Test Types (applied within each category)
├── 6 Structural Components (applied to every simulation)
├── Minimum simulation counts per category
├── Pass criteria (case-level and program-level)
├── Failure classification system
└── Evidence requirements
```

---

## Part 1 — Simulation Categories

### SC-01: Cash Crisis

**Definition**: A business with acute cash shortage — less than 4 weeks of operating expenses in accessible accounts — where the cause is not yet identified and the owner is taking reactive measures.

**Key diagnostic questions**:
- Is the crisis driven by revenue failure, margin compression, timing mismatch, or balance sheet structure?
- Is the crisis acute (sudden onset) or chronic (progressive deterioration disguised by owner coping behaviours)?
- Is the business fundamentally viable or structurally insolvent?

**Presenting conditions**:
- Immediate payroll or supplier payment risk
- Owner drawing down personal savings or credit
- Inconsistent bank balance relative to revenue
- Owner reports "we're profitable but never have cash"

**Archetypes expected to appear**:
- Working capital stress (AR lag, billing gap, cash conversion cycle)
- Pricing-below-cost with revenue-masked losses
- Fixed-cost overextension post-growth
- Owner coping behaviour masking structural insolvency

**Minimum simulations**: 4 cases

**Pass criteria (case-level)**:
- RCA identifies correct cash mechanism (not just "cash problem")
- Output does not recommend debt financing without first diagnosing source
- Output does not recommend revenue growth as a primary cash fix
- Missing inputs include at minimum: cash flow projection, bank statements, aged AR, payroll schedule

---

### SC-02: Growth Without Profit

**Definition**: A business whose revenue is increasing but whose net profit is declining, flat, or negative — the owner believes growth is the solution but the margin structure does not support it.

**Key diagnostic questions**:
- Is the margin decline a pricing problem, a cost structure problem, or a scale diseconomy?
- Is the owner aware that gross margin is declining or only aware that revenue is up?
- Are variable costs growing faster than revenue (contribution margin compression) or are fixed costs being added ahead of revenue (premature scale)?

**Presenting conditions**:
- Revenue up 20%+ but owner reports feeling worse off
- Gross margin appears unchanged but net income is lower
- Owner has recently hired, leased, or expanded
- Owner attributes the problem to revenue not being high enough yet

**Archetypes expected to appear**:
- Premature expansion (fixed cost addition before margin proves out)
- Pricing-below-cost (discounting to win volume)
- Owner capacity ceiling (owner is the bottleneck preventing margin leverage)
- Contribution margin compression from customer mix shift

**Minimum simulations**: 4 cases

**Pass criteria (case-level)**:
- RCA separates revenue failure from margin failure
- Output does not recommend further growth without margin analysis
- Output requests unit economics breakdown (not just total revenue/cost)
- Bad recommendation guard fires if "hire a salesperson" or "grow revenue" is recommended without margin context

---

### SC-03: Declining Margins

**Definition**: A business where gross or net margin has declined over a 6–24 month period, often without the owner fully quantifying the decline or its source.

**Key diagnostic questions**:
- Is the decline in gross margin (input cost inflation, pricing failure, product mix shift) or operating margin (fixed cost creep)?
- Is the margin decline secular (structural) or cyclical (temporary)?
- Does the owner know which product lines, service types, or customer segments are driving the decline?

**Presenting conditions**:
- Owner notes "margins aren't what they used to be"
- Supplier costs up but prices not adjusted
- Revenue has held steady but profit has not
- Owner compares current performance to 2–3 years ago unfavourably

**Archetypes expected to appear**:
- Commodity pass-through failure (cost increase not passed to price)
- Customer mix deterioration (high-margin customers replaced by low-margin ones)
- Service line subsidy (unprofitable service carried by profitable one)
- Operating leverage failure (fixed costs growing without volume to absorb them)

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA identifies whether margin failure is at gross or operating level
- Output requests margin breakdown by product/service/customer segment
- Output does not recommend cutting headcount as first action without evidence headcount is the driver
- Output correctly identifies whether input cost or pricing is the primary lever

---

### SC-04: Customer Churn

**Definition**: A business losing existing customers at a rate that threatens revenue stability, where the owner is focused on acquisition rather than retention.

**Key diagnostic questions**:
- Is churn from service quality failure, pricing failure, competitive substitution, or lifecycle completion?
- Does the owner measure churn explicitly or only notice revenue decline?
- Is the acquisition rate masking the true severity of the churn rate?

**Presenting conditions**:
- "We keep getting new customers but revenue doesn't grow"
- Long-term customers not returning
- Owner attributes the problem to "not enough marketing"
- High acquisition spend with flat revenue

**Archetypes expected to appear**:
- Service delivery failure masked by acquisition
- Price-value mismatch (customers leave at renewal/repeat decision)
- Operational capacity failure causing quality decline
- Market saturation in a small geography

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA distinguishes acquisition deficit from retention deficit
- Output requests churn rate, repeat purchase rate, or customer lifetime data
- Output does not recommend increased marketing spend without confirming acquisition is the bottleneck
- Output requests exit reason data or customer satisfaction evidence

---

### SC-05: Marketing Failure

**Definition**: A business where marketing spend is not producing returns — either because the spend is misdirected, the offer is wrong, or the conversion process fails after marketing delivers leads.

**Key diagnostic questions**:
- Is the failure in lead generation, lead quality, conversion, or offer?
- Is the owner measuring marketing ROI or only spend?
- Is the problem marketing (top of funnel) or sales (mid/bottom of funnel)?

**Presenting conditions**:
- "We spend on ads but it doesn't work"
- Leads come in but don't convert
- Owner has changed marketing channels repeatedly with no improvement
- Marketing spend increasing while revenue flat

**Archetypes expected to appear**:
- Offer-market mismatch (marketing is working; the product or pricing isn't)
- Conversion failure post-lead (sales process, follow-up, or proposal quality)
- Channel mismatch (wrong audience for the channel)
- Attribution blindness (marketing works but owner cannot measure it)

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA separates marketing failure from offer or conversion failure
- Output requests conversion rate data (not just spend and leads)
- Output does not recommend "more marketing spend" without diagnosing current spend efficiency
- Output correctly identifies whether the failure is reach, relevance, or response

---

### SC-06: Operational Bottlenecks

**Definition**: A business where capacity constraints are preventing revenue growth or causing quality degradation — the bottleneck may be people, equipment, process, or the owner's own time.

**Key diagnostic questions**:
- Where in the delivery chain is the constraint?
- Is the bottleneck a people constraint, a process constraint, an equipment constraint, or an owner-as-operator constraint?
- Is the owner aware of the constraint or attributing the problem to insufficient demand?

**Presenting conditions**:
- "We can't take on more work even though customers are waiting"
- Lead times have extended and customers are complaining
- Owner is working excessive hours but output is not increasing
- Quality problems are increasing as volume increases

**Archetypes expected to appear**:
- Owner capacity ceiling (owner is single point of failure)
- Process throughput constraint (specific step limits output)
- Equipment or space constraint at capacity
- Skill gap constraint (one person or skill type is bottleneck)

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA identifies the specific bottleneck (not just "capacity problem")
- Output requests throughput data, not just revenue or headcount
- Output does not recommend hiring before identifying the bottleneck location
- Output correctly separates demand constraint from supply constraint

---

### SC-07: Staffing Problems

**Definition**: A business experiencing people-related operational dysfunction — high turnover, inability to hire, underperformance, or a key-person dependency creating risk.

**Key diagnostic questions**:
- Is the staffing problem a compensation problem, a culture problem, a management problem, or a role design problem?
- Is the owner the source of the staffing problem (management failure, expectations failure, delegation failure)?
- Is the business dependent on one key person who cannot be replaced?

**Presenting conditions**:
- High turnover in a specific role or across the board
- Inability to hire despite competitive wages
- Owner describes a specific underperformer but cannot resolve the situation
- A key employee leaving has destabilised operations

**Archetypes expected to appear**:
- Compensation-market mismatch (wages below market)
- Management failure (owner as problem source)
- Role design failure (unclear responsibilities, overloaded roles)
- Key-person dependency creating operational fragility

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA identifies whether the problem is structural (role/comp/culture) or individual (specific person)
- Output does not recommend termination as first action without diagnosing root cause
- Output requests turnover data, exit reason data, or role description
- Human-factors safety: output models owner management behaviour as a variable, not a personality diagnosis

---

### SC-08: Debt Distress

**Definition**: A business with a debt load — from loans, credit facilities, deferred payables, or ATO/tax liabilities — that is consuming cash flow or creating existential risk.

**Key diagnostic questions**:
- Is the debt distress caused by the original borrowing decision, subsequent operating deterioration, or both?
- Is the debt serviceable from current operations or does it require restructuring?
- Is the owner aware of the true cost of servicing the debt as a proportion of operating cash?

**Presenting conditions**:
- Loan repayments are straining cash each month
- Owner took debt to fix a cash problem but the underlying problem remains
- Tax or ATO liability has accumulated
- Line of credit is fully drawn with no repayment plan

**Archetypes expected to appear**:
- Debt-masked operational failure (borrowed to survive, problem unresolved)
- Refinancing treadmill (short-term debt rolled into short-term debt)
- Tax liability accumulation from deferred obligations
- Structural insolvency with debt as symptom not cause

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA distinguishes debt as cause vs debt as symptom
- Output does not recommend more debt without diagnosing the operating position
- Output requests debt schedule (amounts, rates, terms, security) before prescribing action
- Output correctly classifies whether the business is operationally viable before debt service

---

### SC-09: Turnaround Situations

**Definition**: A business that has already failed to perform and is in active decline — the owner needs to decide between trading out, restructuring, or exit. The intervention mode is turnaround, not optimisation.

**Key diagnostic questions**:
- Is the business worth saving, or should the owner exit?
- What is the minimum viable structure for the business to be sustainable?
- What must be stopped, cut, or exited before anything else?

**Presenting conditions**:
- Months of consecutive losses
- Multiple previous attempts to fix the business have failed
- Owner is personally funding the business from savings or personal debt
- Suppliers or staff have begun to leave due to reliability concerns

**Archetypes expected to appear**:
- Structural insolvency (losses cannot be reversed without fundamental restructuring)
- Cost structure too large for available revenue (shrink-to-survive path)
- Revenue base too small to support fixed costs (pivot or exit required)
- Owner denial blocking necessary decisions

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA correctly classifies whether the business is in turnaround vs optimisation mode
- Output does not recommend growth initiatives when the immediate action is stabilisation
- Output correctly identifies whether the business is viable at current scale
- Output requests a viability calculation (minimum sustainable revenue vs current fixed cost) before prescribing action

---

### SC-10: Expansion Failure

**Definition**: A business that expanded (second location, new product line, new geography, new channel) and the expansion is underperforming or destroying value from the core business.

**Key diagnostic questions**:
- Is the expansion failure isolated (bad expansion decision) or is it revealing a core business weakness?
- Is the expansion dragging cash from a viable core or is the core also deteriorating?
- What is the cost to exit the expansion vs the cost to continue?

**Presenting conditions**:
- Second location opened within 12–24 months; business is worse overall
- New product line is not selling; costs have been allocated to it
- Owner believes the expansion will "eventually pay off"
- Core business metrics have deteriorated since expansion

**Archetypes expected to appear**:
- Premature expansion (core business not proven before expanding)
- Management bandwidth failure (owner cannot manage both)
- Unit economics failure at new location/channel
- Sunk cost retention (owner cannot decide to exit despite evidence)

**Minimum simulations**: 3 cases

**Pass criteria (case-level)**:
- RCA correctly evaluates expansion and core separately
- Output requests unit economics for expansion in isolation
- Output does not recommend investing more in the expansion without a standalone viability test
- Output presents exit from expansion as a legitimate option where data supports it

---

### SC-11: Acquisition Failure

**Definition**: A business that acquired another business and the acquisition has not delivered expected returns, or has introduced unforeseen operational or financial complexity.

**Key diagnostic questions**:
- Was the acquisition value correctly assessed or were key liabilities or risks missed?
- Is the integration failing, or was the acquired business never viable?
- Is the acquirer carrying debt from the acquisition that now threatens both businesses?

**Presenting conditions**:
- Acquired business is not meeting revenue projections
- Integration is consuming owner time at the expense of core business
- Debt taken to fund acquisition is now a cash constraint
- Key staff from the acquired business have left

**Archetypes expected to appear**:
- Due diligence gap (liabilities or risks not identified pre-acquisition)
- Integration failure (two operating systems in conflict)
- Acquisition debt distress (price paid was too high for value delivered)
- Customer retention failure post-acquisition (acquired customers leaving)

**Minimum simulations**: 2 cases

**Pass criteria (case-level)**:
- RCA distinguishes acquisition strategy failure from integration execution failure
- Output requests acquisition debt terms and current performance vs acquisition projections
- Output does not recommend further investment in integration without confirming viability
- Output correctly identifies whether the failure is recoverable or requires exit/write-down

---

### SC-12: Mixed-Cause Failures

**Definition**: A business facing multiple simultaneous genuine problems — not a single root cause with contributing factors, but two or more independent structural failures occurring at the same time. The diagnostic challenge is avoiding false unification.

**Key diagnostic questions**:
- Can the failures be sequenced (fix one to reveal the next) or must they be addressed in parallel?
- Is one failure masking another (e.g., revenue decline hiding a cost problem that would exist even at higher revenue)?
- What is the minimum intervention set — the fewest changes that address all structural failures?

**Presenting conditions**:
- Owner has sought multiple different diagnoses and received different answers from each
- Multiple metrics are simultaneously deteriorating (revenue, margin, cash, headcount)
- Attempted fixes in one area have not resolved the overall situation
- The business appears to be deteriorating on all fronts simultaneously

**Archetypes expected to appear**:
- Any two archetypes from SC-01 through SC-11 occurring simultaneously
- Mixed-cause cases must have verifiably independent root causes (not one cause with two symptoms)

**Minimum simulations**: 4 cases

**Pass criteria (case-level)**:
- RCA correctly identifies multiple root causes without collapsing them
- Output prioritises the correct intervention sequence
- Output does not over-diagnose (does not claim all observed problems are symptoms of one cause when they are not)
- Output does not under-diagnose (does not fix one problem while ignoring the second structural failure)

---

## Part 2 — Five Test Types

Test types are applied within each simulation category. Every simulation must be classified as one of the five types. The mix requirement across the full program is defined in Part 4.

### TT-1: Blind Outcome Test

**What it is**: A simulation case where the correct diagnosis is known and documented in the answer key before the system is run. OpsIQ is given only the owner-facing inputs and no knowledge of the expected output. The system's output is scored against the answer key.

**When to use**: The standard test type. All simulation categories must include at least one blind outcome test.

**Structure**: Identical to SMB holdout fixture structure (scenario, facts, symptoms, misleading_signals, missing_inputs, scoring_criteria). Answer key is sealed before run.

**Pass requirement**: Score ≥ 0.70 overall, RCA dimension ≥ 0.60, 0 bad recommendation violations.

---

### TT-2: Adversarial Test

**What it is**: A simulation case constructed to exploit known OpsIQ heuristics or to present information in a way that would cause a pattern-matching system to misclassify.

**When to use**: To verify OpsIQ is performing genuine diagnosis rather than symptom-pattern matching. Minimum 2 adversarial cases in the full program.

**Structure**: Standard scenario plus an adversarial layer:
- `adversarial_layer`: string describing the specific heuristic being tested
- `expected_misclassification`: string describing what a pattern-matching system would wrongly conclude
- `why_correct_diagnosis_differs`: string explaining why genuine reasoning reaches a different conclusion

**Examples of adversarial constructions**:
- A business with all the surface signals of a cash crisis that is actually structurally profitable but has a timing problem
- A business with all the surface signals of a staffing problem that is actually a management problem
- A business with growing revenue that is accelerating toward insolvency (not a success story)
- A business with a single large misleading signal that dominates the symptom picture

**Pass requirement**: OpsIQ must reach the correct diagnosis despite the adversarial layer. Reaching the expected misclassification is a failure.

---

### TT-3: Missing-Data Test

**What it is**: A simulation case where key inputs that would normally be available are deliberately absent, and OpsIQ must either (a) correctly identify what is missing and request it, or (b) correctly abstain from confident diagnosis.

**When to use**: To verify that OpsIQ requests missing inputs rather than confabulating a diagnosis from incomplete data. Minimum 3 missing-data cases in the full program.

**Structure**: Standard scenario with a `deliberate_data_gaps` array listing inputs that are withheld and why:
```json
"deliberate_data_gaps": [
  {
    "withheld": "gross margin by product line",
    "why_withheld": "owner does not know it",
    "expected_opsiq_response": "must request this before diagnosing margin source"
  }
]
```

**Pass requirement**: OpsIQ's missing input requests must cover all `deliberate_data_gaps` items. If OpsIQ produces a confident diagnosis without the missing data, this is a failure regardless of whether the diagnosis is correct.

---

### TT-4: Conflicting-Data Test

**What it is**: A simulation case where two or more data points in the scenario directly contradict each other — as often occurs in real owner-reported data — and OpsIQ must identify the conflict rather than accepting one data point and ignoring the other.

**When to use**: To verify that OpsIQ does not silently resolve contradictions. Minimum 2 conflicting-data cases in the full program.

**Structure**: Standard scenario with a `data_conflicts` array:
```json
"data_conflicts": [
  {
    "data_point_a": "owner reports gross margin of 45%",
    "data_point_b": "owner reports revenue of $800K and total direct costs of $550K (implied margin: 31%)",
    "correct_response": "flag the discrepancy and request reconciliation before diagnosing"
  }
]
```

**Pass requirement**: OpsIQ must flag the conflict in its output or request reconciliation. Silently accepting either data point and proceeding is a failure.

---

### TT-5: Misleading-Signal Test

**What it is**: A simulation case constructed with one or more strong misleading signals — facts that are true but that point strongly toward a wrong diagnosis. The misleading signals must be more immediately visible than the real root cause.

**When to use**: To verify OpsIQ's resistance to anchoring on surface-level diagnostic cues. Minimum 4 misleading-signal cases in the full program (already overlaps with holdout fixture requirement, so holdout cases can count here if they meet TT-5 structure requirements).

**Structure**: Standard scenario plus a `signal_trap_analysis` section:
```json
"signal_trap_analysis": {
  "primary_trap": "Owner recently upgraded equipment — most analysts assume this is the cash drain",
  "why_trap_is_wrong": "Equipment purchase was $18K; cash gap is $140K recurring monthly — equipment cannot explain it",
  "correct_escape": "Diagnose the cash timing mechanism before attributing it to the capital purchase"
}
```

**Pass requirement**: OpsIQ must reach the correct diagnosis without attributing causality to the primary trap. If OpsIQ names the misleading signal as a primary or secondary root cause, this is a scored failure.

---

## Part 3 — Six Structural Components

Every simulation must include all six structural components. Components 1–3 are pre-run. Components 4–6 are post-run.

### SC-STRUCT-1: Simulation Intake Format

Every simulation must be constructed as a valid JSON object meeting the following structure:

```typescript
interface SimulationCase {
  case_id: string;              // Pattern: /^SIM-\d{2}-\d{3}$/ (category-sequence)
  category: string;             // SC-01 through SC-12
  test_type: string;            // TT-1 through TT-5
  title: string;                // Non-blank, describes the tension not the diagnosis
  segment: string;              // Business type, model, size, headcount
  source_basis: string[];       // Min 1 — basis for construction
  scenario: SimulationScenario; // Same schema as holdout fixture scenario
  expected_outputs: ExpectedOutputs;
  simulation_meta: SimulationMeta;
  // TT-specific optional fields:
  adversarial_layer?: string;
  expected_misclassification?: string;
  why_correct_diagnosis_differs?: string;
  deliberate_data_gaps?: DataGap[];
  data_conflicts?: DataConflict[];
  signal_trap_analysis?: SignalTrapAnalysis;
}

interface SimulationMeta {
  author_id: string;
  construction_date: string;    // ISO 8601
  industry: string;
  intervention_mode: string;    // "diagnostic" | "turnaround" | "optimisation" | "monitoring"
  business_condition: string;   // OpsIQ BusinessCondition label
  consulting_lifecycle_stage: string;
  author_read_benchmark_fixtures: boolean;  // Must be false
  author_read_composer_source: boolean;     // Must be false
}
```

File format: JSONL. One simulation object per line. File naming: `simulation_cases_SC-{nn}.jsonl` per category.

---

### SC-STRUCT-2: Expected Outputs

For every simulation, before the run, the following must be declared:

```typescript
interface ExpectedOutputs {
  primary_root_cause: string;            // Snake_case label
  secondary_causes: string[];            // Min 2, max 4
  expected_first_action: string;         // Specific, diagnostic, ≤10 days
  bad_recommendations_to_flag: string[]; // Min 4, max 6
  scoring_criteria: {
    must_identify: string[];             // 4–8 standard vocabulary terms
    must_not_claim: string[];            // 2–4 false diagnosis phrases
    ideal_depth: string[];               // 2–4 thoroughness indicators
  };
  // For TT-3 only:
  required_missing_input_requests?: string[];
  // For TT-4 only:
  required_conflict_flags?: string[];
  // For TT-2 and TT-5 only:
  disqualified_diagnoses?: string[];     // If OpsIQ outputs these, it has failed the trap
}
```

**Lock requirement**: `expected_outputs` is declared and sealed before the first run. It cannot be modified after the run is observed.

---

### SC-STRUCT-3: Scoring Framework

The simulation scoring framework extends the SMB benchmark scoring system with modifications for TT-2 through TT-5.

#### Standard scoring (TT-1, TT-5)

Uses identical scoring dimensions to the SMB benchmark:
- ROOT_CAUSE_ALIGNMENT (40%): `must_identify` phrase matching against output
- MISSING_INPUT_REQUESTS (20%): `required_missing_input_requests` matching
- FIRST_ACTION_QUALITY (20%): `expected_first_action` semantic matching
- BAD_RECOMMENDATION_AVOIDANCE (20%): `bad_recommendations_to_flag` absent from output

Pass: totalScore ≥ 0.70 AND rca.passed AND bra.passed

#### Modified scoring (TT-2: Adversarial)

Additional dimension:
- ADVERSARIAL_RESISTANCE (replaces 10% of RCA weight): output does not contain `expected_misclassification` phrase or archetype

Pass: standard + adversarial_resistance = true

#### Modified scoring (TT-3: Missing-Data)

Additional dimension:
- MISSING_INPUT_COVERAGE (replaces 20% of MISSING_INPUT_REQUESTS): all `required_missing_input_requests` phrases are present in output

Failure trigger: OpsIQ produces confident diagnosis without covering all `required_missing_input_requests`

#### Modified scoring (TT-4: Conflicting-Data)

Additional dimension:
- CONFLICT_DETECTION (replaces 20% of FIRST_ACTION_QUALITY): output must flag or request reconciliation of each `data_conflicts` item

Failure trigger: OpsIQ accepts contradictory data without flagging

#### Modified scoring (TT-5: Misleading-Signal)

Additional dimension:
- TRAP_RESISTANCE (adds to BRA dimension): output must not attribute causality to `signal_trap_analysis.primary_trap`

Failure trigger: output names the trap signal as primary or secondary root cause

---

### SC-STRUCT-4: Outcome Validation Process

After every simulation run:

**Step 1 — Raw result capture**: Record immediately before analysis:
- case_id, totalScore, passed (bool), dimensionResults, unsupportedArchetype (bool)

**Step 2 — Per-case classification**: Assign exactly one classification per failing case (see Part 4 — Failure Classification).

**Step 3 — TT-specific checks**: Apply TT-2 through TT-5 additional checks manually if not automated.

**Step 4 — Human review sample**: 20% of cases reviewed by a domain expert who has not seen OpsIQ source code. Reviewer confirms:
- The declared diagnosis is correct
- The must_identify terms are standard vocabulary
- The score result agrees with the human reading

**Step 5 — Outcome record**: Produce a simulation run report (format defined in Part 5).

---

### SC-STRUCT-5: Reassessment Process

Reassessment is the process by which a simulation that fails on first run may be re-evaluated after a fix. Strict rules:

**What triggers reassessment**:
- A fix has been applied to OpsIQ (engine, composer, or sub-mechanism)
- The fix is generic (not constructed from reading the simulation answer key)
- The fix classification is ENGINE_GAP or INPUT_MODEL_GAP (not SCORING_LIMITATION or HONEST_CEILING)

**What a reassessment is NOT**:
- Changing the scoring thresholds to pass a simulation
- Changing the `must_identify` terms because OpsIQ doesn't use them
- Reclassifying a failure to justify a fix

**Reassessment protocol**:
1. Document the exact fix applied (which file, which function, what was changed)
2. Document the derivation basis for the fix (why it is generic, not case-specific)
3. Re-run the full simulation set (not just the failing case) to check for regressions
4. Record first-run result and reassessment result separately — both are published

**Classification lock**: A case's classification cannot change after the first fix is proposed. If a case is classified as HONEST_CEILING on first run, it remains HONEST_CEILING regardless of what a fix does to the score.

---

### SC-STRUCT-6: Learning-Loop Validation Process

The learning loop is the process by which simulation failures that are valid ENGINE_GAP or INPUT_MODEL_GAP classifications are fed back into OpsIQ development — without contaminating the simulation asset.

**What flows from simulation to development**:
- ENGINE_GAP classifications → new archetype modelling brief (describes the gap generically)
- INPUT_MODEL_GAP classifications → new sub-mechanism brief (describes the vocabulary gap generically)

**What must NOT flow from simulation to development**:
- must_identify phrase lists from simulation answer keys
- Simulation scenario text
- Simulation case_ids linked to specific composer changes

**Learning-loop record required for each cycle**:
```
SIMULATION_LEARNING_LOOP_ENTRY:
  source_classification: ENGINE_GAP | INPUT_MODEL_GAP
  simulation_case_ids: [list of classified cases]
  gap_description: [generic description of what OpsIQ cannot currently model]
  fix_type: [archetype_addition | sub_mechanism_addition]
  fix_derivation_basis: [what domain sources justify the fix]
  fix_is_generic: true | false
  contamination_check: [confirm fix was not derived by reading answer keys]
```

**Contamination gate**: Before any simulation-driven fix is applied, a leakage audit identical to `HOLDOUT_LEAKAGE_AUDIT.md` Check 2 must be run against the proposed change. The fix must not introduce any `must_identify` phrase from any simulation fixture as a double-quoted string literal.

---

## Part 4 — Minimum Counts, Pass Criteria, and Failure Classification

### Minimum Simulation Counts

| Category | Min Cases | Min TT-1 | Min TT-2 | Min TT-3 | Min TT-4 | Min TT-5 |
|---|---|---|---|---|---|---|
| SC-01 Cash Crisis | 4 | 2 | 0 | 1 | 1 | 1 |
| SC-02 Growth Without Profit | 4 | 2 | 1 | 1 | 0 | 1 |
| SC-03 Declining Margins | 3 | 2 | 0 | 1 | 0 | 1 |
| SC-04 Customer Churn | 3 | 2 | 0 | 1 | 0 | 1 |
| SC-05 Marketing Failure | 3 | 2 | 1 | 0 | 0 | 1 |
| SC-06 Operational Bottlenecks | 3 | 2 | 0 | 1 | 0 | 1 |
| SC-07 Staffing Problems | 3 | 2 | 0 | 1 | 0 | 1 |
| SC-08 Debt Distress | 3 | 2 | 0 | 1 | 1 | 0 |
| SC-09 Turnaround Situations | 3 | 2 | 1 | 0 | 0 | 1 |
| SC-10 Expansion Failure | 3 | 2 | 0 | 1 | 0 | 1 |
| SC-11 Acquisition Failure | 2 | 1 | 0 | 1 | 0 | 0 |
| SC-12 Mixed-Cause Failures | 4 | 2 | 1 | 1 | 0 | 1 |
| **Total minimum** | **38** | **23** | **4** | **10** | **2** | **9** |

**Target case count**: 60 (for statistical confidence across all 12 categories).

**Minimum to run any category**: 2 accepted cases. A category with fewer than 2 accepted cases cannot generate category-level pass rate claims.

---

### Program-Level Pass Criteria

#### First-run targets (declared before any run):

| Metric | First-Run Target | Minimum for Public Claim |
|---|---|---|
| Supported case pass rate (TT-1) | ≥ 55% | ≥ 65% on ≥ 38 accepted cases |
| Average totalScore (supported TT-1) | ≥ 0.62 | ≥ 0.68 |
| Adversarial resistance rate (TT-2) | ≥ 60% | ≥ 75% on ≥ 4 cases |
| Missing-input coverage rate (TT-3) | ≥ 70% | ≥ 80% on ≥ 10 cases |
| Conflict detection rate (TT-4) | ≥ 60% | ≥ 75% on ≥ 2 cases |
| Trap resistance rate (TT-5) | ≥ 65% | ≥ 80% on ≥ 9 cases |
| Bad recommendation violations | 0 | 0 |
| Unsupported case abstention quality | 100% | 100% |
| Author independence confirmed | 100% of cases | 100% of cases |
| Leakage audit passed | Required | Required |

**Note**: TT-2 through TT-5 targets are lower than TT-1 targets because these test types are explicitly adversarial — a 60% first-run adversarial resistance rate is a meaningful result, not a low bar.

#### Category-level pass criteria:

A category is considered validated when:
- ≥ 50% of accepted TT-1 cases pass on a run
- Average TT-1 score ≥ 0.62
- 0 bad recommendation violations in the category
- At least one TT-2, TT-3, TT-4, or TT-5 case included

A category that fails its pass criteria must be classified with a category-level failure reason before any fixes are designed.

---

### Failure Classification System

Every failing case (including TT-2 through TT-5 test-type failures) receives exactly one primary classification:

**SIM_ENGINE_GAP**
OpsIQ produces an incorrect archetype or does not model the scenario type at all. The failure is structural — adding vocabulary to the composer will not fix it; new archetype or detection logic is required.

*Indicators*: Diagnosis type mismatch, RCA score near zero, output discusses a different problem category than the scenario.

*Fix permitted*: Yes — generic engine work (new archetype detection, not case-specific tuning).

---

**SIM_INPUT_MODEL_GAP**
OpsIQ produces the correct archetype but the vocabulary in the output does not match the must_identify terms. The composer sub-mechanism vocabulary does not cover this domain variant.

*Indicators*: Correct archetype classification, rca.passed = false, missingTerms contains standard domain vocabulary.

*Fix permitted*: Yes — generic sub-mechanism addition.

---

**SIM_SCORING_LIMITATION**
A human reviewer confirms the output is qualitatively correct, but the scorer fails because must_identify terms are too specific or require phrase matching that the output approximates but does not contain exactly.

*Indicators*: Human review: PASS. Scorer: FAIL. RCA score slightly below 0.60 threshold.

*Fix permitted*: No code fix — document as fixture calibration issue. Only fixture revision (with human sign-off) is permitted.

---

**SIM_HONEST_CEILING**
The required diagnostic conclusion cannot be reached from the evidence as presented without copying the fixture answer key. Even a human analyst given only the presented facts would not reliably use the exact phrases.

*Indicators*: missingTerms contains highly specific outcome phrases, not standard mechanism vocabulary.

*Fix permitted*: No fix. Document and do not count toward pass rate.

---

**SIM_FIXTURE_ERROR**
The simulation fixture itself is the problem — wrong diagnosis, inconsistent scenario, or must_identify terms that domain experts would not use.

*Indicators*: Domain expert review concludes expected diagnosis is incorrect or must_identify terms are non-standard.

*Fix permitted*: Fixture correction with domain expert sign-off. Corrected fixture is re-run from scratch; original score is voided.

---

**SIM_TRAP_TAKEN (TT-2, TT-5 only)**
OpsIQ was defeated by the adversarial construction or misleading signal. The system produced the expected misclassification or attributed causality to the signal trap.

*Indicators*: TT-2: output matches `expected_misclassification`. TT-5: output attributes primary or secondary causality to `signal_trap_analysis.primary_trap`.

*Fix permitted*: ENGINE_GAP or INPUT_MODEL_GAP sub-classification required before fix design.

---

**SIM_CONFABULATION (TT-3 only)**
OpsIQ produced a confident diagnosis without flagging or requesting the deliberately withheld inputs.

*Indicators*: TT-3: output does not cover `deliberate_data_gaps` items; output is confident rather than conditional.

*Fix permitted*: Requires investigation of missing-input request logic. Cannot be fixed by vocabulary addition.

---

**SIM_CONFLICT_IGNORED (TT-4 only)**
OpsIQ accepted contradictory data without flagging the contradiction.

*Indicators*: TT-4: output does not flag any item in `data_conflicts`; output proceeds from one data point as if the contradiction does not exist.

*Fix permitted*: Requires conflict-detection logic addition. Not a vocabulary fix.

---

## Part 5 — Evidence Requirements and Run Reporting

### Evidence Required Before Any Run

1. Sealed simulation case files (`simulation_cases_SC-{nn}.jsonl`) with SHA-256 hashes recorded
2. Author independence declarations for all cases
3. Leakage audit completed (all 5 automated checks, all 3 manual checks)
4. Declared pass targets signed off before run
5. No OpsIQ changes after simulation case files were finalized

### Evidence Required for Any Public Claim

A public claim ("OpsIQ correctly diagnoses [category] situations") requires:
1. Second or later run with post-first-run results documented
2. First-run results also published (not suppressed)
3. All classification decisions documented with rationale
4. Domain expert review of 20% sample confirmed
5. Author independence declarations confirmed for 100% of cited cases
6. Leakage audit passed for all cited cases
7. Category-level pass criteria met on the cited run

### Run Report Format

Every simulation run produces a `SIMULATION_RUN_REPORT_{date}_{category}.md` containing:

1. Run date and sealed file SHA-256 hash
2. OpsIQ commit hash at time of run
3. Total cases submitted and accepted
4. Per-case results: case_id, test_type, totalScore, passed, classification, primary failure dimension
5. Category-level pass rate (supported TT-1 cases)
6. Test-type results by TT (TT-2 resistance rate, TT-3 coverage rate, TT-4 detection rate, TT-5 resistance rate)
7. Bad recommendation violations (must be 0 or each documented)
8. Unsupported case abstention quality
9. Whether first-run target was met (YES/NO per category)
10. Classification breakdown per category
11. Whether any fix is warranted and what type

---

## Part 6 — Program Governance

### Author Independence

The same rules from `HOLDOUT_CASE_AUTHOR_GUIDE.md` apply to all simulation case authors:
- Cannot have read SMB-001 through SMB-012 fixtures
- Cannot have read `smbOutputComposer.ts`
- Cannot have implemented any OpsIQ sub-mechanism, archetype, or scoring component
- Must declare independence in writing before cases are accepted

### Sequential vs Parallel Execution

Simulation categories may be run in any sequence. The program does not require all 38 minimum cases to exist before any category is run. A category with ≥ 2 accepted cases may be run independently.

However:
- No OpsIQ changes are permitted between a category's first run and the recording of its classification results
- If a fix is applied after a category run, all previously run categories must be re-run before their results are cited in claims that post-date the fix

### Learning-Loop Gate

Fixes derived from simulation results follow the same leakage rules as Phase 2A–4B OpsIQ development:
- Any new vocabulary added to `smbOutputComposer.ts` must be described in its generic form, not in terms of what it does for a specific simulation case
- The learning-loop entry must be completed and reviewed before any code change is committed
- After any fix, the regression lock (`smbRegressionLock.test.ts`) must re-pass with no threshold changes

### Program Completion Definition

The Real-World Simulation Program is complete when:
- All 12 categories have been run at least once
- All 12 categories have met their category-level pass criteria on at least one run
- All cases have been classified
- All ENGINE_GAP and INPUT_MODEL_GAP classifications have been resolved or documented as deferred
- A program-level run report exists covering all categories

Until all 12 categories are complete, no program-level public claim may be made. Category-level claims may be made for validated categories.

---

## Appendix A — Simulation Category Quick Reference

| ID | Category | Min Cases | Primary Diagnostic Challenge |
|---|---|---|---|
| SC-01 | Cash Crisis | 4 | Mechanism identification (not just "no cash") |
| SC-02 | Growth Without Profit | 4 | Separating revenue from margin |
| SC-03 | Declining Margins | 3 | Gross vs operating level diagnosis |
| SC-04 | Customer Churn | 3 | Acquisition vs retention failure |
| SC-05 | Marketing Failure | 3 | Marketing vs conversion vs offer |
| SC-06 | Operational Bottlenecks | 3 | Bottleneck location (not just "capacity") |
| SC-07 | Staffing Problems | 3 | Structural vs individual; owner-as-cause |
| SC-08 | Debt Distress | 3 | Debt as cause vs symptom |
| SC-09 | Turnaround Situations | 3 | Turnaround vs optimisation mode |
| SC-10 | Expansion Failure | 3 | Isolated expansion vs core failure |
| SC-11 | Acquisition Failure | 2 | Strategy vs integration failure |
| SC-12 | Mixed-Cause Failures | 4 | Multi-root-cause without false unification |
| **Total** | | **38** | |

## Appendix B — Test Type Mix Requirements

| Test Type | Min Total | Min per Category |
|---|---|---|
| TT-1 Blind Outcome | 23 | 1 |
| TT-2 Adversarial | 4 | 0 (but ≥ 4 across program) |
| TT-3 Missing-Data | 10 | 0 (but ≥ 1 in 8 of 12 categories) |
| TT-4 Conflicting-Data | 2 | 0 (but ≥ 2 across program) |
| TT-5 Misleading-Signal | 9 | 0 (but ≥ 1 in 9 of 12 categories) |

## Appendix C — Failure Classification Decision Tree

```
Did OpsIQ return scope gap or abstention?
  YES → UNSUPPORTED_ARCHETYPE (not a simulation failure; counts toward abstention quality)
  NO  → Did the case PASS?
          YES → PASS
          NO  → Is this TT-2?
                  YES → Did OpsIQ output the expected_misclassification?
                          YES → SIM_TRAP_TAKEN (sub-classify as ENGINE_GAP or INPUT_MODEL_GAP)
                          NO  → Standard failure classification below
                Is this TT-3?
                  YES → Did OpsIQ miss required_missing_input_requests?
                          YES → SIM_CONFABULATION
                          NO  → Standard failure classification below
                Is this TT-4?
                  YES → Did OpsIQ ignore any data_conflicts item?
                          YES → SIM_CONFLICT_IGNORED
                          NO  → Standard failure classification below
                Is this TT-5?
                  YES → Did OpsIQ attribute causality to the signal trap?
                          YES → SIM_TRAP_TAKEN (sub-classify as ENGINE_GAP or INPUT_MODEL_GAP)
                          NO  → Standard failure classification below
                Standard failure classification:
                  Does domain expert review confirm the diagnosis is wrong? → SIM_FIXTURE_ERROR
                  Is output substantively correct per human review? → SIM_SCORING_LIMITATION
                  Are must_identify terms highly specific/non-derivable? → SIM_HONEST_CEILING
                  Is archetype wrong? → SIM_ENGINE_GAP
                  Is archetype correct, vocabulary missing? → SIM_INPUT_MODEL_GAP
```
