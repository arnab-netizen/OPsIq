# X9D: Governance Capability Design Options

**Date:** 2026-05-15  
**Status:** OPTIONS EVALUATED  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Overview

Five design options for resolving the capability model gap:

- **Option A:** Add missing capabilities directly to domain CAPABILITIES
- **Option B:** Map entitlement strings to existing CAPABILITIES without new constants
- **Option C:** Create dedicated GOVERNANCE_CAPABILITIES namespace with explicit mapping
- **Option D:** Keep governance entitlements separate with enforcement adapter
- **Option E:** Use hasInternalAccess/owner-only checks instead of explicit governance capabilities

---

## Option A: Add Missing Governance Actions Directly to CAPABILITIES

### Design
Add all missing governance actions to domain CAPABILITIES with consistent `"domain:action"` format:

```typescript
// src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  // Decisions (ADD THESE)
  DECISION_CREATE: "decision:create",       // NEW
  DECISION_UPDATE: "decision:update",       // NEW
  DECISION_ACCEPT: "decision:accept",       // existing
  DECISION_REJECT: "decision:reject",       // existing
  
  // Experiments (ADD THESE)
  EXPERIMENT_CREATE: "experiment:create",   // NEW
  EXPERIMENT_UPDATE: "experiment:update",   // NEW
  
  // Admin (ADD THESE)
  ADMIN_SETTINGS: "admin:settings",         // NEW
  ADMIN_TEAM: "admin:team",                 // NEW
  
  // Keep existing capabilities...
};
```

### Security Impact
**Positive:**
- ✓ Single capability namespace = consistent enforcement
- ✓ All governance capabilities checked against same CAPABILITIES enum
- ✓ Type-safe (TypeScript enums catch missing constants)
- ✓ Audit trail consistent (all use same format)

**Risks:**
- ⚠️ Entitlement system must support quota enforcement on new capabilities
- ⚠️ Requires migration of existing entitlement checks to use new constants

### Tenant Isolation Impact
**No negative impact.** Capabilities are per-workspace, tenant isolation is preserved.

### Enterprise Auditability
**Improved:** Single namespace means audit logs use consistent capability names across all operations.

### Scanner Compatibility
**Excellent:** Scanner already understands CAPABILITIES. No changes needed. All capabilities checked against same enum means scanner sees unified governance model.

### Implementation Complexity
**Low to Medium:**
- ✓ Add 6-8 new constants to CAPABILITIES
- ✓ Update entitlement system to recognize new constants
- ✓ Update routes/services to use new constants instead of entitlement string literals
- ✓ Write tests for new capabilities

### Risk of Over-Broad Permissions
**Low:** Each capability is specific (e.g., `decision:create` not `decision:manage`). Granularity preserved.

### Compatibility with Existing Routes
**Good:** Routes already using CAPABILITIES will work. Routes using entitlement strings must be updated.

**Files to update:**
- decisions/create/route.ts (change from `assertCapability("decision_create")` to check CAPABILITIES.DECISION_CREATE)
- recommendations/route.ts (same)

### Compatibility with Billing/Entitlements
**Medium:** Entitlement service must accept new capabilities in tier configs:

```typescript
export const TIER_CONFIGS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  [SubscriptionTier.FREE]: {
    capabilities: [
      Capability.ACTION_CREATE,
      Capability.DECISION_CREATE,    // NEW - must add
      Capability.EXPERIMENT_CREATE,  // NEW - must add
    ],
  },
};
```

### Compatibility with ServiceAuthEnvelope
**Excellent:** ServiceAuthEnvelope already carries `verifiedCapabilities` which are CAPABILITIES constants. New capabilities integrate seamlessly.

### Compatibility with withCanonicalPolicyEnforcement
**Excellent:** Policy wrapper uses CAPABILITIES for checks. New capabilities work automatically.

### Expected Violation Reduction
**Minimal:** Adding constants doesn't reduce scanner violations. Violations come from using old patterns (auth-guard imports). Service refactoring reduces violations.

---

## Option B: Map Entitlement Strings to Existing CAPABILITIES Without New Constants

### Design
Keep entitlement enum separate, create mapping layer:

```typescript
// src/lib/governance-capability-mapping.ts
export const ENTITLEMENT_TO_CAPABILITIES: Record<string, string> = {
  "decision_create": CAPABILITIES.DECISION_ACCEPT,  // Map to existing
  "decision_update": CAPABILITIES.DECISION_REJECT,  // Map to existing
  "experiment_create": CAPABILITIES.INTERVENTION_MANAGE,
};

// Routes use:
const capability = ENTITLEMENT_TO_CAPABILITIES[entitlementString];
const hasCapability = verifiedCapabilities.has(capability);
```

### Security Impact
**Negative:**
- ❌ Mapping layer obscures actual capability being checked
- ❌ Easy to create incorrect mappings (e.g., mapping CREATE to REJECT)
- ❌ Multiple code paths checking capabilities (confusion risk)
- ❌ Audit logs show mapped capability, not actual operation (DECISION_REJECT instead of decision_create)

### Tenant Isolation Impact
**No negative impact.**

### Enterprise Auditability
**Degraded:** Audit logs would show wrong operation names. CREATE operations logged as REJECT operations.

### Scanner Compatibility
**Poor:** Scanner expects CAPABILITIES constants. Mapping layer obscures the check.

### Implementation Complexity
**Medium:** Need to create and maintain mapping layer.

### Risk of Over-Broad Permissions
**HIGH:** Easy to map unrelated capabilities. E.g., mapping `decision_create` to `decision:reject` is semantically wrong but would compile.

### Compatibility with Existing Routes
**Medium:** Routes using entitlement strings can use mapper, but creates duplicate code paths.

### Compatibility with Billing/Entitlements
**Complex:** Mapping adds layer between entitlements and runtime checks. Harder to track what's quota-enforced.

### Compatibility with ServiceAuthEnvelope
**Poor:** Envelope carries CAPABILITIES constants, not entitlement strings. Mapping layer doesn't help.

### Compatibility with withCanonicalPolicyEnforcement
**Poor:** Policy wrapper uses CAPABILITIES directly. Mapping layer doesn't integrate.

### Expected Violation Reduction
**None.**

---

## Option C: Create Dedicated GOVERNANCE_CAPABILITIES Namespace with Explicit Mapping

### Design
New namespace for governance-specific capabilities with explicit mappings:

```typescript
// src/domain/constants/governance-capabilities.ts
export const GOVERNANCE_CAPABILITIES = {
  DECISION_CREATE: "governance:decision:create",
  DECISION_UPDATE: "governance:decision:update",
  STAGE_TRANSITION: "governance:stage:transition",
  OWNER_DASHBOARD: "governance:owner:dashboard",
};

// src/lib/governance-capability-mapping.ts
export const GOVERNANCE_CAPABILITY_MAPPING = {
  [GOVERNANCE_CAPABILITIES.DECISION_CREATE]: {
    entitlementKey: "decision_create",
    description: "Create decisions",
    planGated: true,
  },
  [GOVERNANCE_CAPABILITIES.DECISION_UPDATE]: {
    entitlementKey: "decision_update",
    description: "Update decisions",
    planGated: true,
  },
};
```

### Security Impact
**Positive:**
- ✓ Clear separation between business capabilities and governance operations
- ✓ Explicit mapping reduces ambiguity
- ✓ Easier to audit governance-specific checks

**Risks:**
- ⚠️ Introduces third namespace (now 3 instead of 2!)
- ⚠️ Mapping complexity increases
- ⚠️ More code to maintain

### Tenant Isolation Impact
**No negative impact.**

### Enterprise Auditability
**Good:** Governance operations clearly marked as such in audit logs.

### Scanner Compatibility
**Medium:** Would need to teach scanner about GOVERNANCE_CAPABILITIES namespace.

### Implementation Complexity
**High:** Three namespaces, mapping logic, tests for mappings.

### Risk of Over-Broad Permissions
**Medium:** More namespaces increase mapping mistakes.

### Compatibility with Existing Routes
**Poor:** Routes must be updated to use GOVERNANCE_CAPABILITIES instead of CAPABILITIES or entitlement strings.

### Compatibility with Billing/Entitlements
**Medium:** Mapping layer connects entitlements to governance capabilities.

### Compatibility with ServiceAuthEnvelope
**Poor:** Envelope carries CAPABILITIES, not GOVERNANCE_CAPABILITIES. Type mismatch.

### Compatibility with withCanonicalPolicyEnforcement
**Poor:** Policy wrapper uses CAPABILITIES. GOVERNANCE_CAPABILITIES don't integrate.

### Expected Violation Reduction
**None.**

---

## Option D: Keep Governance Entitlements Separate with Enforcement Adapter

### Design
Keep two separate systems, build adapter to enforce both:

```typescript
// src/lib/governance-enforcement-adapter.ts
export async function enforceGovernanceCapability(
  workspaceId: string,
  entitlementKey: string,
  domainCapability?: string
): Promise<void> {
  // Check entitlement (quota)
  const entitlementResult = await assertCapability(workspaceId, entitlementKey);
  if (!entitlementResult.allowed) throw new PlanLimitError(...);
  
  // Check domain capability if provided (permission)
  if (domainCapability && !verifiedCapabilities.has(domainCapability)) {
    throw new ForbiddenError(...);
  }
}

// Routes use:
await enforceGovernanceCapability(
  workspaceId,
  "decision_create",           // entitlement
  CAPABILITIES.DECISION_CREATE // domain (DOESN'T EXIST YET!)
);
```

### Security Impact
**Negative:**
- ❌ Two separate checks = confusion and error-prone
- ❌ Adapter obscures actual enforcement logic
- ❌ Easy to forget one check or the other
- ❌ Audit logs show two separate operations

### Tenant Isolation Impact
**No negative impact.**

### Enterprise Auditability
**Poor:** Two separate log entries for one operation (entitlement check + domain check).

### Scanner Compatibility
**Poor:** Scanner must understand adapter pattern.

### Implementation Complexity
**High:** Adapter logic, error handling, testing.

### Risk of Over-Broad Permissions
**HIGH:** Can forget domain capability check or entitlement check separately.

### Compatibility with Existing Routes
**Poor:** Requires wrapping all checks in adapter.

### Compatibility with Billing/Entitlements
**Medium:** Entitlements work as before, but integration unclear.

### Compatibility with ServiceAuthEnvelope
**Medium:** Envelope carries domain capabilities, but entitlement check must happen separately.

### Compatibility with withCanonicalPolicyEnforcement
**Poor:** Policy wrapper doesn't know about entitlements.

### Expected Violation Reduction
**None.**

---

## Option E: Use hasInternalAccess/Owner-Only Checks Instead of Explicit Governance Capabilities

### Design
Don't add governance capabilities, use internal access level instead:

```typescript
// decisions/create/route.ts
if (!hasInternalAccess(authContext.policy)) {
  throw new ForbiddenError("Internal access required");
}

// Add quota check separately
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
if (!capabilityCheck.allowed) throw new PlanLimitError(...);
```

### Security Impact
**Negative:**
- ❌ Loses granular governance control
- ❌ hasInternalAccess is role-based, not permission-based
- ❌ Cannot grant selective decision creation to specific roles
- ❌ All-or-nothing governance (internal vs not)

### Tenant Isolation Impact
**No negative impact.**

### Enterprise Auditability
**Poor:** Loses audit trail of specific permissions. Only "internal access" in logs.

### Scanner Compatibility
**Poor:** Internal access checks are not capabilities, scanner won't recognize.

### Implementation Complexity
**Low:** Just use existing internal access checks.

### Risk of Over-Broad Permissions
**HIGH:** Internal access grants broad permissions, not fine-grained.

### Compatibility with Existing Routes
**Medium:** Some routes already use internal access checks.

### Compatibility with Billing/Entitlements
**Poor:** Entitlements still separate, no integration with domain layer.

### Compatibility with ServiceAuthEnvelope
**Poor:** Envelope doesn't distinguish governance roles from access level.

### Compatibility with withCanonicalPolicyEnforcement
**Medium:** Policy wrapper supports internal access checks.

### Expected Violation Reduction
**None.**

---

## Comparison Matrix

| Dimension | Option A | Option B | Option C | Option D | Option E |
|-----------|----------|----------|----------|----------|----------|
| **Security** | ✓ Excellent | ❌ Poor | ⚠️ Medium | ❌ Poor | ❌ Poor |
| **Tenant Isolation** | ✓ No impact | ✓ No impact | ✓ No impact | ✓ No impact | ✓ No impact |
| **Auditability** | ✓ Excellent | ❌ Poor | ⚠️ Good | ❌ Poor | ❌ Poor |
| **Scanner Compatible** | ✓ Excellent | ❌ Poor | ⚠️ Medium | ❌ Poor | ❌ Poor |
| **Implementation** | ✓ Low-Med | ⚠️ Medium | ❌ High | ❌ High | ✓ Low |
| **Over-Broad Risk** | ✓ Low | ❌ High | ⚠️ Medium | ❌ High | ❌ High |
| **Route Compatible** | ✓ Good | ⚠️ Medium | ❌ Poor | ❌ Poor | ⚠️ Medium |
| **Billing Compatible** | ✓ Good | ⚠️ Complex | ⚠️ Medium | ⚠️ Medium | ❌ Poor |
| **ServiceAuthEnvelope** | ✓ Excellent | ❌ Poor | ❌ Poor | ⚠️ Medium | ❌ Poor |
| **Policy Wrapper** | ✓ Excellent | ❌ Poor | ❌ Poor | ❌ Poor | ⚠️ Medium |
| **TOTAL SCORE** | **9/10** | **1/10** | **3/10** | **2/10** | **2/10** |

---

## Recommendation

**Option A is the clear winner.** It:
- ✓ Adds missing capabilities to single namespace
- ✓ Maintains type safety
- ✓ Integrates with ServiceAuthEnvelope
- ✓ Works with policy wrapper
- ✓ Maintains audit trail consistency
- ✓ Lowest implementation complexity
- ✓ Best scanner compatibility

**All other options increase complexity, reduce security, or introduce new problems.**

