# Abstention Profile Audit Report

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Scope:** All 34 remaining abstentions after the REAL_WORLD_REPLAY_ABSTENTION_FIX  
**Methodology:** Full pipeline re-run via `diagnose-abstentions.ts`; gate inputs + fired conditions captured for every case  

---

## Summary

| Metric | Count |
|--------|-------|
| Cases proceeded (non-abstained) | 16 |
| Cases abstained | 34 |
| **Legitimate abstentions** | **7** |
| **Artificial abstentions** | **27** |

---

## Two Abstention Groups

### Group 1 — committed=True, gateAbstain=True (8 cases)

The engine committed a non-UNKNOWN diagnosis. The **causal challenge** then fired and blocked proceed. All 8 share the same gate: `adverseOffArchetypeEvidence=True` in `runCausalChallenge`.

### Group 2 — committed=False (26 cases)

Engine returned `DiagnosisType.UNKNOWN` / `status=INSUFFICIENT_EVIDENCE`. Three sub-causes:
- Text trigger vocabulary mismatch (evidence describes scenario but not in engine's exact terms)
- Missing numeric corroboration (pattern requires a specific `supportingData` key that the packet lacks)
- Genuine engine scope gap (no archetype covers the scenario)

---

## Artificial Defect #1 — CAUSAL_CHALLENGE_OVER_BROAD (7 cases)

**Classification:** ARTIFICIAL  
**Affected cases:** 7 (all in Group 1, committed=True)

| Case ID | Engine Diagnosis | Confidence | Off-Archetype Dimension | Why Wrong |
|---------|-----------------|------------|------------------------|-----------|
| RW_CHINA_EVERGRANDE_2021_DEBT_CRISIS | cash_liquidity_crisis | MODERATE (0.55) | process_maturity | Correct dx; governance evidence triggers PROTECTED_OFF_ARCHETYPE |
| RW_INDIA_COX_KINGS_2019_DEBT_DEFAULT | debt_solvency_pressure | MODERATE (0.55) | process_maturity | Correct dx; governance co-occurrence fires causal challenge |
| RW_INDIA_DHFL_2019_NBFC_INSOLVENCY | debt_solvency_pressure | MODERATE (0.55) | process_maturity | Correct dx; outOfModelCauseInProblem + adverseOffArchetype both fire |
| RW_INDIA_GO_FIRST_2023_INSOLVENCY | cash_liquidity_crisis | HIGH (0.8) | process_maturity | Correct dx; regulatory (Pratt & Whitney/DGCA) co-occurrence |
| RW_INDIA_SUPERTECH_2022_HOMEBUYER_INSOLVENCY | cash_liquidity_crisis | HIGH (0.8) | process_maturity | Correct dx; SC order / homebuyer regulatory events |
| RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE | debt_solvency_pressure | MODERATE (0.55) | process_maturity | Correct dx; accounting/audit governance co-occurrence |
| RW_UK_THOMAS_COOK_2019_COLLAPSE | cash_liquidity_crisis | MODERATE (0.55) | process_maturity | Correct dx; governance/regulatory evidence triggers hold |

**Root cause:**  
`isHoldWorthyOffArchetype` in `causal-challenge.ts` fires when a critical evidence item in an off-home dimension contains text matching `PROTECTED_OFF_ARCHETYPE`. That regex includes `governance|regulat|complian|\bfraud\b|misconduct|sanction|consent order`. Real-world corporate distress cases almost universally have BOTH a primary financial crisis AND secondary governance/regulatory co-occurrences. An airline cash crisis (Go First) co-occurs with regulatory engine-grounding. A debt restructuring case (Evergrande) co-occurs with regulatory/governance scrutiny. These are not "contradictory off-archetype signals" — they are co-occurring dimensions that do not contradict the primary diagnosis.

**Exact file and location:**  
- File: `src/services/governance/causal-challenge.ts`  
- Function: `isHoldWorthyOffArchetype` (line ~214)  
- Pattern: `PROTECTED_OFF_ARCHETYPE` regex (line ~165)  
- The `governance|regulat|complian|\bfraud\b` stems in PROTECTED_OFF_ARCHETYPE over-hold for multi-dimensional real-world cases. The narrowing (lines ~139–226) correctly excluded non-critical secondary evidence, but still holds ALL critical governance/regulatory findings regardless of whether the primary financial diagnosis already addresses the core crisis.

**Fix required (code change — not implemented in this audit):**  
For financial home-dimension diagnoses (`cash_liquidity_crisis`, `debt_solvency_pressure`, `working_capital_stress`, `strategic_capex_risk`, `legal_governance_risk`), the PROTECTED_OFF_ARCHETYPE arm should apply only when the off-archetype governance/regulatory finding describes a cause that **contradicts or supersedes** the committed financial diagnosis, not merely co-occurs with it. Specifically: for diagnoses in `DIAGNOSIS_SUBSUMES_DOMAIN`, governance/regulatory evidence that describes a SECONDARY enforcement or compliance process (not the PRIMARY cause of the financial distress) should not hold.

---

## Artificial Defect #2 — LEGAL_GOVERNANCE_NUMERIC_REQUIRED (13 cases)

**Classification:** ARTIFICIAL  
**Affected cases:** 13 (all committed=False)

| Case ID | Dimensions | LEGAL_TEXT matches | Numeric present | Expected archetype |
|---------|-----------|-------------------|-----------------|--------------------|
| RW_CHINA_LUCKIN_2020_ACCOUNTING_FRAUD | process_maturity (2), financial_health (2), operational_efficiency (2), market_position (1) | YES | NO | legal_governance_risk |
| RW_GLOBAL_FTX_2022_CRYPTO_EXCHANGE_COLLAPSE | process_maturity (3), financial_health (2), operational_efficiency (1), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_BYJUS_2024_INSOLVENCY | financial_health (4), process_maturity (3), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_CCD_2019_DEBT_TURNAROUND | financial_health (2), operational_efficiency (2), process_maturity (3), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_FORTIS_2018_GOVERNANCE_CRISIS | process_maturity (3), financial_health (2), market_position (1), operational_efficiency (2) | YES | NO | legal_governance_risk |
| RW_INDIA_GITANJALI_2018_PNB_FRAUD | process_maturity (3), financial_health (2), operational_efficiency (1), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT | financial_health (4), market_position (2), process_maturity (1), operational_efficiency (1) | YES | NO | legal_governance_risk |
| RW_INDIA_LVB_2020_MORATORIUM | financial_health (3), operational_efficiency (1), process_maturity (2), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_PAYTM_2024_RBI_RESTRICTIONS | process_maturity (4), operational_efficiency (3), market_position (1), financial_health (1) | YES | NO | legal_governance_risk |
| RW_INDIA_SATYAM_2009_ACCOUNTING_FRAUD | process_maturity (5), financial_health (2), market_position (1) | YES | NO | legal_governance_risk |
| RW_INDIA_YES_BANK_2020_MORATORIUM | financial_health (3), operational_efficiency (2), process_maturity (2), market_position (1) | YES | NO | legal_governance_risk |
| RW_UAE_ABRAAJ_2018_PRIVATE_EQUITY_COLLAPSE | process_maturity (4), financial_health (1), market_position (1), operational_efficiency (1) | YES | NO | legal_governance_risk |
| RW_UAE_NMC_HEALTH_2020_ACCOUNTING_DEBT_CRISIS | financial_health (3), process_maturity (4), market_position (1), operational_efficiency (2) | YES | NO | legal_governance_risk |

**Root cause:**  
`fin_isLegalGovernance` in `diagnosis-engine.ts` (line ~777) requires:
```typescript
return (
  fin_num(e, "complianceGapCount") !== undefined ||
  fin_num(e, "regulatoryDeadlineDays") !== undefined ||
  fin_num(e, "exposureAmount") !== undefined
);
```
All 42 historical case packets have NO `supportingData` fields (they were authored without knowing the engine's required field names). The `LEGAL_TEXT` regex **does** match the governance/fraud/regulatory text in all 13 cases, but the mandatory numeric corroboration check prevents the archetype from firing. The gate correctly identifies the text as relevant but then silently returns false due to absent numerics.

**Exact file and location:**  
- File: `src/services/consulting-engine/diagnosis-engine.ts`  
- Function: `fin_isLegalGovernance` (approximately line 771–781)  
- The three numeric keys required: `complianceGapCount`, `regulatoryDeadlineDays`, `exposureAmount`  
- None of the 42 historical case packets include any of these three keys in `supportingData`

**Fix required (not implemented in this audit):**  
Either (a) add a text-only path in `fin_isLegalGovernance` for sufficiently specific governance/fraud vocabulary (multi-term LEGAL_TEXT matches should not require a numeric when the finding uses multiple distinct governance/fraud terms), or (b) extend the batch conversion script to populate `supportingData` with canonical field names where the text clearly implies them (e.g., `"fraud"` text → `complianceGapCount: 1`).

---

## Artificial Defect #3 — DEBT_SOLVENCY_STRICT_CORROBORATION (5 cases)

**Classification:** ARTIFICIAL  
**Affected cases:** 5 (all committed=False)

| Case ID | Dimensions | DEBT_TEXT match | DEBT_STRICT | Numeric | Why fails |
|---------|-----------|----------------|-------------|---------|-----------|
| RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY | financial_health (3), operational_efficiency (2), market_position (1), process_maturity (2) | NO | NO | NO | "debt-laden|unable to sustain|emergency funding" — no DEBT_TEXT term |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | financial_health (4), operational_efficiency (2), process_maturity (2) | NO | NO | NO | Finance findings lack "covenant|leverage|solvency|interest cover" |
| RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE | financial_health (3), operational_efficiency (2), market_position (1), process_maturity (3) | YES ("leverage") | NO | NO | "very high leverage" matches DEBT_1 but no covenant/maturity/debt service text and no numeric |
| RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS | financial_health (4), operational_efficiency (2), market_position (2), process_maturity (2) | YES ("solvency") | NO | NO | "cannot service" ≠ "debt service"; no covenant/maturity/refinanc text; no numeric |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | financial_health (3), process_maturity (3), market_position (1), operational_efficiency (1) | YES | NO | NO | DEBT_1 matches but no covenant/maturity/debt service text and no numeric |

**Root cause:**  
`fin_isDebtSolvency` in `diagnosis-engine.ts` (approximately line 701) requires:
```typescript
return DEBT_TEXT.test(t) && (numeric || /covenant|maturity|debt service|debt-service|refinanc/.test(t));
```
DEBT_TEXT = `/covenant|leverage|interest cover|refinanc|maturity|debt service|debt-service|gearing|solvency|debt load|payables.*due|short-term (debt|facility)/`

For Jet Airways: "heavily debt-laden" — the word "debt" alone is not in DEBT_TEXT (needs "debt service", "debt-service", or "debt load"). No match at all.  
For Kingfisher: aviation debt collapse described without using leverage/solvency/covenant vocabulary.  
For RCOM: "very high leverage" matches DEBT_TEXT but the strict corroboration requires either a numeric OR explicit covenant/maturity/debt service/refinanc text. Neither is present.  
For Vodafone: "solvency" matches DEBT_TEXT, but "cannot service" is not "debt service" (the compound phrase).  
For Enron: similar DEBT_TEXT partial match without strict corroboration.

**Exact file and location:**  
- File: `src/services/consulting-engine/diagnosis-engine.ts`  
- Function: `fin_isDebtSolvency` (approximately line 692–702)  
- Strict corroboration regex: `/covenant|maturity|debt service|debt-service|refinanc/`  
- DEBT_TEXT regex (partial match): `/covenant|leverage|interest cover|refinanc|maturity|debt service|debt-service|gearing|solvency|debt load/`

**Fix required (not implemented in this audit):**  
For the text-only path (no numeric), the strict corroboration should be relaxed to include additional vocabulary that unambiguously describes debt structural distress: `"debt-laden|inability to service|unable to service|obligation.*unpaid|debt burden|outstanding debt.*crisis|debt.*unsustainable"`. Alternatively, in the absence of supportingData numerics, require 2+ distinct DEBT_TEXT terms rather than a specific secondary-corroboration pattern.

---

## Artificial Defect #4 — LIQUIDITY_TRIGGER_VOCABULARY_MISMATCH (2 cases)

**Classification:** ARTIFICIAL  
**Affected cases:** 2 (committed=False)

| Case ID | Finding text | Why it doesn't trigger |
|---------|-------------|------------------------|
| RW_US_SEARS_2018_RETAIL_DECLINE | "Debt and liquidity pressure limiting available investment" | LIQUIDITY_TOPIC matches ("liquidity") but ADVERSE does not fire on "pressure"; "limiting" not in ADVERSE stems |
| RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE | Merger legal/regulatory context, no financial distress text matching LIQ/DEBT | Primarily merger/regulatory — correctly no financial match but also no `fin_isLegalGovernance` numeric |

**Root cause:**  
`softDistress` requires `ADVERSE_FRAMING` to match. The `ADVERSE_FRAMING` regex does not include "pressure" or "limiting" — terms that unambiguously describe distress in the context of liquidity. "Debt and liquidity pressure" is adversely framed in plain English but not in the engine's ADVERSE_FRAMING vocabulary.

**Exact file and location:**  
- File: `src/services/consulting-engine/diagnosis-engine.ts`  
- Constant: `ADVERSE_FRAMING` (approximately line 600)  
- Missing terms: `"pressure"`, `"constrain\w*"`, `"limiting"` when combined with liquidity topic

---

## Legitimate Abstentions (7 cases)

These represent correct engine behavior: the scenario either genuinely falls outside the engine's current archetype coverage, or the committed diagnosis is wrong and the causal challenge correctly halts it.

| Case ID | Evidence Count | Reason | Classification |
|---------|---------------|--------|---------------|
| RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION | 7 | Platform/competitive disruption — no archetype models competitive substitution by new platform | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION | 8 | Same as BlackBerry — competitive disruption without financial-distress triggers | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_US_APPLE_1997_TURNAROUND | 7 | Strategic turnaround — no turnaround archetype; evidence doesn't hit financial-distress matchers | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_US_IBM_1993_TURNAROUND | 7 | Strategic/structural turnaround — same scope gap | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_US_JCPENNEY_2012_PRICING_FAILURE | 8 | Pricing strategy transformation — no archetype for "eliminated discounting" style failure; `pricing_power` targets competitive under-pricing, not strategy change | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_US_STARBUCKS_2008_TURNAROUND | 7 | Brand/customer-experience turnaround — customer_retention archetype needs "low repeat|churn" specific phrasing | LEGITIMATE: ENGINE_SCOPE_GAP |
| RW_INDIA_SUZLON_2012_CDR | 8 | Engine committed wrong diagnosis: `margin_erosion` instead of `debt_solvency_pressure`. Causal challenge correctly halts because process_maturity (CDR governance) evidence is critical and the primary diagnosis is incorrect | LEGITIMATE: WRONG_DIAGNOSIS_CORRECTLY_CHALLENGED |

---

## Per-Case Summary Table (All 34 Abstentions)

| Case ID | committed | Diagnosis | Evidence Count | Gate(s) Fired | Classification | Defect Type |
|---------|-----------|-----------|---------------|---------------|----------------|-------------|
| RW_CHINA_EVERGRANDE_2021_DEBT_CRISIS | True | cash_liquidity_crisis | 7 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_COX_KINGS_2019_DEBT_DEFAULT | True | debt_solvency_pressure | 10 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_DHFL_2019_NBFC_INSOLVENCY | True | debt_solvency_pressure | 9 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_GO_FIRST_2023_INSOLVENCY | True | cash_liquidity_crisis | 8 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_SUPERTECH_2022_HOMEBUYER_INSOLVENCY | True | cash_liquidity_crisis | 6 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE | True | debt_solvency_pressure | 7 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_UK_THOMAS_COOK_2019_COLLAPSE | True | cash_liquidity_crisis | 7 | CAUSAL_CHALLENGE | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_SUZLON_2012_CDR | True | margin_erosion | 8 | CAUSAL_CHALLENGE | LEGITIMATE | WRONG_DIAGNOSIS_CORRECTLY_CHALLENGED |
| RW_CHINA_LUCKIN_2020_ACCOUNTING_FRAUD | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_GLOBAL_FTX_2022_CRYPTO_EXCHANGE_COLLAPSE | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_BYJUS_2024_INSOLVENCY | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_CCD_2019_DEBT_TURNAROUND | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_FORTIS_2018_GOVERNANCE_CRISIS | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_GITANJALI_2018_PNB_FRAUD | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_LVB_2020_MORATORIUM | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_PAYTM_2024_RBI_RESTRICTIONS | False | unknown | 9 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_SATYAM_2009_ACCOUNTING_FRAUD | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_YES_BANK_2020_MORATORIUM | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_UAE_ABRAAJ_2018_PRIVATE_EQUITY_COLLAPSE | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_UAE_NMC_HEALTH_2020_ACCOUNTING_DEBT_CRISIS | False | unknown | 10 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE | False | unknown | 9 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS | False | unknown | 10 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_US_SEARS_2018_RETAIL_DECLINE | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LIQUIDITY_TRIGGER_VOCABULARY_MISMATCH |
| RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE | False | unknown | 9 | LOW_CONFIDENCE+PRECONDITION_UNMET | ARTIFICIAL | LEGAL_GOVERNANCE_NUMERIC_REQUIRED |
| RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |
| RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |
| RW_US_APPLE_1997_TURNAROUND | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |
| RW_US_IBM_1993_TURNAROUND | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |
| RW_US_JCPENNEY_2012_PRICING_FAILURE | False | unknown | 8 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |
| RW_US_STARBUCKS_2008_TURNAROUND | False | unknown | 7 | LOW_CONFIDENCE+PRECONDITION_UNMET | LEGITIMATE | ENGINE_SCOPE_GAP |

---

## Defect Priority Order

| Priority | Defect | Cases affected | File | Fix scope |
|----------|--------|---------------|------|-----------|
| P1 | CAUSAL_CHALLENGE_OVER_BROAD | 7 | `src/services/governance/causal-challenge.ts` | Narrow PROTECTED_OFF_ARCHETYPE: when committed diagnosis is in financial home dimension and off-archetype critical evidence describes secondary regulatory/governance process (not primary cause), do not hold |
| P2 | LEGAL_GOVERNANCE_NUMERIC_REQUIRED | 13 | `src/services/consulting-engine/diagnosis-engine.ts` | Add text-only path: when LEGAL_TEXT matches with 2+ distinct legal/governance terms and no positive framing, allow `fin_isLegalGovernance` to fire without numeric |
| P3 | DEBT_SOLVENCY_STRICT_CORROBORATION | 5 | `src/services/consulting-engine/diagnosis-engine.ts` | Expand DEBT_TEXT or relax strict corroboration to include "debt-laden|inability to service|obligation.*unpaid" |
| P4 | LIQUIDITY_TRIGGER_VOCABULARY_MISMATCH | 2 | `src/services/consulting-engine/diagnosis-engine.ts` | Add "pressure|constrain\w*" to ADVERSE_FRAMING when combined with LIQUIDITY_TOPIC |

---

## Final Decision

**ADDITIONAL_WIRING_DEFECTS_FOUND**

27 of 34 remaining abstentions are ARTIFICIAL — caused by identifiable, fixable defects in the causal challenge gate and the diagnosis engine's trigger patterns. Only 7 abstentions are LEGITIMATE (6 genuine engine scope gaps + 1 correctly-challenged wrong diagnosis).

The three diagnosis engine defects (P2 + P3 + P4) are in `src/services/consulting-engine/diagnosis-engine.ts`. The one gate defect (P1) is in `src/services/governance/causal-challenge.ts`. No safety gate thresholds are involved and none should be changed. These are trigger-vocabulary / numeric-corroboration calibration issues.
