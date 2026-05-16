# X9G-2: Capability Addition Notes

**Date:** 2026-05-16  
**Phase:** X9G-2 Phase B - Capability Addition  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## DECISION_CLOSE Constant Addition

### File Modified
`src/domain/constants/capabilities.ts`

### Change Made
**Location:** Lines 100-107 (Decisions section)

**Before:**
```typescript
  // Decisions
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",

  // Diagnosis
```

**After:**
```typescript
  // Decisions
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  DECISION_ACCEPT: "decision:accept",
  DECISION_REJECT: "decision:reject",
  DECISION_CLOSE: "decision:close",

  // Diagnosis
```

### Constant Details
**Name:** DECISION_CLOSE  
**Value:** "decision:close"  
**Type:** string literal (readonly)  
**Pattern:** Matches decision:* domain capability format  
**Format:** Lowercase, colon-separated (domain:action)

### Governance Impact
✓ Domain capability model now includes close operation  
✓ Constant available for future role mapping (workspace design phase)  
✓ Constant available for future route enforcement (after role design)  
✓ Matches governance design decision from X9G-1

### Authorization Impact
✗ No change (constant not enforced yet)  
✗ Close route still uses legacy `hasPermission("close_decision")`  
✗ No users affected by this change alone

### Runtime Impact
✓ Zero runtime change (constant definition only)  
✓ No new behavior  
✓ No behavior change  
✓ Purely governance infrastructure

### Code Quality
✓ Follows existing naming convention (CAPABILITY_NAME: "domain:action")  
✓ Proper placement (Decision section, after DECISION_REJECT)  
✓ Consistent with other decision capabilities  
✓ No typos or formatting issues

### Test Framework Impact
✗ No changes to test framework  
✗ No route behavior tests affected  
✗ Governance test should pick up constant automatically  

### Future Enablement
**X9G-3 (Or Later Role Design Phase):**
- Add DECISION_CLOSE to ROLE_CAPABILITIES mappings
- Define which roles should have close permission
- Enable role-based access control

**Route Modernization Phase (After Role Design):**
- Update close route to use `requireCapabilities: ["DECISION_CLOSE"]`
- Remove legacy `hasPermission("close_decision")` check
- Migrate to modern canonical enforcement pattern

---

## Validation Notes for Phase E

**Expected Governance Test Behavior:**
- Governance test scans for constant definitions
- Should detect DECISION_CLOSE exists
- Should verify format is "decision:close"
- Test should PASS

**Expected Build Behavior:**
- TypeScript will recognize new constant
- No type errors
- Constant properly typed as literal
- Build should PASS

**Expected Runtime Behavior:**
- Close route continues to work unchanged
- Legacy authorization continues
- No new permissions granted
- No users affected

---

## Summary

✓ DECISION_CLOSE constant successfully added  
✓ No additional changes made  
✓ No route modifications  
✓ No behavior changes  
✓ Ready for Phase C (close route check)

---

## Next Phase
Phase C: Check if close route should reference DECISION_CLOSE (non-enforcing only)
