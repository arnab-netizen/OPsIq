# X8B-1R: Runtime Behavior Change Audit

**Date:** 2026-05-16  
**Phase:** X8B-1R (Reconciliation)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Executive Summary

**Adding DECISION_CLOSE to the role mapping causes NO CHANGE to current runtime behavior.**

The close route still uses legacy hasPermission check and remains broken (403 for all users). DECISION_CLOSE is mapped but not yet used. This is a safe staged migration that prepares for Step 2 route modernization without affecting current behavior.

---

## Question 1: Since close route still uses legacy close_decision, does adding DECISION_CLOSE to role mapping affect current close route?

**Answer:** NO - No effect on current close route

**Evidence:**

**Close Route Current Implementation:**
```typescript
// File: src/app/api/decisions/[decisionId]/close/route.ts
// Line 42:
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions to close decision");
}
```

**Route Behavior Before X9G-3:**
1. Check: hasPermission(membership.role, "close_decision")
2. Lookup: permissions["admin"], permissions["operator"], permissions["reviewer"]
3. Search: Is "close_decision" in any permission array?
4. Result: NO - "close_decision" not found
5. Return: FALSE for all roles
6. Outcome: Throw "Insufficient permissions" for ALL users

**Route Behavior After X9G-3:**
1. Check: hasPermission(membership.role, "close_decision")  ← UNCHANGED
2. Lookup: permissions["admin"], permissions["operator"], permissions["reviewer"]  ← UNCHANGED
3. Search: Is "close_decision" in any permission array?  ← UNCHANGED
4. Result: NO - "close_decision" not found  ← UNCHANGED
5. Return: FALSE for all roles  ← UNCHANGED
6. Outcome: Throw "Insufficient permissions" for ALL users  ← UNCHANGED

**Conclusion:** No change. Route behavior identical before and after.

---

## Question 2: Does any current route/service now check DECISION_CLOSE?

**Answer:** NO

**Routes That Might Check DECISION_CLOSE:**
- ✓ checked: /api/decisions/[decisionId]/close - uses legacy hasPermission("close_decision"), NOT DECISION_CLOSE
- ✓ checked: /api/decisions/[decisionId]/accept - uses legacy pattern (not DECISION_CLOSE)
- ✓ checked: /api/decisions/[decisionId]/reject - uses legacy pattern (not DECISION_CLOSE)

**Services That Might Check DECISION_CLOSE:**
- ✓ checked: src/services/decisions/decision-lifecycle.service.ts - does NOT check DECISION_CLOSE
- ✓ checked: closeDecision method - only performs state transition, no auth checks

**Governance/Policy Checks That Might Use DECISION_CLOSE:**
- ✓ checked: Policy wrapper - no DECISION_CLOSE checks
- ✓ checked: ServiceAuthEnvelope - no DECISION_CLOSE checks
- ✓ checked: Auth guard - no DECISION_CLOSE checks

**Conclusion:** No routes or services currently use DECISION_CLOSE. It's mapped but not enforced anywhere.

---

## Question 3: Does adding this mapping affect policy wrapper behavior?

**Answer:** NO - Wrapper behavior unchanged

**Why:**
- Policy wrappers (withEnforcementFull, withCanonicalEnforcement) don't check DECISION_CLOSE
- Wrappers use capability checks for their own enforcement
- DECISION_CLOSE in role mapping doesn't affect wrapper logic
- Wrappers are not modified in X9G-3

**Evidence:**
```typescript
// File: src/lib/enforced-route.ts
// withEnforcementFull does NOT check DECISION_CLOSE
// Policy checks use ROLE_CAPABILITIES[role]
// Adding entry to ROLE_CAPABILITIES doesn't change wrapper logic
```

**Conclusion:** Policy wrappers unaffected by role mapping addition.

---

## Question 4: Does adding this mapping affect ServiceAuthEnvelope?

**Answer:** NO - ServiceAuthEnvelope unaffected

**Why:**
- ServiceAuthEnvelope is immutable snapshot of auth state at request time
- Adding capability to role mapping doesn't affect snapshot creation
- Envelope reflects current policy context, which now includes DECISION_CLOSE in ADMIN_OR_PORTFOLIO_MANAGER
- But envelope is only used in services that already exist and don't check DECISION_CLOSE

**Effect:**
```typescript
// ServiceAuthEnvelope now includes DECISION_CLOSE in policy.capabilities for ADMIN_OR_PORTFOLIO_MANAGER users
// But no current service code reads policy.capabilities
// So this has no runtime effect
```

**Conclusion:** ServiceAuthEnvelope reflects new mapping but has no effect on current service code.

---

## Question 5: Does this create a capability that users can possess but cannot yet use?

**Answer:** YES - Safe staged migration pattern

**Current State:**
```
ADMIN_OR_PORTFOLIO_MANAGER users:
├─ Have: DECISION_CLOSE in role mapping
├─ Can Demonstrate: Policy checker confirms DECISION_CLOSE capability
├─ Can Use: NO - No route/service checks DECISION_CLOSE yet
└─ Outcome: Can see they have capability, but can't exercise it
```

**Why This Is Safe:**
- Users don't have elevated access they can't use
- Legacy close route still blocks them (broken state preserved)
- No security risk (can't do anything new)
- Enables future migration when Step 2 updates route
- Clear staged migration path

**Example:**
```
// Today:
- hasCapability(ctx, DECISION_CLOSE) → TRUE for ADMIN_OR_PORTFOLIO_MANAGER
- close route checks hasPermission("close_decision") → FALSE for all users
- Result: User CAN'T close (legacy broken behavior)

// After Step 2:
- hasCapability(ctx, DECISION_CLOSE) → TRUE for ADMIN_OR_PORTFOLIO_MANAGER
- close route checks requireCapabilities([DECISION_CLOSE]) → TRUE for ADMIN_OR_PORTFOLIO_MANAGER
- Result: User CAN close (modern behavior enabled)
```

---

## Question 6: Is that safe as staged migration?

**Answer:** YES - Very safe

**Safety Assessment:**

| Factor | Assessment |
|---|---|
| **Current access broadening** | NONE - Users can't do anything new |
| **Current users blocked** | NONE - Same users blocked as before |
| **Capability leak** | NONE - Unused capabilities are invisible to users |
| **Authorization inversion** | NONE - Permissions only get checked if code explicitly does |
| **Service mutation** | NONE - Services unchanged, don't check DECISION_CLOSE |
| **Policy wrapper impact** | NONE - Wrappers unchanged |
| **Route behavior change** | NONE - Routes unchanged |
| **Test coverage** | GOOD - All tests pass (402/402) |
| **Reversibility** | TRIVIAL - Remove 1 line from array |
| **Migration path** | CLEAR - Step 2 will use DECISION_CLOSE capability |

**Why Staged Migration is the Right Approach:**

1. **Separate Concerns:** Role mapping (X9G-3) is independent from route migration (X9G-4)
2. **Parallelizable:** Can review/test role mapping separately from route code
3. **Rollback Easy:** If role mapping causes issues, simple to revert
4. **Async-Safe:** Step 1 complete, Step 2 can happen whenever ready
5. **Foundation First:** Establish correct capability before enforcing it

---

## Runtime Behavior Changes Summary

| Area | Before X9G-3 | After X9G-3 | Changed? |
|---|---|---|---|
| **Close Route Auth** | hasPermission("close_decision") returns FALSE | hasPermission("close_decision") returns FALSE | NO |
| **Close Route Behavior** | Returns 403 for all users | Returns 403 for all users | NO |
| **DECISION_CLOSE Capability** | Not in any role mapping | In ADMIN_OR_PORTFOLIO_MANAGER | YES |
| **DECISION_CLOSE Usage** | N/A (didn't exist) | Not checked by any code | N/A |
| **Policy Wrapper Behavior** | Unchanged | Unchanged | NO |
| **Service Behavior** | Unchanged | Unchanged | NO |
| **Entitlement Gating** | Unchanged | Unchanged | NO |
| **Auth Context** | Unchanged | Unchanged | NO |

---

## Behavior Classification

**Classification:** NO_RUNTIME_BEHAVIOR_CHANGE

**Rationale:**
- Close route behavior identical before and after
- All users blocked before remain blocked after
- No new access granted to any user
- No service behavior changed
- No policy enforcement changed
- No wrapper behavior changed
- Purely prepares for future Step 2 migration

**Safety:** ✓ SAFE

**Why Safe:**
- Users can't do anything they couldn't before
- Legacy broken behavior preserved (no surprises)
- Foundation laid for future modernization
- Easy to revert if needed
- Tests pass fully

---

## Stage Migration Validation

**Is this appropriate as staged migration?**

✓ **Step 1 (Current):** Add DECISION_CLOSE to role mapping
  - Role mapping defines who CAN close (authority model)
  - No enforcement yet (no actual auth check)
  - Safe to deploy independently
  - Can be tested in isolation

✓ **Step 2 (Future):** Update close route to check DECISION_CLOSE
  - Route enforcement uses role mapping from Step 1
  - Actual enforcement happens here
  - Depends on Step 1 completion
  - Can be tested with Step 1 in place

✓ **Benefits of Staged Approach:**
  - Easier code review (role mapping vs. route enforcement separate)
  - Easier testing (can validate capability model before enforcement)
  - Easier rollback (each step independent)
  - Clearer migration path (each step has clear purpose)

---

## Conclusion

**Behavior Change Assessment:** NO RUNTIME BEHAVIOR CHANGE

**Current Behavior:** Close route completely blocked (broken legacy state)
**After Change:** Close route completely blocked (identical behavior)
**Future Behavior:** After Step 2, close route enables ADMIN_OR_PORTFOLIO_MANAGER users

**Safety Verdict:** ✓ SAFE - Staged migration with zero current impact, clear future benefit

---

## Final Determination

| Question | Answer |
|---|---|
| Does adding DECISION_CLOSE mapping affect close route? | NO |
| Does any current code check DECISION_CLOSE? | NO |
| Does wrapper behavior change? | NO |
| Does ServiceAuthEnvelope change? | NO (reflects new mapping, unused) |
| Creates unused capability? | YES (safe for staged migration) |
| Safe as staged migration? | YES (very safe) |
| Runtime behavior changes? | NO |

**Overall Classification:** `NO_RUNTIME_BEHAVIOR_CHANGE` ✓ SAFE
