# OpsIQ Wave 6 — Decision Memo: Action priority source

> Required by the follow-up-wave rule: "if a wave requires a schema/product decision, do not guess — create a
> decision memo (options, recommendation, risks, tests)." This memo resolves the one schema decision Wave 6
> depends on so the runtime fix can proceed without inventing a column.

## Question
Overdue-action escalation must know an action's "priority", but the Prisma `Action` model has **no `priority`
column**. Should we (A) add an `Action.priority` column, (B) derive priority from the linked `Recommendation`, or
(C) drop the priority notion and escalate all overdue actions?

## Facts
- `Recommendation.priority: String` already exists — required, `@@index([priority])`, values seen in code:
  `critical` / `high` / `medium` / `low` (`action.ts::mapPriorityScore`, `recovery-actions.ts`, `seed.ts`).
- Every `Action` is created with a `recommendationId` (`CreateActionInput.recommendationId` is required and is
  persisted by `createAction`). `Action.recommendationId` is a nullable scalar with an index but **no relation
  object**, so a `recommendation`-nested Prisma filter is unavailable — a two-step lookup by id is required.
- `createAction`'s `input.priority` is **already dropped**: it is never written to `Action`; it is only put in the
  audit payload and used for the `=== "critical"` re-evaluation trigger. So the system already treats action
  priority as derived/transient, not a stored Action attribute.
- `createActionsFromInterventions` sets the synthetic `Recommendation.priority` (`"high"`) AND passes a mapped
  `input.priority` — i.e. priority is authored at the recommendation level.

## Options
### (A) Add `Action.priority` column (migration)
- Pros: direct `where: { priority }` filter; per-action granularity.
- Cons: schema migration + backfill for all existing actions (no historical value → guessing); must be written on
  every create and kept in sync with the recommendation; duplicates a signal that already exists; the directive
  explicitly says **"Do not add `Action.priority` without explicit schema decision."** Higher blast radius for a
  runtime-readiness wave whose goal is to stop a throw with minimum code.

### (B) Derive action priority from the linked `Recommendation` — RECOMMENDED
- Pros: uses existing schema (no migration, no invented field); matches how priority is already authored
  (recommendation level) and how `createAction` already treats `input.priority` (not stored); minimal code; honest
  (actions with no recommendation have no priority signal and are excluded, not fabricated).
- Cons: needs a two-step query (fetch overdue actions → look up their recommendations' priority) because there is
  no `recommendation` relation object; actions with a null `recommendationId` are never "high priority" (accepted —
  there is genuinely no priority signal for them).

### (C) Drop priority; escalate every overdue action
- Pros: simplest query.
- Cons: changes the meaning of the `high_priority_overdue` alert (`ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE`);
  over-escalates; loses the real, existing priority signal. Rejected as dishonest to the alert semantics.

## Recommendation
**Option (B).** Derive "critical overdue" from `Recommendation.priority = "critical"` for the overdue action's
`recommendationId`. No `Action.priority` column is added. This is what Wave 6 implements.

## Sub-decision: auto-escalating priority on overdue (`detectOverdueActions`)
`detectOverdueActions` previously tried to **raise** an action's priority when overdue by writing the phantom
`Action.priority`. Under Option (B) there is no per-action priority to raise, and raising the **shared**
`Recommendation.priority` because one of its (possibly many) actions is overdue would over-escalate every sibling
action of that recommendation — a genuine product decision, not a mechanical fix. **Deferred, not guessed**:
Wave 6 removes the always-throwing phantom write and keeps honest overdue **detection** + the `ACTION_OVERDUE`
audit event. Because `detectOverdueActions` has **no production caller** (only `__ignored_tests__` reference it),
this deferral is non-blocking for the owner shadow-pilot runtime path (the wired path,
`detectHighPriorityOverdueActions`, gets the full real fix). If auto-escalation is later wanted, it should escalate
at the recommendation level with an explicit rule for shared recommendations, with its own DB proof.

## Risk if the recommendation is missing or non-critical
An overdue action whose recommendation is not critical (or absent) yields no `high_priority_overdue` alert — the
correct, honest outcome (no critical-priority signal exists). KPI-deterioration escalation
(`detectKPIDeteriorationPattern`) is unaffected and continues to run.

## Tests (implemented this wave)
Critical-recommendation overdue action → alert; non-critical overdue → no alert; critical but not-overdue → no
alert; overdue with no recommendation → no alert; cross-workspace isolation; `detectOverdueActions` no longer
throws and emits `ACTION_OVERDUE`.
