# Real-World Replay P2 Artificial Abstention Fix Report

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Defect class:** LEGAL_GOVERNANCE_NUMERIC_REQUIRED  
**Scope:** Fix P2 abstentions only — no other defect class touched

---

## P2 Cases (9/13 Fixed)

| Case ID | Root Cause | Status |
|---------|-----------|--------|
| RW_CHINA_LUCKIN_2020_ACCOUNTING_FRAUD | Audit committee / governance language (STRONG \baudit\b) | FIXED |
| RW_GLOBAL_FTX_2022_CRYPTO_EXCHANGE_COLLAPSE | Governance + regulatory co-occurrence in 1 finding (2 LEGAL_TEXT terms) | FIXED |
| RW_INDIA_FORTIS_2018_GOVERNANCE_CRISIS | 3 items with multi-term (governance+regulatory) | FIXED |
| RW_INDIA_GITANJALI_2018_PNB_FRAUD | Fraud + investigation (2 STRONG items) | FIXED |
| RW_INDIA_LVB_2020_MORATORIUM | Non-compliance + moratorium (STRONG terms) | FIXED |
| RW_INDIA_PAYTM_2024_RBI_RESTRICTIONS | 4 items with non-compliance (STRONG) | FIXED |
| RW_INDIA_SATYAM_2009_ACCOUNTING_FRAUD | Governance + compliance co-occurrence in 1 finding (2 terms) | FIXED |
| RW_UAE_ABRAAJ_2018_PRIVATE_EQUITY_COLLAPSE | Investigation in PE governance (STRONG) | FIXED |
| RW_UAE_NMC_HEALTH_2020_ACCOUNTING_DEBT_CRISIS | Audit + governance (STRONG) | FIXED |
| RW_INDIA_BYJUS_2024_INSOLVENCY | Diagnosis fires BUT businessProblem contains "insolven" → liquidity domain not subsumed by legal_governance_risk → outOfModelCauseInProblem holds (legitimate safety gate) | MISSED |
| RW_INDIA_CCD_2019_DEBT_TURNAROUND | Insufficient textual governance evidence (governance vacuum — single weak term) | MISSED |
| RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT | Insufficient textual governance evidence | MISSED |
| RW_INDIA_YES_BANK_2020_MORATORIUM | 2 items, neither substantive — correctly does not fire | MISSED |

---

## Root Cause (P2)

Two interacting defects:

**Defect A — `fin_isLegalGovernance` requires numeric fields no historical case provides:**

`fin_isLegalGovernance(e)` requires at least one of `{complianceGapCount, regulatoryDeadlineDays, exposureAmount}` in `supportingData`. Historical case packets have no `supportingData` → always returns false → `legal_governance_risk` never commits.

**Defect B — Causal challenge adverseOffArchetype fires on home-signal vocabulary:**

After Defect A is fixed (diagnosis now commits), the causal challenge receives raw evidence with dimensions like `"governance"`, `"finance"`, `"operations"` — which do not match the mapped home dimensions `{process_maturity, market_position}` for `legal_governance_risk`. Findings in those off-home dimensions containing governance/fraud/regulatory text match `PROTECTED_OFF_ARCHETYPE`, causing `adverseOffArchetypeEvidence=true` → `gateAbstain=true`. The governance evidence that triggered the diagnosis was being treated as a contradiction of the diagnosis.

---

## Files Changed

### `src/services/consulting-engine/diagnosis-engine.ts`

**Added three constants:**
- `STRONG_LEGAL_TEXT`: Strong/unambiguous legal governance terms (fraud, investigation, non-compliance, audit, moratorium, etc.) that are sufficient without numeric corroboration
- `LEGAL_TEXT_G`: Global regex for counting distinct LEGAL_TEXT hits within one finding
- `fin_isLegalGovernanceByText(evidence)`: New function implementing the textual path

**Updated legal_governance_risk pattern** to include `fin_isLegalGovernanceByText(evidence)` as an additional arm alongside the existing `fin_isLegalGovernance(e)` per-item check.

**Textual path logic** (`fin_isLegalGovernanceByText`):
- Filters evidence to `process_maturity`/`market_position` items matching LEGAL_TEXT
- "Substantive" = STRONG_LEGAL_TEXT match OR 2+ distinct LEGAL_TEXT hits in one finding
- Fires if: (2+ relevant items AND at least 1 substantive) OR (1 item that is substantive alone)

### `src/services/governance/causal-challenge.ts`

**Added `LEGAL_GOVERNANCE_DIAGNOSES` set:** `{"legal_governance_risk"}`

**Added `LEGAL_GOVERNANCE_HOME_SIGNAL` regex:** governance/regulatory/fraud/compliance vocabulary that is the home signal of legal_governance_risk (excludes structural-commitment and insolvency/cash terms).

**Extended `isHoldWorthyOffArchetype` bypass:** When the committed diagnosis is `legal_governance_risk` and an off-home finding matches `PROTECTED_OFF_ARCHETYPE` only via governance/legal/fraud vocabulary (`LEGAL_GOVERNANCE_HOME_SIGNAL`), without numeric corroboration, and without structural-commitment terms — the hold is released. This finding contains the same signal that produced the diagnosis, not a contradiction of it.

---

## Safety Guards Preserved

| Scenario | Gate | Status |
|----------|------|--------|
| governance finding WITH numeric supportingData still holds | adverseOff: numeric gate bypasses bypass | HOLDS |
| insolvency text in off-home dim still holds for legal_governance_risk | LEGAL_GOVERNANCE_HOME_SIGNAL excludes "insolven" | HOLDS |
| capex/irreversible structural commitment always holds | PROTECTED_STRUCTURAL_COMMITMENT check runs first | HOLDS |
| non-critical off-home items do not hold | isCritical=false check | HOLDS |
| outOfModel liquidity threat not subsumed by legal_governance_risk | DIAGNOSIS_SUBSUMES_DOMAIN unchanged for liquidity | HOLDS |
| BlackBerry/Kingfisher (2 weak items, no substantive) do NOT fire | fin_isLegalGovernanceByText substantive gate | HOLDS |
| creditor enforcement ≠ regulatory enforcement (RCOM-style) | enforcement excluded from STRONG_LEGAL_TEXT | HOLDS |
| safety/recall with incidental regulatory mention NOT mislabelled | fin_hasCriticalSafetyQuality guard | HOLDS |
| P1 financial-distress co-occurrence bypass unchanged | FINANCIAL_DISTRESS_DIAGNOSES bypass logic untouched | HOLDS |

---

## Tests Added

### `src/__tests__/services/diagnosis-legal-governance-textual.test.ts` (new — 18 tests)

- 5 STRONG single-item path tests (Luckin audit, Byjus audit×2, Gitanjali fraud+investigation, LVB non-compliance, Abraaj investigation)
- 2 multi-term single-item path tests (FTX: governance+regulatory; Satyam: governance+compliance)
- 3 two-plus-item substantive path tests (Paytm 4 items, Fortis 3 items, moratorium STRONG)
- 6 safety guard tests (BlackBerry, Kingfisher, RCOM creditor enforcement, boundary guard, generic performance, safety/recall)
- 2 existing numeric path preservation tests

### `src/__tests__/services/causal-challenge-legal-governance-cooccurrence.test.ts` (new — 9 tests)

- 4 off-home governance/regulatory/fraud/sanction bypasses (Luckin, Paytm, Satyam styles)
- 2 guards that still hold: numeric corroboration + insolvency text
- 1 structural commitment always holds
- 1 non-critical isCritical=false guard
- 1 P1 bypass regression test

---

## Results

| Metric | Before P1 Fix | After P1 Fix | After P2 Fix |
|--------|--------------|-------------|-------------|
| Cases run | 42 | 42 | 42 |
| Proceeded | 8 | 15 | **24** |
| Abstained | 34 | 27 | **18** |
| P2 cases fixed | — | 0 | **9/13** |
| Unsafe recommendations | 0 | 0 | **0** |
| OPSIQ_WORSE | 0 | 0 | **0** |
| OPSIQ_BETTER | 19 | 16 | **12** |
| OPSIQ_MATCHED | 23 | 26 | **30** |
| Safety score | 100% | 100% | **100%** |

---

## Tests Run

| Suite | Tests | Result |
|-------|-------|--------|
| diagnosis-legal-governance-textual (new) | 18 | ✓ all pass |
| causal-challenge-legal-governance-cooccurrence (new) | 9 | ✓ all pass |
| causal-challenge-financial-distress-cooccurrence (P1) | 22 | ✓ all pass |
| causal-challenge-adverse-narrowing | 12 | ✓ all pass |
| causal-challenge-out-of-model-narrowing | 11 | ✓ all pass |
| TypeScript (tsc --noEmit) | — | ✓ 0 errors |
| Historical harness (42 blind replays) | 42 | ✓ 0 unsafe, 0 OPSIQ_WORSE |

---

## Cases Improved (P2 → Proceed)

1. RW_CHINA_LUCKIN_2020_ACCOUNTING_FRAUD
2. RW_GLOBAL_FTX_2022_CRYPTO_EXCHANGE_COLLAPSE
3. RW_INDIA_FORTIS_2018_GOVERNANCE_CRISIS
4. RW_INDIA_GITANJALI_2018_PNB_FRAUD
5. RW_INDIA_LVB_2020_MORATORIUM
6. RW_INDIA_PAYTM_2024_RBI_RESTRICTIONS
7. RW_INDIA_SATYAM_2009_ACCOUNTING_FRAUD
8. RW_UAE_ABRAAJ_2018_PRIVATE_EQUITY_COLLAPSE
9. RW_UAE_NMC_HEALTH_2020_ACCOUNTING_DEBT_CRISIS

## Cases Worsened

**0** — no previously-proceeding case now abstains. No OPSIQ_WORSE.

---

## Missed P2 Cases (4)

**RW_INDIA_BYJUS_2024_INSOLVENCY** — diagnosis engine fires `legal_governance_risk` (committed=true) but businessProblem contains "before formal insolvency" → `liquidity` domain triggered → `outOfModelCauseInProblem=true`. This is a legitimate safety hold: Byjus has concurrent governance failure AND imminent insolvency, a genuine causal conflict. The safety gate correctly escalates.

**RW_INDIA_CCD_2019_DEBT_TURNAROUND**, **RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT**, **RW_INDIA_YES_BANK_2020_MORATORIUM** — diagnosis engine does not commit (engineDiagnosis=unknown). The evidence in these cases does not meet the textual path threshold — either only one weak LEGAL_TEXT term appears, or the terms are incidental mentions without substantive governance/fraud/regulatory context.

---

## Safety Gate Changes

**No safety gate thresholds changed.** `assessSafety`, `abstention-engine.ts`, and all confidence cutoffs are unmodified. Changes are:
1. `diagnosis-engine.ts`: New textual evidence path for `legal_governance_risk` pattern matching
2. `causal-challenge.ts`: Home-signal bypass — governance/legal/fraud vocabulary in off-home dimensions is consistent with (not contradicting) a committed `legal_governance_risk` diagnosis

---

## Decision

**P2 FIXED.** 9/13 LEGAL_GOVERNANCE_NUMERIC_REQUIRED cases now proceed. 4 remaining misses are acceptable: 1 legitimate safety hold (concurrent insolvency threat), 3 insufficient textual evidence. 0 unsafe, 0 OPSIQ_WORSE.

## Next Defect Class

**P3/P4** — per task constraints, do not touch.
