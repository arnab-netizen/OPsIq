# X9D-IMPL: Pre-Implementation Confirmation

**Date:** 2026-05-15  
**Status:** PRE-IMPLEMENTATION INSPECTION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## File Inspection Results

### 1. src/domain/constants/capabilities.ts

**Status:** ✓ Confirmed - DECISION_CREATE and DECISION_UPDATE missing

**Current state:**
- Line 101-102: DECISION_ACCEPT and DECISION_REJECT exist
- DECISION_CREATE: NOT PRESENT
- DECISION_UPDATE: NOT PRESENT
- Format used: "domain:action" (e.g., "decision:accept", "decision:reject")

**Action required:** Add 2 constants with "decision:create" and "decision:update" format

---

### 2. src/services/entitlement.ts

**Status:** ✓ Confirmed - Entitlement namespace has decision capabilities

**Current state:**
- Line 24: `DECISION_CREATE = "decision_create"` (entitlement namespace)
- Line 25: `DECISION_UPDATE = "decision_update"` (entitlement namespace)
- Line 98: FREE tier includes DECISION_CREATE
- Lines 126-127: PRO tier includes DECISION_CREATE and DECISION_UPDATE
- Lines 159-160: ENTERPRISE tier includes DECISION_CREATE and DECISION_UPDATE

**Finding:** Entitlement mapping already exists and is properly tiered. No changes required to entitlement.ts.

**Mapping:**
- Entitlement "decision_create" → Future domain CAPABILITIES.DECISION_CREATE
- Entitlement "decision_update" → Future domain CAPABILITIES.DECISION_UPDATE

---

### 3. src/app/api/decisions/create/route.ts

**Status:** ✓ Confirmed - Route uses entitlement-only string literal

**Current code:**
- Line 1: Imports withEnforcementFull, withAuth
- Line 11: Imports assertCapability from entitlement.service
- Line 30: `const capabilityCheck = await assertCapability(workspaceId, "decision_create");`

**Finding:** Route uses string literal "decision_create" checked against entitlements only. No domain CAPABILITIES check.

**Route users:** 1 (POST /api/decisions/create)

---

### 4. src/app/api/recommendations/route.ts

**Status:** ✓ Confirmed - Route uses entitlement-only string literal

**Current code:**
- Line 4: Imports CAPABILITIES from domain
- Line 36: Uses CAPABILITIES.RECOMMENDATION_CREATE for domain check
- Line 53: `const capabilityCheck = await assertCapability(workspaceId, "decision_create");`

**Finding:** Route checks RECOMMENDATION_CREATE at domain level, but also checks "decision_create" at entitlement level. Mixed pattern.

**Route users:** 1 (POST /api/recommendations - creates recommendations that consume decision quota)

---

## Gap Analysis

### DECISION_CREATE Missing from Domain

**Why it matters:**
- decisions/create route currently only checks entitlements (not fail-closed at domain level)
- Cannot be refactored to ServiceAuthEnvelope until domain CAPABILITIES constant exists
- Blocks decision service refactoring (X9C-5 pilot)

**Proof of need:**
- Route at line 30: `assertCapability(workspaceId, "decision_create")`
- Route must eventually migrate to domain-enforced capability
- Entitlements already define quota enforcement for "decision_create"

**Impact of adding:**
- Makes domain constant available for future refactoring
- Enables type-safe capability checking
- Does NOT change runtime behavior until service is refactored (X9C-5)

---

### DECISION_UPDATE Missing from Domain

**Why it matters:**
- Decision update flows in service require consistency with DECISION_CREATE
- Recommendations route needs DECISION_UPDATE for full authorization coverage
- Part of unified decision capability pair

**Proof of need:**
- recommendations route at line 53 checks "decision_create" for quota
- Future service refactoring needs both create and update capabilities
- Entitlements already define "decision_update" for quota enforcement

**Impact of adding:**
- Ensures complete decision operation coverage
- Maintains capability symmetry (create and update paired)
- Enables future DECISION_UPDATE quota enforcement

---

## Entitlement Mapping Verification

### Current Entitlement Tiers

**FREE tier:**
- ✓ Includes: DECISION_CREATE
- ✗ Missing: DECISION_UPDATE

**PRO tier:**
- ✓ Includes: DECISION_CREATE, DECISION_UPDATE

**ENTERPRISE tier:**
- ✓ Includes: DECISION_CREATE, DECISION_UPDATE

### Action Required

**Entitlement mapping:** Already complete. No changes needed.
- Tier configs already include decision capabilities
- Quota enforcement already in place
- Adding domain constants does NOT require entitlement changes

---

## Route Cleanup Assessment

### Route 1: decisions/create

**Current pattern:** Entitlement-only check
```typescript
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
```

**Optional improvement:** Replace with domain constant reference
```typescript
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
```

**Status:** OPTIONAL - Not required for X9D-IMPL, but recommended for consistency

### Route 2: recommendations

**Current pattern:** Mixed (domain + entitlement)
```typescript
// Domain check
const authContext = await withAuth({
  capability: CAPABILITIES.RECOMMENDATION_CREATE,
  internalOnly: true,
});

// Entitlement check
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
```

**Status:** Complex cleanup - Defer to X9C-5 service refactoring

---

## Expected Scanner Effect After DECISION_CREATE Addition

**Scanner baseline:** 448 violations (283 critical, 165 block-build)

**After adding DECISION_CREATE to domain CAPABILITIES:**
- ✓ No new violations introduced (constants don't create violations)
- ✓ No violation reduction (scanner counts pattern violations from routes/services)
- ✓ Scanner will recognize CAPABILITIES.DECISION_CREATE as safe pattern
- Route still uses entitlement-only check → still counted as violation
- Violation reduction happens when route is refactored to use domain constant (X9C-5)

**Expected scanner total:** 448 (unchanged)

---

## Test Coverage Assessment

### Existing Tests
- auth-governance-regression.test.ts
- phase-g/governance-backbone.test.ts
- runtime-proof/rp4-capability-enforcement-runtime-proof.test.ts
- phase-b/canonical-capability-resolver.test.ts

### Required New Tests
1. DECISION_CREATE exists and equals "decision:create"
2. DECISION_UPDATE exists and equals "decision:update"
3. No extra capabilities added beyond DECISION_CREATE and DECISION_UPDATE
4. Entitlement tier mapping for decision governance present
5. ServiceAuthEnvelope can carry verified decision capabilities

### Test File Location
`src/__tests__/governance/governance-capabilities.test.ts` (new file)

---

## Pre-Implementation Checklist

| Item | Status | Evidence |
|------|--------|----------|
| DECISION_CREATE missing from domain | ✓ CONFIRMED | capabilities.ts line 101-102 shows DECISION_ACCEPT/REJECT but not DECISION_CREATE |
| DECISION_UPDATE missing from domain | ✓ CONFIRMED | capabilities.ts has no DECISION_UPDATE constant |
| decisions/create route uses string literal | ✓ CONFIRMED | route.ts line 30: `assertCapability(workspaceId, "decision_create")` |
| recommendations route uses string literal | ✓ CONFIRMED | route.ts line 53: `assertCapability(workspaceId, "decision_create")` |
| Entitlement mapping already exists | ✓ CONFIRMED | entitlement.ts lines 24-25, tier configs include both capabilities |
| Tier configs need update | ✗ NOT NEEDED | FREE tier has DECISION_CREATE; PRO/ENTERPRISE have both |
| Route cleanup required for implementation | ✗ NOT REQUIRED | Optional, not blocking for minimal scope |
| Scanner will show violation change | ✗ NO | Adding constants doesn't change scanner results |

---

## Ready for Implementation: YES

**Conditions met:**
- ✓ Both capabilities missing from domain confirmed
- ✓ Route users identified (2 routes)
- ✓ Entitlement mapping verified and ready
- ✓ No tier config changes required
- ✓ Route cleanup is optional
- ✓ Scope is minimal and focused
- ✓ Test strategy defined

**Proceed with phase B (add capabilities):** YES
