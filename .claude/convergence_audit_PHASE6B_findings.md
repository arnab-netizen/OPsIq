# PHASE 6 PART 2B CONVERGENCE AUDIT - FINDINGS

**Date**: 2026-05-14  
**Status**: CRITICAL FINDINGS - TIER B GATE FREEZE  
**Severity**: HIGH  

---

## EXECUTIVE SUMMARY

The canonical enforcement wrapper DOES NOT truly own auth semantics.

**Current Architecture Classification: HYBRID_WRAPPER**

- ✓ Wrapper OWNS: HTTP response generation, status code mapping, handler barrier
- ✗ Wrapper DOES NOT OWN: error creation, auth validation logic, capability evaluation
- ✗ Routes still delegate to legacy system for actual auth semantics
- ✗ Double-path risk: wrapper and legacy both involved in decisions

**Recommendation: FREEZE TIER B MIGRATION until hybrid ownership resolved.**

---

## CRITICAL FINDINGS

### Finding 1: Legacy Error Authority (HYBRID OWNERSHIP)

**Location**: Error classification in legacy system

**Problem**:
```
LEGACY CODE (src/services/auth.ts):
- requireSession() throws UnauthorizedError if session invalid
- requirePolicyContext() throws UnauthorizedError if policy invalid

WRAPPER CODE (src/lib/canonical-route-enforcement.ts):
- Catches UnauthorizedError from legacy
- Maps to HTTP 401 status code
```

**Issue**: Legacy system decides WHETHER to throw an error. Wrapper only decides HTTP status code for that error.

**Risk**: If legacy system changes error classification (throw ForbiddenError instead of UnauthorizedError for a specific case), wrapper behavior changes without code modification.

**Classification**: HYBRID - both systems partially authoritative

---

### Finding 2: Capability Logic Still Owned by Legacy

**Location**: Authorization logic in legacy system

**Code Chain**:
```
canDo() → hasCapability() → ROLE_CAPABILITIES lookup → role-based checks
│
└─ This entire logic chain is LEGACY CODE (src/policies/capability-check.ts)
```

**Problem**: 
- Wrapper calls `canDo()` to check capabilities
- But `canDo()` is legacy code that implements the actual authorization logic
- Wrapper only makes "if/else" decision based on legacy evaluation

**Risk**: 
- Wrapper cannot change authorization rules
- Wrapper cannot add new authorization types
- Wrapper cannot fix authorization bugs without changing legacy code

**Classification**: LEGACY OWN - wrapper is dependent on legacy for logic

---

### Finding 3: Session Validation Still Owned by Legacy

**Location**: Session validation in legacy system

**Code Chain**:
```
requireSession() → getSession() → db.session.findUnique()
                   ├─ JWT validation (legacy)
                   ├─ Cookie parsing (legacy)
                   ├─ Expiration checks (legacy)
                   └─ Revocation checks (legacy)
```

**Problem**: Wrapper has no control over:
- How sessions are validated
- When sessions expire
- How revocation is handled
- What constitutes a "valid" session

**Risk**: Session semantics are entirely legacy-controlled

**Classification**: LEGACY OWN

---

### Finding 4: Incomplete Implementation - Capability Derivation

**Location**: src/lib/canonical-route-enforcement.ts line 261-276

**Code**:
```typescript
function deriveCapabilitiesFromPolicy(policy: PolicyContext | null): Set<string> {
  const capabilities = new Set<string>();

  if (!policy || !policy.roles) {
    return capabilities;
  }

  // For now, return empty set
  // In production, this would:
  // 1. Look up each role in ROLE_CAPABILITIES
  // 2. Collect all capabilities for the user's roles
  // 3. Apply scope restrictions
  // The existing canDo() function handles this properly

  return capabilities;  // ← ALWAYS RETURNS EMPTY SET
}
```

**Problem**: 
- Function always returns empty Set
- But code tries to use `ctx.verifiedCapabilities.has(capability)`
- This will ALWAYS fail
- Routes relying on verifiedCapabilities are broken

**Risk**: 
- Routes cannot check capabilities from context
- Must call legacy `canDo()` function instead (defeating the point)
- Incomplete implementation blocks proper context usage

**Classification**: INCOMPLETE - blocking feature

---

### Finding 5: No Double Enforcement Detected (GOOD)

**Analysis**: Verified migrated routes do NOT execute auth twice

**Verified routes**:
- /api/me: Single auth call, single policy load ✓
- /api/engagements/[id]/findings: Single auth, uses ctx throughout ✓
- /api/control/today: Single auth, workspace validated once ✓

**Finding**: No double enforcement detected. Good migration execution.

**Classification**: PASS

---

### Finding 6: Hidden Coupling - Wrapper Cannot Function Without Legacy

**Location**: All canonical wrapper calls to legacy

**Dependency chain**:
```
withCanonicalEnforcement()
  ├─ DEPENDS ON requireAuth() - cannot replace this
  ├─ DEPENDS ON SessionInfo type - from legacy services
  ├─ DEPENDS ON PolicyContext type - from legacy policies
  ├─ DEPENDS ON canDo() function - legacy evaluation logic
  └─ DEPENDS ON error types (UnauthorizedError, ForbiddenError) - legacy definitions
```

**Problem**: Wrapper is completely coupled to legacy system

**Risk**: Cannot deprecate or replace legacy without rewriting wrapper entirely

**Classification**: TIGHT COUPLING - dangerous for future refactoring

---

## CONVERGENCE DECISION MATRIX

| Component | CANONICAL | LEGACY | HYBRID | Decision | Action |
|-----------|-----------|--------|--------|----------|--------|
| Status Code Mapping | ✓ | | | OWN | Keep |
| Workspace Validation | ✓ | | | OWN | Keep |
| Handler Barrier | ✓ | | | OWN | Keep |
| Error Classification | | ✓ | | OWN (legacy) | REWRITE |
| Auth Validation Logic | | ✓ | | OWN (legacy) | WRAP |
| Capability Evaluation | | ✓ | | OWN (legacy) | WRAP |
| Session Validation | | ✓ | | OWN (legacy) | WRAP |
| Capability Derivation | | | ✗ INCOMPLETE | FIX | COMPLETE |
| Error Handling | | ✓ | ✓ | HYBRID | CLARIFY |
| Response Generation | ✓ | | | OWN | Keep |

---

## HYBRID OWNERSHIP RESOLUTION REQUIRED

### Option A: Make Wrapper Truly Canonical (Recommended for Tier B+)

**Actions**:
1. Move error creation to wrapper (UnauthorizedError, ForbiddenError)
2. Move capability evaluation to wrapper (own ROLE_CAPABILITIES logic)
3. Move session validation rules to wrapper
4. Complete deriveCapabilitiesFromPolicy() implementation
5. Deprecate legacy auth-guard functions
6. Update all routes to NOT call legacy functions

**Effort**: High (requires understanding legacy auth rules)  
**Risk**: Breaking change to existing code  
**Benefit**: True canonical ownership, scalable for Tier B/C/D

---

### Option B: Document and Test Hybrid Model

**Actions**:
1. Document exact coupling between wrapper and legacy
2. Build equivalence tests (wrapper behavior = legacy behavior)
3. Add integration tests verifying sync
4. Gate all changes to legacy with wrapper audit
5. Plan gradual migration path

**Effort**: Medium (testing and documentation)  
**Risk**: Ongoing maintenance burden of two systems  
**Benefit**: Can proceed with Tier B, but with caution

---

### Option C: Freeze Tier B Until Resolved

**Actions**:
1. Complete canonical ownership before scaling
2. Resolve all hybrid aspects
3. Implement complete capability derivation
4. Verify zero coupling to legacy

**Effort**: High (implementation work)  
**Risk**: Schedule delay  
**Benefit**: True convergence, safe scaling

---

## RECOMMENDATION FOR TIER B GATE

### PRIMARY GATE CONDITION: RESOLVE HYBRID OWNERSHIP

**Current State**: FAILS gate  
**Reason**: Wrapper cannot safely scale across 70+ Tier B routes without resolving:
1. Who owns error classification? (HYBRID)
2. Who owns authorization logic? (LEGACY)
3. Who owns session validation? (LEGACY)
4. What happens when legacy changes? (UNKNOWN)

**Decision**: **FREEZE TIER B MIGRATION**

**Unblock Tier B by choosing**:
- **Option A**: Complete rewrite (make wrapper truly canonical)
- **Option B**: Explicit testing of hybrid model  
- **Option C**: Stay on Option A (freeze + rewrite)

**Do NOT proceed with Option B + scale to 70 routes** (too risky)

---

## DELIVERABLES GENERATED

✓ canonical_auth_call_graph.md - Complete trace of all calls  
✓ This findings document - Hybrid ownership identified  
⚠ Tier B gate - FROZEN pending resolution

---

## FINAL CLASSIFICATION

```
CONVERGENCE CLASSIFICATION: HYBRID_WRAPPER

Characteristics:
- Wrapper owns HTTP semantics (status codes, responses)
- Wrapper owns flow control (sequencing)
- Wrapper owns handler barrier
- Legacy owns auth semantics (validation, error classification)
- Both systems have authority (dangerous)
- Cannot safely scale without resolution

Risk Level: HIGH for scaling to Tier B/C/D
Stability: ACCEPTABLE for Tier A (already deployed)
Scalability: BLOCKED

Next Step: Resolve ownership model before Tier B
```

---

## SESSION NOTES

This audit reveals the canonical wrapper is NOT a replacement for legacy auth - it is a **facade** that makes legacy auth "prettier" but does not fundamentally change how authentication works.

For true canonical convergence, the wrapper must:
1. Own error creation, not just mapping
2. Own auth validation logic, not just calling legacy
3. Own authorization decisions, not just delegating
4. Have zero coupling to legacy internal functions

Current path scales only to Tier A. Tier B requires architectural decision.
