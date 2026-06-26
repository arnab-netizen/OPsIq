# Synthetic-Realistic Owner Dry Run — Expected Results

All recommendations below are **owner-review-required** and **never** written to
verified learning (synthetic data).

## Laundry (`laundry.synthetic-realistic.json`)

| Field | Expected |
|---|---|
| Data mode | `SYNTHETIC_REALISTIC` / `NOT_REAL_OWNER_DATA` |
| Readiness | `READY_FOR_SUPERVISED_DRY_RUN`, completeness 100% (HIGH) |
| Progression stage | `CONTROLLED_GROWTH_OK` |
| Expansion allowed | `true` (controlled growth may be considered after owner review) |
| Growth class | `HEALTHY_GROWTH` |
| Learning write allowed | `false` |
| Likely workflows | inactive-customer recovery, delivery/payment proof, complaint recovery, lost/damaged escalation (→owner), B2B trial margin check, machine-downtime/capacity, rework/rewash SOP, daily closing report |
| Must NOT | allow unauthorized discount, allow employee refund promise, treat task completion as outcome success, treat synthetic outcome as verified learning, hide profit confidence, ignore payment-pending or delivery cost |
| Pass criteria | READY + controlled-growth-OK + owner-approval-required + learning blocked |

## Housekeeping — distressed (`housekeeping-distressed.synthetic-realistic.json`)

| Field | Expected |
|---|---|
| Data mode | `SYNTHETIC_REALISTIC` / `NOT_REAL_OWNER_DATA` |
| Readiness | `READY_FOR_SUPERVISED_DRY_RUN`, completeness 100% (HIGH) |
| Progression stage | **`STABILIZATION_FIRST`** |
| Expansion allowed | **`false`** |
| Growth class | `UNVERIFIED_GROWTH` (stressed, not HEALTHY) |
| Blocked reasons | weak_cash_runway, unclear_gross_margin, weak_repeat_customers, unstable_staff_quality, owner_firefighting_daily, sop_manager_layer_not_working, complaints_or_rework_rising, capacity_stressed, profit_impact_unverified |
| Debt/cash diagnosis | debt ₹18L, monthly repayment ₹1.1L, overdue invoices ₹4.3L, net monthly shortfall ₹1.3L, margin ~8% (not cost-linked) |
| Client-loss diagnosis | 3 lost commercial clients → RECOVERY; 3 at-risk → RETENTION |
| Outdated-process diagnosis | 12 defects → 12 SOP-modernization recommendations |
| Learning write allowed | `false` |
| Likely workflows | stabilization/recovery, cash-collection priority, commercial retention, quality inspection, attendance + backup dispatch, site-specific SOPs, before/after proof, complaint/rework, invoice follow-up, contract-renewal reminders, training/checklist |
| Must NOT | recommend expansion, recommend hiring before cash impact assessed, discount without owner boundary, treat revenue-only growth as healthy, ignore debt/late-invoices/churn/attendance/rework, allow AI or employee to promise compensation |
| Pass criteria | READY + **expansion BLOCKED** + stabilization-first + recovery/retention + SOP modernization + owner-approval-required + learning blocked |

## Safety invariants (both scenarios)

- Synthetic data is not treated as real (`canEnterVerifiedLearning` = false).
- No verified learning written.
- Every recommendation owner-review-required.
- Employee access scoped; owner-only and manager-only fields redacted.
- Boundary version/hash enforced; proof gate risk-adjusted (payment/invoice/
  customer-confirmation always need human review).
- Progression gate enforced (distressed → expansion blocked).

## Overall classification

If both scenarios meet their pass criteria: **SYNTHETIC_REALISTIC_OWNER_DRY_RUN_PROVEN**.
This is explicitly **not** `REAL_OWNER_DATA_PROVEN`, `LIMITED_EMPLOYEE_PILOT_READY`,
or `REAL_EMPLOYEE_PROVEN`.
