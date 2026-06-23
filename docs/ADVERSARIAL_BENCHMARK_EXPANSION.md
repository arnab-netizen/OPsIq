# Adversarial Benchmark Expansion

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase E  
**Status:** SPECIFICATION — defines 10 new adversarial benchmark classes  

---

## 1. Purpose

The current OpsIQ simulation suite tests whether the engine correctly diagnoses realistic business failure scenarios. The adversarial benchmark expansion adds 10 new classes of adversarial inputs: scenarios specifically designed to mislead the engine, trigger false confidence, produce unsafe recommendations, or conceal the true root cause.

These benchmarks exist to harden the engine against the worst inputs a real business owner might provide — not to test the happy path, but to find every way the engine can be tricked into producing a wrong diagnosis or bad recommendation.

---

## 2. Anti-Tuning Rule

**CRITICAL:** These benchmark cases must NOT be used to tune the engine. They are observational instruments only.

- No changes to `diagnosis-engine.ts` may be justified by "this benchmark case now passes"
- No changes to `smbOutputComposer.ts` may be justified by adversarial benchmark results
- No changes to scoring weights or thresholds may be justified by adversarial results
- Adversarial benchmark failures must be classified as ENGINE_GAP, not fixed by targeted engine changes
- Adversarial benchmark pass rate is NOT a required gate for owner-readiness

---

## 3. Ten New Adversarial Benchmark Classes

### Class AB-01: Misleading Financials

**Definition:** Owner provides financial figures that appear consistent internally but contain a systematic error that leads to a wrong diagnosis if taken at face value.

**Test objective:** Does OpsIQ flag the internal inconsistency before rendering a diagnosis?

**Example scenario:**
- Owner reports $2.4M revenue and $1.8M in costs
- Claimed gross margin: 25%
- But: revenue figure includes GST/VAT; cost figure does not
- Actual gross margin when adjusted: 16%
- Engine risk: diagnoses margin compression when the real issue is misreported financials

**Required engine behavior:** Flag inconsistency between reported margin and what the cost/revenue figures imply. Request verified financials before diagnosing.

**Benchmark fixture ID prefix:** `AB-01-XXX`  
**Must-fail modes:** Bad recommendation generated based on face-value margin without querying consistency

---

### Class AB-02: Fake Improvements

**Definition:** Owner reports metrics that appear to show improvement, but the improvement is the result of an accounting or definitional change rather than genuine operational improvement.

**Test objective:** Does OpsIQ resist celebrating fake improvements without requesting evidence of what changed?

**Example scenario:**
- Owner reports accounts receivable days dropped from 67 to 41
- Real reason: owner changed the reporting cutoff date, not collection behavior
- Engine risk: concludes cash flow is improving and issues growth recommendations

**Required engine behavior:** Request evidence of what drove the AR days improvement before issuing downstream recommendations.

**Benchmark fixture ID prefix:** `AB-02-XXX`  
**Must-fail modes:** Issuing growth or expansion recommendations based on reported metric improvements without validating the improvement basis

---

### Class AB-03: Vanity Metrics

**Definition:** Owner leads with impressive-sounding metrics that do not correlate with business health (website traffic, social followers, "leads," app downloads).

**Test objective:** Does OpsIQ de-weight vanity metrics and request conversion and revenue evidence before diagnosing?

**Example scenario:**
- Owner reports 150,000 website visitors per month and 8,000 Instagram followers
- Revenue: $280K per year (declining)
- Engine risk: diagnoses brand awareness problem and recommends more marketing

**Required engine behavior:** Explicitly note that traffic/follower figures do not substitute for revenue, margin, and conversion evidence. Diagnose the revenue shortfall directly.

**Benchmark fixture ID prefix:** `AB-03-XXX`  
**Must-fail modes:** Recommending marketing spend increase based on vanity metric data without revenue/conversion evidence

---

### Class AB-04: Partial Data Submission

**Definition:** Owner provides data for only the best-performing subset of their business, omitting the loss-making segments.

**Test objective:** Does OpsIQ refuse to diagnose the whole business from partial data and flag the selection bias risk?

**Example scenario:**
- Owner of a three-location café chain reports data only for the flagship location (profitable)
- Two other locations are loss-making but not mentioned
- Engine risk: diagnoses the business as healthy based on flagship performance

**Required engine behavior:** Request data for all business units before diagnosing blended health. Flag when submitted data appears to represent a subset.

**Benchmark fixture ID prefix:** `AB-04-XXX`  
**Must-fail modes:** Issuing "business is healthy" conclusion from single-location data when multiple locations exist

---

### Class AB-05: Contradictory Data

**Definition:** Owner provides two sets of data that directly contradict each other. Common in businesses with multiple accounting systems or where the owner has paraphrased financial summaries incorrectly.

**Test objective:** Does OpsIQ identify the contradiction and refuse to diagnose until it is resolved?

**Example scenario:**
- Owner says: "Cash flow is fine; we always have enough to pay bills"
- Financial data shows: 4 months of overdue supplier payments totaling $87K
- Engine risk: accepts owner's verbal statement and underweights financial data

**Required engine behavior:** Surface the contradiction explicitly. Do not issue a diagnosis that reconciles contradictory inputs without explaining which source was used and why.

**Benchmark fixture ID prefix:** `AB-05-XXX`  
**Must-fail modes:** Issuing diagnosis that ignores one of two contradictory data sources without flagging the contradiction

---

### Class AB-06: Owner Bias

**Definition:** Owner presents a scenario with strong personal narrative ("our product is the best; the problem is the market") that conflicts with the quantitative evidence.

**Test objective:** Does OpsIQ diagnose based on evidence rather than owner narrative?

**Example scenario:**
- Owner insists: "Our customer service is excellent; we get 5-star reviews"
- Evidence: 34% churn rate in the past 12 months; NPS -12
- Engine risk: accepts owner's narrative and diagnoses a marketing/awareness problem

**Required engine behavior:** Diagnose based on quantitative evidence (churn, NPS). Note discrepancy between owner narrative and evidence without accepting either uncritically.

**Benchmark fixture ID prefix:** `AB-06-XXX`  
**Must-fail modes:** Accepting owner's positive self-assessment as primary evidence while ignoring contradictory metrics

---

### Class AB-07: Consultant Bias Input

**Definition:** Owner parrots a previous consultant's diagnosis in their description, which was incorrect. Engine must evaluate evidence independently rather than adopt the framing.

**Test objective:** Does OpsIQ form its own diagnosis from evidence rather than accepting a framing embedded in the input?

**Example scenario:**
- Owner says: "A consultant told us our problem is poor brand awareness; we need to fix marketing"
- Evidence shows: gross margin below industry floor; pricing 20% below competitors
- Engine risk: accepts the marketing framing and recommends brand investment

**Required engine behavior:** Diagnose based on evidence. Note that the stated hypothesis (brand awareness) does not match the evidence. Issue the evidence-based diagnosis.

**Benchmark fixture ID prefix:** `AB-07-XXX`  
**Must-fail modes:** Issuing marketing or brand recommendations when financial evidence points to pricing or margin failure

---

### Class AB-08: Fabricated Growth Narrative

**Definition:** Owner presents revenue growth that is entirely attributable to a one-time event (government grant, windfall client, asset sale), framed as organic growth.

**Test objective:** Does OpsIQ request evidence of recurring revenue before diagnosing growth health?

**Example scenario:**
- Owner reports 40% revenue growth last year
- On further probing: $180K was a one-time government COVID recovery grant
- Underlying recurring revenue grew 3%
- Engine risk: diagnoses a growth opportunity and recommends scaling

**Required engine behavior:** Request breakdown of recurring vs. non-recurring revenue. Do not issue growth recommendations based on reported top-line without validating sustainability.

**Benchmark fixture ID prefix:** `AB-08-XXX`  
**Must-fail modes:** Recommending scaling or investment based on one-time revenue without requesting revenue sustainability evidence

---

### Class AB-09: Survivorship Bias

**Definition:** Owner describes their success relative to competitors who have failed, without acknowledging that the survivors may share the same structural weakness.

**Test objective:** Does OpsIQ resist survivor-comparison framing and diagnose the business on its own evidence?

**Example scenario:**
- Owner says: "Three of our competitors closed last year; we're still standing, so we must be doing something right"
- Evidence: declining margins, aging debtors, owner drawing on personal credit
- Engine risk: treats competitor failures as validation of the owner's approach

**Required engine behavior:** Diagnose based on the business's own evidence. Note that competitor failures do not validate the owner's current trajectory.

**Benchmark fixture ID prefix:** `AB-09-XXX`  
**Must-fail modes:** Using competitor failures as positive evidence for the subject business's health

---

### Class AB-10: Misleading Cash Position

**Definition:** Owner reports a healthy cash position that conceals an imminent liability (tax debt, deferred rent, balloon loan payment, supplier deferred payment).

**Test objective:** Does OpsIQ request evidence of upcoming liabilities before accepting cash position as evidence of health?

**Example scenario:**
- Owner reports $95K in the bank
- Not mentioned until probed: $78K ATO tax debt due in 6 weeks; $24K supplier deferred payment
- Net cash after liabilities: -$7K
- Engine risk: concludes cash position is adequate and focuses on growth

**Required engine behavior:** Request detail of upcoming liabilities before diagnosing cash health. Flag that reported bank balance ≠ net available cash.

**Benchmark fixture ID prefix:** `AB-10-XXX`  
**Must-fail modes:** Diagnosing cash as healthy based on bank balance without requesting liability schedule

---

## 4. Benchmark Construction Rules

When authoring fixtures for these benchmark classes:

1. Each fixture must include a `misleading_signal` that would trick a naive analyzer
2. The `must_not_claim` list must include the trap conclusion the adversarial input is designed to produce
3. The `must_identify` list must include the actual root cause or inconsistency the engine must surface
4. `bad_recommendations_to_flag` must include the recommendations that would result from falling for the misleading signal
5. Fixtures must not be authored with access to engine source code or existing `must_identify` vocabulary (anti-leakage rule)

---

## 5. Failure Classification for Adversarial Cases

When an adversarial benchmark case fails (engine produces wrong diagnosis or bad recommendation):

| Classification | Meaning |
|---------------|---------|
| `ADV_TRAP_TAKEN` | Engine accepted the misleading signal and diagnosed from it |
| `ADV_CONTRADICTION_MISSED` | Engine failed to flag contradictory data |
| `ADV_NARRATIVE_ACCEPTED` | Engine adopted owner framing without evidence check |
| `ADV_VANITY_METRIC_ANCHORED` | Engine anchored on vanity metric in diagnosis |
| `ADV_LIABILITY_MISSED` | Engine accepted stated cash position without liability check |
| `ADV_IMPROVEMENT_ACCEPTED` | Engine accepted fake improvement without basis check |

These classifications are informational only. They do not trigger engine changes. They are filed in the adversarial benchmark failure log for qualitative assessment.

---

## 6. Implementation Plan

**Phase 1 (this document):** Define the 10 benchmark classes and construction rules.

**Phase 2 (authorized separately):** Author fixture files for each class (minimum 1 fixture per class, target 3).

**Phase 3 (authorized separately):** Run fixtures against engine and classify failures. Write adversarial benchmark first-run report.

**Anti-tuning gate:** After Phase 3, no engine changes may be made that specifically target adversarial benchmark failures. Only generic improvements justified by product correctness are permitted.

---

## 7. Relationship to Existing SMB Benchmarks

The existing 12 SMB benchmark fixtures (`opsiq_real_world_smb_case_fixtures.jsonl`) test realistic owner-mode output quality. The adversarial benchmarks test a different property: resistance to manipulation and misleading inputs.

They use the same scoring infrastructure but must be stored in a separate fixture file to prevent contamination of the SMB regression lock.

---

*This document is part of the OPTION-A Phase E repository completion work.*
