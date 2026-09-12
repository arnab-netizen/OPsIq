# Dynamic Budget — Deep Action-System Linkage (plan + minimum-code justification)

Goal: turn budget plan `generatedActions` (advisory) into **persisted, trackable owner
execution tasks** using the existing owner action system — no parallel engine.

## Inspection: what exists, what is reused

| Asset | Decision | Why |
|---|---|---|
| Shared action FSM `@/domain/founder-recovery/action-status` (`canTransition`, `isValidRecoveryStatus`, `requiresCompletionEvidence`, statuses proposed→assigned→in_progress→blocked→completed/cancelled) | **REUSE** | This is THE owner-mode action lifecycle engine; every owner module (finance/sales/…) reuses it. Budget reuses it too — no new FSM. |
| Per-module owner action table pattern (`OwnerFinanceAction` etc.: `workspaceId @db.Uuid`, `businessId`→OwnerBusiness, status, dueAt, assignedTo, completion fields, verification) | **MIRROR** | Active, canonical owner-action persistence. `workspaceId` is a Workspace UUID — matches budget. Budget adds `OwnerBudgetAction` following this identical shape. |
| Generic `OwnerAction` model | **NOT reused** | Never created in any real service (parked); its `workspace` relation FKs to **ClientAccount**, incompatible with budget's Workspace-UUID `workspaceId`. |
| Engagement `Action` (line 11) | **NOT reused** | Consulting/engagement-scoped, not owner-mode. |
| `emitAuditEvent` hash-chained ledger | **REUSE** | Action create/link/update audit. |
| `closeFundedInitiative` (Slice 4) | **REUSE** | Action completion → budget outcome/learning feedback. |
| Owner-finance action route/service shape (`PATCH /actions/[id]`, workspace guard, evidence-on-complete) | **MIRROR** | Same route/validation/enforcement convention. |

Conclusion: this is the repo's own owner-action pattern applied to budget — **not** a
duplicate/parallel action system. The lifecycle engine and audit/learning are reused.

## Minimum-code design

- **Schema:** one new table `OwnerBudgetAction` (mirrors `OwnerFinanceAction` shape) with
  the 15 required fields + a unique idempotency key `(workspaceId, businessId, sourceKey)`.
  Source linkage: `reassessmentId`, `planSnapshotId`, `periodId`. FK `business`→OwnerBusiness.
- **Pure helper** `src/domain/owner-budget/action-mapping.ts`: `budgetActionSourceKey(a)`
  (stable per decisionType+title) + `mapPlanActionToRow(a, ctx)` (derives verificationMethod
  + escalationPath defaults). Unit-tested.
- **Service** `src/services/owner-budget/action-link.service.ts`:
  - `syncBudgetActions({...plan, reassessmentId, planSnapshotId})` — for each
    `plan.generatedActions`, **upsert by sourceKey** (create new, or LINK/refresh an existing
    OPEN action; never reopen completed/cancelled; never duplicate). Transactional; audits
    create vs link.
  - `updateBudgetAction(actionId, input, actorId, workspaceId)` — workspace-scoped status
    transition via the **shared FSM**; completion requires evidence; on completion feeds
    budget learning via the pure `classifyInitiativeOutcome` + a `FundedInitiativeOutcome`
    record (the same store Slice 4 writes). The pure classifier + direct write are used
    instead of importing `closeFundedInitiative` to avoid a budget↔vendor service import
    cycle; behaviour and store are identical. Audits.
  - `listBudgetActions(workspaceId, businessId)`.
- **Wiring:** `reassessBudget` calls `syncBudgetActions` after persisting the snapshot/
  reassessment (passing their ids). Idempotent reassessment ⇒ no duplicate tasks.
- **Routes:** `GET /api/owner/budget/actions` (OWNER_VIEW), `PATCH /api/owner/budget/actions/[actionId]` (OWNER_MANAGE), Zod-validated, canonical-enforced.
- **UI:** `/owner/budget` gains a "Execution tasks (persisted)" section with live status,
  **clearly distinct** from the "Generated actions (advisory)" section, with assign/start/
  complete controls (mirrors finance). Advisory note retained.

## Tests (CI/headless-provable)
Unit (mapping + sourceKey + idempotency key), `[db]` (workspace isolation; cross-workspace
blocked; reassessment creates a real action; repeated reassessment = no duplicate; existing
open action linked/refreshed; status update + completion → outcome/learning), route
enforcement (OWNER_VIEW/OWNER_MANAGE + workspace + validation), regression (owner-finance
action suite still green — its files untouched).

## Out of scope / unchanged
No public SaaS/billing/launch. Gate 10 untouched. Browser/E2E proof remains **deferred**
(`DYNAMIC_BUDGET_UI_OWNER_VISIBLE`, not browser-proven). No existing action system weakened.

Final classification target: `DYNAMIC_BUDGET_ACTION_LINKAGE_DB_PROVEN` (if `[db]` proofs pass).

## Outcome — `DYNAMIC_BUDGET_ACTION_LINKAGE_DB_PROVEN`

Implemented and verified headlessly:

- Schema `OwnerBudgetAction` + migration `20260627030000_owner_budget_action_linkage`
  applied; `npx prisma validate` clean.
- `syncBudgetActions` wired into `reassessBudget` (passes `reassessmentId` + `planSnapshotId`).
- Routes `GET /api/owner/budget/actions` (OWNER_VIEW) and
  `PATCH /api/owner/budget/actions/[actionId]` (OWNER_MANAGE), Zod-validated, canonical-enforced.
- UI `/owner/budget`: "Execution tasks (persisted · governed)" section, distinct from
  "Generated actions (advisory plan snapshot)", with assign/start/complete/cancel controls
  (completion prompts for notes + evidence).
- Tests: `npx tsc --noEmit` 0 errors; `npm run lint:ratchet` PASS (2155→2153 errors, 0 new
  debt); **8/8 `[db]` linkage proofs pass** (governed-field persistence; no-duplicate
  idempotency; assignment preserved on link; completion → outcome/learning; completion
  refused without evidence; illegal transition rejected; workspace-scoped reads;
  cross-workspace write blocked); **17 non-DB tests** (mapping/idempotency-key, route
  enforcement, reuse/no-parallel-engine); **regression 100/100** across owner-budget +
  owner-finance action suites (existing action system unchanged).

Still deferred (unchanged): Browser/E2E proof (`DYNAMIC_BUDGET_UI_OWNER_VISIBLE`). Not
`OWNER_MODE_READY`. Gate 10 untouched.
