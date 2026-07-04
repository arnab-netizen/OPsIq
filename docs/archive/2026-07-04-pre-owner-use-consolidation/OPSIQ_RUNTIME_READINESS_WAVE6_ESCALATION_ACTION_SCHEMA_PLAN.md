# OpsIQ Wave 6 — Escalation / Action Schema Decision + Overdue-Action Fix (Plan-First)

> Follow-up wave closing a MILESTONE_RUNTIME_PARTIAL item. Standard:
> `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (a reachable runtime path that
> currently throws). Branch `claude/runtime-readiness-wave6-escalation-action-schema`, base `main @ ce9a43b6`.
> **CI is NOT triggered by this plan.** Written before implementation.

## 1. The defect (verified against the real schema)

The Prisma `Action` model (`prisma/schema.prisma`, confirmed against `src/generated/prisma/models/Action.ts`)
has **no `priority` column, no `dueDate` column (the field is `dueAt`), and no `workspaceId` column**. Its only
relations are `engagement` and `stage`; `recommendationId` is a nullable scalar with **no `recommendation`
relation object**. Two "overdue-action escalation" functions still query/write those phantom fields and therefore
throw `PrismaClientValidationError` at runtime:

| Site | Phantom fields | Reachability | Runtime impact |
|---|---|---|---|
| `src/services/escalation.ts` → `detectHighPriorityOverdueActions` | `workspaceId`, `priority: "critical"`, `dueDate` in the `action.findMany` where-clause | **Wired**: `checkEngagementEscalations` → called by the Phase-7 re-evaluation loop (`re-evaluation.ts:793`) and by `POST /api/engagements/[id]/escalation-checks` | Every escalation check / Phase-7 re-eval that reaches it throws → 400/500, breaks the governed adaptive loop |
| `src/services/action.ts` → `detectOverdueActions` | reads `action.priority`; **writes** `db.action.update({ data: { priority } })` | **Not wired in production** (only `src/__ignored_tests__/…` reference it) | Latent: would throw on the phantom-column write if ever called |

This is the same class of bug Wave 1's `RUNTIME_SCHEMA_QUERY_SWEEP` fixed for other Action/KPI/Finding queries
(`schema-query-sweep.db.test.ts`, `re-evaluation-workspace-scope.db.test.ts`) — these two overdue-action
functions were missed because they also carry the additional **phantom `priority`** field, which is the schema
decision this wave must resolve (Wave 1 only rescoped `workspaceId`).

## 2. The schema decision (do NOT guess — see the decision memo)

"High-priority overdue" needs a priority signal, but `Action` has none. A real `priority` **already exists on the
linked `Recommendation`** (`Recommendation.priority: String`, required, `@@index([priority])`), and every `Action`
is created with a `recommendationId` (`CreateActionInput.recommendationId` is required; `createAction` persists
it). `createAction`'s `input.priority` is **already dropped** — never written to `Action`, only used for the audit
payload and the `=== "critical"` re-eval trigger. So priority is conceptually a **recommendation-level** attribute.

Decision recorded in `OPSIQ_RUNTIME_READINESS_WAVE6_ESCALATION_ACTION_DECISION.md`:
**derive an action's priority from its linked `Recommendation` — do NOT add an `Action.priority` column.**
This uses existing schema (no migration, no invented field), matches the directive ("do not add `Action.priority`
without an explicit schema decision"), and is the minimum change that makes the path honest.

## 3. Fixes (minimum code, existing systems, no schema change)

### 3a. `detectHighPriorityOverdueActions` (the wired path — full real fix)
Replace the single phantom where-clause with a two-step query on existing schema:
1. `action.findMany` for overdue, still-open actions scoped via the **engagement relation**
   (`engagement: { workspaceId }`, matching every other query in `action.ts`), `dueAt: { lt: now }`,
   `status: { notIn: ["completed","verified","cancelled"] }`, `recommendationId: { not: null }`;
   select `{ id, title, recommendationId }`.
2. `recommendation.findMany` for those `recommendationId`s where `workspaceId` matches and
   `priority: "critical"`; the "critical overdue actions" are the step-1 actions whose recommendation is in that
   set. (Actions with no recommendation have no priority signal and are honestly excluded — no fabrication.)

Alert emission, audit event, and logger call are unchanged. Remove the `(a: any)` casts (typed properly so the
changed lines carry **0** new lint errors for the ratchet).

### 3b. `detectOverdueActions` (the unwired path — stop the phantom write, stay honest)
The overdue **detection + `ACTION_OVERDUE` audit** is real and kept (already engagement-scoped). Remove the
phantom `action.priority` read and the `db.action.update({ data: { priority } })` write + its
`ACTION_PRIORITY_ESCALATED` emission — there is no `Action.priority` column to escalate, and auto-escalating the
**shared** `Recommendation.priority` because one of its actions is overdue is a product decision (over-escalates
sibling actions) recorded in the decision memo, not guessed here. The function returns the overdue actions it
detected. No production caller depends on the removed field.

No route/UI/auth/migration file is touched. No gate/threshold/scanner change.

## 4. DB proof (local Postgres, no CI triggered)
New `src/__tests__/services/escalation/overdue-escalation.db.test.ts` drives the REAL functions against a real DB:
1. An overdue, open action whose `Recommendation.priority = "critical"` → `detectHighPriorityOverdueActions`
   returns a `high_priority_overdue` alert naming that action (the exact call that threw before the fix).
2. An overdue action whose recommendation is **not** critical → **no** alert (priority derivation is real, not
   "any overdue").
3. A critical-recommendation action that is **not** overdue → no alert.
4. An action with **no** recommendation, overdue → no alert (no fabricated priority).
5. **Isolation**: a foreign workspace's overdue critical action does not surface for this workspace.
6. `detectOverdueActions` on an overdue action **no longer throws** and emits an `ACTION_OVERDUE` audit event
   (proves the phantom-write removal).

## 5. Classification (candidate)
**`OVERDUE_ESCALATION_SCHEMA_RESOLVED_DB_PROVEN`** — the wired escalation path no longer throws, derives priority
from the real `Recommendation` source with DB proof and isolation, the latent phantom-write in `detectOverdueActions`
is removed, and the "add `Action.priority` column" / "auto-escalate shared recommendation" questions are resolved
by an explicit decision memo (no guess, no migration). Final classification is gated on required CI + a final
hostile audit after the PR opens.

## 6. Out of scope (unchanged, still blocked)
Public SaaS, billing, launch, integrations. No new engine, no AI autonomy, no gate weakening. The escalation-checks
GET route's pre-existing "history not yet persisted" note is unrelated to the phantom-column bug and is left as-is.
