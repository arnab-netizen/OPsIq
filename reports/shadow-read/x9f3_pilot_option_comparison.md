# X9F-3: Decision Service Pilot Option Comparison

**Date:** 2026-05-16  
**Phase:** X9F-3 - Pilot Selection Only  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Comparison Framework

Evaluated candidates against:
- Route modernity (canonical vs legacy)
- Auth context availability
- Verified input constructibility
- Caller isolation (route vs service vs background)
- Shadow read violations
- Governance completeness
- Dual-format support necessity
- Test coverage

---

## Candidate 1: acceptDecision

**File:** src/services/decision-validation/decision-acceptance.service.ts (lines 24-90)  
**Input Type:** DecisionAcceptanceInput

### Route Analysis

**Route:** src/app/api/decisions/[decisionId]/accept/route.ts  
**Wrapper:** withCanonicalEnforcement (MODERN)  
**Capability:** DECISION_ACCEPT (defined, correct)  
**Auth Passing:** ctx.verifiedWorkspaceId, ctx.verifiedActorId

### Caller Count & Type

| Caller | Type | Location | Pattern |
|--------|------|----------|---------|
| accept route | ROUTE | [decisionId]/accept/route.ts | Canonical enforcement |
| **Total** | **1** | | |

### Current Input

```typescript
{
  decisionId,         // business data
  engagementId,       // business data
  workspaceId,        // raw parameter
  acceptedBy,         // raw parameter
  rationale           // business data
}
```

### Verified Input Constructibility

✓ **YES - All required fields available**
- workspaceId: from ctx.verifiedWorkspaceId (verified)
- acceptedBy: from ctx.verifiedActorId (verified)
- Other fields: from request body (business data)

### Shadow Reads

✓ **NONE** - Route uses canonical enforcement, no withAuth()

### Service-Side Auth Checks

Service performs:
- validateDecisionForAcceptance (business logic)
- Workspace isolation check (lines 28-29)

Auth is pre-verified by route. Service can rely on verified input.

### Business Behavior

- Fetches decision, validates acceptance, updates status to "in_progress"
- Emits audit event
- Returns AcceptanceRecord

### Response Shape

```typescript
{
  decisionId: string;
  acceptedBy: string;
  acceptedAt: Date;
  rationale?: string;
  auditEventId: string;
}
```

### Refactor Impact

**Current:** Service receives raw parameters  
**After:** Service receives VerifiedAcceptanceInput with explicit verified fields

**Risk:** LOW
- Route already modern (canonical enforcement)
- No internal/background callers
- Auth boundary already enforced at route level
- Service can immediately trust workspace/actor from input

**Dual Format Support:** NOT NEEDED

---

## Candidate 2: rejectDecision

**File:** src/services/decision-validation/decision-acceptance.service.ts (lines 92-158)  
**Input Type:** DecisionRejectionInput

### Route Analysis

**Route:** src/app/api/decisions/[decisionId]/reject/route.ts  
**Wrapper:** withCanonicalEnforcement (MODERN)  
**Capability:** DECISION_REJECT (defined, correct - fixed in X9E-6)  
**Auth Passing:** ctx.verifiedWorkspaceId, ctx.verifiedActorId

### Caller Count & Type

| Caller | Type | Location | Pattern |
|--------|------|----------|---------|
| reject route | ROUTE | [decisionId]/reject/route.ts | Canonical enforcement |
| **Total** | **1** | | |

### Current Input

```typescript
{
  decisionId,         // business data
  engagementId,       // business data
  workspaceId,        // raw parameter
  rejectedBy,         // raw parameter
  reason              // business data
}
```

### Verified Input Constructibility

✓ **YES - All required fields available**
- workspaceId: from ctx.verifiedWorkspaceId (verified)
- rejectedBy: from ctx.verifiedActorId (verified)
- Other fields: from request body (business data)

### Shadow Reads

✓ **NONE** - Route uses canonical enforcement, no withAuth()

### Service-Side Auth Checks

Service performs:
- Workspace isolation check (lines 103-104)
- Reason validation

Auth is pre-verified by route.

### Business Behavior

- Fetches decision, validates workspace isolation
- Validates reason is provided
- Updates status to "blocked" with blockReason
- Emits audit event
- Returns RejectionRecord

### Response Shape

```typescript
{
  decisionId: string;
  rejectedBy: string;
  rejectedAt: Date;
  reason: string;
  auditEventId: string;
}
```

### Refactor Impact

**Current:** Service receives raw parameters  
**After:** Service receives VerifiedRejectionInput with explicit verified fields

**Risk:** LOW
- Route already modern (canonical enforcement)
- No internal/background callers
- Auth boundary already enforced at route level
- Service can immediately trust workspace/actor from input
- Capability verified in X9E-6

**Dual Format Support:** NOT NEEDED

---

## Candidate 3: closeDecision

**File:** src/services/decisions/decision-lifecycle.service.ts (lines 394-424)  
**Input Type:** Raw parameters

### Route Analysis

**Route:** src/app/api/decisions/[decisionId]/close/route.ts  
**Wrapper:** withEnforcementFull (LEGACY)  
**Auth Pattern:** hasPermission(role, "close_decision") - ROLE-BASED  
**Capability:** MISSING - no domain CAPABILITIES.DECISION_CLOSE

### Caller Count & Type

| Caller | Type | Location | Pattern |
|--------|------|----------|---------|
| close route | ROUTE | [decisionId]/close/route.ts | Legacy enforcement + role check |
| **Total** | **1** | | |

### Current Input

```typescript
{
  decisionId,         // business data
  workspaceId,        // raw parameter
  actorId             // raw parameter
}
```

### Verified Input Constructibility

✗ **NO - Governance missing**
- No CAPABILITIES.DECISION_CLOSE defined
- hasPermission uses role-based checks (legacy)
- Cannot refactor without capability design

### Shadow Reads

✗ **YES - 4 violations detected**
- withAuth() on line 21 (main shadow read)
- withAuth import pattern detected
- Violates RUNTIME_ENFORCED_HYBRID enforcement

### Service-Side Auth Checks

Service performs:
- Finds decision by id + workspaceId
- Validates state is OUTCOME_RECORDED

No auth checks - relies entirely on route enforcement which is incomplete.

### Business Behavior

- Verifies decision state is OUTCOME_RECORDED
- Transitions to CLOSED state
- Returns {id, status}

### Response Shape

```typescript
{
  id: string;
  status: string;
}
```

### Governance Blocking

**DECISION_CLOSE capability missing**
- Required CAPABILITIES.DECISION_CLOSE: "decision:close" constant
- Requires governance clarification: who can close? what conditions?
- Close route still uses legacy hasPermission(role, "close_decision")
- Cannot refactor service without first defining capability

**Recommendation:** Deferred to X9G phase

**Risk:** HIGH/BLOCKED

---

## Comparison Summary

| Factor | acceptDecision | rejectDecision | closeDecision |
|--------|---|---|---|
| Route modernity | Modern ✓ | Modern ✓ | Legacy ✗ |
| Callers | 1 (route only) | 1 (route only) | 1 (route only) |
| Verified context available | Yes ✓ | Yes ✓ | No ✗ |
| Shadow reads | 0 | 0 | 4 |
| Governance complete | Yes ✓ | Yes ✓ | No ✗ |
| Dual format support needed | No | No | N/A |
| Refactor risk | LOW | LOW | HIGH |
| Blocked | No | No | Yes - missing capability |
| Recommended action | CANDIDATE | CANDIDATE | BLOCKED |

---

## Selection Criteria

**Preferred Candidate Profile:**
1. Route already modern (canonical enforcement)
2. No shadow reads
3. Capability defined
4. No internal/background callers
5. Can construct verified input from verified context

**Both acceptDecision and rejectDecision meet all criteria.**

---

## Next Decision

Must select exactly one between acceptDecision and rejectDecision for X9F-3 pilot implementation.

Selection factors:
- **acceptDecision:** Simpler (no reason/rationale validation complexity)
- **rejectDecision:** Slightly more complex (requires reason validation)

Recommend **acceptDecision** as X9F-3 pilot:
- Simpler input structure
- Matches X9F-2 pattern (createDecision refactor)
- Sets precedent for other acceptance/validation services
- Low complexity, clear path forward

---

## Deferred Items

**closeDecision:** Deferred to X9G phase
- Requires DECISION_CLOSE capability design
- Requires close route modernization to canonical enforcement
- Unblocks after governance phase
- Expected reduction: ~4 violations

