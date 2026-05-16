# PHASE 6 CONVERGENCE CLASSIFICATION

## Final Determination

Based on comprehensive audit of code structure, call graphs, and semantic ownership:

### **CLASSIFICATION: HYBRID_WRAPPER**

Not "True Canonical" ❌  
Not "Legacy Core" ❌  
**Exactly: HYBRID_WRAPPER** ✓

---

## What This Means

### Wrapper Controls (HTTP Layer)
- Response generation (status codes, headers, body format)
- Flow control (sequence of operations)
- Handler execution barrier (before/after auth)
- Error mapping (HTTP status assignment)

### Legacy Controls (Auth Layer)
- Session validation logic (getSession)
- Policy loading logic (getPolicyContext)
- Authorization rule evaluation (hasCapability, ROLE_CAPABILITIES)
- Error classification (UnauthorizedError vs ForbiddenError decision)
- Session lifecycle (expiration, revocation)

### Consequence
**Routes are NOT converged - they are syntactically migrated but semantically unchanged**

---

## Risk Assessment

| Aspect | Risk Level | Reason |
|--------|-----------|--------|
| Scaling to Tier B (70 routes) | 🔴 HIGH | Hybrid ownership will multiply complexity |
| Scaling to Tier C (30 routes) | 🔴 CRITICAL | Complex mutations + hybrid semantics = dangerous |
| Scaling to Tier D (4 routes) | 🔴 CRITICAL | Auth-critical routes need pure semantics |
| Maintenance burden | 🟡 MEDIUM | Two systems must stay in sync |
| Future refactoring | 🔴 HIGH | Cannot change legacy without auditing all routes |
| Performance | 🟢 LOW | No double-calling detected |
| Security | 🟡 MEDIUM | Relies on legacy validation (acceptable for now) |

---

## What Happens Without Resolution

### If Tier B is migrated in current HYBRID state:
1. 70 more routes depend on wrapper + legacy sync
2. Future changes to legacy auth affect 85 total routes (15 + 70)
3. Any divergence in semantics cascades across 85 routes
4. No clear ownership = no clear path to fix bugs
5. Scaling becomes exponentially riskier

### Example divergence scenario:
```
Legacy system change:
- Old behavior: Session with revoked flag → UnauthorizedError
- New behavior: Session with revoked flag → ForbiddenError (differentiate)

Impact on current routes:
- Wrapper maps UnauthorizedError → 401
- Routes expecting 401 still work (by accident)
- But some routes might expect 403 (wrong assumption)
- Hybrid system makes it unclear which is correct
```

---

## Requirements for Tier B Unblock

**Choose ONE path**:

### Path 1: Make Wrapper Truly Canonical (RECOMMENDED)
- ✓ True ownership of all auth semantics
- ✓ Legacy becomes utility library only
- ✓ Safe to scale to 70, 30, 4 routes
- ✗ Requires significant rewrite
- Timeline: 2-3 days

**Unblock criteria**:
- [ ] Error creation moved to wrapper (own UnauthorizedError decision)
- [ ] Capability logic moved to wrapper (own ROLE_CAPABILITIES)
- [ ] Session validation rules moved to wrapper (own expiration/revocation)
- [ ] deriveCapabilitiesFromPolicy() completed
- [ ] Zero calls to legacy auth-specific functions
- [ ] All 15 Tier A routes re-tested with new wrapper
- [ ] No coupling to legacy SessionInfo/PolicyContext types

### Path 2: Explicit Hybrid Testing (ACCEPTABLE SHORT-TERM)
- ✓ Can proceed with Tier B
- ✓ Less immediate rewrite needed
- ✗ Ongoing maintenance burden
- ✗ Scaling still risky

**Unblock criteria**:
- [ ] Document exact wrapper ↔ legacy coupling
- [ ] Build equivalence tests (wrapper behavior = legacy behavior)
- [ ] Add integration test suite
- [ ] Gate all legacy auth changes with wrapper audit
- [ ] Plan gradual migration path to Path 1
- [ ] Assign owner for wrapper-legacy sync

### Path 3: Stay Frozen Until Path 1 Complete
- ✓ Most conservative
- ✓ Safest for production
- ✗ Blocks Tier B/C/D migration
- ✗ Schedule delay

---

## Current Status Against Each Path

### Path 1 (True Canonical): 0% Complete
- [ ] Error creation: LEGACY OWNS
- [ ] Capability logic: LEGACY OWNS
- [ ] Session validation: LEGACY OWNS
- [ ] Derivation: NOT IMPLEMENTED
- [ ] Coupling: TIGHT

### Path 2 (Explicit Hybrid): 10% Complete
- [x] Identified hybrid coupling
- [ ] Documented (in progress)
- [ ] Equivalence tests: NOT STARTED
- [ ] Integration tests: NOT STARTED
- [ ] Owner assigned: NO

### Path 3 (Stay Frozen): 100% Ready
- [x] No work needed
- [x] Can maintain current state indefinitely
- [x] Tier A is safe as-is

---

## Recommendation

**Choose Path 1 (True Canonical) before Tier B**

**Reasoning**:
- Tier B has 70 routes (5x Tier A)
- Hybrid complexity multiplies with scale
- Path 1 investment pays off immediately (safe scaling)
- Path 2 maintenance burden grows exponentially (2x + 70)
- Path 3 indefinitely blocks convergence

**Timeline**: 
- Path 1: 2-3 days investment → safe scaling
- Path 2: 1-2 days + ongoing maintenance → risky scaling
- Path 3: 0 days + zero benefit → blocked

---

## Final Gate Decision

```
TIER B MIGRATION GATE: ❌ BLOCKED

Reason: Hybrid ownership classification
Blocker: Wrapper does not own auth semantics
Resolution: Must choose Path 1, 2, or 3

Status: Awaiting architectural decision
Next: Complete ownership resolution
Then: Proceed to TIER B (if Path 1 or 2)
```

**No Tier B routes should be migrated in current HYBRID state.**
