# OpsIQ Schema/Query Mismatch — Deferred Decisions

> Non-clean schema/query mismatches found in Wave 1 that require an owner-level **schema** or **domain**
> decision. No code was changed for these in Wave 1 (per the wave's migration-free rule). Each throws at
> runtime today; documenting rather than masking.

## DOMAIN_DECISION_REQUIRED — `Action` has no `priority` and no `dueDate` (column is `dueAt`)

`Action` columns: `id, engagementId, stageId, recommendationId, title, description, status, assignedTo, dueAt,
startedAt, completedAt, verifiedAt, metadata, version, …`. There is **no `priority`** and **no `dueDate`**.

1. **`escalation.ts:detectHighPriorityOverdueActions`** — queries
   `action.findMany({ where: { engagementId, workspaceId, priority: "critical", dueDate: { lt: now } } })`.
   Three invalid fields. The `engagement`-scope fix is clean, but "critical priority overdue actions" has no
   schema representation. **Decision needed:** where should action priority live (add `Action.priority`
   column? derive from `Recommendation.priority` via `recommendationId`? drop the concept?) and should
   `dueDate` map to `dueAt`. Until then this escalation detector cannot run.
2. **`report-generator.ts:226`** — `action.findMany({ orderBy: [{ dueDate }, { priority }] })`. Same missing
   columns in an `orderBy`. Same decision.
3. **`action.ts` reprioritization (~line 418)** — writes `data: { priority: newPriority }` to `Action`.
   Same missing column; this write throws.

**Recommendation:** add `Action.priority` (+ map `dueDate`→`dueAt`) OR source priority from the linked
`Recommendation`. This is a small schema/domain change but out of Wave 1's migration-free scope.

## SCHEMA_DECISION_REQUIRED — models with no `workspaceId` and no workspace-scoped parent

`User`, `LeadRecord`, `ClientAccount` have no `workspaceId` column and no relation that carries one
(users are workspace-scoped via `WorkspaceMembership`; `ClientAccount`/`LeadRecord` have no workspace link at
all). The services `user.ts`, `lead.ts`, `client-contact.ts` query them by a flat `workspaceId`, so their
write/success paths throw. Tracked as **BROKEN-SVC-1/2/3**.

**Options (owner decision):**
- (a) Add `workspaceId` columns to `ClientAccount`/`LeadRecord` (+ backfill) and scope `User` via membership;
- (b) Rewrite the three services to scope via existing relations/membership (no schema change for `User`;
  `ClientAccount`/`LeadRecord` still need a workspace link).

These block the last three B4 route migrations' **success** paths (deny paths remain provable).

## Not masked
None of the above were "fixed" by returning empty arrays, swallowing errors, or converting 500s to 200s.
They remain honestly broken until the decision is made.
