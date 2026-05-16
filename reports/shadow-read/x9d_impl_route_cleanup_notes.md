# X9D-IMPL: Route Cleanup Assessment

**Date:** 2026-05-15  
**Status:** ROUTE CLEANUP ASSESSMENT COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Route 1: decisions/create

### File: src/app/api/decisions/create/route.ts

**Current capability check (line 30):**
```typescript
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
```

**Pattern:** String literal "decision_create"

**Optional upgrade:**
```typescript
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
```

### Cleanup Decision: DEFER

**Reason:** 
- String literal works correctly with entitlement service
- Route is not being refactored in X9D-IMPL (only constants added)
- Full route migration deferred to X9C-5 service refactoring phase
- No blocking issue with current pattern

**Impact of not cleaning up:**
- ✓ Route still functions correctly
- ✓ Capability check still passes
- ✓ Quota enforcement still works
- ✓ No security risk
- ⚠️ Not type-safe (string literal vs constant)

**Impact of cleaning up:**
- ✓ Type-safe reference to constant
- ✓ Consistent with domain patterns
- ✓ Enables scanner improvements later
- ✗ Small change not in scope for minimal X9D-IMPL

---

## Route 2: recommendations

### File: src/app/api/recommendations/route.ts

**Current checks:**
```typescript
// Line 36 - Domain check
const authContext = await withAuth({
  capability: CAPABILITIES.RECOMMENDATION_CREATE,
  internalOnly: true,
});

// Line 53 - Entitlement check
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
```

**Pattern:** Mixed (domain constant + string literal)

**Complexity:** This route checks:
1. Domain level: RECOMMENDATION_CREATE (uses constant)
2. Entitlement level: "decision_create" (uses string)

**Optional upgrade:**
```typescript
// Could migrate to:
const capabilityCheck = await assertCapability(
  workspaceId, 
  CAPABILITIES.DECISION_CREATE
);
```

### Cleanup Decision: DEFER

**Reason:** 
- More complex route with mixed pattern
- Route calls createRecommendation service which requires refactoring
- Full migration deferred to X9C-5 service refactoring
- Current pattern works correctly despite being mixed

**Risk of cleanup in X9D-IMPL:**
- Route cleanup might expose service-level auth issues
- Service is not refactored yet
- Deferring ensures X9D-IMPL stays minimal scope

---

## Route Cleanup Summary

| Route | Current Pattern | Type Safety | Cleanup Status | Reason |
|-------|-----------------|-------------|-----------------|--------|
| decisions/create | String literal | ✗ NO | DEFER | Not in minimal scope |
| recommendations | Mixed pattern | ⚠️ PARTIAL | DEFER | Service not refactored |

---

## Scope Compliance

**X9D-IMPL authorized scope:**
- ✓ Add DECISION_CREATE constant
- ✓ Add DECISION_UPDATE constant
- ✓ Verify entitlement mapping
- ✗ Route cleanup NOT required (optional)
- ✗ Service refactoring NOT in scope

**Route cleanup decision:** ✓ PROPERLY DEFERRED

---

## Future Route Migration Plan

### X9C-5 Phase (Service Refactoring)

When services are refactored to use ServiceAuthEnvelope, routes will be updated:

**decisions/create cleanup:**
```typescript
// OLD (string literal)
const capabilityCheck = await assertCapability(workspaceId, "decision_create");

// NEW (service pattern)
const ctx = createServiceAuthEnvelope({
  verifiedCapabilities: new ReadonlySet([CAPABILITIES.DECISION_CREATE]),
  // ... other fields
});
const result = await decisionService.create(ctx, data);
```

**recommendations cleanup:**
```typescript
// Similar migration pattern when service is refactored
```

---

## Authorization for Route Cleanup

**Q: Should routes be updated in X9D-IMPL?**

**A: No - correctly deferred**

**Evidence:**
- X9D-IMPL is minimal scope (add 2 constants only)
- Routes work correctly with string literals + entitlements
- Service refactoring required for proper pattern migration
- X9C-5 will refactor both routes + services together

---

## No Route Changes Made

**Routes modified in X9D-IMPL:** 0

**Route cleanup deferred until:** X9C-5 service refactoring phase

**Current route behavior:** Unchanged and working correctly

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| decisions/create reviewed | ✓ YES | String literal checked at entitlement level |
| recommendations reviewed | ✓ YES | Mixed pattern checked, deferred for service work |
| Route cleanup required for X9D-IMPL | ✗ NO | Cleanup is optional, not required |
| Route cleanup deferred properly | ✓ YES | Deferring to X9C-5 keeps X9D-IMPL minimal |
| Routes function correctly now | ✓ YES | No breaking changes made |
| Routes type-safe migration planned | ✓ YES | Planned for X9C-5 phase |

---

## Conclusion

**Route cleanup status:** PROPERLY DEFERRED

- Routes use string literals correctly with entitlements
- Routes will be refactored in X9C-5 when services are migrated
- No route changes required for X9D-IMPL minimal scope
- Proceeding to phase E (tests)
