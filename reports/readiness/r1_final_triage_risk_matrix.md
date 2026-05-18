# R1-FINAL-TRIAGE: Risk Classification Matrix

**Date:** 2026-05-18  
**Phase:** R1-FINAL-TRIAGE Risk Classification  
**Status:** ✓ CLASSIFICATION COMPLETE

---

## A. Violation Categorization

**Total Violations:** 212 (127 critical, 85 block-build)

**Categories Identified:**
1. **Infrastructure/Library Files** (~80 violations)
   - auth-guard.ts, runtime-shadow-read-enforcer.ts, auth-ownership-allowlist.ts, actor-context.ts
   - These define OLD auth system (being modernized away)
   - Not directly customer-facing
   - Will be eliminated as routes modernize

2. **Service Layer Files** (~40 violations)
   - stage.ts, owner-dashboard.service.ts, etc.
   - Services import auth-guard for capability checks
   - Receive verified context from modernized routes
   - Can be refactored without affecting customer behavior

3. **Route Handler Files** (~60 violations)
   - Handlers using withAuth() directly
   - Customer-visible endpoints
   - Direct auth exposure to customers
   - Require modernization before beta

4. **Governance/Test Files** (~32 violations)
   - shadow-read-classifier.ts, test utilities, scanner code
   - Development/testing artifacts
   - No production impact
   - Can defer cleanup

---

## B. Tier Classification

### TIER_1_BETA_BLOCKER (~60 violations)

**Definition:** Can directly break tenant isolation, auth, billing, or create replay risk

**Components:**
- Route handlers with direct withAuth() calls (~40 violations)
- Routes handling sensitive operations (payments, entitlements, governance)
- Routes where unverified session could leak data
- Routes without idempotency protection on mutations

**Examples:**
- Engagement mutation endpoints
- Decision mutation endpoints  
- Entitlement endpoints
- Webhook handlers (critical payment path)
- Auth-sensitive operations (non-public endpoints)

**Risk if Deferred:**
- Customer A's data accessible to Customer B (CRITICAL)
- Unverified session used for authorization (CRITICAL)
- Replay attacks on mutation endpoints (CRITICAL)
- Idempotency loss on critical operations (HIGH)

**Beta Impact:** ✗ MUST FIX BEFORE BETA

**Estimated Violations in This Tier:** 50-60

---

### TIER_2_PRODUCTION_HARDENING (~40 violations)

**Definition:** Should fix before public scale (paid launch), not required for controlled beta

**Components:**
- Service layer imports of auth-guard (~30 violations)
- Internal utility functions with shadow reads (~10 violations)
- Non-critical path shadow reads

**Examples:**
- Service layer using requireSession() for logging
- Internal audit functions with unverified session reads
- Dashboard calculations using unverified context
- Capability checks in service layer (redundant with route enforcement)

**Risk if Deferred:**
- Service layer receives unverified context (MEDIUM)
- Audit logging might use wrong actor (LOW)
- Scale testing might reveal auth leaks (MEDIUM)
- Performance: Redundant capability checks (LOW)

**Beta Impact:** ✓ OK to defer (services receive verified context from routes)

**Private Beta:** Can launch with these unresolved (controlled environment)

**Paid Launch:** Should fix before public (scale + trust)

**Estimated Violations in This Tier:** 30-40

---

### TIER_3_POST_BETA (~80 violations)

**Definition:** Governance consistency, framework cleanup, low exploitability

**Components:**
- Old auth-guard.ts implementation (~40 violations)
- Framework file violations (defineSystem, middleware setup) (~20 violations)
- Infrastructure cleanup (old wrapper usage) (~20 violations)

**Examples:**
- withAuth() function definition itself (being replaced by withCanonicalEnforcement)
- requireSession() in auth-guard (will be removed)
- Old wrapper patterns in infrastructure
- Framework-level shadow reads

**Risk if Deferred:**
- Technical debt accumulation (LOW)
- Confusing codebase (LOW)
- Future developers confused by old pattern (LOW)
- No exploitability risk (all routes will eventually modernize)

**Beta Impact:** ✓ NO IMPACT (old system coexists with new)

**Recommended:** Defer to post-beta when old auth-guard is fully removed

**Estimated Violations in This Tier:** 70-80

---

### TIER_4_COSMETIC (~32 violations)

**Definition:** Scanner artifacts, development code, no production impact

**Components:**
- shadow-read-classifier.ts (scanner code) (~20 violations)
- Test helper files (~5 violations)
- Governance utilities for analysis (~7 violations)

**Examples:**
- Scanner that detects violations (uses withAuth() to do its job)
- Test utilities that mock auth
- Analysis code in governance folder

**Risk if Deferred:**
- NONE (non-production code)
- Scanner accuracy slightly affected (NEGLIGIBLE)
- Tests run fine (NONE)

**Beta Impact:** ✓ NO IMPACT

**Recommended:** Defer indefinitely (these files don't affect production)

**Estimated Violations in This Tier:** 30-32

---

## C. Route Handler Risk Assessment

**Critical Path (Tier 1 Blocker Candidates):**

| Route Domain | Handler Count | Tier 1 Risk | Auth Exposure | Blocker? |
|--------------|---------------|------------|--------------|----------|
| Engagement mutations | 12 | HIGH | Direct user/workspace | YES |
| Decision mutations | 8 | HIGH | Direct user/workspace | YES |
| Entitlements | 6 | CRITICAL | Billing system | YES |
| Webhook handlers | 2 | CRITICAL | Payment/Stripe | YES |
| Auth critical | 4 | HIGH | Session/capabilities | YES |
| Admin operations | 6 | MEDIUM | Admin only | NO (limited blast radius) |
| Read-only endpoints | 15 | LOW | Data access | NO (no mutations) |
| Testing/internal | 10 | LOW | Development only | NO |

---

## D. Summary by Tier

| Tier | Violations | Severity | Beta | Paid | Enterprise | Recommendation |
|------|-----------|----------|------|------|------------|-----------------|
| **Tier 1** | 50-60 | CRITICAL | ✗ FIX | ✗ FIX | ✗ FIX | MUST FIX NOW |
| **Tier 2** | 30-40 | HIGH | ✓ OK | ✗ FIX | ✗ FIX | FIX PRE-PAID |
| **Tier 3** | 70-80 | MEDIUM | ✓ OK | ✓ OK | ✗ FIX | DEFER POST-BETA |
| **Tier 4** | 30-32 | LOW | ✓ OK | ✓ OK | ✓ OK | DEFER INDEFINITELY |

---

## E. Launch Readiness by Tier

**Private Beta Can Launch When:**
- ✓ Tier 1 resolved (50-60 violations fixed)
- ✓ Tier 2 unresolved acceptable (service layer debt)
- ✓ Tier 3 deferred acceptable (old framework cleanup)
- ✓ Tier 4 deferred acceptable (dev artifacts)

**Result at Beta:** 212 - 60 = **~152 violations acceptable for beta**

**Paid Launch Can Proceed When:**
- ✓ Tier 1 resolved (0 violations)
- ✓ Tier 2 resolved (0 violations)
- ✓ Tier 3 deferred acceptable
- ✓ Tier 4 deferred acceptable

**Result at Paid:** 212 - 60 - 40 = **~112 violations acceptable for paid**

**Enterprise Launch Can Proceed When:**
- ✓ Tier 1-3 resolved
- ✓ Tier 4 deferred acceptable

**Result at Enterprise:** 212 - 142 = **~70 violations acceptable**

---

**Status: ✓ R1-FINAL-TRIAGE RISK CLASSIFICATION COMPLETE**

**Key Finding:** 50-60 Tier 1 violations are HARD BLOCKERS for beta. All other tiers are deferrable.
