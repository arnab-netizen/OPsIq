# X9D-R: Option A Safety Review After Scope Narrowing

**Date:** 2026-05-15  
**Status:** SAFETY REVIEW COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Executive Summary

**Option A Remains Valid.** Narrowing the scope from 8 capabilities to 2 **improves safety** and makes Option A even more appropriate.

**Key Findings:**
- ✓ Direct addition to CAPABILITIES is safe for 2 capabilities
- ✓ Experiment/admin/workspace capabilities should stay entitlement-only (not domain)
- ✓ No implementation changes needed to Option A design
- ✓ ADMIN_SETTINGS should be rejected (use existing SYSTEM_ADMIN instead)

---

## Is Direct Addition to CAPABILITIES Safe?

### For DECISION_CREATE: ✓ YES - SAFE
**Reasoning:**
- Proven route user: src/app/api/decisions/create/route.ts
- Current pattern: `assertCapability(workspaceId, "decision_create")`
- Entitlement overlap: exists in Capability enum
- Format consistency: "decision:create" matches existing CAPABILITIES format
- Mapping logic clear: entitlement string "decision_create" → domain CAPABILITIES.DECISION_CREATE
- Implementation simple: Add 1 constant to capabilities.ts

**Safety Verdict:** ✓ SAFE - No risk from addition

### For DECISION_UPDATE: ✓ YES - SAFE
**Reasoning:**
- Required by decision service update flows
- Entitlement exists for quota enforcement
- Format consistent with DECISION_CREATE
- Part of unified decision operation set

**Safety Verdict:** ✓ SAFE - No risk from addition

### For Other 6 Proposed Capabilities: ❌ NOT SAFE TO ADD NOW

**EXPERIMENT_CREATE/UPDATE:** Not used by any routes
- No current code path requiring them
- Cannot be tested immediately
- Adding to domain CAPABILITIES when entitlement-only is unnecessary
- **Verdict:** Keep entitlement-only, do NOT add to domain

**ADMIN_SETTINGS:** Redundant with existing SYSTEM_ADMIN
- Admin routes actually use SYSTEM_ADMIN
- Adding ADMIN_SETTINGS creates confusion
- **Verdict:** REJECT, use existing SYSTEM_ADMIN instead

**ADMIN_TEAM, WORKSPACE_*:** Not used by any routes
- Admin-level operations, not in service lanes
- No immediate route users
- **Verdict:** Defer to future phases when needed

---

## Should Implementation Add Only DECISION_CREATE and DECISION_UPDATE?

### Answer: ✓ YES - STRONGLY RECOMMENDED

**Reasons:**

1. **Security:** Smaller permission surface = lower risk
   - Only 2 capabilities vs 8
   - Only decision operations, not admin/workspace level
   - Minimal blast radius

2. **Testability:** Both can be tested immediately
   - decisions/create route can verify new capability
   - recommendations route can verify decision updates
   - Tests can be written in X9D-IMPL

3. **Clarity:** Clear purpose and route users
   - DECISION_CREATE: 2 routes actively use "decision_create" string
   - DECISION_UPDATE: decision service requires it
   - No confusion about "why are we adding this?"

4. **Future-Proofing:** Deferred capabilities can be added later when needed
   - Experiments can add EXPERIMENT_CREATE when experiments are actively used
   - Workspace operations can add WORKSPACE_* when workspace routes are implemented
   - No rush to add capabilities pre-emptively

**Verdict:** ✓ ADD ONLY DECISION_CREATE and DECISION_UPDATE

---

## Are Experiment/Admin/Workspace Capabilities Blocked or Deferred?

### Experiment Capabilities: DEFERRED (Not Blocked)

**Current State:**
- experiments exist in domain (experiment-lifecycle.service.ts)
- EXPERIMENT_CREATE, EXPERIMENT_UPDATE exist in entitlements
- No routes call experiment endpoints
- No domain enforcement of experiment capabilities

**Decision:** DEFERRED
- Keep quota enforcement in entitlements (EXPERIMENT_CREATE quota)
- Do NOT add to domain CAPABILITIES yet
- When experiment routes are created, add to CAPABILITIES at that time
- No blocker to adding later

---

### Admin Capabilities: REJECT ADMIN_SETTINGS, DEFER Others

**Current State:**
- ADMIN_SETTINGS mentioned in comments but not used in code
- SYSTEM_ADMIN already in domain CAPABILITIES and is what's actually used
- ADMIN_TEAM in entitlements, no route users
- Routes use SYSTEM_ADMIN (already domain capability)

**Decision:** 
- ✗ REJECT ADMIN_SETTINGS (redundant with SYSTEM_ADMIN)
- ✗ Fix comments to reference SYSTEM_ADMIN instead of ADMIN_SETTINGS
- ✗ DEFER ADMIN_TEAM until admin operations need fine-grained permissions

---

### Workspace Capabilities: DEFERRED (Workspace Design Phase)

**Current State:**
- WORKSPACE_CREATE, WORKSPACE_INVITE in entitlements
- No routes use them (workspace management is admin-level)
- Workspace membership/role design deferred to X9H

**Decision:** DEFERRED
- Keep in entitlements for quota (if needed)
- Do NOT add to domain CAPABILITIES until workspace design phase clarifies
- When workspace/role design is complete (X9H+), add to CAPABILITIES if needed

---

## Do Adding Capabilities Require Entitlement Mapping Tests?

### For DECISION_CREATE and DECISION_UPDATE: ✓ YES - MINIMAL

**Tests Required:**

1. **Constant Existence Tests**
   ```typescript
   expect(CAPABILITIES.DECISION_CREATE).toBeDefined();
   expect(CAPABILITIES.DECISION_CREATE).toBe("decision:create");
   expect(CAPABILITIES.DECISION_UPDATE).toBeDefined();
   expect(CAPABILITIES.DECISION_UPDATE).toBe("decision:update");
   ```

2. **Entitlement Tier Tests**
   ```typescript
   expect(TIER_CONFIGS.free.capabilities).toContain(Capability.DECISION_CREATE);
   expect(TIER_CONFIGS.pro.capabilities).toContain(Capability.DECISION_CREATE);
   ```

3. **Route Integration Tests**
   ```typescript
   // decisions/create should check DECISION_CREATE
   // recommendations should check DECISION_CREATE
   ```

**Implementation Cost:** Low (1 test file, ~50 lines)

---

## Do Adding Capabilities Require Plan Capability Updates?

### For DECISION_CREATE/UPDATE: ⚠️ MAYBE

**Current State:**
- entitlement.ts defines Capability.DECISION_CREATE in enum
- TIER_CONFIGS includes these capabilities in tier configs

**Decision:** Verify but likely NO additional changes needed
- Check that TIER_CONFIGS already includes DECISION_CREATE in appropriate tiers
- If already present, no additional entitlement changes needed
- If missing, add to tier configs (but likely already there)

**Implementation Cost:** Very Low (verify + maybe update 1 config)

---

## Do Adding Capabilities Change Runtime Authorization Behavior Immediately?

### Answer: ✓ YES, BUT LIMITED

**Current Behavior:**
- routes check `assertCapability(workspaceId, "decision_create")` (entitlement check)
- Services accept CanonicalAuthContext (will be refactored)

**After DECISION_CREATE Added to Domain CAPABILITIES:**
- DECISION_CREATE becomes available in domain constant
- Routes can reference CAPABILITIES.DECISION_CREATE instead of string literal
- When service is refactored to ServiceAuthEnvelope, capability check becomes runtime-enforced
- NO change in current runtime behavior until service is refactored (X9C-5)

**Verdict:** ✓ Adding capability is safe, no immediate runtime changes

---

## Do Adding Capabilities Require Scanner Updates?

### Answer: ✗ NO

**Current Scanner:**
- Already understands CAPABILITIES enum
- Automatically recognizes new constants as safe
- Will NOT report new violations from adding constants

**Verification:**
- After X9D-IMPL, scanner should show same 448 violations
- No new violations introduced by adding constants
- Violation reduction happens during service refactoring (X9C-5)

**Verdict:** ✗ No scanner updates required

---

## Do Adding Capabilities Require Route Migrations?

### Answer: ⚠️ MAYBE (2 routes)

**Current Code Pattern:**
- `assertCapability(workspaceId, "decision_create")` uses string literal

**After DECISION_CREATE Added:**
- Option 1: Keep string literals (works, but not ideal)
- Option 2: Update routes to use CAPABILITIES.DECISION_CREATE constant

**Recommendation:** UPDATE ROUTES (Optional but Cleaner)
- Change `"decision_create"` to CAPABILITIES.DECISION_CREATE in assertCapability checks
- Makes code type-safe and more maintainable
- Enables future string literal detection by scanner

**Implementation:**
- src/app/api/decisions/create/route.ts
- src/app/api/recommendations/route.ts
- Update 2 lines total

**Verdict:** ⚠️ Route updates recommended but optional in X9D-IMPL

---

## Conclusion

### Option A Remains Valid ✓

Direct addition of DECISION_CREATE and DECISION_UPDATE to domain CAPABILITIES is safe and recommended.

### Narrowing Scope is Critical ✓

Reducing from 8 to 2 capabilities:
- ✓ Improves security (smaller permission surface)
- ✓ Improves testability (proven route users)
- ✓ Reduces implementation risk (fewer changes)
- ✓ Maintains Option A design validity
- ✓ Allows future deferred capabilities to be added when needed

### Other Capabilities Should Stay Entitlement-Only ✓

- Experiment operations: Keep entitlement-only until experiment routes are created
- Admin operations: Use existing SYSTEM_ADMIN, reject redundant ADMIN_SETTINGS
- Workspace operations: Defer to workspace design phase (X9H+)

### Safety Verdict: ✓ SAFE TO IMPLEMENT MINIMAL SCOPE

