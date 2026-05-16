# X9D-R: Design Scope Review Input Summary

**Date:** 2026-05-15  
**Status:** SCOPE REVIEW ANALYSIS COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Critical Finding: X9D Scope Mismatch

**X9D Proposed:** 8 new capabilities  
**Proven Necessary:** 2 capabilities  
**Entitlement-Only (Not Proven Route Users):** 6 capabilities

---

## Exact Missing Mappings (Proven by Code)

### DECISION_CREATE - PROVEN BLOCKER
**Current Code:**
- `src/app/api/decisions/create/route.ts` - Line 30: `assertCapability(workspaceId, "decision_create")`
- `src/app/api/recommendations/route.ts` - Uses same check

**Status:** ✓ CONFIRMED MISSING FROM domain CAPABILITIES  
**Required By:** 2 routes  
**Severity:** HIGH - Routes cannot be refactored to ServiceAuthEnvelope without this

### DECISION_UPDATE - PROVEN BLOCKER
**Current Code:**
- Entitlement service defines it for quota enforcement
- Used in decision update flows

**Status:** ✓ CONFIRMED MISSING FROM domain CAPABILITIES  
**Required By:** Decision service  
**Severity:** MEDIUM - Needed for consistency with DECISION_CREATE

---

## X9D Proposed Capabilities - Full Analysis

### 1. DECISION_CREATE ✓ PROVEN
**Code Dependency:** `src/app/api/decisions/create/route.ts` Line 30  
**Route/Service:** decisions/create route  
**Entitlement Overlap:** Yes (exists in entitlements)  
**Expected Scanner Reduction:** 1 violation (once route is refactored)  
**Testable Now:** YES  
**Status:** ADD NOW (blocker for X9C-5)

### 2. DECISION_UPDATE ✓ PROVEN
**Code Dependency:** Used in decision service update flows  
**Route/Service:** Recommendations service  
**Entitlement Overlap:** Yes (exists in entitlements)  
**Expected Scanner Reduction:** 1 violation  
**Testable Now:** YES  
**Status:** ADD NOW (consistency with DECISION_CREATE)

### 3. EXPERIMENT_CREATE ❌ NOT PROVEN
**Code Dependency:** None found in routes or active services  
**Route/Service:** No experiment routes in src/app/api/experiment/*  
**Entitlement Overlap:** Yes (only in entitlements)  
**Expected Scanner Reduction:** 0 (no routes use it)  
**Testable Now:** NO (no routes to test against)  
**Status:** DEFER (not actively used, reserved for future)

**Note:** experiment-lifecycle.service.ts exists but is not called by any routes in current codebase.

### 4. EXPERIMENT_UPDATE ❌ NOT PROVEN
**Code Dependency:** None found  
**Route/Service:** None  
**Status:** DEFER (same as EXPERIMENT_CREATE)

### 5. ADMIN_SETTINGS ❌ NOT PROVEN - LIKELY INCORRECT
**Code Dependency:** Comments mention it, but actual code uses SYSTEM_ADMIN  
**Route/Service:** Admin routes actually use CAPABILITIES.SYSTEM_ADMIN (already exists in domain!)  
**Example:** `src/app/api/admin/workspaces/route.ts` - requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN]  
**Status:** REJECT (already covered by SYSTEM_ADMIN)

**Critical Issue:** Comments say "enforces ADMIN_SETTINGS" but code actually uses SYSTEM_ADMIN. Adding ADMIN_SETTINGS would be redundant and incorrect.

### 6. ADMIN_TEAM ❌ NOT PROVEN
**Code Dependency:** None found  
**Route/Service:** No routes use ADMIN_TEAM  
**Status:** DEFER (reserved for future)

### 7. WORKSPACE_CREATE ❌ NOT PROVEN
**Code Dependency:** None found in routes  
**Route/Service:** None actively using this  
**Status:** DEFER (admin-level, not in service lanes)

### 8. WORKSPACE_INVITE ❌ NOT PROVEN
**Code Dependency:** None found  
**Route/Service:** None actively using this  
**Status:** DEFER (admin-level, not in service lanes)

---

## Summary of Findings

| Capability | Proven | Routes | Testable Now | Recommendation |
|-----------|--------|--------|--------------|-----------------|
| DECISION_CREATE | ✓ YES | 2 | YES | ADD NOW |
| DECISION_UPDATE | ✓ YES | 1 | YES | ADD NOW |
| EXPERIMENT_CREATE | ✗ NO | 0 | NO | DEFER |
| EXPERIMENT_UPDATE | ✗ NO | 0 | NO | DEFER |
| ADMIN_SETTINGS | ✗ NO (redundant) | 0 | N/A | REJECT |
| ADMIN_TEAM | ✗ NO | 0 | NO | DEFER |
| WORKSPACE_CREATE | ✗ NO | 0 | NO | DEFER |
| WORKSPACE_INVITE | ✗ NO | 0 | NO | DEFER |

---

## Key Issues with X9D Scope

### Issue 1: ADMIN_SETTINGS is Redundant
- Comments reference ADMIN_SETTINGS but actual routes use SYSTEM_ADMIN
- SYSTEM_ADMIN already exists in domain CAPABILITIES
- Adding ADMIN_SETTINGS would create confusion and duplication
- **Recommendation:** Reject ADMIN_SETTINGS, use existing SYSTEM_ADMIN

### Issue 2: Experiment/Workspace/Admin Capabilities Not Proven
- X9D proposed adding them for "future proofing"
- No active routes or services use them
- Adds unnecessary permission surface area
- Cannot be tested immediately
- **Recommendation:** Defer until needed

### Issue 3: Entitlement-Only Operations
- EXPERIMENT_CREATE, EXPERIMENT_UPDATE, WORKSPACE_*, ADMIN_TEAM are only in entitlements
- Not used by any domain-enforced routes
- May be quota-enforced only (no permission checks)
- **Recommendation:** Keep entitlement-only until proven necessary in domain

---

## Minimum Necessary Scope

**Authorization Required Only For:**
1. DECISION_CREATE - Proven blocker (2 routes)
2. DECISION_UPDATE - Proven blocker (decision service)

**Authorization NOT Required For:**
- EXPERIMENT_CREATE, EXPERIMENT_UPDATE (not used)
- ADMIN_SETTINGS (redundant, use SYSTEM_ADMIN)
- ADMIN_TEAM (not used)
- WORKSPACE_CREATE, WORKSPACE_INVITE (not used)

**Total Minimum Scope:** 2 capabilities (vs 8 proposed)  
**Security Benefit:** Minimal permission surface (only decision operations)  
**Risk Reduction:** High (no unnecessary permissions)

---

## Conclusion

X9D recommended 8 capabilities, but **only 2 are proven blockers with active route users**:
- ✓ DECISION_CREATE
- ✓ DECISION_UPDATE

The other 6 should be **deferred until proven necessary** by actual route/service code dependencies.

**Recommended Scope Reduction:** From 8 to 2 capabilities

