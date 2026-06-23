# Real-World Case Transformation Specification

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 3 — Case Transformation Design  

---

## 1. Overview

A raw historical source document (10-K filing, bankruptcy declaration, founder post-mortem, etc.) must be transformed into two distinct packets:

```
Historical Source Document
        │
        ├──→  INPUT_PACKET     (01_case_input.json)   — ENGINE-VISIBLE
        │                       Pre-decision only, de-identified, outcome-stripped
        │
        ├──→  GROUND_TRUTH_PACKET (outcome.json)     — HIDDEN from engine
        │                       Expert diagnosis, actual decision, outcome polarity
        │
        └──→  SOURCE_RECORD      (source.json)        — HIDDEN from engine
                                Citation, reliability, evidence provenance
```

---

## 2. INPUT_PACKET Specification (`01_case_input.json`)

### 2.1 Fields retained

| Field | Source | Transformation |
|---|---|---|
| `caseId` | Assigned by curator (format: `HV-NNN`) | Stable identifier; not a company name |
| `businessProblem` | Source narrative at T₀ | De-identified; outcome stripped; framed as a consultant would see it |
| `evidence[]` | Financial metrics, operational data, market observations from source | Pre-decision only; each item verified against T₀ date |
| `clientContext.industry` | Source document | Generic industry category (e.g., "retail", "SaaS", "restaurant"); not brand-specific |
| `clientContext.size` | Source document | `"small"` / `"medium"` / `"large"` |
| `clientContext.revenueImpactUrgency` | Curator assessment based on source | `"LOW"` / `"MEDIUM"` / `"HIGH"` / `"CRITICAL"` |
| `ownerConstraintProfile` | Source document (where stated) | Owner-stated constraints, cash runway, legal constraints |

### 2.2 Fields explicitly removed

| Field removed | Why |
|---|---|
| Company name / brand | Identity reveals the outcome (e.g., "Toys R Us" immediately implies FAILURE) |
| Company URL, ticker symbol | Same as name — identity reveals outcome |
| Outcome of the crisis | Must never appear in engine-visible input |
| Expert diagnosis / root cause | Must never appear in engine-visible input |
| What the company actually did in response | Must never appear in engine-visible input |
| Post-mortem language ("the real problem was", "in retrospect") | Hindsight contamination |
| Forward-reference language ("the company later", "within 12 months") | Temporal leakage |
| Any citation URLs that reveal the company's identity | Identity leakage |
| Dates that are specific enough to identify the company | Approximate period only (e.g., "Q3 of a recent fiscal year") |

### 2.3 Evidence item structure

```json
{
  "dimension": "<finance|operations|market|leadership|product|legal>",
  "finding": "<pre-decision observable finding, de-identified, T₀ only>",
  "confidence": "HIGH|MEDIUM|LOW",
  "isCritical": true|false,
  "supportingData": {
    "<metric_name>": "<value>"
  }
}
```

**Evidence item rules:**
- Each item must be traceable to a specific passage in the source document
- Each item must be verifiable as known BEFORE the decision point T₀
- Specific numbers that would identify the company (unique revenue figures, unique headcount) must be expressed as ratios or percentage changes where possible
- Items that reference post-decision events are prohibited

### 2.4 Business problem framing rules

The `businessProblem` field must:
- Describe the situation as it would appear to a consultant engaged at T₀
- End at the decision point — not describe what happened next
- Use de-identified language ("a regional casual-dining chain", not the brand name)
- Avoid diagnosis — describe symptoms, not causes

**Permitted framing:**
> "A specialty retailer with 340 locations has experienced 18 consecutive months of comparable-store sales decline averaging -4.2% per quarter. Inventory turns have slowed from 6.2x to 4.1x over 24 months. Operating cash flow turned negative in the most recent quarter (-$12M). The CEO is requesting a turnaround assessment."

**Prohibited framing:**
> "A specialty retailer that later filed for Chapter 11 bankruptcy experienced sales declines. The real problem was their failure to adapt to e-commerce. Their inventory buildup was the core cause of their cash crisis."

---

## 3. GROUND_TRUTH_PACKET Specification (`outcome.json`)

### 3.1 Required fields

```json
{
  "grounding_class": "REAL_SOURCE_BACKED",
  "expert_diagnosis": "<normalized diagnosis archetype>",
  "expert_first_action": "<what experts/business actually decided to do first>",
  "actual_decision": "<the decision actually taken>",
  "outcome_polarity": "SUCCESS|FAILURE|MIXED",
  "harmful_actions": ["<action phrasing that was value-destroying>"],
  "beneficial_actions": ["<action phrasing aligned with what actually worked>"],
  "citation": "<resolvable URL or bibliographic citation>"
}
```

### 3.2 Field definitions

**`expert_diagnosis`**: The documented root cause, normalized to an OpsIQ engine archetype label where applicable. If the source documents a specific root cause (e.g., "excessive inventory build from premature expansion"), normalize it to the closest archetype the engine uses (e.g., `"OVER_EXPANSION"` or `"CASH_FLOW_CRISIS"`). Where no normalization is possible, use the source's own language.

**`expert_first_action`**: The FIRST action actually taken after the decision point. Not the long-term strategy — the first observable intervention. Must be sourced from the document.

**`harmful_actions`**: Action phrasings the record shows were value-destroying. Express in general action-class language (e.g., "Aggressively expand store count during cash shortage") — not in engine-specific terminology that could coach a system trained on this field.

**`beneficial_actions`**: Action phrasings aligned with what actually worked. Multiple entries allowed; ordered from most to least effective per source documentation.

**`outcome_polarity`**:
- `SUCCESS`: The business recovered or achieved the stated goal within a documented timeframe
- `FAILURE`: The business failed to recover, went bankrupt, or liquidated
- `MIXED`: Partial recovery; some goals achieved, others not; or ambiguous longer-term outcome

### 3.3 Diagnosis normalization table

When normalizing expert diagnosis to engine archetypes, use this mapping:

| Source language | OpsIQ archetype |
|---|---|
| Cash shortage, liquidity crisis, burn rate too high | `CASH_FLOW_CRISIS` |
| Revenue decline, demand collapse, customer loss | `REVENUE_DECLINE` |
| Expansion into new market without product-market fit | `PREMATURE_EXPANSION` |
| Leadership failure, management gap, CEO ineffectiveness | `LEADERSHIP_GAP` |
| Customer churn, retention failure, NRR collapse | `CHURN_CRISIS` |
| Margin compression, COGS increase, pricing power loss | `MARGIN_COMPRESSION` |
| Product-market fit failure, core product obsolescence | `PRODUCT_MARKET_FIT` |
| Inventory excess, working capital tied up in stock | `INVENTORY_CRISIS` |
| Key person departure, talent loss, capability gap | `KEY_PERSON_RISK` |
| Over-leveraged, debt service unsustainable | `DEBT_CRISIS` |
| Operational execution failure, scaling breakdown | `OPERATIONAL_BREAKDOWN` |

If the engine archetype list does not contain an appropriate match, use the verbatim diagnosis from the source.

---

## 4. SOURCE_RECORD Specification (`source.json`)

```json
{
  "citation": "<full bibliographic citation including title, author, date, URL>",
  "source_type": "sec_filing|bankruptcy_filing|founder_postmortem|earnings_transcript|government_report|academic_case|enforcement_action",
  "published_date": "<ISO 8601 date>",
  "accessed_date": "<ISO 8601 date>",
  "reliability_tier": "A|B|C",
  "company_context": "<de-identified description: industry + approximate size + period>",
  "evidence_extracted": [
    "<specific passage or figure pulled from source, with page/section reference>"
  ],
  "source_backed_metrics": {
    "<metric_name_in_evidence>": "<the specific figure from the source document>"
  },
  "source_limitations": "<gaps, staleness, scope caveats, sampling bias>",
  "inferred_vs_stated": {
    "<claim>": "DIRECTLY_STATED|INFERRED"
  },
  "supports_ground_truth": "YES|PARTIAL|NO",
  "contamination_risk": "LOW|MED|HIGH"
}
```

---

## 5. Transformation Process

### 5.1 Step-by-step transformation

```
Step 1: SOURCE IDENTIFICATION
  - Locate source document
  - Confirm accessibility and license
  - Assign reliability tier per ROUND_2_REAL_WORLD_SOURCE_STANDARD §4

Step 2: TIMELINE ESTABLISHMENT
  - Identify T₀ (the decision point — the moment a consultant would be called)
  - Identify T₁ (the first action taken after T₀)
  - Identify T₂ (the outcome — 6, 12, 24 months post-decision)

Step 3: EVIDENCE EXTRACTION (Author A)
  - Author A extracts all pre-T₀ observable evidence from the source
  - Author A does NOT extract outcome or diagnosis
  - Author A creates draft 01_case_input.json

Step 4: GROUND TRUTH EXTRACTION (Author B — blind to Author A's work)
  - Author B reads the same source independently
  - Author B documents what actually happened (T₁, T₂)
  - Author B documents expert diagnosis and outcome polarity
  - Author B creates outcome.json

Step 5: LEAKAGE REVIEW (Author C — sees both)
  - Author C reviews 01_case_input.json for any outcome signals
  - Author C checks each evidence item against T₀ date
  - Author C checks businessProblem for hindsight language
  - Author C verifies de-identification is sufficient
  - Author C approves or requires revision

Step 6: SOURCE RECORD AUTHORING (Author A or B)
  - Complete source.json with full citation and evidence provenance
  - Map each evidence item in 01_case_input.json to source_backed_metrics
  - Mark inferred vs. directly stated claims

Step 7: FINAL VALIDATION
  - Verify grounding_class: REAL_SOURCE_BACKED
  - Verify reliability_tier ≥ B (or B with corroborating source for C)
  - Verify supports_ground_truth ∈ {YES, PARTIAL}
  - Verify no leakage in 01_case_input.json
  - Place in simulation_runs/historical_validation/case_HV-NNN/
```

---

## 6. Leakage Prevention Controls

### 6.1 Temporal leakage

**Risk:** Evidence item describes a metric as of T₁ or T₂, not T₀.  
**Control:** Each evidence item must have a `temporalRef` in the source citation ("as of Q3 2022 earnings call") that Author C verifies is before T₀.

### 6.2 Identity leakage

**Risk:** The combination of industry + size + year + specific revenue figure identifies the company, allowing the engine (if it has training data on this company) to use training knowledge.  
**Control:** Avoid exact revenue figures for famous companies. Express as "a regional casual-dining chain with ~$180M in system revenue" rather than naming the chain. If the chain had unique revenue, express as YoY percentage change instead.

### 6.3 Diagnostic leakage

**Risk:** The businessProblem framing implies the root cause.  
**Control:** Describe symptoms only. "Revenue has declined 18% over 6 quarters" is permitted. "Revenue declined because management failed to adapt to delivery trends" is not.

### 6.4 Hindsight language leakage

**Risk:** Post-mortem language ("the real problem was", "in retrospect") leaks the diagnosis into the evidence.  
**Control:** Author C scans for the following prohibited strings: "real problem", "turned out to be", "in retrospect", "would later", "eventually", "ultimately led to", "what we didn't realize", "looking back".

### 6.5 Action leakage

**Risk:** Evidence item describes what the company did in response (T₁ action) as if it were a pre-decision fact.  
**Control:** Author A is explicitly prohibited from including any response or decision in 01_case_input.json. Any action-describing language is a disqualification of that evidence item.

---

## 7. Validation Checklist (per case)

```
□ caseId is unique and follows HV-NNN format
□ businessProblem ends at T₀, contains no outcome or diagnosis
□ businessProblem is de-identified (no company name, ticker, brand)
□ Each evidence item is pre-T₀ (verified against source date)
□ No evidence item describes a company action or response
□ No hindsight language in any field of 01_case_input.json
□ outcome.json has grounding_class: REAL_SOURCE_BACKED
□ outcome.json expert_diagnosis is documented in source, not inferred
□ outcome.json outcome_polarity is justified by source evidence
□ outcome.json harmful_actions use general language (not engine-specific terms)
□ source.json has complete citation (URL or full bibliographic entry)
□ source.json reliability_tier is A or B
□ source.json supports_ground_truth is YES or PARTIAL
□ All source_backed_metrics map to specific evidence_extracted passages
□ contamination_risk is assessed (LOW preferred; HIGH requires mitigation)
□ Author C leakage review complete and approved
□ Files placed in correct directory: simulation_runs/historical_validation/case_HV-NNN/
```

---

**Phase 3 complete.**
