# Approval Threshold / Auto-Action Policy Engine — Depth Pass

Classification: `APPROVAL_THRESHOLD_AUTO_ACTION_POLICY_REAL_AND_OWNER_VISIBLE`

## A. Files created
- `src/domain/owner-mode/approval-threshold-policy.ts` — pure `buildApprovalPolicy` engine.
- `src/__tests__/owner-mode/approval-threshold-policy.test.ts` — 25 pure unit tests.
- `src/__tests__/components/approval-policy-panel.test.tsx` — 6 jsdom component tests.
- `src/__tests__/execution/approval-threshold-policy-simulation.db.test.ts` — laundry DB simulation (2 tests).
- `docs/remediation/approval-threshold-auto-action-policy-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `approvalPolicy` added to `OwnerNowViewPayload`; `deriveApprovalCandidates(routing)` maps each proposed correction into a policy action candidate; computed after `ownerWorkloadReduction` and returned in the payload.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `ApprovalPolicyPanel` + view types (`ApprovalPolicyView`, `ApprovalPolicyDecisionView`, `ApprovalPolicySummaryView`).
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "What OpsIQ may do without asking" section.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended with `approvalPolicy`; asserts the new section renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. Pure derivation over already-derived process corrections.

## D. Backend logic implemented
- **`buildApprovalPolicy(input, workspaceId, evaluatedAt)`** — pure + deterministic. For each candidate action it returns a 21-field `ApprovalPolicyDecision` with one of five `approvalDecision` values: `AUTO_ALLOWED` / `MANAGER_APPROVAL_REQUIRED` / `OWNER_APPROVAL_REQUIRED` / `NEVER_AUTO` / `NEEDS_DATA`.
- **Default policy** (governance-first):
  - `NEVER_AUTO` (hard-blocked, owner-only): staff termination, compensation change, misconduct accusation, deleting audit records, contract/loan commitment, suppressing risk, scaling on unvalidated demand, legal-terms change, staff disciplinary action.
  - `OWNER_APPROVAL_REQUIRED`: pricing change, refund above threshold, discount grant, B2B contract terms, large spend, legal matter, reputation response, and any **low-confidence + high-impact** action (escalated from a routine base).
  - `MANAGER_APPROVAL_REQUIRED`: routine coaching, minor process change.
  - `AUTO_ALLOWED`: request missing proof, collapse duplicate cleared alerts, draft checklist, propose training, open reassessment, flag overdue, collect data, draft-only recommendation.
  - `NEEDS_DATA`: unknown action type / risk category / impact, or incomplete evidence — **except** a high-harm action, which stays `NEVER_AUTO` (thin data never downgrades a dangerous action).
- **Capability gap:** each decision assesses whether OpsIQ lacks a capability required to ever safely verify/automate the action (refund reconciliation, spend-control ledger, margin simulation, compensation integration, contract-terms registry, legal-review workflow, identity/evidence chain). When so, it keeps the human in the loop and emits a concrete `systemCapabilityRecommendation`; `capabilityRecommendations` is de-duplicated by capability type.
- **`deriveApprovalCandidates`** — maps each `ProcessCorrection` to a candidate: correction type → action type, expected impact type → risk category + impact level, correction confidence → policy confidence, `NO_ACTION_DATA_INSUFFICIENT` → a `NEEDS_DATA` candidate. Every value read from real correction data; ordinary corrections never map to a high-harm action.

## E. Frontend logic implemented
`ApprovalPolicyPanel` (Executive Cockpit standard): the single most-restrictive decision by default (action + decision badge first, rationale, guardrail), the capability-gap recommendation when present, evidence collapsed in a `<details>`, a summary counts line, and the remaining decisions behind a `<details>` summary. Prop-driven; no business logic.

## F. Acceptance criteria checklist
- [x] Pure `buildApprovalPolicy` with a 21-field decision shape and 5 approval decisions.
- [x] `riskCategory` enum + default policy rules per spec.
- [x] Capability-gap assessment → `systemCapabilityRecommendation`.
- [x] `approvalPolicy` wired into the now-view payload + `ApprovalPolicyPanel`.
- [x] 25 pure tests + 6 component + 1 page assertion + laundry DB simulation.
- [x] DB sim wired into LANE_B and LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- The now-view surfaces candidates derived from process corrections only; other action sources (e.g. workload-reduction actions) are governed by their own approval fields and are not double-counted here.
- Impact magnitude is a **type/level**, never a fabricated monetary amount.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/approval-threshold-policy.test.ts` → 25 passed.
2. `npx vitest run src/__tests__/components/approval-policy-panel.test.tsx` → 6 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → 2 passed.
4. LANE_B/LANE_A run `approval-threshold-policy-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → "What OpsIQ may do without asking" section.

## I. Trigger map
Proposed process correction → `deriveApprovalCandidates` → `buildApprovalPolicy` → `approvalPolicy` in the Owner Now View → `ApprovalPolicyPanel`.

## J. Failure modes covered
Empty/clean workspace (no candidates → null, no evidence leak); unknown/incomplete candidate → `NEEDS_DATA`; high-harm action with thin data → stays `NEVER_AUTO`; capability gap → human kept in the loop; no fabricated money, no fraud/negligence/HR-discipline language, no hidden score.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
25 pure unit + 6 component + 1 page assertion + 2 DB simulation = 34 new checks.
