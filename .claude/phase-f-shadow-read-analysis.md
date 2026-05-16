# PHASE F: SHADOW READ ELIMINATION — CRITICAL ANALYSIS

**Date**: 2026-05-14  
**Status**: SNAPSHOT_HYBRID confirmed (requires extensive remediation)  
**Classification**: Cannot certify TRUE_REQUEST_REALITY without eliminating shadow reads  

---

## Critical Finding: 347 Shadow Auth Reads Detected

Static scanner found:
- **347 `withAuth()` calls** (primary shadow reads)
- **155 auth-guard imports** (type + function imports)
- **~50 routes** affected
- **Multiple services** with auth re-fetches

---

## Architecture Problem: Multiple Auth States in Single Request

```
Timeline T0 → T1 → T2

T0: Wrapper enters
  ├─ Create snapshot (session valid at T0)
  └─ Pass to handler

T1: Handler executes
  └─ Calls withAuth()
     └─ Fetches getSession() from DB AGAIN

If session revoked between T0 and T1:
  ├─ Wrapper made decision based on: sessionValid=true
  └─ Handler sees: sessionValid=false

Result: DIFFERENT AUTH SEMANTICS
Problem: SNAPSHOT NON-EXCLUSIVE
Classification: SNAPSHOT_HYBRID (not TRUE_REQUEST_REALITY)
```

---

## Scale of Work Required for TRUE_REQUEST_REALITY

### Current State
- 347 `withAuth()` calls across codebase
- Each call is a shadow read
- Each call violates snapshot exclusivity
- Each represents opportunity for auth state divergence

### Required Changes (F4-F7)

#### F4: Runtime Detection
- Detect auth reads after snapshot finalized
- Block requests immediately
- Capture violations for logging/debugging

#### F5: Auto-Remediation
- Replace 347 `withAuth()` calls with `ctx.verifiedSessionSnapshot`
- Update handler signatures to accept context
- Preserve response shapes and behaviors
- Maintain permission checks (using snapshot values)

**Example Conversion**:
```typescript
// BEFORE (shadow read)
const { session, policy } = await withAuth({ capability: AUDIT_READ });
const role = session.user.role;

// AFTER (snapshot-based)
const { verifiedSessionSnapshot, verifiedCapabilities } = ctx;
const role = verifiedSessionSnapshot.roles[0].role;
// Capability check already done: AUDIT_READ in verifiedCapabilities
```

#### F6: CI Governance Gate
- Block builds with shadow reads
- Scanner runs in CI pipeline
- Prevents regression

#### F7: Adversarial Tests
- Test 1: Route-local `getSession()` blocked
- Test 2: Helper auth access blocked
- Test 3-7: Various bypass attempts

---

## Effort Estimate

| Task | Scope | Effort |
|------|-------|--------|
| F4: Runtime detector | Build enforcer | Small |
| F5: Replace 347 calls | Route/service updates | **LARGE** |
| F6: CI gate setup | Package.json/CI config | Medium |
| F7: Adversarial tests | Test suite | Medium |

**Total**: F5 (auto-remediation) is substantial due to scale

---

## Why SNAPSHOT_HYBRID is Correct

Current system has BOTH:
✓ Snapshot exists (created at wrapper entry)
✓ Snapshot is immutable (deepFreeze enforced)
✓ Snapshot is trace-owned (embedded in trace)
✓ Snapshot is replay-safe (deterministic)

BUT:
✗ Snapshot is NOT exclusive (routes re-fetch auth)
✗ Multiple auth states possible (snapshot vs live)
✗ Mid-request semantic drift (T0 vs T1)
✗ Handler can see different state (live DB vs snapshot)

Result: Snapshot exists but ISN'T the only source of auth truth.
Classification: Correct to call it SNAPSHOT_HYBRID

---

## Path to TRUE_REQUEST_REALITY

### Prerequisite: Complete F5 (Auto-Remediation)
- Convert 347+ `withAuth()` → `ctx.verifiedSessionSnapshot`
- Update handler signatures
- Eliminate route-level auth re-fetches

### Then: F4 Runtime Enforcement
- Block any auth reads post-snapshot
- Fail-fast on violations

### Then: F6-F7 Governance & Testing
- CI gate prevents regression
- Adversarial tests verify exclusivity

### Result Classification
Once complete:
- 0 shadow reads (enforced)
- 0 runtime violations (enforced)
- Snapshot = ONLY auth source
- Classification: **TRUE_REQUEST_REALITY**

---

## Decision Point

### Option A: Complete Migration Now
✓ Finish F4-F7 (complete shadow read elimination)
✓ Achieve TRUE_REQUEST_REALITY classification
✓ All work on one branch
Time: ~20-30 tokens for F5 auto-remediation

### Option B: Document Current State
✓ Leave system as SNAPSHOT_HYBRID
✓ Document why TRUE_REQUEST_REALITY requires F5
✓ Provide migration roadmap
✓ Mark TIER B as blocked pending PHASE F completion

### Option C: Partial Fix
✓ Fix highest-impact routes first
✓ Leave some services as-is
✓ Mixed classification (not suitable for production)

---

## Technical Debt

Current approach created acceptable-but-not-ideal situation:
- Snapshot system is solid (PHASE E proven with 12/12 tests)
- But snapshot isn't exclusive (routes bypass it)
- Result: PHASE F required to complete the architecture

This is why user correctly stated in instructions:
> "Do NOT assume TRUE_REQUEST_REALITY. Snapshot exclusivity NOT proven."

The snapshot exists and works, but it's not the ONLY source of auth truth yet.

---

## Recommendation

**Complete PHASE F (F4-F7) to achieve TRUE_REQUEST_REALITY.**

Reasons:
1. Snapshot infrastructure is complete and proven
2. Remaining work is enforcement + remediation (well-defined)
3. TIER B cannot be certified until TRUE_REQUEST_REALITY
4. Current state (SNAPSHOT_HYBRID) is intermediate, not stable

---

## Summary

**PHASE E Achievement**: Snapshot system created and proven immutable
**PHASE F Challenge**: Make snapshot exclusive (eliminate shadow reads)
**PHASE F Status**: Scanner built (F3), infrastructure ready (F2), extensive remediation needed (F5)
**Current Classification**: SNAPSHOT_HYBRID (correct)
**Target Classification**: TRUE_REQUEST_REALITY (requires F4-F7 completion)

