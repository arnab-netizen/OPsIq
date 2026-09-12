# Dynamic Budget — Reassessment Rules

Source of truth: `src/domain/owner-budget/mode-classifier.ts`,
`reassessment-triggers.ts`, and `src/services/owner-budget/budget.service.ts`.

## Material change triggers (classifyMaterialChange)

| Trigger class | Example kinds | Material | Immediate |
|---|---|---|---|
| BUDGET_STRUCTURE | budget_line_added/removed/amount_changed, reserve_target_changed, approval_threshold_changed, business_goal_changed | yes | yes |
| ACTUAL_FINANCIAL | spend_entry_added/edited/voided, spend_proof_uploaded/disputed, committed_spend_added, cash_balance_changed, payable/receivable_changed, owner_drawing_added, statutory_obligation_changed | yes | yes |
| REVENUE | revenue_changed, refunds_discounts_changed, revenue_assurance_exception | yes | yes |
| EMPLOYEE_GOVERNANCE | approval_violation_detected, split_spend_detected, self_approval_detected, proof_compliance_changed | yes | yes |
| OPERATIONAL | capacity_changed, quality_metric_changed | yes | no |
| SALES_MARKETING | campaign_spend_changed, cac_changed, channel_roi_changed | yes | no |
| EXTERNAL_PLANNING | seasonality_changed, vendor_price_changed, supplier_bank_changed | yes | no |
| NONE | note_edited, label_renamed | no | no |

## Real mutation paths that trigger reassessment (proven)

1. `addBudgetLine` → `budget_line_added`
2. `updateBudgetLineAmount` → `budget_line_amount_changed`
3. `recordSpendEntry` → `spend_entry_added`
4. `updateSpendProofStatus` → `spend_proof_uploaded` / `spend_proof_disputed`
5. `reassessBudget` directly for cash/revenue/period changes (`cash_balance_changed`,
   `revenue_changed`, `budget_period_created`)

≥5 real mutation paths trigger reassessment (Section 4 requirement met). The
mandatory dynamic proof test drives reassessment through `recordSpendEntry`.

## Mode classification (evidence-backed, deterministic)

Computed from cash posture (runway, reserve, free-cash-after-obligations,
next-critical-due), net margin (reused finance metric), unit economics, capacity,
workload, data confidence, and control state — never revenue alone.

- **DATA_INSUFFICIENT**: confidence UNVERIFIED or ≥3 missing critical inputs. Blocks
  growth/scale/hiring/capex/marketing; emits only evidence-collection guidance.
- **EMERGENCY**: reserve breached, OR control breach, OR runway < 14d, OR net margin
  < −20%, OR an obligation due ≤7d exceeds free cash.
- **STABILIZE**: runway < 45d, OR margin < 0, OR workload overloaded / quality
  deteriorating, OR confidence below OPERATIONAL.
- **PROFIT_INCREASE**: revenue present AND net margin in [0, 10%).
- **GROW**: cash safe AND unit economics ok AND capacity available AND confidence ≥ OPERATIONAL.
- **SCALE**: cash safe AND repeatable demand AND low owner-dependency AND sustainable
  workload AND margin ≥ 10% AND confidence ≥ VERIFIED.
- **HYBRID**: STABILIZE co-active with GROW/SCALE → stabilize first, run one capped test.

Precedence: DATA_INSUFFICIENT → EMERGENCY → (STABILIZE+offensive ⇒ HYBRID) →
STABILIZE → PROFIT_INCREASE → SCALE → GROW → conservative STABILIZE default.

## Atomicity / idempotency / versioning (Sections 8, 9)

- `reassessBudget` is idempotent per `(workspaceId, businessId, triggerEventId)` —
  a repeated trigger returns the existing plan; no duplicate snapshot/reassessment.
  Enforced by a DB unique index and a pre-check.
- Snapshot versioning is transactional: the prior `isCurrent` snapshot is preserved
  (`isCurrent=false`) and a new versioned snapshot is created in one `$transaction`.
  Exactly one current snapshot per business at all times.
- Every reassessment emits `OWNER_BUDGET_REASSESSED` to the hash-chained audit ledger.

## Review cadence

EMERGENCY → 2 days; STABILIZE/HYBRID → 7 days; GROW/SCALE/PROFIT_INCREASE → 14 days.
Every plan also carries a kill rule and reassesses on any further material change.
