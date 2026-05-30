# Phase 2 Sub-batch 1: DEFERRED - Architectural Blocker

## Decision: DEFER ALL IDENTIFIED PHASE 2 ROUTES

### Finding
All Phase 2 routes identified for Sub-batch 1 have custom HTTP status code returns in their error handling paths:

1. **dashboard/route.ts**: `return Response.json({error: ...}, { status: 404 })`
2. **drift/route.ts**: `return Response.json({error: ...}, { status: 404 })`
3. **report/route.ts**: `return Response.json({error: ...}, { status: 400 })`
4. **public/actions/route.ts**: `return Response.json({error: ...}, { status: 400 })`

### Constraint Applied
Hard rule: **"If a return has non-200 status... do not fix that return, defer the route"**

All Phase 2 routes violate this rule by returning Response objects with custom status codes.

### Architectural Issue Discovered
The canonical wrapper expects plain objects, not Response objects. However, many routes use `Response.json(..., { status: N })` for error handling.

This creates a conflict:
- **Wrapper contract**: Handlers return plain objects
- **Route pattern**: Error handlers return Response with custom status

### Root Cause
The custom status code returns were acceptable in the old pattern where routes directly returned Response objects. But the canonical wrapper expects plain objects throughout.

The proper fix would be to:
1. Throw classified errors instead of returning Response objects
2. Let wrapper handle error classification and status codes
3. Handler returns ONLY plain objects (success case)

### Decision Rationale
Per hard rules, we cannot:
- Modify error handling behavior (would change auth/error semantics)
- Partially fix routes (one path fixes, other deferred)
- Modify custom status handling (might weaken error semantics)

Therefore, all Phase 2 routes must be deferred until error handling is refactored to use thrown exceptions instead of Response returns.

### Next Steps

#### Option 1: Refactor Error Handling (Recommended)
Create a separate task to refactor Phase 2 routes to use thrown errors:
- Convert `return Response.json({error}, {status: N})` to `throw new ClassifiedApiError(...)`
- Keep custom status codes (wrapper will preserve them)
- Then Phase 2 Sub-batch 1 can proceed

#### Option 2: Escalate for Review
Present architectural decision: Should wrapped handlers be allowed to return Response objects with custom status codes, or should all error handling use thrown exceptions?

#### Option 3: Adjust Hard Rules (Not Recommended)
Allow partial fixes (success path only) for routes with complex error handling. Carries risk of inconsistency.

### Impact
- Phase 1: ✅ 8 routes fixed (Batch 1 Phase 1 complete)
- Phase 2 Sub-batch 1: BLOCKED (architectural)
- Remaining Phase 2: 9 routes (need evaluation)
- Overall: 77 → 69 violations resolved, 8 remaining in Phase 2

### Recommendation
**Proceed with Option 1**: Create a cleanup task to refactor error handling in Phase 2 routes to use thrown exceptions. This aligns with wrapper contract and enables Phase 2 execution.

---

**Status**: ARCHITECTURAL BLOCKER IDENTIFIED
**Action Required**: Approve refactoring of Phase 2 error handling patterns
**Escalation**: Required for product/architecture team decision
