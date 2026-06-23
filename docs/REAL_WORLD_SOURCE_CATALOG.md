# Real-World Source Catalog

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 1 — Source Discovery Audit  

---

## 1. Source Classification Framework

Sources are classified on five axes:
- **Accessibility** — can it be fetched without login, paywall, or legal barrier?
- **Legality** — is extracting evidence for a non-commercial research corpus legally unambiguous?
- **Outcome quality** — does the source document what actually happened, with verifiable outcome polarity (SUCCESS / FAILURE / MIXED)?
- **Decision-date quality** — can the pre-decision state (T₀) be reconstructed without hindsight contamination?
- **Replay suitability** — can the case be expressed as `01_case_input.json` (pre-decision only) + `outcome.json` (hidden) without structural information loss?

Each source is also classified by confidence level:
- **HIGH CONFIDENCE** — legal, accessible, well-structured, outcome-verified, decision-date reconstructible
- **MEDIUM CONFIDENCE** — legal and accessible but requires significant curation effort or has structural limitations
- **LOW CONFIDENCE** — legally or practically constrained; high curation overhead; unreliable outcome documentation

---

## 2. Source Catalog

---

### 2.1 SEC Form 10-K Annual Reports

**Confidence:** HIGH  

| Axis | Assessment |
|---|---|
| Accessibility | Freely available via SEC EDGAR (edgar.sec.gov) — no login required, bulk download available |
| Legality | U.S. government filings; public domain. No copyright restriction on government-required disclosures. Quotation of excerpts for research is legally unambiguous. |
| Outcome quality | HIGH — MD&A section documents business condition at year-end. Multiple years allow before/after comparison. Going concern warnings (GC) are explicit outcome signals. |
| Decision-date quality | HIGH — 10-K filings are dated. Risk factors and MD&A document the situation at the filing date, establishing a clear T₀. Prior year's 10-K establishes T₋₁ for comparison. |
| Replay suitability | HIGH — MD&A and risk factors translate directly to evidence items. Company identity can be de-identified in `01_case_input.json`. Outcome goes in `outcome.json`. |

**Best case types:**
- Revenue decline with management response
- Going concern transitions (FAILURE polarity)
- Successful turnarounds documented across 3+ filings
- Market contraction responses

**Volume potential:** Thousands of companies; practical corpus extraction of 50–100 replay-suitable cases within 2–3 weeks of curation effort.

**Source record reliability:** A (filed under legal obligation, audited financials referenced)

---

### 2.2 SEC Form 8-K Current Reports

**Confidence:** HIGH  

| Axis | Assessment |
|---|---|
| Accessibility | Freely available via SEC EDGAR; real-time and historical |
| Legality | Public domain government filings |
| Outcome quality | MEDIUM — 8-Ks document specific events (leadership changes, material contracts, going concern, bankruptcy filings, material weakness disclosures). Point-in-time, not narrative. Requires pairing with 10-K for full picture. |
| Decision-date quality | HIGH — 8-K has a precise event date establishing T₀ |
| Replay suitability | MEDIUM — useful as an event anchor (e.g., "CFO resignation + revenue miss") but too narrow alone; must be paired with 10-K or earnings transcript for full evidence set |

**Best case types:**
- Material weakness disclosures → subsequent remediation
- CEO/CFO departures at distressed companies → successor strategy
- Covenant breach notices → negotiation outcome
- Restructuring plan announcements → execution result

**Volume potential:** High; best used as case anchors, not standalone cases.

**Source record reliability:** A

---

### 2.3 Chapter 11 Bankruptcy Filings (PACER / CourtListener)

**Confidence:** HIGH  

| Axis | Assessment |
|---|---|
| Accessibility | CourtListener.com provides free access to federal court records for many districts. PACER requires registration (8¢/page) but is legally accessible. |
| Legality | Court records are public; free to access and cite for research |
| Outcome quality | HIGH — bankruptcy filings document the pre-filing condition in extensive detail (first-day declarations, schedules of assets/liabilities, creditor presentation decks). Outcome is binary: confirmed plan / liquidation. |
| Decision-date quality | HIGH — petition date is the exact T₀. First-day declarations reconstruct the pre-petition situation from management's own words. |
| Replay suitability | HIGH — first-day declarations are ideal: management narrative of what went wrong, what they tried, and why they filed. De-identify company name. Outcome goes in `outcome.json`. |

**Best case types:**
- Retail chain liquidations (high first-day declaration quality)
- Restaurant chain Chapter 11s
- Manufacturing bankruptcies with prior turnaround attempts
- Hospitality/hotel restructurings
- SaaS company distress cases (rare but high quality)

**Volume potential:** 500+ cases/year file in the U.S. federal system. CourtListener's free tier provides enough for 50–100 extraction-quality cases.

**Source record reliability:** A

---

### 2.4 Chapter 7 Liquidation Records

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | Same as Chapter 11 — CourtListener / PACER |
| Legality | Public court records |
| Outcome quality | HIGH for FAILURE polarity (liquidation = definitive failure). Limited detail in first-day declarations (often absent for Chapter 7 direct filings). |
| Decision-date quality | MEDIUM — Chapter 7 direct filings often lack the detailed pre-filing narrative present in Chapter 11 first-day declarations. Must rely on prior state filings or creditor exhibits. |
| Replay suitability | MEDIUM — outcome is clear (FAILURE) but pre-decision evidence reconstruction requires secondary sources |

**Volume potential:** Moderate; better for outcome confirmation than evidence extraction.

**Source record reliability:** A for outcome; B for pre-decision reconstruction

---

### 2.5 Earnings Call Transcripts

**Confidence:** HIGH  

| Axis | Assessment |
|---|---|
| Accessibility | Seekingalpha.com (free tier), Motley Fool, company IR pages. Many companies post transcripts directly. Historical transcripts available at no cost for older calls. |
| Legality | Transcripts posted by companies or third parties for public consumption. Excerpts for research are legally unambiguous fair use. Do not wholesale-copy; extract figures and paraphrase per §5 of source standard. |
| Outcome quality | HIGH — management guidance and analyst Q&A reveal the decision point. Comparing guidance vs. subsequent results documents the outcome polarity. |
| Decision-date quality | HIGH — call is dated; guidance is forward-looking (T₀ → T₁). Subsequent calls document outcome. |
| Replay suitability | HIGH — the management narrative at T₀ is exactly the pre-decision framing needed. Evidence items come from metrics shared on the call. The outcome comes from a subsequent filing. |

**Best case types:**
- Revenue misses with turnaround plan announcements
- Guidance reductions with stated causes
- Customer churn explanations
- Margin compression narratives with management response

**Volume potential:** Every public company has quarterly transcripts; extremely high volume. Quality curated corpus of 50 cases achievable quickly for small/mid-cap companies.

**Source record reliability:** B (first-party but not audited; combine with 10-K for A-tier)

---

### 2.6 Founder Post-Mortems (Public Shutdown Letters / Blogs)

**Confidence:** HIGH  

| Axis | Assessment |
|---|---|
| Accessibility | Publicly posted by founders; many aggregated at startups.com, Indie Hackers, and personal blogs |
| Legality | Publicly shared content; citing with attribution is unambiguous |
| Outcome quality | HIGH — founders document their own failure analysis, typically with a clear FAILURE outcome polarity and explicit root cause statements |
| Decision-date quality | MEDIUM — post-mortems are written retrospectively, which creates hindsight contamination risk. The author knows the outcome when writing the pre-decision evidence. Requires careful T₀ reconstruction using only evidence the author explicitly states was knowable before the critical decision. |
| Replay suitability | MEDIUM-HIGH — hindsight framing must be filtered. The "what I wish I'd known" sections require careful extraction to remove post-decision knowledge. The metrics described are usually real and traceable. |

**Best case types:**
- SaaS/product startup shutdowns with clear CAC/LTV analysis
- E-commerce businesses with explicit margin/cash crisis narratives
- Marketplaces with network-effect failure documentation
- B2B SaaS with churn analysis

**Volume potential:** 100+ high-quality cases available from 2015–2024 across Indie Hackers, Startups.com, personal blogs, and Twitter/X threads.

**Source record reliability:** B (first-party; verify key metrics where possible)

**Warning:** High hindsight contamination risk. Each case requires explicit T₀ reconstruction pass to strip post-decision knowledge from evidence.

---

### 2.7 SBA Case Studies and Resources

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | sba.gov and score.org publish case studies and success stories; free and public |
| Legality | Government publications; public domain |
| Outcome quality | MEDIUM — SBA materials are often positive-framing (success stories). Failure cases are less common. Outcome documentation is often anecdotal rather than quantitative. |
| Decision-date quality | LOW — SBA case studies rarely document the exact pre-decision state with enough evidence to reconstruct a rigorous `01_case_input.json`. |
| Replay suitability | LOW — too narrative, too anecdotal, insufficient evidence density for the harness's scoring requirements |

**Volume potential:** 10–20 usable cases at best; not a primary source.

**Source record reliability:** B for outcomes; C for evidence detail

---

### 2.8 Government Economic / Regulatory Reports

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | Freely available from relevant agencies (NIST, SBA, Federal Reserve, FTC, DOJ) |
| Legality | Public domain government reports |
| Outcome quality | HIGH when the report documents a specific enforcement action or industry analysis with outcome evidence |
| Decision-date quality | MEDIUM — aggregate reports don't document individual business decision dates; enforcement actions provide exact dates |
| Replay suitability | MEDIUM — best for FTC enforcement actions (deceptive practices, pricing, etc.) where the business decision, expert finding, and outcome are all documented |

**Best case types:**
- FTC actions against businesses for deceptive revenue practices → settlement outcome
- NIST MEP case studies (occasionally contain verifiable metrics)
- Federal Reserve small business credit surveys (aggregate only; low individual-case suitability)

**Volume potential:** 15–25 FTC/DOJ enforcement-based cases; useful as supplementary source.

**Source record reliability:** A for enforcement actions; B for agency reports

---

### 2.9 Public Turnaround Case Studies (Academic / Industry Research)

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | Some publicly available through university repositories, SSRN, or industry associations (TMA — Turnaround Management Association publishes award case studies) |
| Legality | Academic papers are citable; industry white papers require license check. SSRN papers are free to access. |
| Outcome quality | HIGH — turnaround case studies are typically written after outcome is known; document both the distress state and the outcome |
| Decision-date quality | HIGH — well-documented turnaround cases establish T₀ (when turnaround was initiated) clearly |
| Replay suitability | MEDIUM — academic framing requires extraction of evidence items. May include too much context about the solution (requires careful T₀ filtering). |

**Volume potential:** 20–40 high-quality cases from TMA, SSRN, and university repositories.

**Source record reliability:** B–A depending on publication; cite the original source

---

### 2.10 Public Investor Letters (Annual Letters to LPs / Shareholders)

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | Public when voluntarily shared (e.g., Berkshire Hathaway letters, Pershing Square letters, activist hedge fund letters) |
| Legality | Publicly shared documents; fair use for excerpts |
| Outcome quality | MEDIUM — letters discuss portfolio companies at a point in time; outcome requires tracking the company to T₁ via separate filing |
| Decision-date quality | MEDIUM — letter date establishes T₀; the situation described is from management's perspective at that date |
| Replay suitability | LOW-MEDIUM — letters describe situations but typically do not provide the evidence-density needed for a rich `01_case_input.json`. Better as supplementary corroboration. |

**Volume potential:** 10–20 cases; not a primary source.

---

### 2.11 Franchise Disclosure Documents (FDDs)

**Confidence:** MEDIUM  

| Axis | Assessment |
|---|---|
| Accessibility | FDDs are legally required public documents in the U.S.; many available through FTC, state regulators, and aggregators |
| Legality | Public regulatory filings; public domain |
| Outcome quality | MEDIUM — FDDs document franchise system financials (Item 19) and litigation history (Item 3). Do not typically document individual franchisee outcomes. |
| Decision-date quality | HIGH for system-level decisions; LOW for individual franchise unit cases |
| Replay suitability | LOW — useful only for system-level turnaround cases (franchisors reordering their model); individual unit cases not documented |

**Volume potential:** 5–10 system-level cases; not a primary source.

---

### 2.12 Public Retailer / Manufacturing / Hospitality Disclosures

**Confidence:** HIGH (for public companies) / LOW (for private)

| Axis | Assessment |
|---|---|
| Accessibility | Public company disclosures are available via SEC EDGAR; private company disclosures are generally inaccessible |
| Legality | Public company disclosures: public domain (government-mandated); private: limited |
| Outcome quality | HIGH for public; unknown for private |
| Decision-date quality | HIGH for public; LOW for private |
| Replay suitability | HIGH for public companies with documented restructuring or distress periods |

**Volume potential:** Significant — every public retailer, manufacturer, or hospitality company that has undergone a documented distress period is a potential case. Estimated 100+ candidates for the 2010–2024 period.

**Best examples:**
- Retail: companies that closed store counts, cut SKUs, restructured vendor relationships
- Manufacturing: capacity utilization crises, raw material cost pass-through decisions
- Hospitality: RevPAR collapse and recovery documentation in public REIT filings

---

### 2.13 Public SaaS Company Disclosures

**Confidence:** HIGH (public) / MEDIUM (private with public post-mortems)

| Axis | Assessment |
|---|---|
| Accessibility | Public company S-1/10-K filings via SEC EDGAR; private company post-mortems via founder blogs |
| Legality | Public domain for SEC filings; fair use for post-mortems |
| Outcome quality | HIGH for public companies; MEDIUM for private |
| Decision-date quality | HIGH for public; MEDIUM for private |
| Replay suitability | HIGH — SaaS metrics (ARR, churn, CAC, LTV, NRR) map directly to evidence items in the harness |

**Best case types:**
- Net Revenue Retention collapse → response
- CAC payback deterioration → go-to-market pivot
- Churn crisis → product pivot or feature investment
- IPO post-lockup guidance miss → restructuring

**Volume potential:** 30–50 high-quality cases from 2015–2024 SaaS company SEC filings + private post-mortems.

---

## 3. Source Ranking Summary

| Rank | Source Type | Confidence | Volume Potential | Reliability Tier |
|---|---|---|---|---|
| 1 | Chapter 11 first-day declarations | HIGH | 50–100 | A |
| 2 | SEC 10-K filings (multi-year distress analysis) | HIGH | 100+ | A |
| 3 | Founder post-mortems (startup shutdowns) | HIGH | 100+ | B |
| 4 | SaaS company SEC filings | HIGH | 30–50 | A |
| 5 | Earnings call transcripts + subsequent filings | HIGH | 50+ | B→A with 10-K |
| 6 | Public turnaround case studies (TMA, SSRN) | MEDIUM | 20–40 | A–B |
| 7 | FTC/DOJ enforcement actions | MEDIUM | 15–25 | A |
| 8 | SEC 8-K filings (as anchors, paired with 10-K) | HIGH | High (paired) | A |
| 9 | SBA/SCORE case studies | MEDIUM | 10–20 | B–C |
| 10 | Government economic reports | MEDIUM | 10–20 | A–B |
| 11 | Investor letters | MEDIUM | 10–20 | B |
| 12 | Franchise disclosure documents | MEDIUM | 5–10 | A |
| 13 | Chapter 7 records (standalone) | MEDIUM | Moderate | A for outcome |

---

## 4. Sources NOT Suitable

| Source | Reason |
|---|---|
| HBR case studies | Proprietary; not freely available; copyright |
| Paid analyst reports (Gartner, IDC) | Proprietary |
| Bloomberg / CapIQ data | Requires subscription; not public domain |
| Private company databases | Not publicly accessible |
| Unsourced blog posts / SEO content | Prohibited by ROUND_2_REAL_WORLD_SOURCE_STANDARD §5 |
| AI-recalled "common knowledge" about companies | Explicitly prohibited per §5 |
| Social media posts about business performance | No verifiable sourcing; reliability tier D |

---

**Phase 1 complete.**
