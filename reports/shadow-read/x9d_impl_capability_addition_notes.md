# X9D-IMPL: Capability Addition Notes

**Date:** 2026-05-15  
**Status:** CAPABILITY ADDITION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Changes Made

### File: src/domain/constants/capabilities.ts

**Change location:** Lines 100-103 (Decisions section)

**Before:**
```typescript
  // Decisions
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",
```

**After:**
```typescript
  // Decisions
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",
```

**Scope:** Exactly 2 constants added, no other changes

---

## Capabilities Added

| Constant Name | Value | Type | Format | Usage |
|-------------|-------|------|--------|-------|
| DECISION_CREATE | "decision:create" | Domain constant | domain:action | decisions/create, recommendations routes |
| DECISION_UPDATE | "decision:update" | Domain constant | domain:action | Decision service, recommendations |

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| DECISION_CREATE added | ✓ YES | Line 101 in capabilities.ts |
| DECISION_UPDATE added | ✓ YES | Line 102 in capabilities.ts |
| Format is "domain:action" | ✓ YES | Matches existing pattern (decision:create, decision:update) |
| No other capabilities added | ✓ YES | Only 2 constants, no experiment/admin/workspace/etc |
| Alphabetical order maintained | ✓ YES | CREATE before UPDATE before ACCEPT before REJECT |
| TypeScript syntax valid | ✓ YES | Proper object literal format |
| Type inference updated | ✓ AUTOMATIC | CapabilityName type auto-includes new constants |

---

## Impact Analysis

### What Changed
- Domain CAPABILITIES object now includes DECISION_CREATE and DECISION_UPDATE
- No changes to entitlements (already existed there)
- No changes to routes
- No changes to services
- No changes to tests (tests added in phase E)

### What Didn't Change
- ✗ No route migration
- ✗ No service refactoring
- ✗ No entitlement tier modification
- ✗ No auth context changes
- ✗ No feature work
- ✗ No wrapper changes

### Runtime Behavior
- Constants are now available for type-safe reference
- Routes can optionally migrate to use CAPABILITIES.DECISION_CREATE instead of "decision_create" string
- Actual authorization behavior unchanged (still entitlement-based until service refactors)
- No new runtime violations from constant addition

---

## Scope Compliance

### Authorized Changes
- ✓ Add DECISION_CREATE constant
- ✓ Add DECISION_UPDATE constant
- ✓ Place in logical location (Decisions section)
- ✓ Use consistent format with existing capabilities

### Forbidden Changes Not Made
- ✗ No EXPERIMENT_CREATE added
- ✗ No EXPERIMENT_UPDATE added
- ✗ No ADMIN_SETTINGS added
- ✗ No ADMIN_TEAM added
- ✗ No WORKSPACE_CREATE added
- ✗ No WORKSPACE_INVITE added
- ✗ No route migrations
- ✗ No service refactoring
- ✗ No any/as any introduced
- ✗ No permission fabrication

---

## Next Steps

Phase C: Verify entitlement mapping
Phase D: Check route cleanup (optional)
Phase E: Add tests
Phase F: Validation (build, tests, scanner)
