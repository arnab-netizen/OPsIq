# Holdout Case Author Guide

## Purpose

This guide is for the person constructing holdout SMB cases for the OpsIQ Owner Mode benchmark.

**You must not have read any of the following before constructing cases:**

- `tests/owner-mode/real-world-smb-cases/opsiq_real_world_smb_case_fixtures.jsonl` (the 12 existing fixtures)
- `tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts` (the output composer source)
- `tests/owner-mode/real-world-smb-cases/evidence-hints/*.json` (the existing evidence sidecars)
- Any `SMB_PHASE_*` implementation report in the same directory

If you have read any of those files, you are not eligible to author holdout cases. Find a different author.

---

## What You Are Building

Each holdout case is a realistic SMB consulting scenario. It represents a small or medium business with a genuine operational problem. The case includes:

1. A business description and its known financial facts
2. The symptoms the owner presents with
3. Red herrings and misleading signals that point away from the real root cause
4. The inputs that are missing and would sharpen the diagnosis
5. The correct diagnosis and what should be done first
6. The diagnostic terms a competent consultant would use
7. The bad advice that a bad consultant might give

The OpsIQ system will be run against your case without any preparation, and its output will be scored against your answer key. You are not told how OpsIQ works internally.

---

## Acceptable SMB Categories

Cases may come from any of the following business categories. Mix of industries is required — minimum 5 distinct industries across the holdout set:

**Services**
- Professional services (accountants, lawyers, consultants, engineers)
- Trade contractors (plumbers, electricians, HVAC, builders)
- Health and wellness (physio, chiropractic, personal training, beauty)
- Hospitality (cafes, restaurants, catering, event spaces)
- IT services, SaaS micro-businesses, managed services providers
- Cleaning and maintenance services

**Retail and product**
- Specialty retail (single or multi-location)
- E-commerce or D2C with inventory holding
- Wholesale distribution
- Food production or artisan manufacturing

**Mixed / recurring revenue**
- Subscription-adjacent (gyms, tutoring centres, childcare)
- Franchise units
- Property services

**Minimum coverage requirement across 12–25 cases:**
- At least 3 service businesses
- At least 3 product/retail businesses
- At least 2 businesses with recurring or subscription-adjacent revenue
- At least 2 businesses with employees (not just owner-operator)
- At least 2 businesses in financial distress (not just underperformance)

---

## Business Size Constraints

- Annual revenue: $200K – $8M
- Employees: 0–50 (including owner)
- Operating at least 12 months (not pre-revenue startups)
- Owner is financially involved but not necessarily financially literate

---

## Required Presenting Symptoms

Each case must have **at minimum 3 symptoms** that the owner would actually describe when seeking help. These are the presenting complaints, not the diagnosis:

Examples of acceptable symptom descriptions:
- "We're busy but always running out of cash"
- "I'm working longer hours than ever but earning less"
- "We have inventory everywhere but keep running out of the things people want"
- "Our revenue is up but the bank balance is always low"
- "I can't afford to take on more work even though customers are waiting"
- "Our margins have dropped but I can't figure out why"

Symptoms must be written in the language an owner would use, not in accounting or consulting jargon. Do not use the words "accounts receivable", "contribution margin", "working capital", or similar technical terms in the symptoms field.

---

## Required Misleading Signals

Each case must contain **at minimum 2 misleading signals** — facts that seem to explain the problem but don't:

Examples of acceptable misleading signals:
- Revenue is growing (when the real problem is cost structure)
- The business has loyal long-term customers (when the real problem is unit economics)
- A competitor closed recently (when the real problem is not market share)
- The owner believes the problem is a particular employee (when the problem is a process)
- Gross margin looks acceptable (when the real problem is operating costs or cash timing)
- The owner recently made an equipment purchase (which is not the cause of the problem)

Misleading signals must be plausible — a reasonable person seeing them first might pursue the wrong diagnosis.

---

## Required Missing Inputs

Each case must specify **3–6 inputs that OpsIQ should request** because they are not in the presented data but would materially sharpen the diagnosis.

Rules for missing inputs:
- Each input must be something a real consultant would actually ask for
- Each input must be specific (not "more information about the business")
- The inputs must be derivable from the case as written — they are plausible questions, not random ones
- At least one missing input per case must be a document or report (e.g., aged receivables report, wage cost breakdown, supplier terms, inventory turnover by SKU)
- At least one missing input per case must be a specific numeric metric

Examples of good missing inputs:
- "Full accounts receivable aging report broken down by client and days outstanding"
- "Gross margin percentage broken down by product category or service line"
- "Owner hours worked per week split between billable client work and internal administration"
- "Contractual payment terms in client agreements and whether they are enforced"
- "Inventory turnover rate by SKU or product family for the last 12 months"

---

## Required Diagnosis Expectations

Each case requires a complete answer key:

### primary_root_cause

A short snake_case label naming the core problem:

Examples: `accounts_receivable_cash_flow_gap`, `fixed_cost_overextension`, `inventory_demand_mismatch`, `pricing_below_cost`, `owner_capacity_ceiling`, `contract_terms_misalignment`

This is your assessment of the core diagnosis. It must be specific.

### secondary_causes

2–4 contributing factors that make the primary root cause worse or harder to diagnose. These are real problems but not the primary driver.

### expected_first_action

The single most important immediate action the business should take. This must be:
- Specific (not "review your finances")
- Diagnostic (the action should gather information or isolate the problem, not immediately fix it)
- Safe (does not require significant capital, commitment, or irreversible change)
- Feasible in the next 5–10 business days for a typical owner

Good first actions are typically: "produce X report broken down by Y", "calculate Z metric by segment", "obtain W document from supplier/client/accountant".

### bad_recommendations_to_flag

4–6 recommendations that a bad consultant might give but that would make this case worse. These must be specific and plausible — things that actually get recommended badly.

Examples:
- "Hire a salesperson to grow revenue" (when the problem is cash timing, not revenue)
- "Discount pricing to attract more volume" (when the problem is margin compression)
- "Take on a line of credit to fund operations" (when the problem is cost structure)
- "Open a second location" (when the first location is losing money)
- "Invest in marketing" (when the problem is collection, not lead generation)

Bad recommendations must be genuine risks — things that a reasonable but wrong advisor might recommend, not obviously absurd suggestions.

---

## Scoring Criteria You Must Define

### must_identify

**4–8 specific terms or phrases** that a competent consultant's diagnosis would contain.

Rules:
- These are the phrases you would expect to read in a good consultant's written diagnosis
- They must be derivable from the case evidence without reading any OpsIQ source code
- They must be standard consulting or accounting vocabulary — not invented jargon
- They must be specific to the root cause, not generic business terms
- **Do not include terms from SMB-001 through SMB-012 answer keys** (you have not read them, so this is naturally satisfied)
- Aim for a mix: 2–3 mechanism-level terms ("cash conversion cycle", "breakeven volume"), 1–2 metric terms ("days sales outstanding", "inventory turnover"), 1–2 consequence terms ("cash flow gap", "capacity ceiling")
- Do not include terms that appear in the misleading signals — the score tests diagnosis, not symptom recitation

### must_not_claim

**2–4 things the diagnosis must not assert**, typically related to the misleading signals:

Examples:
- "The business needs to increase marketing spend" (when the problem is collections, not lead volume)
- "The owner should hire immediately" (when they cannot afford headcount)
- "Revenue growth is the primary lever" (when the problem is cost or cash timing)

### ideal_depth

**2–4 observations** that a particularly thorough diagnosis would include — things beyond the minimum but that indicate deep analysis. These are not required to pass, but indicate output quality above the floor.

---

## Anti-Leakage Rules

These rules are mandatory. A case that violates any of them will be rejected before scoring:

1. **No must_identify term may appear verbatim in the scenario fields** (`symptoms`, `misleading_signals`, `business` description, or `facts_known_to_owner`). Symptoms describe what the owner sees. Diagnoses describe what a consultant concludes. They use different vocabulary.

2. **No expected_first_action phrase may appear verbatim in the scenario.** The first action is what should be done, not what has been done.

3. **No bad_recommendation phrase may appear verbatim in the scenario.** The bad recommendations are advisory risks, not presented facts.

4. **The business description must not use diagnostic vocabulary.** The owner does not say "my business has a cash conversion cycle problem". They say "we're always waiting on payments while our bills pile up."

5. **must_identify terms must be standard industry vocabulary.** They must be phrases that any competent consultant in the relevant field would use independently, derivable from the facts of the case without knowledge of how OpsIQ works internally.

6. **Do not construct cases around known OpsIQ archetypes.** You do not know what archetypes OpsIQ uses. Construct cases around real business problems. If OpsIQ cannot handle the archetype, that is a valid finding.

7. **Primary_root_cause snake_case labels must be your own.** Do not use labels from existing fixtures.

8. **Cases must be plausible, not engineered to pass.** A case that appears to be constructed so that a specific system will pass it is an invalid holdout case.

---

## What Makes a Good Holdout Case

A good holdout case:

- Describes a business you have either seen, heard about, or can credibly construct from domain knowledge
- Has a diagnosis that a senior consultant would agree with
- Has misleading signals that would fool a junior analyst
- Has missing inputs that a good consultant would actually request
- Has bad recommendations that a bad consultant might actually give
- Uses diagnostic vocabulary in `must_identify` that any consultant familiar with the domain would recognize independently
- Is genuinely uncertain — the correct answer requires reasoning, not just keyword matching

A bad holdout case:

- Has the answer embedded in the presenting symptoms (leakage)
- Uses the same vocabulary in `must_identify` as appears in the business description
- Has misleading signals that are obviously irrelevant
- Has bad recommendations that no real consultant would give
- Is constructed to match a system's known output patterns

---

## Deliverable Format

Each case must be a valid JSON object matching the schema in `HOLDOUT_FIXTURE_SCHEMA.md`. Case IDs must follow the pattern `HO-\d{3}` (e.g., `HO-001`, `HO-002`).

Deliver cases as a JSONL file (one JSON object per line) named:
`holdout_cases.jsonl`

Do not submit cases one at a time. Submit the complete set together so the first run can be conducted on the sealed set.
