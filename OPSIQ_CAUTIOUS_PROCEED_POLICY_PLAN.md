# OpsIQ Cautious-Proceed Policy Calibration — Plan

> Define and prove the safe action-status spectrum so OpsIQ can recommend **low-risk, reversible, SOP-approved**
> action where appropriate — without over-automating, allowing autonomous high-risk action, faking confidence,
> or proceeding when critical evidence is missing. **Additive, conservative-by-default** changes only; no
> existing supervisor / chaos / DB / browser / ratchet gate is weakened.

- **Branch:** `claude/cautious-proceed-policy-calibration`
- **Base HEAD:** `f7b3e796eb02df448c6073e8309812d43eb91767`

## 1. Current action-status taxonomy
`OwnerActionStatus` (`src/domain/owner-mode/supervisor-summary.ts`):
`blocked` · `need_more_data` · `owner_decision_required` · `cautious_proceed` · `proceed`.

## 2. Current conservative behavior (measured)
`deriveActionStatus(input, confidence)`:
1. `unsafeCount>0 || dominant∈{compliance_block, proof_fraud_block}` → **blocked**
2. `!criticalDomainsAllReal || confidence==="none"` → **need_more_data**
3. `ownerApprovalRequired || dominant∈HIGH_RISK_FINANCIAL{cash_survival,below_margin,profitable_growth,efficiency_scaling}` → **owner_decision_required**
4. `confidence∈{low,medium}` → **cautious_proceed**
5. else → **proceed**

The real runtime never reaches steps 4–5 because `plan.ownerApprovalRequired = arb.ownerApprovalNeeded || advice.ownerApprovalNeeded`, and `arb.ownerApprovalNeeded = activeConstraints.length>0 || expand/accept_contract`. So **any** binding constraint ⇒ owner decision; a healthy business resolves to `profitable_growth` (high-risk-financial) ⇒ owner decision. → `cautious_proceed`/`proceed` are unreachable for realistic data (conservative by design).

## 3. Where action status is produced
`deriveActionStatus` inside `buildSupervisorSummary` (`src/domain/owner-mode/supervisor-summary.ts`), from a
`SupervisorInput` that the production service `owner-whole-business-plan.service.ts` maps from the runtime
(`plan` + `ingestion` + `arbitration`).

## 4. Where action status is rendered
`src/components/owner/SupervisorSummary.tsx` — `data-testid="supervisor-action-status"` badge (STATUS_LABEL /
STATUS_VARIANT), plus do-now / do-not-do / owner-delegate / proof / reassessment. Browser: `tests/browser/
18-…` and `19-chaos-replay.spec.ts`.

## 5–10. Explicit policy criteria (canonical)
A new pure module `src/domain/owner-mode/action-status-policy.ts` → `decideActionStatus(signals)` encodes:

- **BLOCKED** when any: unsafe action · compliance/professional-review boundary without review · fake/disputed
  proof · bad contract/payment terms with high risk · cash/runway hard block · staff/customer safety risk ·
  high-risk action with missing critical data · likely-bad-outcome-if-followed.
- **NEED_MORE_DATA** when (not blocked) any: required data missing · material assumptions · weak/one-sided
  source · confidence below threshold · high decision impact with insufficient evidence.
- **OWNER_DECISION_REQUIRED** when (not blocked/need-data) any: financially material · changes
  staffing/payroll · changes pricing materially · B2B contract terms · brand/compliance/legal/professional
  boundary · reversible-but-material · owner approval required by standing instruction · high-risk-financial
  constraint not downgradable by a safe action.
- **CAUTIOUS_PROCEED** only when ALL: low/medium risk · reversible · evidence sufficient · cash impact safe ·
  staff capacity ok · customer-quality risk controlled · proof + reassessment defined · stop-loss threshold
  exists · owner approval not required (or already granted) · within approved SOP/standing instruction.
- **PROCEED** only when ALL: low risk · routine · reversible · within approved SOP/standing instruction ·
  evidence sufficient · proof + reassessment defined · no material cash/staff/customer/compliance risk ·
  no owner approval required.

Professional-review criteria: a compliance/licensing/tax/safety boundary that lacks a written professional
review ⇒ **blocked** (never proceed/cautious_proceed).

## 11. Tests required
- Policy unit tests (§3): the 10 required (high-risk can't proceed; missing-data can't proceed; owner-approval
  can't proceed without approval; professional-review can't proceed; low-risk routine SOP proceeds; reversible
  medium-risk cautious_proceeds; cautious_proceed has proof/reassessment + stop-loss; proceed has
  proof/reassessment; blocked/need_more_data never render as proceed).
- Status-coverage (§4): ≥5 each of the 5 statuses; every proceed low-risk+reversible; every cautious_proceed
  has proof/reassessment/stop-loss; no proceed/cautious with missing critical data or approval violation.
- Supervisor behaviour-preservation: every existing supervisor/chaos test stays green (safeAction absent ⇒
  identical output).
- DB: a seeded healthy + SOP-covered business yields cautious_proceed/proceed via the real
  `getOwnerWholeBusinessPlan`; high-risk/missing-data/owner-approval/professional-review businesses do NOT.
- Browser: spec renders all 5 statuses distinctly; blocked/need_more_data never look like proceed.

## 12. Minimum-code plan (additive, conservative-by-default)
1. **`action-status-policy.ts`** (new, pure): `PolicySignals` + `decideActionStatus(signals) → {status, reasons}`
   encoding §5–10. Canonical definition + fully unit-tested.
2. **`supervisor-summary.ts`** (additive): add optional `SupervisorInput.safeAction` block (risk level,
   reversible, withinApprovedSOP, ownerApprovalGranted, evidenceSufficient, cashImpactSafe, staffCapacityOk,
   customerQualityControlled, hasStopLoss, hasProofReassessment). Refactor `deriveActionStatus` to delegate to
   `decideActionStatus`. **Behavior-preserving**: when `safeAction` is absent (all existing callers), output is
   identical to today. When present and genuinely safe (and dominant ∉ {cash_survival, below_margin,
   compliance_block, proof_fraud_block}), an owner-decision is **downgraded** to cautious_proceed/proceed.
3. **`owner-whole-business-plan.service.ts`** (additive): populate `safeAction` ONLY for a genuinely-safe
   business — `criticalDomainsAllReal` + `unsafeCount===0` + no red domains + dominant not high-financial/
   compliance/proof + a covering owner standing instruction (within approved SOP). Otherwise leave `safeAction`
   undefined ⇒ unchanged conservative behaviour.
4. **Scenario profile** `safe_sop_routine` (test fixture) + DB test proving cautious_proceed/proceed from real
   rows; existing profiles still resolve blocked/owner_decision.
5. **`tests/browser/20-action-status-spectrum.spec.ts`** rendering all 5 statuses (5 seeded businesses).
6. Reports + no-regression.

No autonomy, no LLM, no new brain. The downgrade is gated on explicit safety signals and never applies to
unsafe / missing-data / compliance / proof / cash-hard-block / owner-approval-required cases.
