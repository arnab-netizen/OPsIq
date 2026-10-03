# Owner Threshold Provenance

Status: documentation + governance only. **No threshold value, formula, severity mapping, stale window, danger band,
confidence cutoff, comparator order or numeric output changes.** Registry of record:
`src/domain/owner-spine/threshold-provenance.ts` (metadata only; never imported by production calculations — a test
enforces this). Governance: `src/__tests__/owner-spine/threshold-provenance.test.ts`. Builds on
`OWNER_SCORE_COMPARABILITY_CONTRACT.md` (PR #582).

## 1. Executive statement

OpsIQ thresholds are **not** automatically scientific, statistical or industry-standard. Each one belongs to an
explicit provenance class. The audit result is blunt:

- **No threshold is `EXTERNAL_STANDARD_VERIFIED`, and none is `EXTERNAL_GUIDANCE_ADAPTED`.** External research (section 6)
  found no authoritative source supporting any exact OpsIQ number. The primary documents could not be opened from this
  environment (egress-blocked), so even the directional leads are recorded as **unverified** and are not used to
  classify any threshold.
- Almost every consequential threshold is an `INTERNAL_HEURISTIC` (a deterministic engineering/product choice with no
  recorded source). A handful are deliberate `INTERNAL_PRODUCT_POLICY` choices (status boundaries and safety caps). Industry-template
  overrides are `INDUSTRY_TEMPLATE` with no supported numbers.
- Four records have `LEGACY_OR_UNKNOWN` origin, including the display danger bands and the decision-confidence level
  bands. **Unknown provenance is a result of this audit, not a failure of it.**
- Nothing was tuned. Where the audit finds an inconsistency or an unsupported value it is recorded as a
  `BEHAVIOR_CHANGE_CANDIDATE` (section 9) for a separate, validated decision.

## 2. Provenance vocabulary and families

Classes: `EXTERNAL_STANDARD_VERIFIED`, `EXTERNAL_GUIDANCE_ADAPTED`, `INDUSTRY_TEMPLATE`, `INTERNAL_PRODUCT_POLICY`,
`INTERNAL_HEURISTIC`, `DERIVED_FROM_OTHER_RULE`, `LEGACY_OR_UNKNOWN`. Families: `DIAGNOSIS_TRIGGER`,
`SEVERITY_BOUNDARY`, `DISPLAY_BAND`, `DATA_SUFFICIENCY`, `DATA_QUALITY_PENALTY`, `FRESHNESS`, `DECISION_SAFETY_GATE`,
`PRIORITY_INPUT`, `VERIFICATION_OUTCOME`, `PRODUCT_POLICY_UX`. An industry label in code is never treated as proof that
a number is an industry standard. A number the repo explains only qualitatively (a comment about *why a template
direction makes sense*) is still classified by what is proven about the exact value.

## 3. Inventory matrix

210 registered thresholds. Source of truth: `src/domain/owner-spine/threshold-provenance.ts` (this table is generated from it).

| Provenance class | Count |
|---|---|
| `EXTERNAL_STANDARD_VERIFIED` | 0 |
| `EXTERNAL_GUIDANCE_ADAPTED` | 0 |
| `INDUSTRY_TEMPLATE` | 42 |
| `INTERNAL_PRODUCT_POLICY` | 14 |
| `INTERNAL_HEURISTIC` | 143 |
| `DERIVED_FROM_OTHER_RULE` | 7 |
| `LEGACY_OR_UNKNOWN` | 4 |

### FINANCE

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `FIN.lowCashRunwayDays` | lowCashRunwayDays | 45 | days | cash runway below this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.criticalCashRunwayDays` | criticalCashRunwayDays | 30 | days | Breach of the cash runway cutoff escalates the finance finding to a critical/higher severity or scores the hi… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.insolventCashRunwayDays` | insolventCashRunwayDays | 7 | days | Breach of the cash runway cutoff escalates the finance finding to a critical/higher severity or scores the hi… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highFixedCostBurdenPct` | highFixedCostBurdenPct | 50 | percent | fixed cost burden above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highPayrollBurdenPct` | highPayrollBurdenPct | 40 | percent | payroll burden above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highDebtServicePressurePct` | highDebtServicePressurePct | 25 | percent | debt service pressure above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.criticalDebtServicePressurePct` | criticalDebtServicePressurePct | 50 | percent | Breach of the debt service pressure cutoff escalates the finance finding to a critical/higher severity or sco… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highReceivablesPressurePct` | highReceivablesPressurePct | 30 | percent | receivables pressure above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highPayablesPressurePct` | highPayablesPressurePct | 40 | percent | payables pressure above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highDiscountLeakagePct` | highDiscountLeakagePct | 10 | percent | discount leakage above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highCostLeakageRatioPct` | highCostLeakageRatioPct | 15 | percent | cost leakage ratio above this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.thinNetMarginPct` | thinNetMarginPct | 5 | percent | net margin below this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.healthyNetMarginPct` | healthyNetMarginPct | 15 | percent | net margin below this value fires (or qualifies) a finance finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.highOwnerWithdrawalPressurePct` | highOwnerWithdrawalPressurePct | 50 | percent | DEFINED BUT NOT READ: no finance rule, metric or recommendation references this field (verified by search of … | `LEGACY_OR_UNKNOWN` | Declared in FinanceThresholds and the generic defaults, never read. Cashflow has a same-n… | DEFINED_BUT_UNREFERENCED |
| `FIN.staleSnapshotDays` | staleSnapshotDays | 45 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `FIN.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | negative gross margin <0 critical/95; negative net margin <0 critical/90; below break-even high/80; insolvent… | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `FIN.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | negNet +30, negGross +15, belowBreakEven +20; runway insolvent 30/critical 20/low 10; debt critical 20/high 1… | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.FINANCE_HEALTH_CONFIDENCE_CEILING` | finance health ceiling from data confidence | floor(50 + dataConfidence/2) | points | Finance healthScore can never exceed 50 + dataConfidence/2 (only finance has this ceiling) | `INTERNAL_HEURISTIC` | No origin comment for the 50 base or the 1/2 slope. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.FINANCE_CASHFLOW_BANKBALANCE_FRESH_45` | cashflow bank balance accepted into finance diagnosis | 45 | days | A cashflow snapshot ending within 45 days of the finance snapshot supplies the finance bank balance; older is… | `INTERNAL_HEURISTIC` | Hard-coded literal 45 with no comment tying it to the stale-evidence window. | INVENTORIED_NOT_VALIDATED |
| `FIN.SURVIVAL_STATE_LADDER` | finance survival state classification | INSOLVENT_RISK (insolvent runway, or critical debt with negative net margin) > CRITICAL (negative net margin … | lookup | Maps combinations of the finance runway/debt/margin/leakage signals onto the survival state the action gate r… | `DERIVED_FROM_OTHER_RULE` | Built mechanically from deriveRiskSignals() over the registered finance thresholds; the c… | INVENTORIED_NOT_VALIDATED |
| `FIN.LOW_ABSOLUTE_CASH_14_7_DAYS` | cash below N days of total costs when runway is unknown | fires at <14 days of costs (only when cashRunwayDays is null); critical below 7 | days | Raises FIN_LOW_ABSOLUTE_CASH (high, critical under 7 days) when profitability makes runway unknowable | `INTERNAL_HEURISTIC` | Comment: 'fires when cash < 14 days of total costs, regardless of profitability (plugs th… | INVENTORIED_NOT_VALIDATED |
| `FIN.OPPORTUNITY_RULE_LITERALS` | finance opportunity firing literals | margin opportunity while 0 <= net margin < healthy bar; receivables opportunity when pressure > high bar / 2;… | lookup | Decides whether a finance opportunity finding exists and its low/medium severity | `INTERNAL_HEURISTIC` | The 'half' of the receivables bar is explained by a comment; the 2 / 80 / 100 literals ha… | INVENTORIED_NOT_VALIDATED |
| `FIN.SURVIVAL_STATE_CONFIDENCE_GATE_70` | finance data-confidence gate for the WATCH state | 70 | points | Finance data confidence below 70 contributes to a WATCH survival state (and is mirrored in recommendation con… | `DERIVED_FROM_OTHER_RULE` | Same value as the caution boundary; the code does not import it, so the equality is by co… | INVENTORIED_NOT_VALIDATED |
| `FIN.CONFIDENCE_AND_FRESHNESS_TIERS` | finance confidence tier and freshness tier | confidence: HIGH >=85, MEDIUM >=60, LOW >=30, else BLOCKED; freshness: FRESH <30d, AGING <45d, STALE <90d, CR… | lookup | Labels the finance reading's confidence and age | `INTERNAL_HEURISTIC` | Comments give descriptions of each tier only; no origin for the boundaries. | INVENTORIED_NOT_VALIDATED |
| `FIN.EFFECTIVENESS_LEARNING_CONSTANTS` | bounded effectiveness modifier on action confidence | MIN_SAMPLE 3; MAX_MODIFIER 0.10; Bayesian prior N 5, p 0.50; never applied to critical severity | confidence | Nudges a finance action's confidence by up to ±0.10 from historical outcomes | `INTERNAL_HEURISTIC` | Described as Bayesian shrinkage with a safety rule for critical findings; the numeric con… | INVENTORIED_NOT_VALIDATED |

### FINANCE — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `FIN.laundry_local_service.highFixedCostBurdenPct` | highFixedCostBurdenPct | 55 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `FIN.laundry_local_service.highPayrollBurdenPct` | highPayrollBurdenPct | 45 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `FIN.laundry_local_service.highReceivablesPressurePct` | highReceivablesPressurePct | 20 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `FIN.generic_local_service.highFixedCostBurdenPct` | highFixedCostBurdenPct | 55 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `FIN.generic_local_service.highPayrollBurdenPct` | highPayrollBurdenPct | 45 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `FIN.retail_service_hybrid.highReceivablesPressurePct` | highReceivablesPressurePct | 35 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### CASHFLOW

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `CASH.lowCashRunwayDays` | lowCashRunwayDays | 30 | days | cash runway below this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.criticalCashRunwayDays` | criticalCashRunwayDays | 14 | days | Breach of the cash runway cutoff escalates the cashflow finding to a critical/higher severity or scores the h… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.insolventCashRunwayDays` | insolventCashRunwayDays | 5 | days | Breach of the cash runway cutoff escalates the cashflow finding to a critical/higher severity or scores the h… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highUrgentPaymentRiskPct` | highUrgentPaymentRiskPct | 60 | percent | urgent payment risk above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.criticalUrgentPaymentRiskPct` | criticalUrgentPaymentRiskPct | 100 | percent | Breach of the urgent payment risk cutoff escalates the cashflow finding to a critical/higher severity or scor… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highPayablesPressurePct` | highPayablesPressurePct | 75 | percent | payables pressure above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.criticalPayablesPressurePct` | criticalPayablesPressurePct | 100 | percent | Breach of the payables pressure cutoff escalates the cashflow finding to a critical/higher severity or scores… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highDebtPaymentPressurePct` | highDebtPaymentPressurePct | 40 | percent | debt payment pressure above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highOverdueReceivablesPct` | highOverdueReceivablesPct | 30 | percent | overdue receivables above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highCollectionGapDays` | highCollectionGapDays | 45 | days | collection gap above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.highOwnerWithdrawalPressurePct` | highOwnerWithdrawalPressurePct | 30 | percent | owner withdrawal pressure above this value fires (or qualifies) a cashflow finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.staleSnapshotDays` | staleSnapshotDays | 30 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `CASH.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | insolvent runway critical/100 (urgency 100); runway critical band critical/80, low band high/55; urgent payme… | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `CASH.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | runway insolvent 30/critical 20/low 10; urgent payment critical 25/high 12; payables critical 15/high 8; over… | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |

### CASHFLOW — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `CASH.laundry_local_service.highOverdueReceivablesPct` | highOverdueReceivablesPct | 20 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `CASH.laundry_local_service.highCollectionGapDays` | highCollectionGapDays | 20 | days | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `CASH.generic_local_service.highOverdueReceivablesPct` | highOverdueReceivablesPct | 25 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `CASH.generic_local_service.highCollectionGapDays` | highCollectionGapDays | 30 | days | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `CASH.retail_service_hybrid.highOverdueReceivablesPct` | highOverdueReceivablesPct | 35 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `CASH.retail_service_hybrid.highCollectionGapDays` | highCollectionGapDays | 60 | days | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### SALES

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `SALES.lowConversionPct` | lowConversionPct | 15 | percent | conversion below this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.criticalConversionPct` | criticalConversionPct | 5 | percent | Breach of the conversion cutoff escalates the sales finding to a critical/higher severity or scores the highe… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.healthyConversionPct` | healthyConversionPct | 30 | percent | conversion at/above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.lowQualifiedConversionPct` | lowQualifiedConversionPct | 40 | percent | qualified conversion below this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.weakRepeatRatePct` | weakRepeatRatePct | 25 | percent | repeat rate below this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.criticalRepeatRatePct` | criticalRepeatRatePct | 10 | percent | Breach of the repeat rate cutoff escalates the sales finding to a critical/higher severity or scores the high… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.healthyRepeatRatePct` | healthyRepeatRatePct | 50 | percent | repeat rate at/above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.highLostCustomerRatePct` | highLostCustomerRatePct | 20 | percent | lost customer rate above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.criticalLostCustomerRatePct` | criticalLostCustomerRatePct | 35 | percent | Breach of the lost customer rate cutoff escalates the sales finding to a critical/higher severity or scores t… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.highComplaintToSalePct` | highComplaintToSalePct | 5 | percent | complaint to sale above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.highDiscountDependencePct` | highDiscountDependencePct | 15 | percent | discount dependence above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.highRefundRatePct` | highRefundRatePct | 5 | percent | refund rate above this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.weakB2bPipelineCoveragePct` | weakB2bPipelineCoveragePct | 50 | percent | b2b pipeline coverage below this value fires (or qualifies) a sales finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.staleSnapshotDays` | staleSnapshotDays | 45 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SALES.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | low conversion critical/85\|high/60; poor follow-up medium/50; weak repeat critical/80\|high/60; lost-customer … | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `SALES.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | conversion 25/12, repeat 20/10, lost 20/10 (critical/high); complaint +12, discount +10, refund +8, B2B pipel… | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |

### SALES — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `SALES.laundry_local_service.lowConversionPct` | lowConversionPct | 10 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.laundry_local_service.criticalConversionPct` | criticalConversionPct | 3 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.laundry_local_service.weakRepeatRatePct` | weakRepeatRatePct | 35 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.laundry_local_service.criticalRepeatRatePct` | criticalRepeatRatePct | 15 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.laundry_local_service.healthyRepeatRatePct` | healthyRepeatRatePct | 60 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.generic_local_service.lowConversionPct` | lowConversionPct | 12 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.generic_local_service.weakRepeatRatePct` | weakRepeatRatePct | 30 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.generic_local_service.healthyRepeatRatePct` | healthyRepeatRatePct | 55 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SALES.retail_service_hybrid.weakRepeatRatePct` | weakRepeatRatePct | 30 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### OPERATIONS

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `OPS.lowCompletionRatePct` | lowCompletionRatePct | 85 | percent | completion rate below this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalCompletionRatePct` | criticalCompletionRatePct | 70 | percent | Breach of the completion rate cutoff escalates the operations finding to a critical/higher severity or scores… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.healthyCompletionRatePct` | healthyCompletionRatePct | 95 | percent | completion rate at/above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.highDelayRatePct` | highDelayRatePct | 15 | percent | delay rate above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalDelayRatePct` | criticalDelayRatePct | 30 | percent | Breach of the delay rate cutoff escalates the operations finding to a critical/higher severity or scores the … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.highReworkRatePct` | highReworkRatePct | 5 | percent | rework rate above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalReworkRatePct` | criticalReworkRatePct | 12 | percent | Breach of the rework rate cutoff escalates the operations finding to a critical/higher severity or scores the… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.highComplaintRatePct` | highComplaintRatePct | 5 | percent | complaint rate above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.highCapacityUtilizationPct` | highCapacityUtilizationPct | 90 | percent | capacity utilization above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalCapacityUtilizationPct` | criticalCapacityUtilizationPct | 100 | percent | Breach of the capacity utilization cutoff escalates the operations finding to a critical/higher severity or s… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.lowDeliverySuccessRatePct` | lowDeliverySuccessRatePct | 90 | percent | delivery success rate below this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalDeliverySuccessRatePct` | criticalDeliverySuccessRatePct | 80 | percent | Breach of the delivery success rate cutoff escalates the operations finding to a critical/higher severity or … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.lowSopCompliancePct` | lowSopCompliancePct | 80 | percent | sop compliance below this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.criticalSopCompliancePct` | criticalSopCompliancePct | 60 | percent | Breach of the sop compliance cutoff escalates the operations finding to a critical/higher severity or scores … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.highIdleRatePct` | highIdleRatePct | 20 | percent | idle rate above this value fires (or qualifies) a operations finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.staleSnapshotDays` | staleSnapshotDays | 45 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `OPS.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | capacity bottleneck critical/85\|high/55; low completion critical/80\|high/55; high delay critical/75\|high/50; … | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `OPS.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | completion 25/12, delay 18/9, rework 18/9, capacity 20/10, delivery 15/8, SOP 15/8 (critical/high); complaint… | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |

### OPERATIONS — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `OPS.laundry_local_service.highDelayRatePct` | highDelayRatePct | 10 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.laundry_local_service.criticalDelayRatePct` | criticalDelayRatePct | 20 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.laundry_local_service.highReworkRatePct` | highReworkRatePct | 4 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.laundry_local_service.healthyCompletionRatePct` | healthyCompletionRatePct | 97 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.generic_local_service.highDelayRatePct` | highDelayRatePct | 12 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.generic_local_service.healthyCompletionRatePct` | healthyCompletionRatePct | 96 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `OPS.retail_service_hybrid.highCapacityUtilizationPct` | highCapacityUtilizationPct | 85 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### MARKETING

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `MKT.healthyRoiPct` | healthyRoiPct | 200 | percent | roi at/above this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowRoiPct` | lowRoiPct | 50 | percent | roi below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.criticalRoiPct` | criticalRoiPct | 0 | percent | Breach of the roi cutoff escalates the marketing finding to a critical/higher severity or scores the highest … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowLeadConversionPct` | lowLeadConversionPct | 10 | percent | lead conversion below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.criticalLeadConversionPct` | criticalLeadConversionPct | 3 | percent | Breach of the lead conversion cutoff escalates the marketing finding to a critical/higher severity or scores … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowInquiryConversionPct` | lowInquiryConversionPct | 20 | percent | inquiry conversion below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowReferralRatePct` | lowReferralRatePct | 10 | percent | referral rate below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowCampaignFollowupRatePct` | lowCampaignFollowupRatePct | 70 | percent | campaign followup rate below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.criticalCampaignFollowupRatePct` | criticalCampaignFollowupRatePct | 40 | percent | Breach of the campaign followup rate cutoff escalates the marketing finding to a critical/higher severity or … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.lowOrganicSharePct` | lowOrganicSharePct | 30 | percent | organic share below this value fires (or qualifies) a marketing finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.staleSnapshotDays` | staleSnapshotDays | 45 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `MKT.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | wasted spend critical/85\|high/55; poor conversion critical/80\|high/55; weak offer medium/45; wrong channel mi… | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `MKT.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | ROI 25/12, lead conversion 18/9, follow-up 15/8; inquiry +8, referral +8, paid-reliant +8 | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |

### MARKETING — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `MKT.laundry_local_service.lowReferralRatePct` | lowReferralRatePct | 15 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `MKT.laundry_local_service.healthyRoiPct` | healthyRoiPct | 250 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `MKT.generic_local_service.lowReferralRatePct` | lowReferralRatePct | 12 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `MKT.retail_service_hybrid.lowLeadConversionPct` | lowLeadConversionPct | 8 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### SOP

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `SOP.lowCompletionRatePct` | lowCompletionRatePct | 85 | percent | completion rate below this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.criticalCompletionRatePct` | criticalCompletionRatePct | 65 | percent | Breach of the completion rate cutoff escalates the sop finding to a critical/higher severity or scores the hi… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.healthyCompletionRatePct` | healthyCompletionRatePct | 95 | percent | completion rate at/above this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.lowVerificationRatePct` | lowVerificationRatePct | 70 | percent | verification rate below this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.criticalVerificationRatePct` | criticalVerificationRatePct | 50 | percent | Breach of the verification rate cutoff escalates the sop finding to a critical/higher severity or scores the … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.highOverdueRatePct` | highOverdueRatePct | 15 | percent | overdue rate above this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.criticalOverdueRatePct` | criticalOverdueRatePct | 30 | percent | Breach of the overdue rate cutoff escalates the sop finding to a critical/higher severity or scores the highe… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.highDisputeRatePct` | highDisputeRatePct | 10 | percent | dispute rate above this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.highReassignmentRatePct` | highReassignmentRatePct | 20 | percent | reassignment rate above this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.highRepeatedFailureRatePct` | highRepeatedFailureRatePct | 10 | percent | repeated failure rate above this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.criticalRepeatedFailureRatePct` | criticalRepeatedFailureRatePct | 25 | percent | Breach of the repeated failure rate cutoff escalates the sop finding to a critical/higher severity or scores … | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.lowProofCompliancePct` | lowProofCompliancePct | 80 | percent | proof compliance below this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.lowSopCoveragePct` | lowSopCoveragePct | 70 | percent | sop coverage below this value fires (or qualifies) a sop finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.criticalSopCoveragePct` | criticalSopCoveragePct | 40 | percent | Breach of the sop coverage cutoff escalates the sop finding to a critical/higher severity or scores the highe… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.staleSnapshotDays` | staleSnapshotDays | 45 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `SOP.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | low completion critical/80\|high/55; low verification high/60\|medium/45; high overdue critical/70\|high/50; rep… | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `SOP.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | completion 22/11, verification 15/8, overdue 18/9, repeated failure 18/9, SOP coverage 14/7 (critical/high); … | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |

### SOP — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `SOP.laundry_local_service.lowCompletionRatePct` | lowCompletionRatePct | 90 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SOP.laundry_local_service.healthyCompletionRatePct` | healthyCompletionRatePct | 97 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SOP.laundry_local_service.lowSopCoveragePct` | lowSopCoveragePct | 80 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SOP.generic_local_service.healthyCompletionRatePct` | healthyCompletionRatePct | 96 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `SOP.retail_service_hybrid.lowVerificationRatePct` | lowVerificationRatePct | 75 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### STRATEGY

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `STRAT.strongRoiPct` | strongRoiPct | 100 | percent | roi at/above this value fires (or qualifies) a strategy finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.lowRoiPct` | lowRoiPct | 20 | percent | roi below this value fires (or qualifies) a strategy finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.criticalRoiPct` | criticalRoiPct | 0 | percent | Breach of the roi cutoff escalates the strategy finding to a critical/higher severity or scores the highest r… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.longPaybackMonths` | longPaybackMonths | 18 | months | payback above this value fires (or qualifies) a strategy finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.criticalPaybackMonths` | criticalPaybackMonths | 36 | months | Breach of the payback cutoff escalates the strategy finding to a critical/higher severity or scores the highe… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.minAffordabilityRatio` | minAffordabilityRatio | 1 | ratio | affordability below this value fires (or qualifies) a strategy finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.criticalAffordabilityRatio` | criticalAffordabilityRatio | 0.5 | ratio | Breach of the affordability cutoff escalates the strategy finding to a critical/higher severity or scores the… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.lowReserveRatio` | lowReserveRatio | 0.1 | ratio | reserve below this value fires (or qualifies) a strategy finding or label | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.staleSnapshotDays` | staleSnapshotDays | 60 | days | Evidence older than this many days takes the data-confidence staleness deduction (-15) in this domain's snaps… | `INTERNAL_HEURISTIC` | thresholds.ts describes these only as 'Generic defaults that work for any owner-operated … | INVENTORIED_NOT_VALIDATED |
| `STRAT.RULE_SEVERITY_IMPACT_LADDER` | per-rule severity and impact constants (risk rules) | missing cash high/45; missing risk level medium/35; negative base case (<=0) critical/85; negative ROI critic… | lookup | Each risk rule hard-sets the severity (and impact) of the finding it raises; the ladder decides which finding… | `INTERNAL_HEURISTIC` | Per-rule constants in risk-rules.ts with no recorded source; no in-repo comment or doc ex… | INVENTORIED_NOT_VALIDATED |
| `STRAT.RISK_SCORE_POINT_TABLE` | additive point table behind the domain risk score | base by risk level low 20/medium 45/high 70 (50 if missing); criticalRoi +20, negative worst case +10, paybac… | points | Points added to the domain riskScore when each registered threshold band is crossed (the risk score feeds dan… | `INTERNAL_HEURISTIC` | No origin comment for the point weights; the repo describes the scores as uncalibrated de… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.DATA_CONFIDENCE_STRATEGY_CASH_AFFORDABILITY_25` | extra deduction when an investment is stated without cash available | 25 | points | Strategy only: investmentRequired > 0 with no cashAvailable deducts 25 (plus the 5 for the missing field = 30… | `INTERNAL_HEURISTIC` | Function comment: 'Cash is critical once a positive investment is required… (5 above + 25… | INVENTORIED_NOT_VALIDATED |
| `STRAT.RISK_LEVEL_BASE_SCORE` | baseline option-risk contribution by qualitative risk level | low 20; medium 45; high 70 | score | Starting point of strategyRiskScore before ROI/payback/affordability points | `INTERNAL_HEURISTIC` | Comment: 'Baseline option-risk contribution by qualitative risk level.' No source. | INVENTORIED_NOT_VALIDATED |
| `STRAT.RISK_LEVEL_SPREAD` | downside/upside spread by qualitative risk level | low 0.2; medium 0.4; high 0.6 | ratio | Spread applied to the revenue change to build the downside/upside scenarios | `INTERNAL_HEURISTIC` | Comment: 'Downside/upside spread applied to the revenue change by qualitative risk level.… | INVENTORIED_NOT_VALIDATED |

### STRATEGY — industry templates

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `STRAT.laundry_local_service.longPaybackMonths` | longPaybackMonths | 12 | months | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `STRAT.laundry_local_service.criticalPaybackMonths` | criticalPaybackMonths | 24 | months | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `STRAT.laundry_local_service.strongRoiPct` | strongRoiPct | 120 | percent | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `STRAT.generic_local_service.longPaybackMonths` | longPaybackMonths | 15 | months | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |
| `STRAT.retail_service_hybrid.criticalPaybackMonths` | criticalPaybackMonths | 30 | months | Replaces the generic default for businesses mapped to this industry template | `INDUSTRY_TEMPLATE` | A code comment gives a qualitative rationale for the template direction (e.g. cash-and-ca… | INVENTORIED_NOT_VALIDATED |

### OWNER_HOME

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.DANGER_BANDS_20_40_60_80` | risk score → danger level | <20 none; <40 low; <60 elevated; <80 high; >=80 critical; null unknown | score | Bands a 0-100 domain risk score into the owner-facing danger level shown on the home danger cards, for every … | `LEGACY_OR_UNKNOWN` | Only the comment 'Band a domain risk score (or null) into a danger level. Null → unknown.… | NEEDS_PRODUCT_DECISION |
| `GLOBAL.SEVERITY_TO_DANGER_LEVEL` | finding severity → danger level | critical→critical; high→high; medium→elevated; low→low | lookup | Used for the Finance cash danger card when a finding's severity (not a score) drives the level | `INTERNAL_HEURISTIC` | Comment: 'Severity-only level (a finding's severity, when no score applies).' No source f… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.SURVIVAL_STATE_TO_DANGER_LEVEL` | finance survival state → danger level | SAFE→none; WATCH→low; AT_RISK→elevated; CRITICAL→high; INSOLVENT_RISK→critical | lookup | An in-progress period's survival state can tighten (never soften) a danger card | `INTERNAL_HEURISTIC` | No origin comment beyond the 'only ever tightens' behavior note; mapping is positional (o… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.STALE_EVIDENCE_DAYS_45` | owner-decision evidence staleness window | 45 | days | A domain whose period ended more than 45 days ago (or whose snapshot is superseded) is stale: its candidates … | `INTERNAL_PRODUCT_POLICY` | Comment: 'Evidence older than this is flagged stale (same window as the Business Conditio… | NEEDS_PRODUCT_DECISION |
| `GLOBAL.COMPLIANCE_PROVENANCE_CONFIDENCE` | compliance candidate confidence by evidence provenance | authoritative_document 1; professional_input 0.85; owner_input 0.7; unstated 0.6 | confidence | Confidence carried by a compliance candidate in the canonical comparator | `INTERNAL_HEURISTIC` | Comment: 'Evidence strength from the item's recorded provenance (never a constant).' The … | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.OWNER_RECORDED_RISK_CONFIDENCE_0_6` | confidence of an owner-recorded business risk | 0.6 | confidence | Fixed evidence strength of an owner-recorded (not measured) risk candidate | `INTERNAL_PRODUCT_POLICY` | Comment: an owner-recorded risk is an owner assessment, not measured data, so its evidenc… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.CRITICAL_RISK_SEVERITY_75` | owner-recorded risk eligibility | 75 | score | An owner-recorded risk competes for the owner's #1 target only if its severity (or residual risk when mitigat… | `INTERNAL_HEURISTIC` | Comment: 'Same critical threshold the risk service uses to raise a critical alert (busine… | INVENTORIED_NOT_VALIDATED |

### OWNER_SPINE

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.DATA_CONFIDENCE_CAUTION_70` | lowest domain dataConfidenceScore → 'caution' | 70 | points | Lowest domain data confidence below 70 sets dataSufficiencyStatus 'caution' and lists the domain in lowConfid… | `INTERNAL_PRODUCT_POLICY` | Comment: 'Slice 1 — data-confidence thresholds for the command-center sufficiency status.… | NEEDS_PRODUCT_DECISION |
| `GLOBAL.DATA_CONFIDENCE_INSUFFICIENT_40` | lowest domain dataConfidenceScore → 'insufficient' | 40 | points | Lowest domain data confidence below 40 (or any missing critical data) sets dataSufficiencyStatus 'insufficien… | `INTERNAL_PRODUCT_POLICY` | Same slice comment as the 70 boundary; no rationale for the number is recorded. | NEEDS_PRODUCT_DECISION |
| `GLOBAL.OD_CONFIDENCE_CAP_CAUTION_70` | decision confidence cap under 'caution' | 70 | points | Hard-coded literal 70 caps the primary decision's confidence score when business-wide sufficiency is 'caution' | `DERIVED_FROM_OTHER_RULE` | Equals DATA_CONFIDENCE_CAUTION but is a separate literal (not imported); the equality is … | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.OD_CONFIDENCE_CAP_INSUFFICIENT_40` | decision confidence cap under 'insufficient' | 40 | points | Hard-coded literal 40 caps the primary decision's confidence score when business-wide sufficiency is 'insuffi… | `DERIVED_FROM_OTHER_RULE` | Equals DATA_CONFIDENCE_INSUFFICIENT but is a separate literal (not imported). | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.DECISION_CONFIDENCE_LEVEL_BANDS` | decision confidence score → level label | >=75 high; >=50 moderate; >=25 low; else insufficient | score | Converts the (capped) 0-100 decision confidence into the High/Moderate/Low/Very low label the owner sees | `LEGACY_OR_UNKNOWN` | No comment on the function and no doc states the 75/50/25 values or their origin. | NEEDS_PRODUCT_DECISION |
| `GLOBAL.WHAT_CHANGED_WINDOW_DAYS_14` | 'what changed' lookback window | 14 | days | Only events/transitions within the last 14 days appear in 'what changed' | `INTERNAL_PRODUCT_POLICY` | Comment: 'Recent-change window for what changed (days).' No rationale or doc states 14. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.SEVERITY_URGENCY_BOOST` | severity boost inside priorityScore's urgency factor | low 0; medium 0.1; high 0.25; critical 0.5 | ratio | Adds to the urgency factor (0.5 + urgency/100 + boost) of calculateOwnerPriorityScore | `INTERNAL_HEURISTIC` | Comment: 'Severity → extra urgency weight (critical raises priority).' No source. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.PRIORITY_FACTOR_CONSTANTS` | priorityScore factor constants | urgencyFactor 0.5 + urgency/100 + boost; effortFactor 1 − 0.6·effort/100; survivalFactor 1 + 0.5·survival/100 | ratio | Weights of the priority product (formula unchanged by this registry) | `INTERNAL_HEURISTIC` | Formula is documented in the function comment; the 0.5 / 0.6 / 0.5 constants have no reco… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.REFRESH_CONFIDENCE_CAP_0_4` | confidence cap on an evidence-refresh target | 0.4 | confidence | A refresh target synthesized for out-of-date figures carries at most 0.4 confidence ('low') | `INTERNAL_PRODUCT_POLICY` | Comment: 'Out-of-date figures never carry more than low confidence (below the moderate th… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.UNKNOWN_BLOCKER_CONFIDENCE_0_4` | gate-blocker confidence when the underlying reading has no numeric confidence | 0.4 | confidence | A safety-gate blocker target whose cash/margin/capacity reading has no numeric confidence carries 0.4 | `INTERNAL_PRODUCT_POLICY` | Comment: 'unknown: never high (UNKNOWN_BLOCKER_CONFIDENCE).' | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.UNVERIFIED_GATE_CONFIDENCE_0_4` | cap on unverified/provisional cash-finance reading confidence | 0.4 | confidence | A cash/finance reading that is unverified, stale, amended or provisional is capped at 0.4 | `INTERNAL_PRODUCT_POLICY` | Documented in OWNER_DECISION_CONSOLIDATION_PROOF.md:221 (Decision 4) without a reason for… | INVENTORIED_NOT_VALIDATED |

### DATA_QUALITY

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.DATA_CONFIDENCE_MISSING_CRITICAL_30` | points deducted per missing critical input | 30 | points | Each missing critical input lowers the domain dataConfidenceScore by 30 (same in finance, cashflow, sales, ma… | `INTERNAL_HEURISTIC` | Documented only in the function comment ('reduced by: 30 per missing critical input…'); n… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.DATA_CONFIDENCE_MISSING_IMPORTANT_5` | points deducted per missing important numeric field | 5 (marketing 4) | points | Each missing important field lowers dataConfidenceScore by 5 in every domain except marketing, which deducts 4 | `INTERNAL_HEURISTIC` | No rationale for 5 or for marketing's 4. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.DATA_CONFIDENCE_INVALID_CURRENCY_10` | points deducted for an invalid currency | 10 | points | An invalid or missing reporting currency lowers dataConfidenceScore by 10 | `INTERNAL_HEURISTIC` | No rationale recorded. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.DATA_CONFIDENCE_STALE_15` | points deducted when the snapshot is stale | 15 | points | A snapshot whose period ended more than the domain's staleSnapshotDays ago lowers dataConfidenceScore by 15 | `INTERNAL_HEURISTIC` | docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:590 repeats '-15 if the snapshot is stale … | INVENTORIED_NOT_VALIDATED |

### RECOVERY

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.DATA_CONFIDENCE_RECOVERY_MISSING_30` | recovery data confidence = 100 − 30 per missing revenue/cost/order input | 30 | points | Recovery's dataConfidenceScore loses 30 for each missing core metric | `INTERNAL_HEURISTIC` | Comment says these are 'documented mappings of real recovery fields — nothing is invented… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.RECOVERY_PRIORITY_SCORE_90_70_45_20` | recovery action priority/impact from severity | critical 90; high 70; medium 45; low 20; default 40 (also duplicated in business-condition.service.ts) | score | Recovery candidates' priorityScore and expectedImpactScore | `INTERNAL_HEURISTIC` | Comment: 'documented mappings of real recovery fields — nothing is invented'. OWNER_DECIS… | NEEDS_PRODUCT_DECISION |
| `GLOBAL.RECOVERY_EFFORT_SCORE_75_50_25` | recovery action effort | high 75; medium 50; low 25; default 50 | score | Recovery candidates' effortScore (lower effort wins the last numeric tie-break) | `INTERNAL_HEURISTIC` | Same comment as the priority table; no source. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.RECOVERY_HEALTH_STATUS_RISK_85_55_20` | recovery health status → riskScore | critical 85; at_risk 55; healthy 20; fallback 100 − healthScore | score | Recovery's DomainScore riskScore, which feeds survivalRiskScore (max within survival domains) | `INTERNAL_HEURISTIC` | Described as a documented mapping of real recovery fields; no origin for 85/55/20. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.BAND_THRESHOLDS` | recovery diagnosis medium/high/critical bands | grossMarginPct 35/25/15 (unused); netMarginPct 10/5/0; repeatCustomerRatePct 40/30/20; discountLeakagePct 8/1… | percent | Maps each recovery metric to a medium/high/critical finding severity (inclusive boundaries) | `INTERNAL_HEURISTIC` | File header: 'explicit, documented operating thresholds — not fabricated reliability scor… | NEEDS_PRODUCT_DECISION |
| `RECOVERY.CASH_PRESSURE` | recovery cash-pressure level | receivables exposure >=30 → +2, >=15 → +1; net margin <5 → +1 (<0 → +2); score >=3 high, >=1 medium, else low | points | Sets the recovery cash-pressure level | `INTERNAL_HEURISTIC` | No origin comment. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.DECLINE_LITERALS` | staff-productivity and average-order-value decline findings | staff productivity: drop <= -10% (high at <= -25%); AOV: drop <= -8% (high at <= -20%); both need a previous … | percent | Raises the finding and sets medium/high severity | `INTERNAL_HEURISTIC` | Hard-coded literals outside RECOVERY_THRESHOLDS; no source. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.FINDING_CONFIDENCE_CONSTANTS` | fixed confidence per recovery finding | 0.9 low revenue/high cost ratio; 0.85 weak repeat/discount/receivables; 0.8 quality/delivery/B2B; 0.75 turnar… | confidence | Confidence carried by each recovery finding and its action | `INTERNAL_HEURISTIC` | Fixed constants; recovery has no data-driven confidence; not calibrated. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.HEALTH_FROM_FINDINGS` | recovery health score and status | health = max(0, 100 − (critical 40, high 20, medium 8, low 3 per finding)); status critical if any critical f… | points | Sets recovery healthScore and the status that maps to recovery riskScore (85/55/20) | `INTERNAL_HEURISTIC` | No origin comment. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.ACTION_TIMEFRAME_DAYS` | recovery action timeframe by priority and per-template window | critical 3d, high 7d, medium 14d, low 21d; template windows 14/21/30/60 days | days | Sets the expected timeframe shown for a recovery action | `INTERNAL_HEURISTIC` | No origin comment. | INVENTORIED_NOT_VALIDATED |
| `RECOVERY.SNAPSHOT_STALE_WARNING_45` | recovery snapshot staleness warning | 45 | days | Adds the warning 'Reporting period is stale (>45 days old)' when a recovery snapshot is saved; recovery's age… | `DERIVED_FROM_OTHER_RULE` | Same value as the owner evidence window (separate literal, maxAgeDays default). | INVENTORIED_NOT_VALIDATED |

### OWNER_MODE

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.CAPACITY_RECORD_FRESH_DAYS_45` | recorded equipment-state freshness | 45 | days | Equipment state updated within 45 days gives the capacity block confidence 0.9; older or undated gives 0.4 | `DERIVED_FROM_OTHER_RULE` | Comment: 'Freshness window for recorded equipment state (the Owner evidence window).' Als… | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.COMPLIANCE_EXPIRING_SOON_30` | compliance 'expiring soon' default window | 30 | days | Default window for flagging a compliance item as expiring soon (used by the compliance service, not the actio… | `INTERNAL_HEURISTIC` | Default argument only; no comment or doc. | INVENTORIED_NOT_VALIDATED |
| `GLOBAL.OUT_OF_DATE_EVIDENCE_CONFIDENCE_0_4` | confidence cap for out-of-date or undated gate evidence | 0.4 | confidence | Capacity/margin evidence that is out of date or undated carries 0.4 confidence | `DERIVED_FROM_OTHER_RULE` | Comment: 'the same cap as unverified cash/finance readings'. | INVENTORIED_NOT_VALIDATED |
| `GATE.EQUIPMENT_UTILIZATION_0_85_0_95` | equipment utilization → capacity status | utilization >= 0.95 → high_risk; >= 0.85 → caution; down/out of service/maintenance due → blocked; null → cau… | ratio | A high_risk/blocked status blocks capacity-consuming actions | `INTERNAL_HEURISTIC` | Only the 'Jarvis 360 Slice 7' docblock; no source for 0.85/0.95. The Federal Reserve G.17… | INVENTORIED_NOT_VALIDATED |
| `VERIFY.OUTCOME_BOUNDARIES` | improved / not-improved / inconclusive decision | no numeric tolerance: strict comparison against baseline/target in the given direction; missing baseline or a… | lookup | Decides verified_improved / verified_not_improved / inconclusive | `INTERNAL_PRODUCT_POLICY` | No percentage band exists; the rule is purely comparative and stated in the function comm… | INVENTORIED_NOT_VALIDATED |

### DOMAIN_RULES

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.SEVERITY_URGENCY_DEFAULT_20_45_70_90` | default finding urgency from severity | low 20; medium 45; high 70; critical 90 (identical table in every domain's risk-rules) | score | Urgency assigned to a finding when its rule does not hard-set one; feeds priorityScore | `INTERNAL_HEURISTIC` | No origin comment; the same table is repeated per domain. | INVENTORIED_NOT_VALIDATED |
| `DOMAIN.STATE_LABEL_CONFIDENCE_GATE_50` | data-confidence gate for the domain state label | dataConfidence < 50 → WATCH (cashflow), SOFT (sales), STRAINED (operations), FLAT (marketing), SLIPPING (SOP)… | points | Low data confidence forces the cautious state label in each non-finance domain | `INTERNAL_HEURISTIC` | Hard-coded literal 50 per domain; differs from the 70/40 sufficiency boundaries; no sourc… | INVENTORIED_NOT_VALIDATED |

### OWNER_CONDITION

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GLOBAL.REASSESSMENT_CADENCE_70_40_7_14_30` | adaptive review cadence | max(survival,execution) >=70 → 7d; insufficient data → 7d; >=40 → 14d; caution & <40 → 14d; not both measured… | days | Sets how soon the next business reassessment is due | `INTERNAL_HEURISTIC` | CLAUDE.md mandates an adaptive review cadence but gives no numbers. The docblock says the… | NEEDS_PRODUCT_DECISION |

### PORTFOLIO

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `PORT.survivalRiskAlertScore` | portfolio survival-risk alert | 70 | score | A business with survivalRiskScore >= 70 raises a portfolio survival-risk alert | `INTERNAL_HEURISTIC` | Comment only states the purpose; no origin. | INVENTORIED_NOT_VALIDATED |
| `PORT.cashRiskAlertScore` | portfolio cash-risk alert | 70 | score | A business whose cashflow-domain riskScore >= 70 raises a cash-risk alert | `INTERNAL_HEURISTIC` | Comment only states the purpose; no origin. | INVENTORIED_NOT_VALIDATED |
| `PORT.executionRiskAlertScore` | portfolio execution-risk alert | 70 | score | A business with executionRiskScore >= 70 raises an execution-risk alert | `INTERNAL_HEURISTIC` | Comment only states the purpose; no origin. | INVENTORIED_NOT_VALIDATED |
| `PORT.safeInvestmentSurvivalRiskBar` | 'safe to invest in' survival-risk bar | 50 | score | Only businesses with measured survivalRiskScore below 50 are eligible as 'best growth candidate' / investment… | `INTERNAL_PRODUCT_POLICY` | Comment: 'A business is safe to invest in only when survival risk is below this.' A delib… | INVENTORIED_NOT_VALIDATED |
| `PORT.minInvestmentOpportunityScore` | minimum growth opportunity for an investment recommendation | 40 | score | An investment recommendation requires growthOpportunityScore >= 40 (that score is a raw cross-domain max; see… | `INTERNAL_HEURISTIC` | Comment only states the purpose. | INVENTORIED_NOT_VALIDATED |

### OWNER_FINANCE

| ID | Threshold | Value | Unit | Effect | Provenance | Evidence in repo | Status |
|---|---|---|---|---|---|---|---|
| `GATE.CASH_UNSAFE_FOR_GROWTH_AT_RISK` | cash safety: growth blocked from survival state | survival severity >= 2 (AT_RISK) | lookup | Growth-sensitive actions are blocked when the finance survival state is AT_RISK or worse | `INTERNAL_PRODUCT_POLICY` | A deliberate safety policy documented in the module and the owner-action-gate docblock; s… | INVENTORIED_NOT_VALIDATED |
| `GATE.CASH_UNSAFE_FOR_SPEND_CRITICAL` | cash safety: finance/pricing/hiring blocked from survival state | survival severity >= 3 (CRITICAL) | lookup | Finance-, pricing- and hiring-sensitive actions are blocked at CRITICAL or worse | `INTERNAL_PRODUCT_POLICY` | Same safety-policy family as GATE.CASH_UNSAFE_FOR_GROWTH_AT_RISK (state ladder SAFE 0 .. … | INVENTORIED_NOT_VALIDATED |
| `GATE.CASH_EXISTENTIAL_INSOLVENT` | cash safety: general actions blocked from survival state | survival severity >= 4 (INSOLVENT_RISK) | lookup | General (non-protective) actions are blocked only at INSOLVENT_RISK; compliance-sensitive actions are always … | `INTERNAL_PRODUCT_POLICY` | Same safety-policy family as GATE.CASH_UNSAFE_FOR_GROWTH_AT_RISK (state ladder SAFE 0 .. … | INVENTORIED_NOT_VALIDATED |
| `GATE.MARGIN_FLOOR_15` | pricing-sensitive work blocked below a known gross margin | 15 | percent | Pricing/margin-sensitive actions are blocked when a KNOWN gross margin is below 15%; an unknown margin is not… | `INTERNAL_PRODUCT_POLICY` | Comment: 'below the default safety floor (15%)'. No source. Numerically equals finance he… | INVENTORIED_NOT_VALIDATED |
| `GATE.CASH_RUNWAY_30_60_90_UNREFERENCED` | simplified runway gate (checkCashSafetyGate) | runway <=30d CRITICAL; <=60d AT_RISK; <=90d WATCH; else SAFE | days | No production behavior: the function is not called from non-test code (verified by search) | `LEGACY_OR_UNKNOWN` | Docblock 'Simplified cash-runway gate for high-level decision checks'; no callers. A thir… | DEFINED_BUT_UNREFERENCED |


## 4. Known global thresholds

### 4.1 Danger bands (`GLOBAL.DANGER_BANDS_20_40_60_80`)

`dangerLevel(riskScore)` in `src/domain/owner-home/summary.ts`: `<20` none, `<40` low, `<60` elevated, `<80` high,
`>=80` critical, `null` unknown. It converts **every** domain's 0-100 risk score into the same five words on the home
danger cards. **Provenance not found:** the only comment is a one-line description; no document explains the
values; the clone history is shallow so authorship cannot be recovered; and no external standard defining these bands
was found (NIST SP 800-30's illustrative bands, unverified, are 0-4/5-20/21-79/80-95/96-100 and the standard calls them
examples). Classification: `LEGACY_OR_UNKNOWN`, `NEEDS_PRODUCT_DECISION`. Unchanged. This is PR #582 finding 4.

### 4.2 Data confidence

`DATA_CONFIDENCE_CAUTION = 70` and `DATA_CONFIDENCE_INSUFFICIENT = 40` (`contracts.ts`): the lowest domain
`dataConfidenceScore` below 70 gives status `caution`, below 40 (or any missing critical data) `insufficient`; the
primary decision's displayed confidence is capped at 70 / 40 through two separate hard-coded literals in
`owner-decision.ts`. Classification: `INTERNAL_PRODUCT_POLICY` (low confidence): a deliberate status boundary of a named
slice ("Slice 1 — data-confidence thresholds for the command-center sufficiency status") with **no recorded rationale
for the numbers**. ISO/IEC 25012 defines completeness but sets no numeric threshold (unverified lead). A separate
literal `< 50` gates the cautious state label in six non-finance domains, and finance uses `< 70`; both are unregistered
conventions (`DOMAIN.STATE_LABEL_CONFIDENCE_GATE_50`, `FIN.SURVIVAL_STATE_CONFIDENCE_GATE_70`).

The data-quality deductions (30 per missing critical input, 5 (marketing 4) per missing important field, 10 invalid
currency, 15 stale, strategy +25 cash and +5 risk level, recovery 100−30×missing) are `INTERNAL_HEURISTIC`.

### 4.3 Severity mappings

| Mapping | Where | Classification |
|---|---|---|
| severity → default urgency 20/45/70/90 | every domain's `risk-rules.ts` (`SEVERITY_URGENCY`) | `INTERNAL_HEURISTIC` |
| severity → priority boost 0/0.1/0.25/0.5 | `contracts.ts#SEVERITY_URGENCY_BOOST` | `INTERNAL_HEURISTIC` |
| severity → danger word (critical→critical, high→high, medium→elevated, low→low) | `summary.ts#SEVERITY_LEVEL` | `INTERNAL_HEURISTIC` |
| finance survival state → danger word | `summary.ts#SURVIVAL_STATE_LEVEL` | `INTERNAL_HEURISTIC` |
| per-rule severity/impact constants | each domain's `risk-rules.ts` | `INTERNAL_HEURISTIC` (one ladder record per domain) |
| risk-score point tables | each domain's `metrics.ts` | `INTERNAL_HEURISTIC` (one record per domain) |

### 4.4 Freshness / staleness windows

Two independent notions of "stale" exist and they do not use the same numbers:

| Window | Value | Unit | Where | Effect |
|---|---|---|---|---|
| Finance `staleSnapshotDays` | 45 | days | `owner-finance/thresholds.ts` | −15 data confidence only |
| Cashflow `staleSnapshotDays` | 30 | days | `owner-cashflow/thresholds.ts` | −15 data confidence only |
| Sales / Operations / Marketing / SOP `staleSnapshotDays` | 45 | days | each `thresholds.ts` | −15 data confidence only |
| Strategy `staleSnapshotDays` | 60 | days | `owner-strategy/thresholds.ts` | −15 data confidence; decision note |
| Owner-decision stale evidence | 45 | days | `owner-decision-candidates.ts` | Evidence flagged stale: refresh target replaces advice; "what changed" suppressed; sufficiency downgraded. Strategy never stale |
| Capacity record freshness | 45 | days | `owner-action-gate-policy.ts` | Gate confidence 0.9 vs 0.4 |
| Finance reads cashflow bank balance | 45 | days | `owner-finance/diagnosis.service.ts` | Balance ignored when older |
| Recovery snapshot warning | 45 | days | `founder-recovery/validation.ts` | Warning text only |
| "What changed" window | 14 | days | `owner-decision.ts` | Lookback |
| Finance freshness tiers | 30 / 45 / 90 | days | `owner-finance/data-confidence.ts` | Label only |

The per-domain windows only reduce confidence; the owner-decision window changes eligibility and does not follow the
per-domain values (cashflow 30 vs 45; strategy 60 vs never stale). Time unit is days throughout.

## 5. Domain thresholds

All seven domains share one structure: `GENERIC_*_THRESHOLDS` (generic defaults, described in the file only as
"Generic defaults that work for any owner-operated business") plus `INDUSTRY_*_THRESHOLDS` overrides, resolved by
`resolve*Thresholds(industryTemplate)`. Every generic field is registered with its exact value (matrix above), as
`INTERNAL_HEURISTIC`. Recovery has its own band table (`RECOVERY.BAND_THRESHOLDS`), cash-pressure rule, decline
literals, health penalties and fixed confidences, all `INTERNAL_HEURISTIC`. Domain risk rules also carry per-rule
severity/impact constants and additive risk-score point tables not in `thresholds.ts`; they are registered per domain.

Notable observations (not changed):

- `FIN.highOwnerWithdrawalPressurePct` (50) is **defined but never read** by any finance rule, metric or recommendation.
- `checkCashSafetyGate` (runway ≤30/60/90 days) has **no production caller**; there are three different runway scales
  (finance 45/30/7, cashflow 30/14/5, and this unreferenced one).
- Finance's `FIN_LOW_ABSOLUTE_CASH` uses separate literals (14 and 7 days of costs) alongside the registered runway fields.
- `RECOVERY_THRESHOLDS.grossMarginPct` is defined but unused by `generateFindings`.
- The margin safety floor (`GATE.MARGIN_FLOOR_15`, gross margin) equals finance `healthyNetMarginPct` (15, net margin) only
  numerically; no link between them is stated and none is claimed.
- The finding summaries "below the healthy bar" / "below the safe threshold" (finance, sales and others) name OpsIQ's own
  cutoffs and do not claim an external standard; they are noted as ambiguous wording, not changed.

### Industry templates

Templates: `laundry_local_service`, `generic_local_service`, `retail_service_hybrid` (42 override values across the seven
domains, all registered as `INDUSTRY_TEMPLATE` with `industryValueSupport: INTERNAL_HEURISTIC`). Fallback: an unknown or
absent template uses the generic defaults. How a template is chosen: it is the snapshot's own `industryTemplate` field
(owner-supplied, validated as a string, no UI default); only **finance** additionally maps `business.businessType` to a
template when the snapshot has none (`mapBusinessTypeToFinanceIndustryTemplate`: laundr/dry-clean →
`laundry_local_service`; clean/housekeep/maid/janitor → `generic_local_service`; retail/shop/store →
`retail_service_hybrid`). Cashflow, sales, operations, marketing, SOP and strategy never infer a template. Industry values
do influence diagnosis (they replace the generic cutoff). A comment per template gives a qualitative reason (cash-and-carry
service carries little receivables, etc.); **no number has a recorded source**, so none is `SUPPORTED_EXACT` or
`SUPPORTED_DIRECTIONALLY`. Founder-recovery has no template argument and is laundry/local-service specific by construction.

## 6. External research (no value was changed or retrofitted)

Candidates searched: cash-runway reserve, collection gap/DSO, debt-service burden vs lender DSCR, net margin, capacity
utilization, payback/ROI, risk-matrix banding, data-completeness cutoffs, repeat/conversion benchmarks, staleness cadence.
**Result: no authoritative source supports an exact OpsIQ number.** Primary pages (NIST, Federal Reserve, JPMorgan Chase
Institute) were fetch-blocked, so everything below is a **search-snippet paraphrase, unverified**, and is not attached to any
threshold as classification evidence:

| Source | Claim (unverified paraphrase) | Support | Population |
|---|---|---|---|
| [JPMorgan Chase Institute — Cash flows, balances and buffer days](https://www.jpmorganchase.com/corporate/institute/report-cash-flows-balances-and-buffer-days.htm) | Descriptive distribution of small-business cash buffer days (median reported near 27). Not a recommended minimum. | DIRECTIONAL | US small businesses holding Chase accounts; sample period not confirmed |
| [NIST SP 800-30 Rev. 1 (Appendix I example risk scales)](https://csrc.nist.gov/pubs/sp/800/30/r1/final) | Example semi-quantitative bands reported as 0-4 / 5-20 / 21-79 / 80-95 / 96-100; the standard says they are illustrative. These do not equal OpsIQ's 20/40/60/80 bands. | NONE | Information-security risk assessment; not business financial risk |
| [ISO/IEC 25012 / 25024 data quality](https://iso25000.com/index.php/en/iso-25000-standards/iso-25012) | Defines completeness as a quality characteristic; does not set numeric acceptability thresholds. | NONE | General data quality |
| [Federal Reserve G.17 capacity-utilization methodology](https://www.federalreserve.gov/RELEASES/G17/Meth/MethCap.htm) | Capacity is a sustainable maximum output; supports the direction that 100% utilization is at the limit, not the value 90. | DIRECTIONAL | US manufacturing, mining and utilities |

Other findings: the JPMorgan Chase Institute buffer-days work is descriptive (reported median near 27 days), not a
recommended minimum; SBA SOP 50 10 DSCR floors (reported 1.15, 1.10 for small loans) are a different metric from
debt-service-as-%-of-revenue; IRS sole-proprietor aggregates are descriptive; no primary source was found for DSO cutoffs,
payback cutoffs, repeat-customer rates or reporting-staleness windows. Where sources disagree or only approximate, nothing
was chosen. Re-verify any lead from the primary document before citing it in code.

## 7. Unknown and unsupported thresholds

`LEGACY_OR_UNKNOWN` (no defensible origin):

| ID | Why |
|---|---|
| `GLOBAL.DANGER_BANDS_20_40_60_80` | No comment, doc or external standard explains it |
| `GLOBAL.DECISION_CONFIDENCE_LEVEL_BANDS` | 75/50/25 label bands with no comment or doc |
| `FIN.highOwnerWithdrawalPressurePct` | Defined, never read |
| `GATE.CASH_RUNWAY_30_60_90_UNREFERENCED` | No production caller; third runway scale |

Weakest internal heuristics (no source, high leverage on what the owner sees): the 20-point risk-score point tables,
per-rule severity/impact ladders, the 0.5/0.6/0.5 priority-factor constants, and the recovery priority lookup 90/70/45/20.
Nothing here is presented as externally validated.

## 8. Carried-forward PR #582 findings (behavior untouched)

1. `growthOpportunityScore` raw cross-domain max — no threshold of its own; inherits opportunity-rule heuristics.
2. Portfolio growth/profit rankings inherit 1; portfolio alert/bar values (70/70/70/50/40) are `INTERNAL_HEURISTIC`/policy.
3. Owner-home top opportunities sort by raw `impactScore` — impact values are per-rule heuristics.
4. Uniform danger bands 20/40/60/80 — **provenance not found** (4.1).
5. Each domain's own risk feeds the priority survival factor — upstream risk tables and point weights are `INTERNAL_HEURISTIC`.

## 9. Output decision register (`BEHAVIOR_CHANGE_CANDIDATE`s — none implemented)

| # | Threshold ID | Current value | Provenance | Problem | Evidence available | Impact if changed | Future validation |
|---|---|---|---|---|---|---|---|
| 1 | `DANGER_BANDS_20_40_60_80` | 20/40/60/80 | `LEGACY_OR_UNKNOWN` | Same bands for heterogeneous domain risk scores; no origin | None supporting the values (NIST illustrative bands differ, unverified) | Changes every danger word on home cards | Fixture replay of danger cards across domains; owner comprehension check |
| 2 | `REASSESSMENT_CADENCE_70_40_7_14_30` | 70/40 → 7/14/30 days | `INTERNAL_HEURISTIC` | Docblock says it mirrors risk badges, but danger bands are 80/40 | In-repo inconsistency only | Changes review due dates | Blast-radius analysis of cadence vs danger levels |
| 3 | Cash runway scales (`FIN.*CashRunwayDays`, `CASH.*CashRunwayDays`, `GATE.CASH_RUNWAY_30_60_90_UNREFERENCED`) | 45/30/7; 30/14/5; 30/60/90 | `INTERNAL_HEURISTIC` / unknown | Three runway scales for related meaning | Chase Institute buffer days descriptive only (unverified) | Changes cash findings and survival state | Real-business replay of runway findings |
| 4 | `FIN.highOwnerWithdrawalPressurePct` | 50 | `LEGACY_OR_UNKNOWN` | Defined but unused | Repo search | None today; wiring it in would add findings | Decide: remove or implement with validation |
| 5 | `DATA_CONFIDENCE_CAUTION_70` / `_INSUFFICIENT_40`, state-label gates (50, finance 70) | 70/40, 50 | policy / heuristic | Duplicated literals; three different cutoffs for similar "thin data" meaning | None | Changes advice caps and banners | Replay data-sufficiency across fixtures |
| 6 | Staleness windows (per-domain 30/45/60 vs owner-decision 45, strategy never stale) | see 4.4 | policy / heuristic | Two stale definitions; cashflow 30 vs 45 | None | Changes eligibility/refresh targets and confidence | Blast-radius + fixture replay |
| 7 | `RECOVERY_PRIORITY_SCORE_90_70_45_20` | 90/70/45/20 | `INTERNAL_HEURISTIC` | Recovery cannot compete with saturated optimisation actions (PROOF D4) | Repo doc states the limitation | Changes recovery ordering inside its class | Replay recovery vs domain candidates |
| 8 | `RECOVERY.BAND_THRESHOLDS` (`grossMarginPct` unused) | table | `INTERNAL_HEURISTIC` | Unused band; no sources for bands | None | Changes recovery finding severity | Compare against real recovery cases |
| 9 | `FIN.LOW_ABSOLUTE_CASH_14_7_DAYS` | 14 / 7 | `INTERNAL_HEURISTIC` | Separate literals beside the registered runway fields | Comment only | Changes a finance finding | Review with runway decision (row 3) |
| 10 | `GATE.MARGIN_FLOOR_15` vs `FIN.healthyNetMarginPct` | 15 / 15 | policy / heuristic | Same number, different metrics (gross vs net), no stated link | None | Changes margin blocker | Confirm intent with product owner |
| 11 | Strategy payback/ROI cutoffs (`STRAT.*Payback*`, `*Roi*`) | 18/36 months; 100/20/0 % | `INTERNAL_HEURISTIC` | No standard exists; discretionary | No primary source found | Changes strategy decisions | Real-business validation |

No replacement value is proposed: no strong, directly applicable evidence exists.

## 10. Owner-facing claim audit

Searched owner UI, domain finding text and services for "industry standard", "benchmark", "best practice", "recommended
threshold", "target range", "optimal", "normal", "safe margin". **No copy presents a threshold as an industry standard or
externally validated.** "Healthy bar" / "safe threshold" appear in some finding summaries and refer to OpsIQ's own
cutoffs (recorded as ambiguous wording, unchanged). No copy changes were required in this slice.
