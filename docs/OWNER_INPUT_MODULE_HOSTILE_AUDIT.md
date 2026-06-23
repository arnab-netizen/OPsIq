# Owner Input Module Hostile Audit

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase G  
**Status:** AUDIT — findings require resolution before input module is production-ready

---

## 1. Scope

This audit covers the complete owner data input pathway in OpsIQ: how business data enters the system, how it is validated, how confidence and completeness are scored, and how missing or low-quality inputs are handled and surfaced.

The audit applies a hostile lens: what fails, what is silently accepted and produces wrong diagnoses, and what misleads the owner about the quality of the analysis they are receiving.

---

## 2. Input Pathway Map

```
Owner provides data via:
├── /owner/intake — manual entry form
│     └── POST /api/owner/intake
├── CSV upload — structured data file
│     └── POST /api/owner/data/csv
├── Google Sheets link — external source
│     └── GET /api/integrations/sheets
└── Manual API / webhook — programmatic submission
      └── POST /api/owner/data/webhook

Data lands in:
└── Evidence store (OwnerEvidence or equivalent model)
      └── Feeds diagnosis engine via input assembler
            └── diagnosis-engine.ts
```

---

## 3. Input Quality Findings

### IQ-001: No input completeness score surfaced to owner

**Finding:** When an owner submits data, there is no completeness percentage, completeness tier, or "what you're missing" summary shown on the command center or intake confirmation screen.

**Impact:** An owner who submits partial data (e.g., revenue but no cost data) receives a diagnosis anyway. The diagnosis is based on incomplete evidence but the owner has no indication of this. They may act on a false diagnosis.

**Required fix:** After intake submission, display a completeness score (0–100%) with a breakdown: "Revenue data: provided. Cost data: missing. Margin: cannot be verified. Staff count: provided. AR days: missing." The score must appear on the command center as long as completeness < 80%.

---

### IQ-002: Evidence quality tier not assigned or displayed

**Finding:** Evidence items have no quality tier (Strong / Moderate / Weak / Assumed). All evidence is treated identically regardless of whether it was drawn from verified accounts or typed from memory.

**Impact:** Assumed or approximate data drives the same diagnostic weight as verified data. Low-confidence diagnoses are presented identically to high-confidence diagnoses.

**Required fix:** Assign a quality tier to each evidence item based on source type:
- **Strong:** CSV from accounting system, Google Sheets from bookkeeper, API connection to accounting software
- **Moderate:** Manual entry with specific figures and date references
- **Weak:** Manual entry with approximate figures ("about $X")
- **Assumed:** System-assumed default where no data was provided

Display the tier badge on each evidence item. Flag when a diagnosis is based primarily on Weak or Assumed evidence.

---

### IQ-003: No staleness detection on evidence items

**Finding:** Evidence submitted 90 days ago is treated identically to evidence submitted today. There is no staleness flag, no expiry policy, and no prompt to resubmit aged data.

**Impact:** A diagnosis generated from 6-month-old data is presented as current. Business conditions may have changed materially.

**Required fix:** Evidence items must carry a submission timestamp. After 90 days, evidence must display a staleness flag: "Data from [date] — consider updating." After 180 days, the evidence must be excluded from diagnosis unless explicitly re-confirmed by the owner.

---

### IQ-004: No detection of internally inconsistent data

**Finding:** The intake form and evidence store accept contradictory data without flagging it. Examples:
- Owner states revenue $1.2M and gross margin 35%, but submitted cost data implies gross margin of 18%
- Owner states average debtor days 28 but reports chasing invoices older than 60 days
- Owner states headcount 12 but payroll figures imply 6-7 FTE

**Impact:** Internal inconsistency may indicate misclassification, GST inclusion errors, or misunderstanding of financial concepts. If not caught, the engine diagnoses from corrupted inputs.

**Required fix:** The input assembler must run a consistency check before triggering diagnosis:
1. Revenue × (1 - stated gross margin %) must approximately match stated cost of goods
2. Stated AR days must be consistent with revenue and outstanding debtor figures
3. Stated headcount must be consistent with payroll costs at award/market rates

Inconsistencies above a 20% tolerance must block diagnosis and prompt the owner to reconcile.

---

### IQ-005: GST / tax-inclusive figures not detected

**Finding:** The intake form does not ask whether revenue and cost figures are GST-inclusive or GST-exclusive. An owner reporting GST-inclusive revenue of $1.1M may intend $1.0M ex-GST. If the cost figures are ex-GST and revenue is GST-inclusive, all margin calculations are wrong by approximately 9%.

**Impact:** Systematic margin error of ~9% produces wrong diagnosis for every owner who reports GST-inclusive revenue. This is very common in Australian SMBs.

**Required fix:** Intake form must include explicit GST basis selector: "Are your figures GST-inclusive or GST-exclusive?" All stored figures must be normalised to ex-GST at submission time and tagged accordingly.

---

### IQ-006: Numeric field input not guided or bounded

**Finding:** Numeric fields for financial data (revenue, costs, debtor balance) have no formatting guidance, no plausibility bounds, and no unit indicator. An owner may type "1200" meaning $1,200, $1.2M, or 1200 units.

**Impact:** Orders-of-magnitude errors in input produce completely wrong diagnoses.

**Required fix:**
1. Fields must show unit labels: "$ (annual)" or "$ per month"
2. Fields must have soft-limit warnings: if revenue entered is < $10K or > $100M, display a confirmation prompt
3. Fields should accept formats: "1200000", "1,200,000", "1.2M" and normalise to integer on submission

---

### IQ-007: No validation that business description matches financial profile

**Finding:** The business description (free text) and the financial data are not cross-checked for plausibility. A business described as "sole trader lawn mowing" submitting $8M revenue raises no flag. A business described as "medium-sized construction company" submitting $95K revenue raises no flag.

**Impact:** Owner may have submitted data for the wrong business or made a data entry error. The engine diagnoses from the wrong data without warning.

**Required fix:** For common industry categories, the input assembler should apply revenue plausibility checks by segment: "Sole trader services businesses typically have revenue of $50K–$500K. Your submitted figure of $8.2M is unusual. Please confirm."

---

## 4. Confidence Scoring Findings

### CS-001: No confidence score generated from input completeness

**Finding:** The engine outputs a diagnosis but no confidence score is computed from the quality and completeness of the input evidence.

**Impact:** A diagnosis based on 3 data points is presented with the same visual weight as a diagnosis based on 40 data points.

**Required fix:** Confidence score (0–100) must be computed from:
- Input completeness (0–40 points): percentage of required fields provided
- Evidence quality (0–30 points): weighted average of quality tiers
- Internal consistency (0–20 points): result of consistency checks
- Evidence recency (0–10 points): age of most recent data submission

Output confidence tier: HIGH (85–100), MEDIUM (60–84), LOW (30–59), BLOCKED (<30).

---

### CS-002: BLOCKED state not triggered when evidence is insufficient

**Finding:** When insufficient evidence exists to make a diagnosis, the engine does not enter a BLOCKED state. It proceeds to render a diagnosis with whatever evidence is available, including no evidence.

**Impact:** A diagnosis rendered on zero evidence is indistinguishable from a diagnosis rendered on strong evidence. The owner acts on a guess.

**Required fix:** If input completeness score < 30, the engine must not render a diagnosis. Instead it must render a BLOCKED state: "OpsIQ cannot diagnose your business yet. Missing: [list of critical missing inputs]."

---

### CS-003: Evidence coverage by domain not shown

**Finding:** The command center does not show which domains (Finance, Cash Flow, Sales, Operations) have evidence and which are evidence-free.

**Impact:** Owner does not know which areas of their business OpsIQ can actually analyze.

**Required fix:** On the command center, each domain panel must show its evidence coverage: "Finance: 4 evidence items (Strong). Operations: 0 evidence items (No data). Sales: 2 evidence items (Moderate)."

---

## 5. Missing Input Handling Findings

### MI-001: Missing inputs not categorised by diagnosis impact

**Finding:** When OpsIQ identifies missing inputs it should request, they are listed without priority. An owner sees a list of 8 missing inputs and does not know which to prioritise.

**Impact:** Owner provides low-priority inputs first; high-priority inputs remain missing; diagnosis stays incomplete.

**Required fix:** Missing inputs must be categorised:
- **CRITICAL:** Without this, diagnosis is impossible or unreliable
- **IMPORTANT:** Would materially improve confidence
- **USEFUL:** Would fill secondary coverage gaps

Only CRITICAL inputs should be shown on the command center. IMPORTANT and USEFUL inputs appear in the Evidence panel.

---

### MI-002: Missing input prompts not domain-specific

**Finding:** Missing input prompts are generic ("We need more financial data") rather than specific to the owner's current diagnosis.

**Impact:** Owner does not understand what specific data is needed or why.

**Required fix:** Missing input prompts must be specific: "To diagnose your cash flow position, we need: (1) your current accounts receivable balance by age bucket, (2) your creditor payment terms, (3) your bank balance as of this week."

---

### MI-003: No escalation when CRITICAL missing inputs remain unresolved for 7+ days

**Finding:** If a critical input has been flagged as missing for more than 7 days, there is no escalation: no new notification, no change in command center prominence, no audit record.

**Required fix:** CRITICAL missing inputs unresolved for 7+ days must be surfaced as a P1 banner on the command center: "Action required: OpsIQ cannot complete your diagnosis until you provide [input]. Overdue [7 days]."

---

## 6. Hallucination Risk Findings

### HA-001: Engine may assume inputs not provided

**Finding:** If the diagnosis engine references a business metric not present in the evidence store, it may synthesise an assumed value rather than flagging the gap. The assumed value is not documented or surfaced to the owner.

**Impact:** Hallucinated evidence produces a diagnosis the owner cannot verify or challenge.

**Required fix:** The input assembler must produce an explicit `assumed_inputs` list for every diagnosis. Any assumed value must be flagged in the diagnosis output: "Assumed: gross margin approximately 40% (industry average; no data provided)."

---

### HA-002: Missing inputs opsiq should request not validated against actual evidence gaps

**Finding:** The `missing_inputs_opsiq_should_request` field in simulation fixtures defines what the engine should ask for. In production, there is no systematic check that the engine actually requests the documented missing inputs when evidence is absent.

**Impact:** The engine may silently proceed without flagging genuine evidence gaps that the simulation corpus expects it to catch.

**Required fix:** The input assembler must have a `required_evidence_fields_by_category` registry. Before each diagnosis, it must check which fields are present and generate a `missing_inputs` list. This list must be compared to the minimum threshold before proceeding.

---

## 7. Audit Summary

| ID | Category | Priority | Finding |
|----|----------|----------|---------|
| IQ-001 | Input Quality | P0 | No completeness score surfaced to owner |
| IQ-002 | Input Quality | P1 | Evidence quality tier not assigned or displayed |
| IQ-003 | Input Quality | P1 | No staleness detection on evidence |
| IQ-004 | Input Quality | P0 | No detection of internally inconsistent data |
| IQ-005 | Input Quality | P0 | GST/tax-inclusive figures not detected |
| IQ-006 | Input Quality | P1 | Numeric field input not guided or bounded |
| IQ-007 | Input Quality | P2 | No cross-check of description vs financial profile |
| CS-001 | Confidence Scoring | P0 | No confidence score from input completeness |
| CS-002 | Confidence Scoring | P0 | BLOCKED state not triggered on insufficient evidence |
| CS-003 | Confidence Scoring | P1 | Evidence coverage by domain not shown |
| MI-001 | Missing Inputs | P1 | Missing inputs not categorised by diagnosis impact |
| MI-002 | Missing Inputs | P1 | Missing input prompts not domain-specific |
| MI-003 | Missing Inputs | P2 | No escalation on unresolved critical inputs after 7 days |
| HA-001 | Hallucination Risk | P0 | Engine may assume inputs not documented or surfaced |
| HA-002 | Hallucination Risk | P1 | Missing inputs not validated against actual evidence gaps |

**P0 count:** 6  
**P1 count:** 6  
**P2 count:** 3  

**Verdict:** The owner input module has 6 P0 defects that mean diagnoses are produced from unvalidated, potentially inconsistent, or GST-distorted data without the owner receiving any indication of input quality. These defects mean every diagnosis rendered without data completeness and consistency checks carries a material false-confidence risk.

---

## 8. Owner Input Module Readiness Verdict

**NOT PRODUCTION-READY.** The input module does not validate financial consistency, does not detect tax-inclusive figures, does not score or surface evidence quality, and does not prevent the engine from rendering diagnoses on insufficient evidence.

Required before declaring production-ready:
1. Resolve P0 findings: completeness scoring, consistency checking, GST detection, confidence scoring with BLOCKED state, hallucination surfacing
2. Resolve P1 findings: evidence quality tiers, staleness detection, numeric field guidance, domain evidence coverage, missing input categorisation and specificity

---

*This document is part of the OPTION-A Phase G repository completion work.*
