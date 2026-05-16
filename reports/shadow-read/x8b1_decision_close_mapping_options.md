# X8B-1: DECISION_CLOSE Mapping Options

**Date:** 2026-05-16  
**Phase:** X8B-1 Phase D - Design Options  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Option A: Map DECISION_CLOSE to Roles that SHOULD Have Close (Intended Behavior)

**Description:** Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER + SYSTEM_ADMIN roles (assuming these are the roles that should close decisions)

**Implementation:**
```typescript
// In src/policies/capability-check.ts ROLE_CAPABILITIES:
[ROLES.SYSTEM_ADMIN]: Object.values(CAPABILITIES),  // All capabilities
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing capabilities ...
  CAPABILITIES.DECISION_CLOSE,  // ADD THIS
],
```

**Role Mapping:**
- SYSTEM_ADMIN: ✓ YES (has all capabilities)
- ADMIN_OR_PORTFOLIO_MANAGER: ✓ YES
- EXPERIENCED_CONSULTANT: ✗ NO
- BEGINNER_CONSULTANT: ✗ NO
- ANALYST: ✗ NO
- CLIENT_OWNER: ✗ NO
- CLIENT_TEAM_MEMBER: ✗ NO
- VIEWER: ✗ NO

**Entitlement Mapping:** NONE (close doesn't consume quotas)

---

### Evaluation for Option A

| Factor | Assessment | Details |
|---|---|---|
| **Behavior Preservation** | GOOD | Assumes admin/portfolio manager were intended closers |
| **Least Privilege** | GOOD | Restrictive, only 2 roles |
| **Enterprise Auditability** | GOOD | Clear role assignment |
| **Risk of Blocking Users** | LOW | If legacy was broken (which it is), no current users blocked |
| **Risk of Over-Broad Access** | VERY LOW | Only admin/manager roles |
| **Entitlement Impact** | NONE | No entitlement changes needed |
| **Route Migration Readiness** | HIGH | After role mapping, route can use requireCapabilities |
| **Service Refactor Readiness** | HIGH | Service unchanged, route migration possible |
| **Testability** | HIGH | Can test with admin and non-admin roles |
| **Rollback Simplicity** | HIGH | Remove from ROLE_CAPABILITIES to revert |

**Pros:**
- ✓ Fixes broken legacy close_decision
- ✓ Implements intended behavior (admin/manager finalization)
- ✓ Least privilege (only 2 roles)
- ✓ No entitlement complexity
- ✓ Enables future route modernization
- ✓ Clear audit trail

**Cons:**
- ✗ Requires role mapping work
- ✗ Assumes admin/portfolio manager are correct closers

**Risk Assessment:** LOW (addressing broken legacy, enabling future work)

---

## Option B: Map DECISION_CLOSE Only to SYSTEM_ADMIN

**Description:** Most restrictive - only system admin can close decisions

**Implementation:**
```typescript
// Only SYSTEM_ADMIN gets DECISION_CLOSE (via Object.values(CAPABILITIES))
// No explicit role mapping needed
```

**Role Mapping:**
- SYSTEM_ADMIN: ✓ YES (only role)
- All others: ✗ NO

**Entitlement Mapping:** NONE

---

### Evaluation for Option B

| Factor | Assessment | Details |
|---|---|---|
| **Behavior Preservation** | MEDIUM | Very restrictive, may be too limited |
| **Least Privilege** | VERY HIGH | Most restrictive option |
| **Enterprise Auditability** | GOOD | Clear system admin gate |
| **Risk of Blocking Users** | MEDIUM | If portfolio managers need to close, they're blocked |
| **Risk of Over-Broad Access** | VERY LOW | Only system admin |
| **Entitlement Impact** | NONE | No entitlement changes |
| **Route Migration Readiness** | HIGH | Can migrate route after role mapping |
| **Service Refactor Readiness** | HIGH | Independent of role mapping |
| **Testability** | MEDIUM | Limited test coverage (only system admin) |
| **Rollback Simplicity** | HIGH | SYSTEM_ADMIN already has all capabilities |

**Pros:**
- ✓ Most restrictive (highest security)
- ✓ No assumptions about who should close
- ✓ Clear gate (system admin only)

**Cons:**
- ✗ May be too restrictive
- ✗ Portfolio managers blocked from closing
- ✗ Doesn't match expected behavior (admin + portfolio manager)
- ✗ Creates operational bottleneck

**Risk Assessment:** MEDIUM (may over-restrict access)

---

## Option C: Keep Legacy close_decision Indefinitely

**Description:** Do NOT fix the broken legacy system. Leave close_decision as-is (broken) and do NOT map DECISION_CLOSE to roles.

**Implementation:** NO CHANGES

---

### Evaluation for Option C

| Factor | Assessment | Details |
|---|---|---|
| **Behavior Preservation** | POOR | Preserves broken state |
| **Least Privilege** | N/A | System is broken (everyone blocked) |
| **Enterprise Auditability** | POOR | Ambiguous (intentional block or bug?) |
| **Risk of Blocking Users** | CRITICAL | All users already blocked (broken legacy) |
| **Risk of Over-Broad Access** | NONE | No one can access |
| **Entitlement Impact** | NONE | No changes |
| **Route Migration Readiness** | NO | Defers indefinitely |
| **Service Refactor Readiness** | NO | Defers indefinitely |
| **Testability** | POOR | Tests would fail (everyone blocked) |
| **Rollback Simplicity** | N/A | No changes to rollback |

**Pros:**
- ✓ No implementation effort
- ✓ No risk of changing behavior
- ✓ Defers decision

**Cons:**
- ✗ Leaves system broken (no one can close decisions)
- ✗ DECISION_CLOSE constant exists but unused
- ✗ Doesn't enable future modernization
- ✗ Not a real solution
- ✗ Creates confusion (capability exists but doesn't work)

**Risk Assessment:** HIGH (perpetuates broken functionality)

---

## Option D: Map DECISION_CLOSE Through Entitlement/Plan Only

**Description:** Add decision_close to subscription tiers and gate closing by entitlement, NOT by workspace role

**Implementation:**
```typescript
// In src/services/entitlement.ts:
export enum Capability {
  // ... existing ...
  DECISION_CLOSE = "decision_close",  // ADD THIS
}

export const TIER_CONFIGS = {
  [SubscriptionTier.FREE]: {
    capabilities: [
      // ... existing ...
      // NO decision_close (free tier can't close)
    ],
  },
  [SubscriptionTier.PRO]: {
    capabilities: [
      // ... existing ...
      Capability.DECISION_CLOSE,  // ADD THIS
    ],
  },
  [SubscriptionTier.ENTERPRISE]: {
    capabilities: [
      // ... existing ...
      Capability.DECISION_CLOSE,  // ADD THIS
    ],
  },
};
```

**Role Mapping:** NONE - not role-based

**Entitlement Mapping:** PRO and ENTERPRISE tiers only

---

### Evaluation for Option D

| Factor | Assessment | Details |
|---|---|---|
| **Behavior Preservation** | POOR | Tier-based doesn't match role-based legacy |
| **Least Privilege** | MEDIUM | Depends on tier boundaries |
| **Enterprise Auditability** | POOR | Mixed role + entitlement gates |
| **Risk of Blocking Users** | HIGH | Blocking by plan tier, not by role |
| **Risk of Over-Broad Access** | MEDIUM | All users in PRO+ tier get close |
| **Entitlement Impact** | HIGH | Changes subscription tier logic |
| **Route Migration Readiness** | MEDIUM | Would use assertCapability (plan check) |
| **Service Refactor Readiness** | MEDIUM | Plan-based, different pattern |
| **Testability** | MEDIUM | Tier-based tests needed |
| **Rollback Simplicity** | MEDIUM | Remove from TIER_CONFIGS |

**Pros:**
- ✓ Enables plan-based gating (monetization)
- ✓ Different from legacy (fresh start)

**Cons:**
- ✗ Doesn't match legacy role-based pattern
- ✗ Mixing entitlement + role gates
- ✗ Creates complexity (which gate applies?)
- ✗ May block users in lower tiers regardless of role
- ✗ Not ideal for internal decision operations (usually role-based, not plan-based)

**Risk Assessment:** MEDIUM (mixes authorization patterns)

---

## Option E: Two-Step Migration (Legacy Fix → Modern Route)

**Description:**
- Step 1 (NOW): Fix legacy by adding DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER + SYSTEM_ADMIN in ROLE_CAPABILITIES
- Step 2 (LATER): Modernize close route to use requireCapabilities instead of legacy hasPermission

**Implementation - Step 1:**
```typescript
// In ROLE_CAPABILITIES:
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing ...
  CAPABILITIES.DECISION_CLOSE,
],
```

**Implementation - Step 2 (later phase):**
```typescript
// In close route (future):
export const POST = withCanonicalEnforcement(
  async (ctx) => { /* ... */ },
  { requireCapabilities: ["DECISION_CLOSE"], requireWorkspace: true }
);
```

**Role Mapping - Step 1:** YES (add to ADMIN_OR_PORTFOLIO_MANAGER)

**Entitlement Mapping:** NONE (close doesn't need quotas)

---

### Evaluation for Option E

| Factor | Assessment | Details |
|---|---|---|
| **Behavior Preservation** | GOOD | Step 1 fixes legacy, Step 2 modernizes |
| **Least Privilege** | GOOD | Role-based, only 2 roles |
| **Enterprise Auditability** | GOOD | Clear role assignment |
| **Risk of Blocking Users** | LOW | Step 1 fixes broken state |
| **Risk of Over-Broad Access** | VERY LOW | Only admin/portfolio manager |
| **Entitlement Impact** | NONE | No entitlement changes |
| **Route Migration Readiness** | HIGH | Step 1 enables Step 2 |
| **Service Refactor Readiness** | HIGH | Can follow route modernization |
| **Testability** | HIGH | Both legacy and modern patterns |
| **Rollback Simplicity** | HIGH | Step 1 reversible, Step 2 independent |

**Pros:**
- ✓ Fixes broken legacy immediately (Step 1)
- ✓ Enables future modernization (Step 2)
- ✓ Clear two-phase approach
- ✓ Least privilege (2 roles)
- ✓ No entitlement complexity
- ✓ Can test both patterns

**Cons:**
- ✗ Requires two phases instead of one
- ✗ Step 1 leaves legacy code in place temporarily
- ✗ Step 2 depends on Step 1 completion

**Risk Assessment:** LOW (phased, low risk)

---

## Comparison Matrix

| Factor | Option A | Option B | Option C | Option D | Option E |
|---|---|---|---|---|---|
| **Behavior Preservation** | GOOD | MEDIUM | POOR | POOR | GOOD |
| **Least Privilege** | GOOD | VERY HIGH | N/A | MEDIUM | GOOD |
| **Auditability** | GOOD | GOOD | POOR | POOR | GOOD |
| **Blocking Risk** | LOW | MEDIUM | CRITICAL | HIGH | LOW |
| **Over-Broad Risk** | V.LOW | V.LOW | NONE | MEDIUM | V.LOW |
| **Entitlement Impact** | NONE | NONE | NONE | HIGH | NONE |
| **Route Readiness** | HIGH | HIGH | NO | MEDIUM | HIGH |
| **Service Readiness** | HIGH | HIGH | NO | MEDIUM | HIGH |
| **Testability** | HIGH | MEDIUM | POOR | MEDIUM | HIGH |
| **Rollback** | HIGH | HIGH | N/A | MEDIUM | HIGH |
| **Overall Risk** | LOW | MEDIUM | HIGH | MEDIUM | LOW |

---

## Recommendation for Selection

**Most Aligned with X9G Intent:** Option E (Two-Step Migration)

**Rationale:**
1. ✓ Fixes broken close_decision legacy (Step 1)
2. ✓ Enables modernization (Step 2)
3. ✓ Least privilege (2 roles: admin + portfolio manager)
4. ✓ No entitlement complexity
5. ✓ Clear, phased approach
6. ✓ Low risk both steps

**Alternative if Speed Preferred:** Option A (Direct modern mapping)

**Not Recommended:**
- ✗ Option B: Too restrictive
- ✗ Option C: Perpetuates broken state
- ✗ Option D: Mixes authorization patterns

---

## Next Steps

Select ONE option in Phase E (Final Decision)
