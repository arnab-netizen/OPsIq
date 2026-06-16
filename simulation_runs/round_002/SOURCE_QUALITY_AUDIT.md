# Round 2 Source Quality Audit

**Purpose:** Verify that all 50+ Round 2 cases are sourced from legitimate, distinct sources with no overlap or reuse from Round 1.

**Authority:** ROUND_2_CASE_PACK_SPECIFICATION.md §8 (Quality Requirements)  
**Requirement:** Source quality audit must PASS before Round 2 execution begins

---

## Audit Principle

Each Round 2 case must be:
1. **Sourced from a legitimate source** (published case study, public dataset, synthetic design, adversarial design, real business scenario)
2. **Distinct from Round 1 cases** (no case ID overlap, no source overlap, different businesses/contexts)
3. **Documented** (source attribution is clear and verifiable)
4. **Non-proprietary** (sourced from public or permission-granted sources, not confidential client data)

---

## Audit Checklist

### For Each Case (RW, PD, SYN, ADV, BLND)

**A. Source Legitimacy (CRITICAL)**

- [ ] **A1:** Case is sourced from a legitimate, identifiable source (published case study, SEC filing, Kaggle dataset, research paper, etc.)
  - Example PASS: "Sourced from HBR case study 'Delta Air Lines Revenue Management (A)' by John Curran, 1989"
  - Example FAIL: "Made up for this exercise" or "Inspired by a company I once worked for"
- [ ] **A2:** Source is cited explicitly in case input (sourceNote field or equivalent)
- [ ] **A3:** If source is a published case study, the case is publicly available (not proprietary/locked)
- [ ] **A4:** If source is a public dataset, the dataset is downloadable and verifiable (Kaggle, SEC EDGAR, Yahoo Finance, etc.)
- [ ] **A5:** If source is synthetic or adversarial, it is explicitly labeled as such and designed for test purposes

**Scoring:**
- PASS if all A1-A5 are TRUE
- FAIL if any A1-A5 is FALSE

---

**B. Source Distinctness from Round 1 (CRITICAL)**

**Real-World Cases:**
- [ ] **B1.RW:** No case ID overlap: Case IDs are RW-016 through RW-030 (NOT RW-001 through RW-015)
- [ ] **B2.RW:** No business overlap: Case company/business context is different from Round 1 real-world cases
  - Round 1 context: Domino's-adjacent patterns, specific industries covered in Round 1
  - Round 2: Different industries, different companies, different failure modes where possible
- [ ] **B3.RW:** No source overlap: Case not sourced from the same publication/case study source as any Round 1 real-world case
  - Example: If Round 1 used HBR case X, Round 2 RW case should use different HBR case or different publication

**Public-Dataset Cases:**
- [ ] **B1.PD:** No case ID overlap: Case IDs are PD-011 through PD-020 (NOT PD-001 through PD-010)
- [ ] **B2.PD:** No company overlap: Dataset/company is different from Round 1 public-dataset cases
  - Example: If Round 1 used Apple 2023-2025 financials, Round 2 PD case should use different company or different time period
- [ ] **B3.PD:** No source overlap: Dataset sourced from different source or same source but different company/time period
  - Example: Both from SEC EDGAR is OK if companies are different; both from same company different years is OK; same company same year is NOT OK

**Synthetic Cases:**
- [ ] **B1.SYN:** No case ID overlap: Case IDs are SYN-011 through SYN-020 (NOT SYN-001 through SYN-010)
- [ ] **B2.SYN:** No scenario overlap: Synthetic scenario is different from Round 1 synthetic cases (different failure archetype or stress-test focus)
  - Example: If Round 1 SYN-001 tested UNIT_ECONOMICS_BREAKDOWN, Round 2 SYN-011 should test a different archetype or industry

**Adversarial Cases:**
- [ ] **B1.ADV:** No case ID overlap: Case IDs are ADV-011 through ADV-020 (NOT ADV-001 through ADV-010)
- [ ] **B2.ADV:** No trap overlap: Trap type is different from Round 1 adversarial cases (different cognitive trap or test scenario)
  - Example: If Round 1 ADV-001 tested SURVIVORSHIP_BIAS, Round 2 ADV-011 should test a different trap (CONFLICTING_SIGNALS, MISSING_DATA, etc.)

**Blind-Outcome Cases:**
- [ ] **B1.BLND:** No case ID overlap: Case IDs are BLND-006 through BLND-010 (NOT BLND-001 through BLND-005)
- [ ] **B2.BLND:** No scenario overlap: Forward-looking scenario is different from Round 1 blind-outcome cases

**Scoring:**
- PASS if all case-type specific B1-B3 checks are TRUE
- FAIL if any B1-B3 is FALSE

---

**C. Source Attribution Quality (MEDIUM)**

- [ ] **C1:** Source attribution is specific enough to be verified by a third party
  - Example GOOD: "Kaggle dataset 'HR Analytics: Job Change of Data Scientists' by Arun S, 2020"
  - Example BAD: "A Kaggle dataset about HR" (too vague)
- [ ] **C2:** If sourced from a case study, publication details are included (author, title, date, publisher)
- [ ] **C3:** If sourced from a dataset, link or download location is documented
- [ ] **C4:** If sourced from public financial data, company name, ticker, and reporting period are documented
- [ ] **C5:** Source type (real-world, public dataset, synthetic, adversarial, blind-outcome) is correctly labeled

**Scoring:**
- PASS if all C1-C5 are TRUE
- FAIL if any C1-C5 is FALSE

---

**D. Source Non-Proprietary Verification (CRITICAL)**

- [ ] **D1:** Case is not sourced from confidential/proprietary client data
  - Example BAD: "Sourced from confidential consulting engagement with Company X"
  - Example GOOD: "Sourced from company's published annual report and investor disclosures"
- [ ] **D2:** If case includes financial or operational data, the data is from public sources (SEC filings, published reports, public datasets)
- [ ] **D3:** If case is based on a real business, permission has been obtained (or case is anonymized such that business cannot be identified)
- [ ] **D4:** Case does not include trade secrets, proprietary processes, or non-public strategic information

**Scoring:**
- PASS if all D1-D4 are TRUE
- FAIL if any D1-D4 is FALSE

---

**E. Audit Trail Documentation (MEDIUM)**

- [ ] **E1:** Case input includes sourceNote field with full source attribution
- [ ] **E2:** If case was created by sourcing from multiple sources, all sources are cited
- [ ] **E3:** Any external links (Kaggle, SEC EDGAR, etc.) are included and tested as valid
- [ ] **E4:** If case is anonymized real business, the anonymization strategy is documented (e.g., "Company name and ticker removed; industry and scale preserved")
- [ ] **E5:** Case sourcing metadata is stored in CASE_SOURCING_LOG.md with dates and source details

**Scoring:**
- PASS if all E1-E5 are TRUE
- FAIL if any E1-E5 is FALSE

---

## Audit Execution

**For each case:**

1. **Verify source legitimacy** - Auditor checks that source is real, public, and verifiable
   - For published case studies: Read abstract/intro; confirm case exists and is accessible
   - For datasets: Download dataset; confirm data matches case description
   - For synthetic: Confirm scenario is realistic and stress-test purpose is clear
2. **Verify distinctness from Round 1** - Auditor checks CASE_SOURCING_LOG and Round 1 cases
   - No ID overlap
   - No source overlap
   - Different context/business/scenario
3. **Verify attribution quality** - Auditor checks sourceNote field for clarity and specificity
4. **Verify non-proprietary** - Auditor checks that case uses only public or permitted data
5. **Document findings** - Auditor records source quality assessment

---

## Source Quality Risk Levels

| Risk Level | Definition | Action |
|-----------|----------|--------|
| **CLEAN** (GREEN) | Source is legitimate, distinct from Round 1, clearly attributed, non-proprietary. Case accepted. | PASS - case accepted |
| **LOW_RISK** (YELLOW) | Source is legitimate and non-proprietary, but attribution could be more specific. Case can be accepted with improved sourcing metadata. | PASS - case accepted, with note to improve attribution |
| **MEDIUM_RISK** (ORANGE) | Source is legitimate but attribution is unclear, or source is slightly similar to Round 1 case (but distinct). Case requires clarification. | FAIL - case requires revision. Clarify source or demonstrate distinctness. |
| **HIGH_RISK** (RED) | Source is unclear, proprietary, or suspected overlap with Round 1. Case is rejected. | FAIL - case rejected. Provide legitimate, distinct source. |

---

## Audit Pass/Fail Criteria

**Case PASSES source quality audit if:**
- Source quality risk level ≤ LOW_RISK (GREEN or YELLOW)
- All checklist items A1-A5 are TRUE
- All case-type specific B1-B3 items are TRUE
- All checklist items C1-C5 are TRUE
- All checklist items D1-D4 are TRUE
- All checklist items E1-E5 are TRUE

**Case FAILS source quality audit if:**
- Source quality risk level ≥ MEDIUM_RISK (ORANGE or RED)
- Any critical item (A, B, D) is FALSE
- Attribution quality is insufficient to verify source
- Source overlaps with Round 1 or is proprietary

---

## Round 1 Source Registry (for Overlap Detection)

**Real-World Cases (RW-001 to RW-015):**
| Case ID | Source | Company/Context | Notes |
|---------|--------|---------|-------|
| RW-001 | [Source from Round 1] | [Company/context] | Documented in Round 1 archive |
| RW-002 | | | |
| ... | | | |

*(Complete this table by reviewing Round 1 CASE_SOURCING_LOG.md)*

**Public-Dataset Cases (PD-001 to PD-010):**
| Case ID | Source | Dataset/Company | Notes |
|---------|--------|---------|-------|
| PD-001 | [Source from Round 1] | [Dataset/company] | Documented in Round 1 archive |
| ... | | | |

*(Complete for overlap detection)*

---

## Round 2 Source Registry (to be populated)

**Real-World Cases (RW-016 to RW-030):**
| Case ID | Status | Source | Company/Context | Audited | Risk Level | Notes |
|---------|--------|--------|---------|--------|-----------|-------|
| RW-016 | PENDING | — | — | NO | — | Awaiting case sourcing |
| RW-017 | PENDING | — | — | NO | — | — |
| ... | | | | | | |

**Public-Dataset Cases (PD-011 to PD-020):**
| Case ID | Status | Source | Dataset/Company | Audited | Risk Level | Notes |
|---------|--------|--------|---------|--------|-----------|-------|
| PD-011 | PENDING | — | — | NO | — | Awaiting case sourcing |
| ... | | | | | | |

*(Continue for SYN, ADV, BLND)*

---

## Remediation Path (If Case Fails)

1. **Identify audit failure** - Which checklist item(s) failed? Is it source legitimacy, distinctness, attribution, or non-proprietary concern?
2. **Revise case sourcing** - If source is unclear or proprietary, find new legitimate source; if overlap with Round 1, find different case
3. **Update sourceNote** - Provide detailed, verifiable source attribution
4. **Reaudit** - Run case through source quality audit again
5. **Pass or escalate** - If still failing, escalate to PM for waiver decision (rare)

---

## Audit Timeline

- **Before Round 2 execution:** All 50+ cases must pass source quality audit
- **Schedule:** Audit runs in parallel with case sourcing (as cases are sourced, they are audited)
- **Per case:** 10-15 minutes (auditor verifies source, checks overlap, documents findings)
- **Total effort:** 50 cases × 12 min = ~10 hours (can be split among auditors)

---

## Notes

- Source quality audit is **binary pass/fail** per case (no partial credit)
- Source quality audit is **independent** of content quality (a case can be well-written but fail audit if source is proprietary or overlaps with Round 1)
- Source quality audit is **required before Round 2 execution** (non-negotiable gate)
- Audit is performed by **auditor independent of case sourcing team** (ideally)
- Round 1 source registry must be consulted to detect overlaps

---

## Audit Status

| Category | Required | Sourced | Audited | Passed | Failed | Notes |
|----------|----------|---------|---------|--------|--------|-------|
| Real-World (RW) | 15 | 0 | 0 | 0 | 0 | Awaiting sourcing |
| Public-Dataset (PD) | 10 | 0 | 0 | 0 | 0 | Awaiting sourcing |
| Synthetic (SYN) | 10 | 0 | 0 | 0 | 0 | Awaiting sourcing |
| Adversarial (ADV) | 10 | 0 | 0 | 0 | 0 | Awaiting sourcing |
| Blind-Outcome (BLND) | 5 | 0 | 0 | 0 | 0 | Awaiting sourcing |
| **TOTAL** | **50** | **0** | **0** | **0** | **0** | **Awaiting sourcing** |

---

**Status:** CHECKLIST_READY (awaiting cases to audit)  
**Next step:** As cases are sourced, verify source legitimacy and distinctness before case locking  
**Gate:** All 50+ cases must PASS source quality audit before Round 2 execution begins

