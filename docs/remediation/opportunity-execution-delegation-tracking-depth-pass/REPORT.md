# Opportunity Execution & Delegation Tracking — depth pass (PASS 12)

Turns the opportunity operating layer's prep checklists, tender readiness, proof-pack requirements,
validation actions and portfolio decisions into governed, trackable **execution tasks** with an owner, a
status, and completion evidence — answering "who must do what next for this opportunity, what evidence
proves it was done, and what changes when it is completed?" OpsIQ only drafts/records; it never submits a
tender, contacts a customer, or spends.

## A. Files created
- `src/domain/owner-mode/opportunity-execution.ts` — pure domain: `deriveOpportunityExecutionTasks`, `planTaskUpdate`, `executionTaskKey`, task shape + governance constants.
- `src/services/owner-mode/opportunity-execution.service.ts` — governed write path `recordExecutionTaskUpdate` + read `getPersistedExecutionTasks`.
- `src/app/api/owner/opportunities/execution-task/route.ts` — POST route (OWNER_MANAGE) validating the update.
- `prisma/migrations/20260706020000_opportunity_execution_task/migration.sql` — additive `opportunity_execution_tasks` table.
- `src/__tests__/owner-mode/opportunity-execution.test.ts` — 18 domain tests.
- `src/__tests__/owner-mode/opportunity-execution.service.test.ts` — 5 service tests (in-memory DB).
- `src/__tests__/components/opportunity-execution-panel.test.tsx` — 7 component tests.
- `src/__tests__/execution/opportunity-execution-delegation-simulation.db.test.ts` — real-Postgres laundry DB simulation.
- `docs/remediation/opportunity-execution-delegation-tracking-depth-pass/REPORT.md` — this report.

## B. Files changed
- `prisma/schema.prisma` — added `OpportunityExecutionTask` model.
- `src/domain/constants/audit-events.ts` — added `OWNER_OPPORTUNITY_EXECUTION_TASK_UPDATED`.
- `src/services/owner-guidance/owner-now-view.service.ts` — derive `opportunityExecution` from the operating layer + portfolio/validation hints, overlay persisted status; injectable `executionTasks` dep.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `OpportunityExecutionPanel` + view types.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render the panel in the "Grow" cockpit group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — payload + assertions for the execution surface.
- `.github/workflows/db-verification.yml` — wired the new DB sim into LANE_B + LANE_A explicit lists.

## C. Schema changes
New table `opportunity_execution_tasks` (additive, non-destructive): id, workspace_id, task_key, opportunity_key,
source_type, source_key, task_type, next_action_owner, status (default PROPOSED), approval_level, evidence_refs[],
linked_proof_ids[] (uuid), blocking_reason, outcome_summary, completed_by_user_id, completed_by_role, completed_at,
created_at, updated_at. `UNIQUE(workspace_id, task_key)` (idempotent per opportunity + task type); index on
`(workspace_id, opportunity_key)`.

## D. Backend logic implemented
- **Derivation** (`deriveOpportunityExecutionTasks`): from each live opportunity, seeds tasks — tender eligibility/documents/cost/owner-review/draft/compliance-advisor; proof-pack; prep-checklist unit-economics; non-tender cash guardrail; validate-ready → manual lead contact + record; portfolio owner-review / scale approval. Rejected/expired opportunities produce no work. Deterministic keys, dedupe, persisted-status overlay, single top task, grouped summary + capability recommendations.
- **Write guard** (`planTaskUpdate`): owner-approval tasks require an owner actor + decision note and can never auto-complete; evidence-required tasks cannot COMPLETE without evidence (→ IN_PROGRESS, no fake completion); forbidden fraud/HR-discipline language fails closed; a valid evidence-backed completion sets `updatesOpportunity`.
- **Service** (`recordExecutionTaskUpdate`): validates via the domain, persists row + atomic audit in one transaction, idempotent on `(workspaceId, taskKey)`; `getPersistedExecutionTasks` returns a workspace-scoped taskKey→status map (P2021-safe before migrate).

## E. Frontend logic implemented
`OpportunityExecutionPanel` (prop-driven, no business logic): the single top task with owner badge, status,
description, skip-risk, blocked reason, evidence collapsed in `<details>`, the OpsIQ-drafts-only guardrail, and a
grouped one-line summary. Honest empty state. Rendered inside the collapsed "Grow" cockpit group.

## F. Acceptance criteria checklist
- [x] Opportunities become trackable tasks with owner + evidence + status.
- [x] OpsIQ never submits / contacts / spends (draft/record only; guardrail shown).
- [x] Owner-approval tasks cannot be auto-completed or completed by a non-owner.
- [x] Completion requires evidence where the task type demands it; no fake completion.
- [x] Completed evidence-backed task feeds opportunity readiness (`updatesOpportunity`).
- [x] Idempotent, workspace-scoped, atomic audit on every mutation.
- [x] No fabricated money / win probability / hidden score / fraud-HR language.
- [x] Cockpit shows one top task; the rest grouped/counted.

## G. Known limitations
- Task derivation currently sources from the operating layer, portfolio and validation stages; it does not yet propose tasks from SOP/training corrections (out of scope for this pass).
- `dueAt`/`priority` are modelled but not yet surfaced as owner-facing deadlines.

## H. Manual verification steps
1. Submit a B2B signal without unit economics → open Process Intelligence → "Grow" → "Opportunity execution": a COLLECT_COST_DATA task owned by the manager.
2. POST `/api/owner/opportunities/execution-task` with `action: COMPLETE` and no evidence → task stays IN_PROGRESS.
3. Repeat with evidence → COMPLETED; the panel reflects it; an audit event is written.
4. Attempt to complete an OWNER_APPROVAL_REVIEW task as a manager → rejected, no write.

## I. Trigger map
- New/updated opportunity in the operating layer → task seeds re-derived on the next now-view.
- Portfolio decision OWNER_REVIEW_REQUIRED / SCALE_CANDIDATE → owner-approval task.
- Designed-but-unrun validation experiment → manual contact + record tasks.
- Task completion with sufficient evidence → `updatesOpportunity` (feeds readiness re-evaluation).

## J. Failure modes covered
- Fake/weak completion (no evidence) → not COMPLETED.
- Non-owner completing an owner-approval task → fail closed, no write.
- Forbidden fraud/HR-discipline language → rejected.
- Rejected/expired opportunity → no tasks fabricated.
- Clean workspace → null execution block, no rows.
- Duplicate submission → idempotent (no second row).
- Missing table before migrate → empty map (P2021-safe).

## K. Events emitted
- `owner.opportunity_execution_task_updated` (atomic with the row write; payload: taskKey, opportunityKey, taskType, action, status, updatesOpportunity).

## L. Automated tests added
- 18 domain + 5 service + 7 component + 2 page (32 non-DB, all passing) + 1 real-Postgres laundry DB simulation (10 cases, LANE_B/LANE_A wired).
