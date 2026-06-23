# Real-World Case Acquisition Strategy

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 2 — Case Acquisition Strategy  

---

## 1. Overview

This document defines the exact acquisition strategy for four corpus target sizes: 50, 100, 250, and 500 replay-ready cases. Each target has a distinct source mix, effort estimate, quality profile, and diversity expectation.

All cases must satisfy:
- `grounding_class: REAL_SOURCE_BACKED`
- `reliability_rating` ∈ {A, B} (C only with corroborating source)
- `supports_ground_truth` ∈ {YES, PARTIAL}
- Complete per-case layout: `01_case_input.json` + `outcome.json` + `source.json`
- No leakage of outcome/diagnosis into engine-visible input

---

## 2. Target: 50 Cases (Minimum Viable Corpus)

### 2.1 Source mix

| Source | Target count | Rationale |
|---|---|---|
| Chapter 11 first-day declarations (2015–2024) | 20 | Highest reliability; clear pre-filing state; definitive FAILURE outcome polarity |
| Founder post-mortems (startup/SaaS/e-commerce) | 15 | High volume; founder-narrated root cause; strong hindsight documentation |
| SEC 10-K multi-year distress → turnaround | 10 | SUCCESS or MIXED polarity balance; public company audit trail |
| Earnings call transcripts + subsequent filing | 5 | Specific decision-point cases with documented outcome |

### 2.2 Effort estimate

| Task | Estimate |
|---|---|
| Source identification and bookmark | 4–6 hours |
| Evidence extraction per case (avg 45 min each) | 37.5 hours |
| T₀ reconstruction and hindsight filtering | 12 hours |
| Per-case layout authoring (`01_case_input.json`, `outcome.json`, `source.json`) | 25 hours |
| Dual review (leakage check + source validation) | 12 hours |
| **Total** | **~90 hours (≈ 2–3 person-weeks)** |

### 2.3 Expected quality

- Reliability tier: 70% A, 30% B
- Outcome polarity mix: ~40% FAILURE, 35% SUCCESS, 25% MIXED
- Industry diversity: retail, SaaS, restaurant, manufacturing, hospitality, e-commerce, professional services
- Size diversity: startup through large-cap public company

### 2.4 Expected diversity gaps

- Overrepresented: tech startup shutdowns (founder post-mortems are disproportionately SaaS)
- Underrepresented: regional manufacturing, professional services, healthcare services
- Geographic bias: U.S.-centric (SEC and CourtListener focus on U.S. entities)

### 2.5 Statistical confidence at 50 cases

- Sufficient for initial signal on `historical_alignment` and `safety` dimensions
- Insufficient for robust cross-industry or cross-size breakdowns
- Useful for detecting systematic failure modes (e.g., consistent misdiagnosis of cash-flow crisis as market problem)
- See `REAL_WORLD_STATISTICAL_CONFIDENCE_PLAN.md` for full confidence analysis

---

## 3. Target: 100 Cases (Recommended Corpus)

### 3.1 Source mix

| Source | Target count | Rationale |
|---|---|---|
| Chapter 11 first-day declarations | 30 | Expand industry coverage; include more retail + hospitality |
| Founder post-mortems | 25 | Add B2B SaaS, marketplace, and consumer product categories |
| SEC 10-K distress → turnaround | 20 | Add larger public companies; more SUCCESS polarity |
| Earnings call transcripts + filing | 10 | Specific guidance-miss → execution cases |
| FTC/DOJ enforcement actions | 8 | FAILURE polarity with clear harmful action documentation |
| SSRN/TMA turnaround case studies | 7 | MIXED and SUCCESS polarity; structured expert analysis |

### 3.2 Effort estimate

| Task | Estimate |
|---|---|
| Source identification and bookmark | 6–10 hours |
| Evidence extraction per case (avg 45 min) | 75 hours |
| T₀ reconstruction and hindsight filtering | 20 hours |
| Per-case layout authoring | 50 hours |
| Dual review | 25 hours |
| **Total** | **~180 hours (≈ 4–5 person-weeks)** |

### 3.3 Expected quality

- Reliability tier: 75% A, 25% B
- Outcome polarity mix: ~35% FAILURE, 40% SUCCESS, 25% MIXED
- Industry diversity: 8+ distinct industry categories
- Size diversity: startup through enterprise

### 3.4 Statistical confidence at 100 cases

- Sufficient for meaningful `historical_alignment` score with ±10% confidence interval
- Sufficient for cross-industry breakdowns with ≥10 cases per industry
- First point at which per-dimension scores become externally reportable
- See `REAL_WORLD_STATISTICAL_CONFIDENCE_PLAN.md`

---

## 4. Target: 250 Cases (High-Confidence Corpus)

### 4.1 Source mix

| Source | Target count | Rationale |
|---|---|---|
| Chapter 11 first-day declarations | 70 | Full retail/hospitality/manufacturing coverage 2010–2024 |
| Founder post-mortems | 55 | Full SaaS/e-commerce/marketplace coverage |
| SEC 10-K distress → turnaround | 50 | Large and mid-cap coverage; international ADRs where available |
| Earnings call transcripts + filing | 30 | Expand to quarterly cadence cases |
| FTC/DOJ enforcement actions | 20 | Expand to price-fixing, fraud, and deceptive-practices cases |
| SSRN/TMA case studies | 15 | Academic and professional association cases |
| SBA SCORE case studies | 10 | SMB coverage (sole prop + small business segment) |

### 4.2 Effort estimate

| Task | Estimate |
|---|---|
| Source identification and bookmark | 15–20 hours |
| Evidence extraction per case | 187 hours |
| T₀ reconstruction and hindsight filtering | 45 hours |
| Per-case layout authoring | 125 hours |
| Dual review | 60 hours |
| **Total** | **~430 hours (≈ 10–12 person-weeks)** |

### 4.3 Expected quality

- Reliability tier: 80% A, 20% B
- Outcome polarity mix: ~30% FAILURE, 45% SUCCESS, 25% MIXED
- Industry diversity: 12+ categories including healthcare services, legal, construction
- Size diversity: from sole proprietor to Fortune 500
- Decision-type diversity: pricing, staffing, capacity, market entry, product, financing

### 4.4 Statistical confidence at 250 cases

- Sufficient for statistically robust conclusions on all 5 dimensions
- Sufficient for industry-specific breakdowns with tight confidence intervals
- Sufficient for size-based breakdowns (startup vs. SMB vs. mid-market vs. enterprise)
- Sufficient for outcome-polarity-specific analysis
- First point at which `historical_alignment` becomes publishable as a validation metric

---

## 5. Target: 500 Cases (Research-Grade Corpus)

### 5.1 Source mix

| Source | Target count | Rationale |
|---|---|---|
| Chapter 11 first-day declarations | 130 | Historical depth back to 2005; geographic spread |
| Founder post-mortems | 100 | Include non-U.S. founders writing in English |
| SEC 10-K distress → turnaround | 100 | Full S&P 500 coverage for distress periods; mid-cap expansion |
| Earnings call transcripts + filing | 70 | Full quarterly cycle coverage for key companies |
| FTC/DOJ enforcement actions | 40 | Full enforcement database coverage |
| SSRN/TMA/academic case studies | 30 | International business school cases (LSE, INSEAD where public) |
| SBA + government reports | 20 | SMB segment expansion |
| Public franchise FDDs (system-level) | 10 | Franchise system restructuring cases |

### 5.2 Effort estimate

| Task | Estimate |
|---|---|
| Source identification and bookmark | 30–40 hours |
| Evidence extraction per case | 375 hours |
| T₀ reconstruction and hindsight filtering | 90 hours |
| Per-case layout authoring | 250 hours |
| Dual review | 125 hours |
| **Total** | **~870 hours (≈ 22–25 person-weeks)** |

### 5.3 Expected quality

- Reliability tier: 85% A, 15% B
- Outcome polarity mix: well-balanced across all three polarities
- Industry diversity: 15+ categories
- Geographic diversity: primarily U.S. with selective international cases
- Temporal diversity: 2005–2024

### 5.4 Statistical confidence at 500 cases

- Research-grade confidence on all dimensions
- Sufficient for multivariate analysis (does diagnosis accuracy vary by industry × size?)
- Sufficient for temporal analysis (has alignment improved as the engine has evolved?)
- Suitable for external validation reporting

---

## 6. Recommended Starting Strategy

### Phase 1: Minimum Viable (50 cases)

**Priority order:**
1. CourtListener Chapter 11 searches for retail (2018–2023 wave: Toys R Us, Pier 1, etc. — but use smaller, less "famous" cases to reduce contamination risk)
2. Indie Hackers / Startups.com post-mortems with quantified CAC, LTV, churn metrics
3. SEC EDGAR 10-K searches for companies with going-concern opinions that subsequently either survived or liquidated

**Parallel tracks:**
- **Track A (FAILURE):** Chapter 11 cases → 20 cases
- **Track B (SUCCESS/MIXED):** 10-K turnarounds + earnings call cases → 20 cases
- **Track C (STARTUP):** Founder post-mortems → 10 cases

**Entry criteria per case:**
- At least 3 evidence items extractable without hindsight
- Clear decision-date (T₀) identifiable
- Outcome polarity documentable from the same or subsequent source
- Source reliability ≥ B

**Reject criteria per case:**
- Famous case (Enron, WeWork) — engine likely has training contamination
- Insufficient pre-decision evidence (only post-mortem narrative, no metrics)
- Outcome ambiguous or undocumented
- Source requires login or paywall

---

## 7. Anti-Contamination Strategy

### 7.1 Engine training contamination risk

The OpsIQ engine uses an LLM foundation. Famous business failures (Enron, Blockbuster, Kodak, WeWork, FTX) are likely in the LLM's training data. The engine may "recognize" these cases and respond based on training knowledge rather than the provided evidence, invalidating the blind test.

**Mitigation:** Prioritize less-famous cases. Chapter 11 cases from regional retail chains, small restaurant franchisors, and local manufacturing companies are far less likely to appear in LLM training data.

**Contamination risk indicator:** If the engine's `diagnosis_agreement` is suspiciously high (>80%) on the first corpus run, contamination is likely. De-identify case inputs further and rerun.

### 7.2 Author contamination risk

Case authors who know the outcome will unconsciously include outcome-signaling evidence in `01_case_input.json`.

**Mitigation:** Dual-author process: Author 1 extracts pre-decision evidence only. Author 2 (blind to Author 1's work) extracts the outcome. The two are combined only by a third party who checks for leakage.

---

## 8. Tooling Needed for Acquisition

| Tool | Purpose | Cost |
|---|---|---|
| CourtListener.com | Chapter 11 first-day declarations | Free |
| SEC EDGAR full-text search (efts.sec.gov) | 10-K/8-K retrieval | Free |
| Indie Hackers / Startups.com | Founder post-mortems | Free |
| SSRN.com | Academic turnaround case studies | Free |
| Simple spreadsheet (Google Sheets) | Case tracking (ID, source, status, polarity, review status) | Free |
| Git + this repository | Storage and version control | Free |

**Total tooling cost: $0 (all sources are free)**

---

**Phase 2 complete.**
