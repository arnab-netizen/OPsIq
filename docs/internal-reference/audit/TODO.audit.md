# Audit TODO: Remaining Violations

Last scanned: 2026-05-02  
Status: 23 violations remaining across 4 categories  
Build: ✓ Passing  
Audit Events: ✓ Complete (all mutations have emitAuditEvent + workspaceId)

---

## [AUTH] - Enforce authContext only, no raw actorId

- [x] src/services/escalation.ts:17 - detectHighPriorityOverdueActions accepts actorId: string instead of authContext
- [x] src/services/escalation.ts:73 - detectKPIDeteriorationPattern accepts actorId: string instead of authContext
- [x] src/services/escalation.ts:149 - checkEngagementEscalations accepts actorId: string instead of authContext
- [x] src/services/execute.ts:44 - executeWorkflow accepts actorId: string instead of authContext
- [x] src/services/action-lifecycle.ts:123 - transitionActionState context.actorId: string (should use authContext)
- [x] src/services/execution-certainty.ts:148 - calculateExecutionCertainty accepts actorId: string instead of authContext
- [x] src/services/idempotency.ts:9 - IdempotencyRecord interface has actorId: string instead of authContext
- [x] src/services/review-cycle.ts:38 - generateReviewCycle accepts actorId: string instead of authContext
- [ ] src/services/report-generator.ts:499 - generateWorkflowReport accepts actorId: string instead of authContext
- [ ] src/services/lead.ts:169 - updateLeadEngagementStatus accepts actorId: string instead of authContext
- [ ] src/services/role-assignment.ts:60 - assignRole accepts actorId: string instead of authContext
- [ ] src/services/role-assignment.ts:184 - removeRoleAssignment accepts actorId: string instead of authContext

---

## [READ] - All queries require workspaceId, no overfetch/filter, includes/select safe, joins scoped

- [x] src/services/escalation.ts:76 - db.kPI.findMany missing workspaceId in where clause (only has engagementId)
- [x] src/services/action-lifecycle.ts:225 - getActionsByEngagementAndState missing workspaceId in query where clause
- [x] src/services/action-lifecycle.ts:234 - getActionsByState missing workspaceId entirely - no workspace isolation on state queries

---

## [CAPABILITY] - Capability checks on all services, read + write enforced

✓ CLEAR - All service functions properly check capabilities via requireCapabilityForService or requireServiceContext

---

## [AUDIT] - All mutations emitAuditEvent, include workspaceId, include actorId(authContext)

✓ CLEAR - All mutations have emitAuditEvent calls with proper workspaceId parameter (Fixed in Phase 1)

---

## [IDEMPOTENCY] - POST routes require idempotency key, decision execution safe, retry safe

- [x] src/app/api/operator/route.ts:45 - POST endpoint missing idempotency-key requirement/validation
- [x] src/app/api/diagnosis/route.ts - POST endpoint missing idempotency-key requirement

---

## [ASYNC] - Background jobs carry workspace context, no bypass paths

- [x] src/services/decision-control/enforcement.service.ts:164 - enforceDecisionControl().catch(() => null) - fire-and-forget error handling swallows errors without logging
- [x] src/services/control/control-surface.service.ts:124 - enforceDecisionControl().catch(() => null) - same fire-and-forget pattern

---

## [DETERMINISM] - Snapshot support, stable outputs

- [x] src/services/escalation.ts:76 - db.kPI.findMany() missing orderBy clause on main result set (only has orderBy on nested snapshots)

---

## [DEPLOYMENT] - No fs local paths, env vars validated, postgres ready, migration safe

✓ CLEAR - No localhost hardcodes or unsafe local paths; proper environment variable validation in place

---

## Summary

| Category | Violations | Status |
|----------|-----------|--------|
| AUTH | 4/12 remaining | ⚠️ 6 fixed: escalation (3), execute, action-lifecycle, execution-certainty, idempotency, review-cycle |
| READ | 0/3 | ✓ CLEAR (Phase 2 complete) |
| CAPABILITY | 0 | ✓ CLEAR |
| AUDIT | 0 | ✓ CLEAR (Phase 1 complete) |
| IDEMPOTENCY | 0/2 | ✓ CLEAR (Phase 2 complete) |
| ASYNC | 0/2 | ✓ CLEAR (Phase 2 complete) |
| DETERMINISM | 0/1 | ✓ CLEAR (Phase 2 complete) |
| DEPLOYMENT | 0 | ✓ CLEAR |

**Total: 9 violations remaining (down from 23)**

---

## Phase 1 Completion

✓ All mutations now emit audit events  
✓ All emitAuditEvent calls include workspaceId (REQUIRED)  
✓ All audit events include actorId from authContext where available  
✓ Build passing with zero type errors  

---

## Phase 2 Completion (Current)

✓ READ Safety - All queries scoped by workspaceId (escalation KPI, action state queries)
✓ IDEMPOTENCY - All new POST routes (operator, diagnosis) require and validate idempotency-key  
✓ ASYNC Safety - All fire-and-forget patterns replaced with proper error logging
✓ DETERMINISM - All critical queries have stable orderBy clauses
✓ AUTH Conversion (Partial) - 6/12 functions converted: escalation (3), execute, action-lifecycle, execution-certainty, idempotency, review-cycle
✓ Build passing with zero type errors

**Remaining Phase 2 Work:** 4 AUTH violations (report-generator, lead, role-assignment x2) - These require coordinated updates across multiple callers

---

## Next Phase Goals

**Phase 2.5: Complete AUTH Conversion** - Fix remaining 4 actorId → authContext conversions (report-generator, lead, role-assignment)
- These require updating callers in test files and service dependencies
- May be simpler to batch fix once caller patterns are identified
