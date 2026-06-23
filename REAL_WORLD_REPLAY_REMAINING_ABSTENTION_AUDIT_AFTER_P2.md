# Real-World Replay — Remaining Abstention Audit After P1+P2

**Date:** 2026-06-20
**Harness state:** 24 proceeded | 18 abstained | 0 OPSIQ_WORSE
**Scope:** All 18 remaining abstentions after P1 (CAUSAL_CHALLENGE_OVER_BROAD, 7 fixed) and P2 (LEGAL_GOVERNANCE_NUMERIC_REQUIRED, 9 fixed)
**Method:** Read all 18 case inputs + outcome files; run diagnosis engine and causal challenge directly; trace exact gate triggers

---

## Summary

| Classification | Count |
|----------------|-------|
| LEGITIMATE | 8 |
| ARTIFICIAL | 10 |

| Defect class | Count |
|--------------|-------|
| SCOPE_GAP | 6 |
| CAUSAL_CHALLENGE_OVER_BROAD (new instance) | 1 |
| WIRING_DEFECT (raw evidence dimensions) | 1 |
| DEBT_SOLVENCY_STRICT_CORROBORATION | 5 |
| DIAGNOSIS_ENGINE_MISS (no pattern fires) | 3 |

---

## Group 1 — committed=True, gateAbstain=True (2 cases)

### RW_INDIA_BYJUS_2024_INSOLVENCY

- **engine_diagnosis:** legal_governance_risk
- **committed:** true
- **gateAbstain:** true
- **abstention_reason:** `outOfModelCauseInProblem=true` — businessProblem contains "insolvency" → matches the `insolven` stem in the `liquidity` protected-danger domain → `legal_governance_risk` subsumes `{legal, integrity}` but NOT `liquidity` → `outOfModelProtectedDanger` returns true → causal challenge blocks proceed
- **classification:** ARTIFICIAL
- **defect_class:** CAUSAL_CHALLENGE_OVER_BROAD
- **root_cause_detail:**
  BYJU's insolvency proceedings at the time of the case packet are a direct downstream consequence of the sustained governance and financial-reporting failures that the engine correctly diagnosed as `legal_governance_risk`. The insolvency filing is not an independent causal domain that contradicts or supersedes the committed diagnosis; it is the business outcome of the governance collapse. The `DIAGNOSIS_SUBSUMES_DOMAIN` map assigns `legal_governance_risk → {legal, integrity}` but omits `liquidity`, so the `insolven` stem triggers `outOfModelProtectedDanger` even when the diagnosis already addresses the governance root cause that produced the insolvency.
- **recommended_fix:**
  File: `src/services/governance/causal-challenge.ts`
  Function: `DIAGNOSIS_SUBSUMES_DOMAIN` constant (approximately line 328)
  Change: Add `"liquidity"` to the set for `legal_governance_risk`:
  ```ts
  legal_governance_risk: new Set(["legal", "integrity", "liquidity"]),
  ```
  Rationale: governance/fraud failures routinely terminate in insolvency proceedings. When the committed diagnosis is `legal_governance_risk`, the downstream `insolven` mention in the problem statement describes the outcome of the governance collapse, not a separate unaddressed causal domain.

---

### RW_INDIA_SUZLON_2012_CDR

- **engine_diagnosis:** margin_erosion
- **committed:** true
- **gateAbstain:** true
- **abstention_reason:** `adverseOffArchetypeEvidence=true` — but triggered by a **wiring defect**, not a genuine off-archetype signal. The harness passes `inp.evidence` (raw, with dimension string `"finance"`) to `assessConsultingOutput`, but `ARCHETYPE_DIMENSIONS["margin_erosion"]` = `{"financial_health"}`. Because `"finance" !== "financial_health"`, every piece of evidence appears off-archetype to the causal challenge. The second finance evidence item contains `"EBIT margin of negative 7%"` → `SEVERE_FINANCIAL_TEXT` pattern `/margin[\w ]*negative/` matches `"margin of negative"` → `isHoldWorthyOffArchetype` returns true → `adverseOff=true` → abstain.
- **classification:** ARTIFICIAL
- **defect_class:** WIRING_DEFECT
- **root_cause_detail:**
  In `run-historical-validation.ts` line ~301, `assessConsultingOutput` receives `inp.evidence` (raw dimension strings) as the `evidence` option, while the causal challenge internally compares `ev.dimension` against canonical archetype home-dimension sets. The SUZLON finance evidence contains a negative EBIT margin finding that is the primary on-archetype signal for `margin_erosion` — it correctly triggers the diagnosis — but because the raw dimension `"finance"` does not match `"financial_health"` in `ARCHETYPE_DIMENSIONS`, the causal challenge misclassifies it as off-archetype and blocks on `SEVERE_FINANCIAL_TEXT`.
- **recommended_fix:**
  File: `simulation_runner/run-historical-validation.ts`
  Location: line ~301-304, the `assessConsultingOutput` call
  Change: Pass `engineInput.evidence` (already mapped to canonical dimensions via `toEvidenceItems`) instead of `inp.evidence` (raw strings):
  ```ts
  const safety = assessConsultingOutput(output, uuidv5(`${inp.caseId}#rec`, NS), "historical-validation", {
    totalEvidenceCount: engineInput.evidence.length,
    evidence: engineInput.evidence as unknown as CausalEvidence[],   // mapped, not raw
    ownerConstraintProfile: ocp,
  });
  ```
  Impact: This WIRING_DEFECT affects ANY case where the committed diagnosis is not `unknown` and the raw evidence contains negative-margin, severe-financial, or aggravation text — because ALL evidence dimensions appear off-archetype when passed raw. Other abstentions from committed diagnoses may also be affected.

---

## Group 2 — committed=False (16 cases)

For all committed=False cases, the causal challenge is inert (it short-circuits on `!input.committed`). Abstention is driven by `assessSafety` via `LOW_CONFIDENCE + PRECONDITION_UNMET` (confidence_score=0.1 because the engine returned `DiagnosisConfidence.INSUFFICIENT_EVIDENCE` / `UNKNOWN`).

The root cause is always in the diagnosis engine: either a SCOPE_GAP (no archetype covers the scenario) or a pattern-match failure (DIAGNOSIS_ENGINE_MISS / DEBT_SOLVENCY_STRICT_CORROBORATION).

---

### RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** No archetype pattern fires. Evidence describes competitive platform disruption — market-share loss to iOS/Android, ecosystem decline, developer abandonment. No financial-distress numerics. No archetype exists for competitive substitution by a superior platform.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a — engine correctly abstains; competitive-disruption archetype is out of scope.
- **classification_note:** OPSIQ_BETTER (outcome polarity=NEGATIVE; abstention avoids recommending business-as-usual)

---

### RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Same as BlackBerry — competitive platform disruption, no archetype.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a
- **classification_note:** OPSIQ_BETTER (outcome polarity=NEGATIVE)

---

### RW_INDIA_CCD_2019_DEBT_TURNAROUND

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** No debt-solvency or key-person pattern fires. The two finance findings describe ₹70bn debt exposure and multi-lender coordination — no DEBT_TEXT match (`covenant|leverage|interest cover|refinanc|maturity|debt service|gearing|solvency`). "₹70 billion in debt" does not contain any DEBT_TEXT term. No LIQUIDITY_HARD trigger. The governance findings describe the founder's death (key-person loss) and governance vacuum, but the `key_person_risk` archetype requires `team_capability` dimension evidence, and all governance findings are in `process_maturity` dimension.
- **classification:** ARTIFICIAL
- **defect_class:** DIAGNOSIS_ENGINE_MISS
- **root_cause_detail:**
  Two separate misses: (1) `fin_isDebtSolvency` requires DEBT_TEXT vocabulary; "₹70 billion in debt", "creditors had exposure", "coordinated creditor management" — none match DEBT_TEXT. (2) `key_person_risk` archetype requires `team_capability` dimension; the CCD findings about founder death are in `governance` → mapped to `process_maturity`, not `team_capability`. The case has a compound crisis: acute key-person loss + heavy debt.
- **recommended_fix:**
  Two independent fixes:
  1. File: `src/services/consulting-engine/diagnosis-engine.ts`, function `fin_isDebtSolvency` (~line 693): extend DEBT_TEXT to include `"debt-laden|debt burden|heavily indebted|debt.*exposure|creditor.*management|debt.*service"` so that plain-language high-debt descriptions fire without requiring specific covenant/leverage vocabulary.
  2. File: `src/services/consulting-engine/diagnosis-engine.ts`, `key_person_risk` pattern (~line ~450): Add `process_maturity` as an eligible dimension for key-person findings when the finding text contains `"founder.*died|sudden.*death|key.*person.*loss|no.*successor|leadership.*vacuum"`. Alternatively, in `run-historical-validation.ts`, add `"governance"` as a secondary mapping path to both `process_maturity` AND `team_capability` when the finding text matches key-person vocabulary (prefer engine-side fix for generality).

---

### RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** No liquidity-crisis or debt-solvency pattern fires. Finance findings describe active defaults, asset-liability mismatch, rating downgrades, and debt spread across subsidiaries/SPVs — but none match `LIQUIDITY_HARD` (`out of cash|cannot make payroll|insolven|cash crunch`) or `LIQUIDITY_TOPIC` (`runway|liquidity|burn rate`) with `ADVERSE_FRAMING`. The word "liquidity" does not appear in any finance finding (it appears in market dimension findings about market contagion). DEBT_TEXT: "short-term deposits" matches `short-term (debt|facility)`? No — "short-term deposits" is not "short-term debt" or "short-term facility". No numeric for leverageRatio/covenantHeadroom/interestCoverage.
- **classification:** ARTIFICIAL
- **defect_class:** DEBT_SOLVENCY_STRICT_CORROBORATION (also DIAGNOSIS_ENGINE_MISS for cash path)
- **root_cause_detail:**
  The IL&FS default is a classic asset-liability mismatch liquidity collapse. The engine's `fin_isLiquidityCrisis` requires `dimension=financial_health` (met, once mapped) AND (`LIQUIDITY_HARD` match OR (`LIQUIDITY_TOPIC` AND `ADVERSE_FRAMING`)). The IL&FS findings use terms like "active defaults", "structural asset-liability mismatch", "below investment grade" — none contain "liquidity", "runway", or "burn rate" as a topic. `fin_isDebtSolvency` requires DEBT_TEXT; "asset-liability mismatch", "below investment grade", "short-term deposits" do not match.
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Function: `LIQUIDITY_HARD` or `LIQUIDITY_TOPIC` constants (~line 610-618)
  Add to LIQUIDITY_HARD: `"asset.?liability mismatch|structural.*default|active default.*debt|missed.*payment.*due|payment.*default"` OR extend LIQUIDITY_TOPIC to include `"default|mismatch"` (with appropriate adverse framing guard to avoid false positives).
  Alternatively, for the debt path: extend DEBT_TEXT to include `"short-term deposit.*due|asset-liability|payment default|instrument.*default"`.

---

### RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** No debt-solvency or cash-liquidity pattern fires. Finance findings: "suspended operations after lenders declined emergency funding" → no DEBT_TEXT match; "heavily debt-laden and unable to sustain operations" → `debt-laden` is NOT in DEBT_TEXT (`debt load` is, but `debt-laden` ≠ `debt load`); "obligations to creditors... unpaid" → no DEBT_TEXT match. LIQUIDITY_HARD: no match ("insolven" appears in businessProblem but not in financial_health dimension findings). No numeric.
- **classification:** ARTIFICIAL
- **defect_class:** DEBT_SOLVENCY_STRICT_CORROBORATION
- **root_cause_detail:**
  "Debt-laden" is a plain-language synonym for "debt load" but does not match the literal DEBT_TEXT regex `/debt load/`. "Unable to sustain operations from internal cash flows" is unambiguous financial distress but neither `debt-laden` nor `unable to sustain` appear in DEBT_TEXT. The strict corroboration requirement also fails (no numeric, no `covenant|maturity|debt service|refinanc`).
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Constant: `DEBT_TEXT` (~line 692)
  Add: `|debt[- ]laden|unable to sustain|obligation.*unpaid|creditor.*unpaid|unable to service`
  This directly covers Jet Airways ("debt-laden", "unable to sustain") and is unambiguous debt-structural vocabulary.

---

### RW_INDIA_KINGFISHER_2012_COLLAPSE

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "never turned a profit", "accumulated losses exceeded 50% of net worth; cash losses in FY2011-12", "domestic revenue declined", "seven months of salary arrears" — no DEBT_TEXT match, no LIQUIDITY_HARD match, no LIQUIDITY_TOPIC soft match. `fin_isMarginErosion`: "accumulated losses", "cash losses" don't match MARGIN_HARD or MARGIN_TOPIC. No numeric for any pattern.
- **classification:** ARTIFICIAL
- **defect_class:** DIAGNOSIS_ENGINE_MISS
- **root_cause_detail:**
  Kingfisher's collapse exhibits `cash_liquidity_crisis` characteristics (operations suspended, salary arrears, cash losses) but the finding vocabulary misses every engine trigger. "Cash losses" would match MARGIN_HARD (`operating loss`) if it said "operating loss" instead of "cash losses". "Seven months of salary arrears" is a canonical liquidity-crisis signal (inability to meet payroll), but the LIQUIDITY_HARD pattern requires `"missed payroll"` or `"cannot make payroll"` — not `"salary arrears"`. The `legal` dimension finding about DGCA licence-cancellation uses dimension `"legal"` → mapped to `process_maturity` in the harness.
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Constant: `LIQUIDITY_HARD` (~line 610)
  Add: `|salary arrears|wage arrears|payroll arrears|unable to pay.*(?:staff|employee|worker|salary)`
  These are unambiguous liquidity-crisis signals. "Salary arrears" is functionally identical to "missed payroll" and should trigger `cash_liquidity_crisis`.

---

### RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "Total debt is very high and significantly exceeds cash generation capacity" → matches DEBT_TEXT at `leverage`? No — "very high" is not in DEBT_TEXT. Actually checks: "exceeds cash generation capacity" — no DEBT_TEXT match. Wait — "leverage" appears in DEBT_TEXT and "very high leverage"? Let me check: finding text is "Total debt is very high and significantly exceeds cash generation capacity from operations, creating acute solvency risk". Contains "solvency" → DEBT_TEXT match. But strict corroboration requires numeric OR `covenant|maturity|debt service|debt-service|refinanc` — none present. "Solvency" alone matches DEBT_TEXT but the strict corroboration fails.
- **classification:** ARTIFICIAL
- **defect_class:** DEBT_SOLVENCY_STRICT_CORROBORATION
- **root_cause_detail:**
  RCom's first finance finding: "Total debt is very high and significantly exceeds cash generation capacity from operations, creating acute solvency risk." Contains "solvency" → `DEBT_TEXT` matches. But `fin_isDebtSolvency` requires `DEBT_TEXT.test(t) && (numeric || /covenant|maturity|debt service|debt-service|refinanc/.test(t))`. No numeric (`leverageRatio/covenantHeadroom/interestCoverage` absent). No covenant/maturity/debt service/refinanc text. So `fin_isDebtSolvency` returns false despite an unambiguous solvency-risk statement.
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Function: `fin_isDebtSolvency` (~line 702)
  Relax the strict corroboration for "solvency" and "unable to service": when DEBT_TEXT matches AND the text contains unambiguous solvency-distress vocabulary (`"acute solvency|debt.*exceeds.*capacity|cannot service|unable to service|solvency risk"`) treat that as sufficient corroboration without requiring a numeric.
  Add to strict-corroboration check: `|acute solvency|exceeds.*(?:cash|debt service) capacity|solvency risk|cannot service|unable to service debt`

---

### RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "Large estimated AGR liability recognized... obligation significantly exceeds capacity to pay" → no DEBT_TEXT match; "Combined debt and AGR dues create obligations that operating cash flow cannot service; solvency is under acute threat" → `DEBT_TEXT` checks: "solvency" → yes, matches. Strict corroboration: "cannot service" — does this match `/covenant|maturity|debt service|debt-service|refinanc/`? "debt service" would match "cannot service" only if "debt service" is literally in the text. The finding says "operating cash flow cannot service" not "cannot service debt service" — no literal match. No numeric. So `fin_isDebtSolvency` returns false.
- **classification:** ARTIFICIAL
- **defect_class:** DEBT_SOLVENCY_STRICT_CORROBORATION
- **root_cause_detail:**
  "Obligations that operating cash flow cannot service; solvency is under acute threat" is unambiguous debt-solvency distress. DEBT_TEXT matches "solvency". The strict corroboration requires "debt service" as a compound phrase (not "cannot service" alone). This is a near-miss: "cannot service" is semantically identical to "cannot meet debt service obligations" but is two words shorter than the regex trigger.
- **recommended_fix:** Same as RCOM fix — add `"cannot service|unable to service debt|solvency.*acute threat"` to the strict-corroboration alternate regex. Or (cleaner): split `fin_isDebtSolvency` into hard path (explicit covenant/maturity/debt-service) and soft path (DEBT_TEXT + unambiguous solvency/service-failure vocabulary without numeric).

---

### RW_INDIA_YES_BANK_2020_MORATORIUM

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "asset quality is deteriorating", "Bank needs capital and has failed to secure... capital", "Capital adequacy insufficient to absorb stressed asset losses" — no DEBT_TEXT match, no LIQUIDITY_TOPIC match, no LIQUIDITY_HARD match. Governance/legal findings: "Known governance and risk-management concerns", "RBI actively monitoring... regulatory intervention increasingly probable" — these hit `LEGAL_TEXT` (regulat, governance) but `fin_isLegalGovernance` requires numeric (`complianceGapCount/regulatoryDeadlineDays/exposureAmount`) and `fin_isLegalGovernanceByText` was fixed in P2 but may not fire here.
- **classification:** ARTIFICIAL
- **defect_class:** DIAGNOSIS_ENGINE_MISS
- **root_cause_detail:**
  Yes Bank's crisis is primarily a `cash_liquidity_crisis` / banking capital failure. The engine has no bank-specific archetype. The finance findings describe NPA/capital adequacy deterioration (not standard liquidity/debt vocabulary). The legal/governance findings about RBI intervention would qualify for `legal_governance_risk` via `fin_isLegalGovernanceByText` (P2 fix), BUT the `legal` findings use `process_maturity` dimension (correctly mapped), while additional findings are in `operations` and `market` dimensions. Let me verify: governance dim has "governance" text → process_maturity, "legal" dimension for "RBI actively monitoring" → process_maturity. `fin_isLegalGovernanceByText` checks for `process_maturity` or `market_position` dimensions — two governance/legal findings exist. The `moratorium` word appears in the case ID but NOT in the evidence text. `STRONG_LEGAL_TEXT` includes `moratorium` — does it appear in findings? No. Does `fin_isLegalGovernanceByText` fire? Evidence in process_maturity: "Known governance and risk-management concerns contributed to the asset-quality deterioration" → `governance` matches LEGAL_TEXT → one item. "RBI actively monitoring capital adequacy and asset quality — regulatory intervention increasingly probable" → `regulatory` matches LEGAL_TEXT → second item. Two items, neither with STRONG_LEGAL_TEXT. Check: `(t.match(LEGAL_TEXT_G) ?? []).length >= 2` for each — "Known governance and risk-management concerns" → `governance` → 1 LEGAL_TEXT_G match (not ≥2). "RBI actively monitoring capital adequacy... regulatory intervention" → `regulatory` + `regulatory` → 2 matches from same term in same finding? LEGAL_TEXT_G would match `regulatory` twice → `(t.match(LEGAL_TEXT_G)).length >= 2` → true → isSubstantive=true. So one substantive item → `fin_isLegalGovernanceByText` should return true. But then this should have been fixed by P2!
  
  Wait — the P2 fix added `fin_isLegalGovernanceByText` as a TEXT-ONLY path to fire `legal_governance_risk` without numeric. Does P2's `fin_isLegalGovernanceByText` appear in the archetype routing? Let me re-check the engine output: YES_BANK returned `unknown`. So either the evidence dimension after mapping doesn't reach `process_maturity` for legal findings, or the archetype has an additional precondition. YES_BANK's legal/governance findings are in dimension `legal` (→ mapped to `process_maturity`) and `governance` (→ mapped to `process_maturity`). The `fin_isLegalGovernanceByText` function filters `e.dimension === "process_maturity" || e.dimension === "market_position"`. Both legal findings map to `process_maturity`. So `fin_isLegalGovernanceByText` SHOULD fire for YES_BANK if the P2 fix is working. Yet it returns unknown. The issue may be in the archetype's minimum-count requirement or critical-finding requirement.
- **recommended_fix:**
  Investigate whether `fin_isLegalGovernanceByText` fires for YES_BANK (check `legal_governance_risk` archetype in diagnosis-engine.ts around line 473 for additional conditions beyond `fin_isLegalGovernanceByText`). If it doesn't fire, the minimum substantive count may need to be reduced from 1 to 0.5 (i.e., if `isSubstantive` but only 1 item, still fire). If it does fire but the archetype has a critical-finding gate that NO process_maturity finding satisfies, relax the critical-finding requirement for `legal_governance_risk` when STRONG_LEGAL_TEXT matches.

---

### RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Evidence: 4 governance findings (closing conditions, disputed leadership, deal deadline, legal/arbitration risk), 2 market findings (strategic necessity, standalone competitive pressure), 2 operations findings, 1 finance finding. `fin_isLegalGovernanceByText`: governance → process_maturity, legal → process_maturity. Findings include: "legal and arbitration risk exists" → LEGAL_TEXT matches (breach, litigation implied). But the primary case is a corporate M&A deal failure with governance/leadership disputes — not fraud, regulatory breach, or compliance failure. `fin_isLegalGovernanceByText` may fire but the situation doesn't truly fit `legal_governance_risk` (it's a strategic/deal failure, not a regulatory or fraud crisis).
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **root_cause_detail:**
  The Zee-Sony merger failure is an M&A deal-collapse scenario driven by governance/leadership disputes in a proposed merger. No archetype covers M&A deal failure. While `legal_governance_risk` might fire via `fin_isLegalGovernanceByText` (disputed governance terms), the scenario is fundamentally a strategic transaction failure, not an operational legal/regulatory crisis. The engine correctly abstains. Standalone Zee's competitive position deterioration is a `demand_generation_failure` or `market_position` archetype — but the primary presenting problem is M&A execution failure.
- **recommended_fix:** n/a — engine correctly abstains on a scenario outside operational archetype scope.

---

### RW_US_APPLE_1997_TURNAROUND

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Evidence covers finance (losses, cost misalignment), operations (fragmented product lines, non-core initiatives), market (Mac ecosystem erosion), governance (strategic clarity low). No archetype fires: finance findings don't match DEBT_TEXT, LIQUIDITY_HARD, or MARGIN_HARD specifically. Operational findings are in `operational_efficiency` but don't match OPERATIONAL_TOPIC (`turnaround|slow|capacity|delay|utiliz|bottleneck`). The case is a strategic survival/turnaround scenario.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a — no archetype covers strategic turnaround/survival scenarios.

---

### RW_US_ENRON_2001_GOVERNANCE_FRAUD

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "off-balance-sheet vehicles and related-party entities create material contingent obligations" → DEBT_TEXT: `covenant|leverage|interest cover|refinanc|maturity|debt service|debt-service|gearing|solvency|debt load|payables.*due|short-term (debt|facility)` — no match. "Reported profitability is high but has not been verified against underlying cash flow quality" — no DEBT_TEXT match. Governance findings: "CEO resigned abruptly", "Board oversight of related-party transactions under scrutiny", "Accounting complexity far exceeds expectations" — these contain "governance", "audit" (LEGAL_TEXT), "related-party" (borderline). `fin_isLegalGovernanceByText`: checks process_maturity findings. Governance dimension maps to process_maturity. "Board oversight of related-party transactions is under scrutiny; governance structures appear to permit conflicts of interest" → `governance` matches LEGAL_TEXT. "Accounting complexity far exceeds what would be expected from the underlying business; this creates structural opacity that makes the true financial position opaque to external parties" → no LEGAL_TEXT match (governance/audit/fraud not present). "CEO Jeffrey Skilling resigned abruptly" → no LEGAL_TEXT match. Only one LEGAL_TEXT match in process_maturity dimension → `fin_isLegalGovernanceByText` requires either 1 substantive (STRONG_LEGAL_TEXT or ≥2 LEGAL_TEXT_G matches) or 2+ items. The governance finding: "governance structures appear to permit conflicts of interest" → `governance` → 1 LEGAL_TEXT_G match → not substantive. So `fin_isLegalGovernanceByText` may not fire.
- **classification:** ARTIFICIAL
- **defect_class:** DIAGNOSIS_ENGINE_MISS
- **root_cause_detail:**
  Enron is the canonical accounting/governance fraud case. The evidence strongly implies fraud and accounting misconduct but uses circumspect vocabulary ("accounting complexity exceeds expectations", "off-balance-sheet vehicles", "related-party entities", "contingent obligations not transparently disclosed"). `STRONG_LEGAL_TEXT` includes `\bfraud\b|misconduct|investigation|sanction|audit` — "accounting complexity" and "off-balance-sheet" are not in STRONG_LEGAL_TEXT. The finding "accounting complexity far exceeds what would be expected" is clearly an audit/governance signal but doesn't use the word "audit" or "fraud". `fin_isLegalGovernanceByText` requires substantive items; only the "governance structures" finding weakly matches LEGAL_TEXT (1 match, not substantive).
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Constant: `STRONG_LEGAL_TEXT` (~line 776)
  Add: `|off-balance-sheet|related.party.*obligat|accounting.*opacity|opaque.*financial|financial.*opacity|special purpose vehicle|spv.*obligat`
  These terms are unambiguous indicators of accounting manipulation/governance failure. Alternatively, extend LEGAL_TEXT to include `"off-balance-sheet|related-party"` and count these as additional hits for `fin_isLegalGovernanceByText`.

---

### RW_US_IBM_1993_TURNAROUND

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Evidence: finance (losses, cost misalignment), market (disruption from distributed computing), governance (pressure to break up), operations (product-customer gap, organizational complexity). Similar to Apple — strategic turnaround scenario with no matching archetype.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a

---

### RW_US_JCPENNEY_2012_PRICING_FAILURE

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Evidence describes a chain-wide pricing strategy failure (everyday-low-price rollout). No archetype for pricing strategy execution failure. `pricing_power` targets competitive under-pricing (below competitors), not strategic repricing that fails due to customer behavior change.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a

---

### RW_US_SEARS_2018_RETAIL_DECLINE

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Finance findings: "Q1 2018 comp store sales down 11.9%", "Sears Domestic comp down 13.4%", "Company using asset sales and financial transactions to fund operations", "Debt and liquidity pressure limiting available investment". LIQUIDITY_TOPIC: "Debt and liquidity pressure" → contains "liquidity" → topic match. ADVERSE_FRAMING: "limiting" → not in ADVERSE_FRAMING (`/\b(fell|fall\w*|declin\w*|drop\w*|...)` — "limiting" is NOT listed). So `softDistress` fails. "Asset sales to fund operations" → "fund" matches nothing adverse. LIQUIDITY_HARD: no match (no "runway/insolven/cash crunch/out of cash"). DEBT_TEXT: no match on any finance finding.
- **classification:** ARTIFICIAL
- **defect_class:** DIAGNOSIS_ENGINE_MISS (LIQUIDITY_TRIGGER_VOCABULARY_MISMATCH as originally classified)
- **root_cause_detail:**
  "Debt and liquidity pressure limiting available investment" is unambiguous financial distress. The LIQUIDITY_TOPIC matches ("liquidity") but ADVERSE_FRAMING does not include "limiting", "constrain", or "pressure" — these are soft-adverse terms that appear in distress context but are excluded from the ADVERSE_FRAMING regex. This is the P4 defect from the original audit, still unresolved.
- **recommended_fix:**
  File: `src/services/consulting-engine/diagnosis-engine.ts`
  Constant: `ADVERSE_FRAMING` (~line 601)
  Add to the alternation: `|constrain\w*|limiting|under pressure|pressure.*limit`
  OR: Add "liquidity pressure" to `LIQUIDITY_HARD` as a compound phrase: `|liquidity pressure|cash pressure|debt.*pressure(?:.*fund)?` which is unambiguous without requiring the ADVERSE_FRAMING gate.

---

### RW_US_STARBUCKS_2008_TURNAROUND

- **engine_diagnosis:** unknown
- **committed:** false
- **gateAbstain:** true
- **abstention_reason:** Evidence: market (comp-store sales under pressure, brand erosion), operations (expansion cannibalization, quality inconsistency, partner engagement). No financial-distress numerics, no DEBT_TEXT/LIQUIDITY matches. Customer retention language ("declining comparable-store sales") doesn't match `customer_retention_erosion` patterns (requires `churn|attrition|low repeat|NPS`). Brand/quality turnaround with no matching archetype.
- **classification:** LEGITIMATE
- **defect_class:** SCOPE_GAP
- **recommended_fix:** n/a

---

## Full Case Table

| Case ID | dx | committed | gateAbstain | classification | defect_class |
|---------|-----|-----------|-------------|----------------|--------------|
| RW_INDIA_BYJUS_2024_INSOLVENCY | legal_governance_risk | True | True | ARTIFICIAL | CAUSAL_CHALLENGE_OVER_BROAD |
| RW_INDIA_SUZLON_2012_CDR | margin_erosion | True | True | ARTIFICIAL | WIRING_DEFECT |
| RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_INDIA_CCD_2019_DEBT_TURNAROUND | unknown | False | True | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT | unknown | False | True | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY | unknown | False | True | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | unknown | False | True | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE | unknown | False | True | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS | unknown | False | True | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_YES_BANK_2020_MORATORIUM | unknown | False | True | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_US_APPLE_1997_TURNAROUND | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | unknown | False | True | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_US_IBM_1993_TURNAROUND | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_US_JCPENNEY_2012_PRICING_FAILURE | unknown | False | True | LEGITIMATE | SCOPE_GAP |
| RW_US_SEARS_2018_RETAIL_DECLINE | unknown | False | True | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS (LIQUIDITY_TRIGGER_VOCAB_MISMATCH) |
| RW_US_STARBUCKS_2008_TURNAROUND | unknown | False | True | LEGITIMATE | SCOPE_GAP |

---

## Defect Priority Order for P3

| Priority | Defect | Cases | File | Fix |
|----------|--------|-------|------|-----|
| **P3-A** | WIRING_DEFECT: harness passes raw evidence to causal challenge | 1 (SUZLON; may affect future committed cases) | `simulation_runner/run-historical-validation.ts` line ~301 | Pass `engineInput.evidence` (mapped) not `inp.evidence` (raw) to `assessConsultingOutput` |
| **P3-B** | CAUSAL_CHALLENGE_OVER_BROAD: `legal_governance_risk` doesn't subsume `liquidity` domain | 1 (BYJUS) | `src/services/governance/causal-challenge.ts` ~line 333 | Add `"liquidity"` to `legal_governance_risk` in `DIAGNOSIS_SUBSUMES_DOMAIN` |
| **P3-C** | DEBT_SOLVENCY_STRICT_CORROBORATION: corroboration too narrow | 4 (ILFS, JET, RCOM, VODAFONE) | `src/services/consulting-engine/diagnosis-engine.ts` ~line 692-702 | Add `"debt-laden|unable to sustain|obligation.*unpaid|cannot service|solvency.*acute|exceeds.*capacity"` to corroboration alternative; add `asset-liability mismatch|active default` to LIQUIDITY_HARD or DEBT_TEXT |
| **P3-D** | DIAGNOSIS_ENGINE_MISS: key-person/founder-death not firing | 1 (CCD) | `src/services/consulting-engine/diagnosis-engine.ts` | Add `process_maturity` key-person vocabulary to `key_person_risk` pattern OR extend DEBT_TEXT to cover plain high-debt descriptions |
| **P3-E** | DIAGNOSIS_ENGINE_MISS: salary/payroll arrears not in LIQUIDITY_HARD | 1 (KINGFISHER) | `src/services/consulting-engine/diagnosis-engine.ts` ~line 610 | Add `"salary arrears|wage arrears|payroll arrears"` to `LIQUIDITY_HARD` |
| **P3-F** | DIAGNOSIS_ENGINE_MISS: liquidity pressure vocabulary mismatch | 1 (SEARS) | `src/services/consulting-engine/diagnosis-engine.ts` ~line 601 | Add `"constrain\w*|limiting|under pressure"` to ADVERSE_FRAMING or add `"liquidity pressure"` to LIQUIDITY_HARD |
| **P3-G** | DIAGNOSIS_ENGINE_MISS: circumspect accounting/governance vocabulary | 1 (ENRON) | `src/services/consulting-engine/diagnosis-engine.ts` ~line 776 | Add `"off-balance-sheet|related-party.*obligat|accounting.*opaci|special purpose vehicle"` to STRONG_LEGAL_TEXT |
| **P3-H** | DIAGNOSIS_ENGINE_MISS: YES_BANK `fin_isLegalGovernanceByText` not firing | 1 (YES_BANK) | `src/services/consulting-engine/diagnosis-engine.ts` ~line 802 | Investigate and fix `fin_isLegalGovernanceByText` count/substantive logic for banking regulatory-intervention cases |

### Impact if P3 implemented

- P3-A + P3-B: Converts SUZLON and BYJUS from abstain to proceed → +2 proceeded
- P3-C: Converts 4 debt-collapse cases (ILFS, JET, RCOM, VODAFONE) → +4 proceeded (if no causal challenge fires on them)
- P3-D: CCD (key-person + debt) → +1 if both dimensions fixed
- P3-E: Kingfisher → +1
- P3-F: Sears → +1
- P3-G: Enron → +1 (if legal_governance_risk fires)
- P3-H: Yes Bank → +1 (if legal_governance_risk fires)
- **Maximum uplift from P3:** +11 proceeded (from 24 to 35), 7 remaining legitimate abstentions

### Legitimate abstentions that should never be fixed (8 cases)

1. RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION — platform disruption scope gap
2. RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION — platform disruption scope gap
3. RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE — M&A deal-failure scope gap
4. RW_US_APPLE_1997_TURNAROUND — strategic turnaround scope gap
5. RW_US_IBM_1993_TURNAROUND — strategic turnaround scope gap
6. RW_US_JCPENNEY_2012_PRICING_FAILURE — pricing strategy execution scope gap
7. RW_US_STARBUCKS_2008_TURNAROUND — brand/quality turnaround scope gap
8. *(SUZLON is ARTIFICIAL — the engine's margin_erosion diagnosis is wrong and the causal challenge is wrong for the wrong reason; see WIRING_DEFECT note above — SUZLON is genuinely a debt_solvency_pressure case misdiagnosed as margin_erosion)*

### Notes on OPSIQ classification

All 18 abstained cases have `OPSIQ_BETTER` or `OPSIQ_MATCHED` classification (0 OPSIQ_WORSE). The abstentions are safe — they avoid recommending action on cases where the engine cannot commit. P3 fixes would convert OPSIQ_BETTER cases (abstained on NEGATIVE outcomes) and OPSIQ_MATCHED cases into active recommendations, which is only safe if the converted recommendations are accurate and beneficial.

---

## Key New Finding vs Original ABSTENTION_AUDIT_REPORT.md

The original audit did not identify the WIRING_DEFECT (raw evidence passed to causal challenge). This defect causes SUZLON to abstain on an `adverseOffArchetypeEvidence` signal that does not exist in the actual engine context — the EBIT negative-7% finding is a legitimate ON-archetype signal for `margin_erosion` that appears off-archetype only because the harness sends un-mapped dimension strings to the causal challenge.

The original audit classified SUZLON as `LEGITIMATE: WRONG_DIAGNOSIS_CORRECTLY_CHALLENGED` — this classification was incorrect. The causal challenge fires on a wiring bug, not on a genuine diagnosis conflict.
