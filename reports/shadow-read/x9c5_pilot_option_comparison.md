# X9C-5: Pilot Option Comparison

**Date:** 2026-05-15  
**Status:** COMPARISON COMPLETE  
**Decision:** Neither option safe for X9C-5

---

## Candidates Evaluated

Two remaining service blockers with auth-guard imports:
1. stage.ts
2. owner-dashboard.service.ts

---

## Option 1: stage.ts

### Basic Metrics
- **File size:** 334 lines
- **Exported functions:** 6
- **Auth-guard imports:** 1 (requireCapabilityForService)
- **requireCapabilityForService calls:** 4 visible
- **Route callers:** 0 visible (no stage/* routes found)
- **Service-to-service callers:** Unknown (not visible in codebase)
- **Scanner reduction if refactored:** 1 violation

### Function Inventory
1. **createStage** - Creates new stage, requires STAGE_CREATE capability
2. **getStage** - Retrieves single stage, requires STAGE_VIEW capability
3. **getStagesForEngagement** - Lists stages, requires STAGE_VIEW capability
4. **updateStage** - Updates stage properties/status, requires STAGE_TRANSITION capability
5. **blockStage** - Blocks engagement via stage, requires STAGE_TRANSITION capability
6. **unblockStage** - Unblocks engagement via stage, requires STAGE_TRANSITION capability

### Governance Dependencies
- **Stage transitions:** Validates via validateStageTransition(oldStatus, newStatus)
- **Engagement blocking:** Directly modifies engagement.isBlocked state
- **Re-evaluation:** Calls triggerReEvaluation() when appropriate
- **Governance impact:** HIGH - stages are intervention phase components

### Policy Dependencies
- Calls validateStageTransition from policies/state-transition
- No direct policy context usage, but state-transition is policy-related

### Callers
- **Route callers:** None found (src/app/api has no /stages routes)
- **Service callers:** Unknown
- **Scope visibility:** LOW - no visible callers = no clear scope

### Capability Requirements
- STAGE_CREATE
- STAGE_VIEW
- STAGE_TRANSITION (used in 2 functions)

### Risk Assessment

**Complexity:** MEDIUM
- 6 functions (larger than findings.ts 7, similar to deliverable.ts 2)
- Multiple capability checks
- Complex state transitions
- Conditional audit events
- Version management

**Governance Dependency:** HIGH
- Modifies engagement.isBlocked state
- Validates stage transitions (critical to intervention phase)
- Triggers re-evaluation on state changes

**Policy Dependency:** MEDIUM
- Validates transitions via policy
- No direct policy context in function

**Caller Clarity:** LOW
- No visible route callers
- No visible service-to-service callers
- Scope is unclear

**Blast Radius:** UNKNOWN
- Unknown caller count = unknown impact
- Could be critical internal service or unused

**Rollback Difficulty:** HIGH
- 6 functions to refactor and test
- Stage transitions are critical
- Unknown external dependencies make rollback risky

---

## Option 2: owner-dashboard.service.ts

### Basic Metrics
- **File size:** 444 lines
- **Exported functions:** 1 (getOwnerDashboard)
- **Auth-guard imports:** 1 (requireCapabilityForService)
- **requireCapabilityForService calls:** 1
- **Route callers:** 1 confirmed (engagements/[id]/dashboard/route.ts)
- **Service-to-service callers:** 0 visible
- **Scanner reduction if refactored:** 1 violation

### Function Inventory
1. **getOwnerDashboard** - Aggregates dashboard data for engagement owner/manager

### Function Details
```typescript
async function getOwnerDashboard(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<OwnerDashboardData>
```

**Scope:** Single public function (simpler than stage.ts)
**Mutation:** None (read-only)
**Dependency count:** 6 service dependencies

### Service Dependencies
1. **execution-certainty** - Calculates probability of successful execution
2. **execution-drift** - Detects execution drift from plan
3. **decision-confidence** - Computes decision confidence metrics
4. **financial-normalization** - Normalizes financial impact
5. **business-impact** - Generates business impact summary
6. **decision-control** - Determines primary decision

### Governance Dependencies
- **Reads governance-dependent entities:** Findings, recommendations, actions, business condition
- **Aggregates governance data:** Execution certainty, drift, decision confidence
- **Does NOT modify governance state:** Read-only aggregation
- **Governance impact:** HIGH - depends on governance-aware services

### Policy Dependencies
- All 6 dependent services are policy-aware
- Dashboard aggregates policy-determined metrics
- No direct policy context in getOwnerDashboard, but dependent services use policy

### Callers
- **Route callers:** 1 confirmed (engagements/[id]/dashboard/route.ts GET)
- **Service callers:** None visible
- **Scope visibility:** HIGH - single clear caller

### Capability Requirements
- ENGAGEMENT_VIEW (1 check)

### Risk Assessment

**Complexity:** HIGH
- 1 function (smaller scope than stage.ts)
- BUT function has 6 service dependencies
- Aggregates complex metrics (execution certainty, drift, confidence)
- Parallel Promise.all() data fetching
- Complex data transformation

**Governance Dependency:** HIGH
- Reads and aggregates data from governance-aware services
- Depends on execution certainty, drift detection, decision framework
- Will be affected by governance design changes

**Policy Dependency:** HIGH
- All 6 dependent services are policy-aware
- No way to refactor getOwnerDashboard without understanding policy impact

**Caller Clarity:** HIGH
- 1 confirmed route caller
- Clear scope and impact
- Easy to test changes

**Blast Radius:** MEDIUM
- Single route caller limits blast radius
- BUT: Dashboard is critical path (manager/owner decision-making tool)
- Aggregates metrics that influence business decisions

**Rollback Difficulty:** MEDIUM
- 1 function to refactor (easier than stage.ts)
- Single route caller (easier to test and rollback)
- BUT: Complex aggregation logic must be preserved exactly

---

## Comparison Summary

| Dimension | stage.ts | owner-dashboard.service.ts |
|-----------|----------|---------------------------|
| **Function count** | 6 | 1 |
| **Lines of code** | 334 | 444 |
| **Auth-guard calls** | 4 | 1 |
| **Capabilities** | 3 (CREATE, VIEW, TRANSITION) | 1 (ENGAGEMENT_VIEW) |
| **Route callers** | 0 (unclear) | 1 (clear) |
| **Service dependencies** | 3 (validation, re-eval, audit) | 6 (complex aggregation) |
| **Governance dependent** | YES (modifies state) | YES (reads state) |
| **Policy dependent** | MEDIUM | HIGH |
| **Scope clarity** | LOW (unknown callers) | HIGH (1 route caller) |
| **Mutation risk** | HIGH (modifies engagement) | LOW (read-only) |
| **Complexity** | MEDIUM (6 functions) | HIGH (6 dependencies) |
| **Blast radius** | UNKNOWN (unknown callers) | MEDIUM (1 caller) |
| **Refactor difficulty** | MEDIUM-HIGH (6 functions) | MEDIUM (1 function) |
| **Rollback difficulty** | HIGH | MEDIUM |

---

## Risk Analysis

### stage.ts Risks
**BLOCKER:** No visible route callers
- Cannot determine if service is in use
- Cannot test refactoring thoroughly
- Unknown service-to-service dependencies
- **Recommendation:** Do NOT refactor without understanding all callers

**BLOCKER:** Governance dependent (modifies state)
- Changes engagement.isBlocked state
- Validates stage transitions (critical to phase lifecycle)
- Triggers re-evaluation
- **Recommendation:** Defer until governance design clarifies intervention phase

### owner-dashboard.service.ts Risks
**BLOCKER:** Governance dependent (aggregates state)
- Reads data from 6 governance-aware services
- Depends on execution certainty, drift detection, decision confidence
- All these services may change during governance design
- **Recommendation:** Defer until governance design phase completes

**BLOCKER:** Policy dependent
- All 6 dependent services are policy-aware
- Dashboard logic depends on policy-determined outputs
- Refactoring without policy clarity risks introducing mutations or logic errors
- **Recommendation:** Defer until policy contract is settled

---

## Conclusion

### stage.ts: RECOMMEND DEFER
- **Primary blocker:** No visible route callers (unclear scope)
- **Secondary blocker:** Governance dependent (modifies state)
- **Decision:** Not safe to refactor without first understanding all call sites and governance impact

### owner-dashboard.service.ts: RECOMMEND DEFER
- **Primary blocker:** High governance and policy dependency
- **Secondary blocker:** 6 service dependencies all subject to governance design changes
- **Decision:** Not safe to refactor until governance and policy design phases clarify aggregation requirements

---

## Recommendation

**SELECT:** Neither service for X9C-5 pilot

**REASON:** Both remaining service blockers are governance-dependent. Refactoring either without resolving X9D (Governance Design) first would create technical debt and risk logic errors when governance design clarifies intervention phases, decision frameworks, and policy aggregations.

**NEXT PHASE:** Recommend deferring service refactor pilots (X9C-5, X9C-6, X9C-7) until X9D completes.

