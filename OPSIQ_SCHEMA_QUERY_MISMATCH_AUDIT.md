# OpsIQ Schema/Query Mismatch Audit (Wave 1)

> Every `Action`/`KPI`/`Finding` query site inspected (non-test, non-generated). These three models have **no
> `workspaceId` column** (workspace-scoped via `engagement.workspaceId`). Sites filtering by a flat
> `workspaceId` throw `PrismaClientValidationError` at runtime.
>
> Method: `rg` inventory (128 occurrences / ~35 files) → precise where-clause classification of the 44 sites
> that reference a bare `workspaceId`, plus the 37 already using `engagement: { workspaceId }`.

## Classifications
- **ALREADY_CORRECT** — already `engagement: { workspaceId }`, or the flagged query has no `workspaceId` in its
  actual `where` (false positive; workspace verified by the caller before an update-by-id).
- **CLEAN_RELATION_SCOPE_FIX** — only `workspaceId` is invalid; fixable via the `engagement` relation, no migration.
- **DOMAIN_DECISION_REQUIRED** — also references a non-existent `Action.priority`/`dueDate`; needs a domain call.
- **SCHEMA_DECISION_REQUIRED** — model lacks `workspaceId` entirely and has no workspace-scoped parent relation
  (`User`/`LeadRecord`/`ClientAccount`); needs a migration decision.

## CLEAN_RELATION_SCOPE_FIX — fixed in this wave (32)

### findMany / findFirst / count  (bare `workspaceId` → `engagement: { workspaceId }`)
| File:line | Query |
|---|---|
| engagement-health.ts:39,45 | finding.findMany, action.findMany |
| escalation.ts:77 | kPI.findMany (detectKPIDeteriorationPattern) |
| review-cycle.ts:53,79,95,232,248,261 | kPI/action/finding findMany (×6) |
| recommendation.ts:748,760 | finding.findMany, action.findMany |
| kpi.ts:130 | kPI.findMany (listKPIs) |
| action-lifecycle.ts:284 | action.count |
| report-generator.ts:218,230 | finding.findMany (orderBy severity — valid), kPI.findMany |
| api/engagements/[engagementId]/business-impact/detail/route.ts:46,48 | finding/action findMany |
| api/engagements/[engagementId]/execution-certainty/route.ts:32,38 | finding/action findMany |

### updateMany  (bare `workspaceId` → `engagement: { workspaceId }`; updateMany accepts relation filters)
| File:line | Query |
|---|---|
| action.ts:320 | action.updateMany (updateAction, version-guarded) |
| kpi.ts:260 | kPI.updateMany (updateKPIValue, version-guarded) |
| api/actions/[actionId]/start/route.ts:29 | action.updateMany |
| api/actions/[actionId]/complete/route.ts:32 | action.updateMany |

### findUnique → findFirst + `engagement: { workspaceId }`
| File:line | Query |
|---|---|
| action.ts:340 | action re-read after update |
| kpi.ts:145,291 | kPI read (+snapshots), re-read after update |
| owner-mode/do-not-repeat.service.ts:63 | finding (do-not-repeat keys) |
| owner-mode/recommendation-capacity-safety.service.ts:55 | finding (sensitivity gate) |
| owner-mode/recommendation-input-quality.service.ts:60 | finding (sensitivity gate) |
| owner-finance/recommendation-cash-safety.service.ts:61 | finding (sensitivity gate) |
| owner-finance/recommendation-margin-safety.service.ts:49 | finding (sensitivity gate) |
| decision-confidence/recommendation-confidence.service.ts:84 | finding (compliance-sensitivity gate) |
| business-impact/impact-delta.service.ts:83 | action (+include engagement) |
| api/engagements/[engagementId]/actions/[actionId]/route.ts:28 | action (engagement lookup) |
| api/actions/[actionId]/impact-delta/route.ts:17 | action |

## DOMAIN_DECISION_REQUIRED — deferred (see DEFERRED_DECISIONS.md)
| File:line | Reason |
|---|---|
| escalation.ts:25 (detectHighPriorityOverdueActions) | filters `Action.priority` + `dueDate` (no such columns) |
| report-generator.ts:226 | action `orderBy [{ dueDate }, { priority }]` (no such columns) |
| action.ts:418 | reprioritization writes `Action.priority` (no such column) |

## SCHEMA_DECISION_REQUIRED — deferred (tracked BROKEN-SVC-1/2/3)
`services/user.ts`, `services/lead.ts`, `services/client-contact.ts` — `User`/`LeadRecord`/`ClientAccount`
have no `workspaceId` and no workspace-scoped parent relation. Needs a migration or membership-scoping rewrite.

## ALREADY_CORRECT / false positives (no change)
37 sites already use `engagement: { workspaceId }` (e.g. re-evaluation.ts:201/310/321, decision-control,
decision-evidence, business-impact.service, decision-confidence.service, execution-drift, findings.ts read
paths, owner-dashboard). Plus update-by-id sites where the caller pre-verifies workspace ownership:
`action.ts:469` (findUnique by id), `findings.ts:211/269/317/375` (update by id after engagement-scoped read),
`outcome/outcome.service.ts:176` (update by id). Sibling models with real `workspaceId` in mixed queries
(`Recommendation`, `BusinessConditionProfile`, `Engagement`) are left unchanged.
