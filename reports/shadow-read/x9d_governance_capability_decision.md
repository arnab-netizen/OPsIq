# X9D: Governance Capability Design Decision

**Date:** 2026-05-15  
**Status:** DECISION RENDERED  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## SELECTED OPTION: A

**Add Missing Governance Actions Directly to CAPABILITIES**

---

## Why Option A Was Selected

### 1. Security (Critical)
Option A maintains a single, consistent capability namespace that all enforcement layers understand:
- ✓ Routes, services, and policies all check against same CAPABILITIES enum
- ✓ Type-safe enforcement (missing constants caught at compile time)
- ✓ No mapping ambiguity (one constant = one permission)
- ✓ Audit trail clear and consistent

**Risk:** Entitlement system must support new capabilities → LOW (already supports arbitrary capability strings)

### 2. Integration (Critical)
Option A integrates seamlessly with existing architecture:
- ✓ ServiceAuthEnvelope carries CAPABILITIES constants
- ✓ withCanonicalPolicyEnforcement checks CAPABILITIES
- ✓ auth-shadow-read-scanner understands CAPABILITIES
- ✓ No new code paths needed

**Options B-E require new integrations or wrapper logic.**

### 3. Simplicity (Important)
Option A has lowest implementation complexity:
- ✓ Add 6-8 constants to capabilities.ts
- ✓ Update entitlement tier configs
- ✓ Update 2 routes that use entitlement string literals
- ✓ Write 1 test file

**Options C-D require new systems and adapters.**

### 4. Auditability (Important)
Option A produces consistent audit logs:
- ✓ All governance operations logged as "decision:create", "experiment:create", etc.
- ✓ No mapping confusion
- ✓ Audit trail clear across all services

**Option B-E produce confusing audit trails.**

### 5. Future Extensibility (Important)
Option A scales to new governance operations:
- ✓ Add new capability → works everywhere automatically
- ✓ Type-safe from day one
- ✓ No mapping layers to maintain

---

## Why Alternatives Were Rejected

### Option B Rejected
**"Map entitlement strings to existing CAPABILITIES"**
- ❌ Creates semantic mismatch (e.g., mapping `decision_create` to `decision:reject`)
- ❌ Audit logs show wrong operation names
- ❌ Mapping layer is error-prone
- ❌ Doesn't solve the fundamental problem (still have two namespaces)

### Option C Rejected
**"Create GOVERNANCE_CAPABILITIES namespace"**
- ❌ Introduces THIRD namespace (now 3 instead of solving 2)
- ❌ Increases mapping complexity
- ❌ Doesn't integrate with ServiceAuthEnvelope (uses different enum)
- ❌ Overcomplicated solution

### Option D Rejected
**"Keep separate with enforcement adapter"**
- ❌ Two checks required for every operation (error-prone)
- ❌ Easy to forget one check or the other
- ❌ Confusing implementation
- ❌ More code to maintain and test

### Option E Rejected
**"Use hasInternalAccess/owner-only checks"**
- ❌ Loses fine-grained governance control
- ❌ Role-based vs permission-based mixing
- ❌ No way to grant selective capabilities
- ❌ All-or-nothing governance

---

## Exact Mapping Rules

### New Capabilities to Add (to domain/constants/capabilities.ts)

```typescript
export const CAPABILITIES = {
  // ... existing capabilities ...
  
  // Decisions (ADD THESE - currently entitlement-only)
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  
  // Experiments (ADD THESE - currently entitlement-only, reserved)
  EXPERIMENT_CREATE: "experiment:create",
  EXPERIMENT_UPDATE: "experiment:update",
  
  // Admin (ADD THESE - currently entitlement-only, reserved)
  ADMIN_SETTINGS: "admin:settings",
  ADMIN_TEAM: "admin:team",
  
  // Workspace (ADD THESE - currently entitlement-only, reserved)
  WORKSPACE_CREATE: "workspace:create",
  WORKSPACE_INVITE: "workspace:invite",
  
  // ... existing capabilities remain unchanged ...
};
```

### Entitlement Mapping (services/entitlement.ts)

The entitlement system's `Capability` enum remains for quota/tier enforcement, but new additions should map to domain CAPABILITIES:

```typescript
export enum Capability {
  // Keep existing...
  DECISION_CREATE = "decision_create",     // Maps to CAPABILITIES.DECISION_CREATE
  DECISION_UPDATE = "decision_update",     // Maps to CAPABILITIES.DECISION_UPDATE
  
  // New for completeness:
  EXPERIMENT_CREATE = "experiment_create",
  EXPERIMENT_UPDATE = "experiment_update",
  ADMIN_SETTINGS = "admin:settings",
  ADMIN_TEAM = "admin:team",
  // ...
}
```

---

## Allowed Governance Capabilities

After implementation, the following governance capabilities are allowed:

### Decision Operations
- `CAPABILITIES.DECISION_CREATE` - Create decisions (plan-gated)
- `CAPABILITIES.DECISION_UPDATE` - Update decisions (plan-gated)
- `CAPABILITIES.DECISION_ACCEPT` - Accept decisions (role-gated)
- `CAPABILITIES.DECISION_REJECT` - Reject decisions (role-gated)

### Stage Operations
- `CAPABILITIES.STAGE_CREATE` - Create stages (domain-enforced)
- `CAPABILITIES.STAGE_TRANSITION` - Transition stages (domain-enforced)
- `CAPABILITIES.STAGE_VIEW` - View stages (domain-enforced)
- `CAPABILITIES.STAGE_RESOLVE_SOFT_BLOCKER` - Resolve blockers (domain-enforced)

### Owner Mode
- `CAPABILITIES.OWNER_VIEW` - View owner dashboard (domain-enforced)
- `CAPABILITIES.OWNER_MANAGE` - Manage owner config (domain-enforced)

### Intervention
- `CAPABILITIES.INTERVENTION_MANAGE` - Manage interventions (domain-enforced)
- `CAPABILITIES.INTERVENTION_VIEW` - View interventions (domain-enforced)

### Condition Assessment
- `CAPABILITIES.CONDITION_ASSESS` - Assess business condition (domain-enforced)
- `CAPABILITIES.CONDITION_VIEW` - View condition (domain-enforced)

---

## Forbidden Broad Capabilities

The following should NOT be created:
- ❌ `GOVERNANCE_ALL` (too broad)
- ❌ `DECISION_MANAGE` (loses granularity - should be separate CREATE/UPDATE/ACCEPT/REJECT)
- ❌ `INTERVENTION_ALL` (should be separate MANAGE/VIEW)
- ❌ `OWNER_MODE` (should be separate VIEW/MANAGE)
- ❌ Catch-all capabilities like `ADMIN` without specific scope

**Rule:** Each capability should represent a single, specific action. No "all operations" capabilities.

---

## Entitlement String Mapping to Runtime Capabilities

When entitlement system checks capabilities, map to domain CAPABILITIES:

```
Entitlement String          → Domain CAPABILITIES
─────────────────────────────────────────────────
"decision_create"           → CAPABILITIES.DECISION_CREATE
"decision_update"           → CAPABILITIES.DECISION_UPDATE
"experiment_create"         → CAPABILITIES.EXPERIMENT_CREATE
"experiment_update"         → CAPABILITIES.EXPERIMENT_UPDATE
"admin_settings"            → CAPABILITIES.ADMIN_SETTINGS
"admin_team"                → CAPABILITIES.ADMIN_TEAM
"workspace_create"          → CAPABILITIES.WORKSPACE_CREATE
"workspace_invite"          → CAPABILITIES.WORKSPACE_INVITE
```

**Implementation:** When routes/services need to check entitlement-based capabilities, use domain CAPABILITIES constants instead of entitlement string literals.

---

## How Scanner Should Recognize Safe Mappings Later

The auth-shadow-read-scanner should:

1. ✓ Accept any capability checked against CAPABILITIES enum as safe
2. ✓ Reject any capability string literal that's not in CAPABILITIES
3. ✓ Recognize ServiceAuthEnvelope construction as safe (already does)
4. ✓ Flag entitlement string literals in routes as violations (move to CAPABILITIES)

**Rule:** Once a capability is in CAPABILITIES, it's recognized as safe by scanner. Checking against CAPABILITIES constants is safe. String literals are violations.

---

## How ServiceAuthEnvelope Should Carry Verified Governance Capability

ServiceAuthEnvelope already carries this correctly:

```typescript
export interface ServiceAuthEnvelope {
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;
  readonly verifiedCapabilities: ReadonlySet<string>;  // ← Already correct
  readonly hasInternalAccess: boolean;
  readonly verifiedActor?: Readonly<AuthenticatedUser>;
  readonly policy?: Readonly<PolicyContext>;
}
```

The `verifiedCapabilities` field is a `ReadonlySet<string>` that contains domain CAPABILITIES constants. Once DECISION_CREATE et al. are added to CAPABILITIES, they automatically work in ServiceAuthEnvelope.

---

## How Owner-Dashboard Should Be Handled

**Decision:** Keep ENGAGEMENT_VIEW for engagement-specific dashboard. Add separate OWNER_DASHBOARD_VIEW for workspace-level owner dashboard.

**Implementation:**
1. Rename src/app/api/owner/dashboard/route.ts capability check from OWNER_VIEW to OWNER_DASHBOARD_VIEW (if this distinction is needed)
2. OR keep as-is if owner mode dashboards don't need separate gating

**Recommendation:** Keep as-is for now (OWNER_VIEW sufficient). Can refine later if owner dashboard becomes plan-specific.

---

## How Stage.ts Should Be Handled

**Decision:** Keep domain-only governance for stage operations. Do NOT add to entitlements (not plan-gated).

**Rationale:**
- Stage operations are always available (not quota-limited)
- Stage creation/transition are role-gated (STAGE_CREATE, STAGE_TRANSITION)
- These are already in domain CAPABILITIES
- No plan-specific gating needed

**Implementation:**
1. stage.ts remains unchanged (already uses domain CAPABILITIES)
2. During service refactoring, convert to ServiceAuthEnvelope pattern
3. No entitlement changes needed

---

## How Decisions/Create Should Be Handled

**Decision:** Add DECISION_CREATE to domain CAPABILITIES. Map entitlement check to domain capability.

**Implementation:**
1. Add DECISION_CREATE to domain/constants/capabilities.ts
2. Update decisions/create/route.ts to check against CAPABILITIES.DECISION_CREATE instead of entitlement string literal
3. Keep entitlement quota enforcement (separate from permission check)
4. During service refactoring, convert decision service to ServiceAuthEnvelope pattern

**Code Change (Example):**
```typescript
// Before:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
if (!capabilityCheck.allowed) throw new PlanLimitError(...);

// After:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
if (!capabilityCheck.allowed) throw new PlanLimitError(...);
// ALSO check domain capability (once service is refactored)
if (!authContext.verifiedCapabilities.has(CAPABILITIES.DECISION_CREATE)) {
  throw new ForbiddenError("DECISION_CREATE capability required");
}
```

---

## Fail-Closed Rules

1. **Missing Capability = Forbidden:** If CAPABILITIES.DECISION_CREATE is not in verifiedCapabilities, request is forbidden (403)
2. **Entitlement Exceeded = Plan Limit:** If quota exceeded, return PlanLimitError (not 403)
3. **Both Must Pass:** Both entitlement AND permission checks must pass:
   - Permission check (CAPABILITIES): Fail-closed (403)
   - Quota check (entitlements): Fail-closed (402/quota exceeded)

---

## Rollback Rule

If decision is made to revert Option A:
1. Remove newly added CAPABILITIES constants
2. Revert routes back to entitlement string literals
3. Keep entitlement enum unchanged
4. Restore two-namespace behavior

**Rollback Cost:** Low (just reverse the additions). But not recommended - Option A is correct design.

---

## Phases Unlocked by This Design Decision

Once Option A is implemented:

### X9C-5 (Service Refactor Pilots 2+)
- Stage.ts can be refactored to ServiceAuthEnvelope
- Owner-dashboard.service.ts can be refactored
- Decision service can be refactored

### X9C-6 (Service Refactor Pilots 3+)
- Other governance-dependent services can follow
- Pattern established and validated

### X9C-7+ (Service Refactor Pilots 4+)
- Remaining services can be refactored with confidence
- No new capability design needed

---

## Conclusion

**SELECTED: Option A - Add Missing Governance Actions to CAPABILITIES**

This design:
- ✓ Solves critical capability namespace gap
- ✓ Maintains security and consistency
- ✓ Integrates with ServiceAuthEnvelope architecture
- ✓ Enables future service refactoring
- ✓ Produces clear audit trails
- ✓ Lowest implementation complexity
- ✓ Best long-term maintainability

**No code changes yet.** This is design phase only. Implementation authorized to follow in X9D implementation phase.

