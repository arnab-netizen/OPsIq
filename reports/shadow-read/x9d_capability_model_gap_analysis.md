# X9D: Capability Model Gap Analysis

**Date:** 2026-05-15  
**Status:** ANALYSIS COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Executive Summary

The capability model has a **CRITICAL GAP**: Two separate capability namespaces exist and are used inconsistently:

1. **Domain CAPABILITIES** (domain/constants/capabilities.ts) - Format: `"domain:action"` (e.g., `"decision:accept"`)
2. **Entitlement Capability** (services/entitlement.ts) - Format: `"action_operation"` (e.g., `"decision_create"`)

This creates security risks and blocks governance service refactoring.

---

## Problem Statement

### The Two Namespaces

**Namespace 1: Domain CAPABILITIES**
```typescript
// src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",
  DECISION_CREATE: undefined,  // MISSING!
  DECISION_UPDATE: undefined,  // MISSING!
  STAGE_CREATE: "stage:create",
  STAGE_TRANSITION: "stage:transition",
  OWNER_VIEW: "owner:view",
  OWNER_MANAGE: "owner:manage",
  // ... many more ...
};
```

**Namespace 2: Entitlement Capability**
```typescript
// src/services/entitlement.ts
export enum Capability {
  DECISION_CREATE = "decision_create",
  DECISION_UPDATE = "decision_update",
  ACTION_CREATE = "action_create",  // duplicate with domain!
  EXPERIMENT_CREATE = "experiment_create",
  ADMIN_SETTINGS = "admin_settings",
  // ... no STAGE_* ...
  // ... no OWNER_VIEW/OWNER_MANAGE ...
}
```

### The Inconsistency

| Operation | Domain CAPABILITIES | Entitlement Capability | Used By |
|-----------|-------------------|----------------------|---------|
| DECISION_CREATE | ❌ Missing | ✓ Exists | decisions/create/route.ts |
| DECISION_UPDATE | ❌ Missing | ✓ Exists | quota enforcement |
| DECISION_ACCEPT | ✓ Exists | ❌ Missing | decision routes |
| DECISION_REJECT | ✓ Exists | ❌ Missing | decision routes |
| STAGE_CREATE | ✓ Exists | ❌ Missing | stage.ts service |
| STAGE_TRANSITION | ✓ Exists | ❌ Missing | stage.ts service |
| OWNER_VIEW | ✓ Exists | ❌ Missing | owner/dashboard routes |
| ACTION_CREATE | ✓ Exists | ✓ Exists | both (DUPLICATE!) |

---

## Gap Questions & Answers

### Q1: Which governance actions currently lack CAPABILITIES constants?

**Answer:**
- `DECISION_CREATE` - exists only in entitlements, missing from domain CAPABILITIES
- `DECISION_UPDATE` - exists only in entitlements, missing from domain CAPABILITIES
- `EXPERIMENT_CREATE` - exists only in entitlements
- `EXPERIMENT_UPDATE` - exists only in entitlements
- `ADMIN_SETTINGS` - exists only in entitlements
- `ADMIN_TEAM` - exists only in entitlements
- `WORKSPACE_CREATE` - exists only in entitlements
- `WORKSPACE_INVITE` - exists only in entitlements

**Status:** 8 governance actions missing from domain CAPABILITIES

---

### Q2: Which entitlement strings overlap with capability concepts?

**Answer:**

Overlapping concepts:
- `ACTION_CREATE` - defined in both namespaces
  - Domain: `"action:create"`
  - Entitlement: `"action_create"`
  - **Problem:** Different formats for same concept

- `ACTION_UPDATE` - defined in both
  - Domain: `"action:update"`
  - Entitlement: `"action_update"`
  - **Problem:** Different formats for same concept

- `ACTION_DELETE` - entitlement only, but no domain equivalent
- `AUDIT_VIEW` - defined in both with different formats
- `AUDIT_EXPORT` - defined in both with different formats

**Status:** Partial overlap with inconsistent formats

---

### Q3: Should decision_create become DECISION_CREATE in domain CAPABILITIES?

**Answer:** ✓ **YES, MUST DO**

**Evidence:**
- decisions/create/route.ts calls `assertCapability(workspaceId, "decision_create")`
- This is a runtime auth check, not just quota enforcement
- Decision creation should be governed by ServiceAuthEnvelope once services are refactored
- Currently uses entitlement-only check, cannot work with domain CAPABILITIES-based ServiceAuthEnvelope

**Recommendation:**
Add to domain CAPABILITIES:
```typescript
DECISION_CREATE: "decision:create",
DECISION_UPDATE: "decision:update",
```

---

### Q4: Should stage transitions have separate capabilities?

**Answer:** ✓ **YES, CURRENT DESIGN IS CORRECT**

**Evidence:**
- stage.ts already has separate capabilities:
  - `STAGE_CREATE` - create new stage
  - `STAGE_TRANSITION` - change status, block/unblock
  - `STAGE_VIEW` - read stage data
- These are appropriate because transitions modify engagement state

**Recommendation:**
- Keep separate capabilities (they're already defined)
- Clarify whether they should be plan-gated in entitlements
- Decision: Keep domain-only OR add to entitlements if plan-specific

---

### Q5: Should owner-dashboard aggregation require a governance capability?

**Answer:** ⚠️ **UNCLEAR - REQUIRES CLARIFICATION**

**Evidence:**
- getOwnerDashboard aggregates governance-aware data (findings, recommendations, actions, conditions, execution metrics)
- Currently requires ENGAGEMENT_VIEW capability
- Unclear if this is sufficient for governance-aware aggregation
- No separate OWNER_DASHBOARD_VIEW or DASHBOARD_AGGREGATE capability

**Options:**
1. **Keep ENGAGEMENT_VIEW** - Dashboard read assumes engagement visibility
2. **Add DASHBOARD_AGGREGATE** - Explicit capability for dashboard aggregation
3. **Add OWNER_MODE_DASHBOARD** - Separate from engagement dashboard

**Recommendation:**
- If dashboard is plan-specific: Add capability mapping
- If dashboard is always available: Keep ENGAGEMENT_VIEW
- **Decision:** Deferred to governance design clarification phase

---

### Q6: Which mappings would be unsafe or too broad?

**Answer:**

**UNSAFE:**
- `WORKSPACE_ADMIN` as catch-all for all workspace operations (too broad)
- `GOVERNANCE_MANAGE` without clear scope (unclear what's managed)
- `INTERVENTION_ALL_OPERATIONS` (too vague)

**TOO BROAD:**
- Mapping ADMIN_SETTINGS to single capability (should be more granular)
- Mapping DECISION_* operations to single DECISION_MANAGE (loses granularity)
- Using ENGAGEMENT_MANAGE for all engagement operations (should be separate CREATE/UPDATE/DELETE)

**SAFE:**
- Mapping plan-based quotas to specific _CREATE operations (decision_create, experiment_create)
- Keeping governance operations separate (DECISION_ACCEPT vs DECISION_REJECT)
- Keeping view operations separate from manage operations (OWNER_VIEW vs OWNER_MANAGE)

---

### Q7: Which mappings are minimum necessary?

**Answer:**

**MINIMUM REQUIRED (to unblock service refactoring):**
1. Add `DECISION_CREATE` to domain CAPABILITIES → Unblocks decisions/create refactoring
2. Add `DECISION_UPDATE` to domain CAPABILITIES → Maintains quota model
3. Clarify stage capabilities mapping → Unblocks stage.ts refactoring
4. Clarify owner dashboard mapping → Unblocks owner-dashboard service refactoring

**NOT REQUIRED FOR X9C:**
- Experiment capabilities (no routes found for experiments)
- Workspace capabilities (admin-level, not in service lanes)
- Admin capabilities (admin-level, not in service lanes)

**MINIMUM SET:**
```typescript
CAPABILITIES: {
  DECISION_CREATE: "decision:create",  // ADD
  DECISION_UPDATE: "decision:update",  // ADD
  // Keep existing stage, owner, and other capabilities
}
```

---

### Q8: Which mappings must remain deferred?

**Answer:**

**DEFERRED to X9E (after X9D completes):**
- Policy-specific governance aggregations (dashboard depends on policy context)
- Workspace membership role mappings (depends on role design)
- Financial/billing gating (depends on entitlement clarification)

**DEFERRED to X9D completion:**
- Owner-dashboard aggregation capability mapping
- Stage transition plan-gating decision
- Experiment capability mapping

---

## Consolidated Gap List

### Critical Gaps (Block Service Refactoring)
1. ❌ `DECISION_CREATE` missing from domain CAPABILITIES
2. ❌ `DECISION_UPDATE` missing from domain CAPABILITIES
3. ❌ Two capability namespaces used inconsistently

### High-Priority Gaps (Governance Clarity)
4. ⚠️ Stage operations not plan-gated in entitlements
5. ⚠️ Owner-dashboard capability mapping unclear
6. ⚠️ Intervention operations not in entitlements

### Medium-Priority Gaps (Future Clarification)
7. ⚠️ Experiment operations only in entitlements
8. ⚠️ Admin operations only in entitlements
9. ⚠️ Workspace operations only in entitlements

---

## Dependency Chain

```
Add DECISION_CREATE/UPDATE to domain CAPABILITIES
    ↓
Unblock decisions/create route refactoring
    ↓
Enable decision service migration to ServiceAuthEnvelope
    ↓
Clear path for decision governance (X9C-5+)
    ↓
Clarify stage transition gating
    ↓
Unblock stage.ts service refactoring (X9C-5)
    ↓
Clarify owner-dashboard aggregation
    ↓
Unblock owner-dashboard service refactoring
```

---

## Conclusion

**The capability model has a CRITICAL GAP that must be resolved before service refactoring can continue:**

1. Add `DECISION_CREATE` and `DECISION_UPDATE` to domain CAPABILITIES
2. Unify namespace formats (all domain CAPABILITIES should use `"domain:action"` format)
3. Clarify which entitlement-only capabilities need domain equivalents
4. Establish governance capability mapping rules

**These changes are PREREQUISITE to X9C-5 (Service Refactor Pilots 2+) and must be designed before implementation.**

