# X9F-1: Decision Service Refactor Risk Analysis

**Date:** 2026-05-16  
**Status:** RISK ANALYSIS COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Executive Summary

Four decision service functions were audited for ServiceAuthEnvelope refactoring readiness:
1. **acceptDecision** - ✓ READY (low risk)
2. **rejectDecision** - ✓ READY (low risk)
3. **createDecision** - ✓ READY (lowest risk - route already modern)
4. **closeDecision** - ✗ BLOCKED (medium risk - legacy route)

**Recommendation:** Select createDecision as pilot (lowest risk, route already modernized in X9E-2)

---

## Service Analysis

### 1. acceptDecision (Decision Acceptance Service)

**Current Pattern:**
```typescript
export async function acceptDecision(input: DecisionAcceptanceInput): Promise<AcceptanceRecord>
```

**Input Structure:**
```typescript
{
  decisionId: string;
  engagementId: string;
  workspaceId: string;
  acceptedBy: string;  // verified actor ID
  rationale?: string;
}
```

**Route Caller:** `src/app/api/decisions/[decisionId]/accept/route.ts:22`
- Uses: `withCanonicalEnforcement`
- Auth check: `requireCapabilities: ["DECISION_ACCEPT"]`
- Status: ✓ Modern canonical route (X9E-6 fixed capability)

**Risk Assessment:** LOW
- Service has no auth context dependencies
- Route is already canonical (modern pattern)
- Single route caller
- Input is simple and well-defined
- Route provides verified data (verifiedActorId, verifiedWorkspaceId)

**ServiceAuthEnvelope Refactoring:**
- ✓ Route can construct envelope from verified context
- ✓ Service can accept envelope without changing behavior
- ✓ No response shape change needed
- ✓ No business logic change needed

**Scanner Effect:**
- Current: Service called from canonical route (0 violations)
- After: Service called from canonical route with envelope (0 violations)
- Expected reduction: 0 (pattern unchanged, already clean)

---

### 2. rejectDecision (Decision Rejection Service)

**Current Pattern:**
```typescript
export async function rejectDecision(input: DecisionRejectionInput): Promise<RejectionRecord>
```

**Input Structure:**
```typescript
{
  decisionId: string;
  engagementId: string;
  workspaceId: string;
  rejectedBy: string;  // verified actor ID
  reason: string;
}
```

**Route Caller:** `src/app/api/decisions/[decisionId]/reject/route.ts:22`
- Uses: `withCanonicalEnforcement`
- Auth check: `requireCapabilities: ["DECISION_REJECT"]` (X9E-6 fixed)
- Status: ✓ Modern canonical route (X9E-6 fixed bug)

**Risk Assessment:** LOW
- Service has no auth context dependencies
- Route is already canonical (modern pattern)
- Single route caller
- Auth bug fixed in X9E-6 (correct capability)
- Input is simple and well-defined
- Route provides verified data

**ServiceAuthEnvelope Refactoring:**
- ✓ Route can construct envelope from verified context
- ✓ Service can accept envelope without changing behavior
- ✓ No response shape change needed
- ✓ No business logic change needed

**Scanner Effect:**
- Current: Service called from canonical route (0 violations)
- After: Service called from canonical route with envelope (0 violations)
- Expected reduction: 0 (pattern unchanged, already clean)

---

### 3. createDecision (Decision Creation Service)

**Current Pattern:**
```typescript
export async function createDecision(input: CreateDecisionInput): Promise<CreateDecisionResult>
```

**Input Structure:**
```typescript
{
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;
  userId: string;
  problemType: string;
  expectedOutcome: string;
  // ... additional fields
}
```

**Route Caller:** `src/app/api/decisions/create/route.ts:30`
- Uses: `withCanonicalEnforcement`
- Auth check: `requireCapabilities: ["DECISION_CREATE"]` (X9E-2 cleaned)
- Status: ✓ Modern canonical route (already cleaned in X9E-2)

**Risk Assessment:** LOWEST ✓
- Service has no auth context dependencies
- Route is already canonical (modern pattern)
- Route was already cleaned in X9E-2 (string literal → constant replacement)
- Single route caller
- Input is well-defined
- Route provides verified data
- **Advantage:** Route pattern is most proven (X9E-2 already done)

**ServiceAuthEnvelope Refactoring:**
- ✓ Route can construct envelope from verified context
- ✓ Service can accept envelope without changing behavior
- ✓ No response shape change needed
- ✓ No business logic change needed
- ✓ Route proven pattern (X9E-2 model)

**Scanner Effect:**
- Current: Service called from canonical route (0 violations)
- After: Service called from canonical route with envelope (0 violations)
- Expected reduction: 0 (pattern unchanged, already clean)

**Why Lowest Risk:**
1. Route already modernized (X9E-2 completed)
2. Most proven pattern to follow
3. No legacy code
4. Single caller
5. Simple input type

---

### 4. closeDecision (Decision Lifecycle Service)

**Current Pattern:**
```typescript
export async function closeDecision(decisionId: string, workspaceId: string, userId: string)
```

**Input Structure:**
- decisionId: string
- workspaceId: string
- userId: string
(Parameter list, not typed input object)

**Route Caller:** `src/app/api/decisions/[decisionId]/close/route.ts:57`
- Uses: `withEnforcementFull` (legacy wrapper)
- Auth check: `hasPermission(membership.role, "close_decision")` (role-based)
- Status: ✗ Legacy route pattern (NOT modernized)

**Risk Assessment:** MEDIUM ✗
- Service is clean (no auth context)
- But route uses legacy pattern (withEnforcementFull, hasPermission)
- Route uses role-based auth, not capability-based
- Missing DECISION_CLOSE in domain CAPABILITIES
- Governance incomplete for close operation

**Blocking Issues:**
1. **Route Modernization Needed:** Route must migrate from withEnforcementFull to withCanonicalEnforcement
2. **Capability Design Missing:** DECISION_CLOSE capability not defined in domain CAPABILITIES
3. **Auth Model Incomplete:** Role-based permission "close_decision" not aligned with capability model

**ServiceAuthEnvelope Refactoring:**
- ✗ BLOCKED - Cannot safely refactor service without route modernization
- Route must be updated first
- Capability model must be designed first

**Why Medium Risk:**
- Service is clean, but route is not
- Mixing legacy and modern patterns creates maintenance burden
- Requires coordination (route + capability design)

---

## Comparative Risk Analysis

| Factor | acceptDecision | rejectDecision | createDecision | closeDecision |
|--------|---|---|---|---|
| Service pattern | ✓ Clean | ✓ Clean | ✓ Clean | ✓ Clean |
| Route pattern | ✓ Modern | ✓ Modern | ✓ Modern | ✗ Legacy |
| Route capability | ✓ Fixed | ✓ Fixed (X9E-6) | ✓ Cleaned (X9E-2) | ✗ Missing design |
| Single caller | ✓ Yes | ✓ Yes | ✓ Yes | ✓ Yes |
| Input type | ✓ Typed | ✓ Typed | ✓ Typed | ✗ Parameter list |
| Envelope ready | ✓ Yes | ✓ Yes | ✓ Yes | ✗ No |
| Risk level | LOW | LOW | **LOWEST** | MEDIUM |

---

## Pilot Selection Rationale

### Recommended: createDecision (LOWEST RISK)

**Advantages:**
1. ✓ Route already modernized (X9E-2 completed)
2. ✓ Proven pattern to follow (X9E-2 implemented)
3. ✓ Service is clean with typed input
4. ✓ Single route caller
5. ✓ No capability bugs (string already replaced)
6. ✓ High confidence in success

**Process:**
1. Phase X9F-2: Convert CreateDecisionInput → ServiceAuthEnvelope-wrapped version
2. Route constructs envelope from CanonicalAuthContext
3. Service receives envelope instead of separate parameters
4. No behavior change, only input envelope change

### Alternative: acceptDecision

**Also Low Risk**, but:
- Less proven pattern (not yet modernized in prior phases)
- Dependency on X9E-6 capability fix (more recent)
- Would be second-best choice if createDecision unavailable

### Alternative: rejectDecision

**Also Low Risk**, but:
- Just fixed in X9E-6 (let it stabilize)
- Similar risk to acceptDecision
- Could follow createDecision refactor

### NOT RECOMMENDED: closeDecision

**Blocked Until:**
1. Close route migrated from legacy (withEnforcementFull → withCanonicalEnforcement)
2. DECISION_CLOSE capability designed and added to domain CAPABILITIES
3. Role-based "close_decision" aligned with capability model
4. Route modernization complete

**Future Phase:** X9G (close route modernization + closeDecision refactor)

---

## Expected Outcomes

**If createDecision selected for X9F-2:**

**Build:** ✓ PASS
- TypeScript compilation succeeds
- ServiceAuthEnvelope import available
- Type checking validates envelope construction

**Tests:** ✓ PASS (402/402)
- Service behavior unchanged
- Integration tests verify creation still works
- No test failures expected

**Scanner:** ✓ STABLE (448 violations)
- Pattern change doesn't reduce violations
- Route still uses canonical pattern
- No new violations introduced
- Reduction: 0 (expected)

**Authorization:** ✓ PRESERVED
- DECISION_CREATE check still at route
- Capability enforcement unchanged
- No authorization behavior change
- Least privilege principle maintained

---

## Governance Gaps Identified

**Close Route Governance:**
- Missing DECISION_CLOSE in domain CAPABILITIES
- Role-based auth ("close_decision") not capability-aligned
- Requires Phase X9G (close route capability design + route modernization)
- Blocks service refactor until resolved

---

## Conclusion

**Three decision services ready for refactoring; one blocked:**
- acceptDecision: ✓ Ready (LOW risk)
- rejectDecision: ✓ Ready (LOW risk)
- **createDecision: ✓✓ RECOMMENDED (LOWEST risk)**
- closeDecision: ✗ Blocked (medium risk, governance gap)

**Recommendation:** Select createDecision as X9F-2 pilot (proven route pattern, fewest dependencies).
