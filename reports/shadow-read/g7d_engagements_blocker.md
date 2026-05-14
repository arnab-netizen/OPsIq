# G7D-R-E: Engagements Route Blocker Classification

**Phase**: G7D-R (Reconciliation)
**Route**: `src/app/api/engagements/[engagementId]/route.ts`
**Handler**: GET
**Status**: BLOCKED - Not migrated in G7D
**Classification**: POLICY_CONTEXT_ROUTE

---

## Blocker Identification

### Exact Dependency

**Line 60** (GET handler):
```typescript
const engagement = await getEngagementById(
  engagementId,
  workspaceId,
  hasInternalAccess(policy)  // <-- BLOCKER
);
```

**hasInternalAccess function** (src/policies/capability-check.ts):
```typescript
export function hasInternalAccess(policy: PolicyContext): boolean {
  // Determines if actor can see internal-only fields
  // Uses policy.capabilities, policy.actorType, policy.hierarchy
  // Requires full PolicyContext object
}
```

### Root Cause

The handler needs to determine access level **at read time** (in the handler) because:
1. Different fields are visible based on actor's internal access level
2. getEngagementById needs a boolean flag, not just capability names
3. hasInternalAccess requires full PolicyContext (not just `verifiedCapabilities: Set<string>`)

### Why withCanonicalEnforcement Fails

`CanonicalAuthContext` provides:
```typescript
verifiedCapabilities: Set<string>;  // ✓ Has list of capabilities
// But NOT:
policy?: PolicyContext;  // ✗ Missing full policy object
```

`PolicyContext` contains (from src/policies/capability-check.ts):
```typescript
export interface PolicyContext {
  actorId: string;
  actorType: "user" | "service";
  capabilities: string[];  // Same data, but...
  actorHierarchy: number;  // NOT in CanonicalAuthContext
  workspace: { id: string; tier: string };
  tenant?: string;
  // Other fields used by capability checks
}
```

### The withCanonicalEnforcement Gap

```typescript
// Wrapper provides:
export interface CanonicalAuthContext {
  verifiedActorId: string;  // ✓
  verifiedActorType: "user" | "service";  // ✓
  verifiedCapabilities: Set<string>;  // ✓ But not full PolicyContext
  verifiedWorkspaceId: string;  // ✓
  // Missing PolicyContext fields:
  // - actorHierarchy
  // - actor role information
  // - Other policy-evaluated attributes
}
```

The canonical context has **capabilities as a set**, but not the full **PolicyContext** that hasInternalAccess needs.

---

## Classification: POLICY_CONTEXT_ROUTE

**Route Type**: Requires read-time policy evaluation in handler

**Characteristics**:
- ✓ GET handler (read-safe)
- ✓ Single simple capability (ENGAGEMENT_VIEW)
- ✗ Uses policy object, not just capability name
- ✗ Field-level access control based on actor hierarchy
- ✗ Requires PolicyContext for business logic

**Similar Routes** (likely to have same blocker):
- Engagements: view internal notes, timeline, internal risks (blocked by internal access)
- Clients: view internal assessments, confidential health data (possibly)
- Actions: view internal blocking details (possibly)

---

## Architectural Options

### Option A: Expose PolicyContext in CanonicalAuthContext

**Implementation**:
```typescript
export interface CanonicalAuthContext {
  // ... existing fields ...
  verifiedPolicyContext?: PolicyContext;
}
```

**Pros**:
- Minimal wrapper changes
- Enables immediate migration of policy-aware routes
- Services already use PolicyContext

**Cons**:
- Increases context size globally
- Makes canonical context less "canonical" (exposes implementation detail)
- ~40+ handlers now have access to full policy object
- Potential inconsistency (policy might be out of sync with verified capabilities)

**Risk**: Medium (context pollution, but contained)

### Option B: Extract Policy Logic to Service Layer

**Implementation**:
```typescript
// Instead of handler calling hasInternalAccess():
const internalAccess = await determineInternalAccess(
  session: CanonicalAuthContext.verifiedSessionSnapshot,
  capabilities: CanonicalAuthContext.verifiedCapabilities
);
const engagement = await getEngagementById(
  engagementId,
  workspaceId,
  internalAccess
);
```

**Pros**:
- No CanonicalAuthContext changes needed
- Service layer handles policy logic
- Cleaner separation of concerns

**Cons**:
- Requires new service function
- Must reconstruct policy-level decisions from capabilities set
- Might not capture all policy nuances
- Service layer must be idempotent to policy changes

**Risk**: Medium-High (reconstruction might miss nuances)

### Option C: Find Different 5th Candidate Handler

**Candidates** that don't require PolicyContext:
- List endpoints (clients, leads, engagements)
- Simple lookups without field-level access
- Endpoints with uniform visibility

**Pros**:
- Completes G7D batch with valid handler
- No architectural changes needed
- Simpler migration

**Cons**:
- Doesn't solve underlying blocker
- Defers policy-context routes indefinitely
- Leaves architectural gap documented

**Risk**: Low (but incomplete solution)

### Option D: Defer Engagements and Accept 4-Handler Completion

**Implementation**:
- Accept 4 GET handlers as G7D completion
- Document engagements as architectural limitation
- Plan separate phase for policy-context routes

**Pros**:
- Maintains scope control
- Acknowledges real architectural constraint
- No workarounds or type violations

**Cons**:
- Incomplete batch (4/5)
- engagements/[engagementId] remains in legacy pattern
- Policy-context routes require separate effort

**Risk**: Low (but accepts limitation)

---

## Decision Matrix

| Option | Scope Violation | Type Safety | Completeness | Risk |
|--------|---|---|---|---|
| A (Expose PolicyContext) | YES | HIGH | 100% | MEDIUM |
| B (Extract Logic) | NO | MEDIUM | 100% | MEDIUM-HIGH |
| C (Find Different Candidate) | NO | HIGH | 80% (4/5) | LOW |
| D (Defer Engagements) | NO | HIGH | 80% (4/5) | LOW |

---

## Recommendation

**CONDITIONAL ACCEPTANCE OF OPTION C**

1. **Accept** current 4-handler completion (clients, contacts, roles, leads)
2. **Defer** engagements to architectural phase
3. **Document** PolicyContext gap as known limitation
4. **Plan** separate phase for policy-context routes (Option A or B)
5. **Track** that GET handlers without policy-context needs can be migrated cleanly

**Alternative**: If urgency requires 5-handler completion, recommend **Option B** (extract policy logic to service layer) as least-invasive architectural change.

---

## Implementation Path for Future

If Option B is chosen:
1. Create `determineInternalAccessFromCapabilities()` service function
2. Test that it correctly maps canonical capabilities to hasInternalAccess() result
3. Update engagements GET handler to use new service function
4. Verify field visibility matches original behavior

If Option A is chosen:
1. Add `verifiedPolicyContext?: PolicyContext` to CanonicalAuthContext
2. Populate it in withCanonicalEnforcement wrapper
3. Ensure policy is always consistent with verified capabilities
4. Update handlers to access policy via context
5. Document that all canonical handlers now have policy access

---

## No Constraint Violations in Blocker

✓ No any/as any types attempted (violation was reverted)
✓ No service weakening (blocker is legitimate architectural limitation)
✓ No permission fabrication (blocker prevents that)
✓ No scanner rule relaxation
✓ No wrapper contract expansion (blocker exists due to contract mismatch)

---

End of Blocker Classification
