# P2B_STATUS_CONTRACT.md

**Authoritative verificationStatus Contract**  
**Authority:** Domain schema (evidence.ts) + Database defaults  
**Date:** 2026-06-02

---

## Authoritative Contract Definition

**Source:** `src/domain/evidence/evidence.ts:92`

```typescript
verificationStatus: z.enum(["unverified", "verified", "disputed"]),
```

**Allowed Values (ONLY):**
1. `"unverified"` - Initial state, awaiting verification
2. `"verified"` - Manually verified by admin/authority
3. `"disputed"` - Marked as suspicious or conflicting

**Database Default:** `"unverified"` (prisma/schema.prisma:661)

---

## Inventory of All References

### Writers (Setters)

| Location | Values Set | Authority Check | Status |
|----------|-----------|-------|--------|
| src/services/outcome/verification.ts:150 | "flagged" \| "unverified" | ✗ NOT in contract | **VIOLATION** |
| src/app/api/operator/route.ts:182 | From verification.ts | ✗ Inherits violation | **VIOLATION** |
| src/services/decisions/decision-lifecycle.service.ts:365 | From verification.ts | ✗ Inherits violation | **VIOLATION** |

**CRITICAL:** All writers trace to verification.ts which writes "flagged" (not in contract).

### Readers (Getters)

| Location | Read Value | Check | Impact |
|----------|-----------|-------|--------|
| src/services/recommendation/attribution.ts:93 | item.verificationStatus | === "verified" | Gets 0 for "flagged" items |
| src/app/api/value/7day/route.ts:100 | item.verificationStatus | === "verified" | Metrics incomplete |

**CRITICAL:** Readers only check for "verified". Flagged items treated as unverified.

### Filters

| Location | Filter | Expected | Actual |
|----------|--------|----------|--------|
| attribution.ts:93 | `=== "verified"` | Find verified outcomes | Misses flagged outcomes |
| 7day/route.ts:100 | `=== "verified"` | Count verified metrics | Zero-counts flagged |

### Metrics Affected

1. **Attribution Service** (attribution.ts:93)
   - Metric: itemsVerified count
   - Expected: All verified outcomes
   - Actual: Only "verified" state (misses "flagged")

2. **7-Day Value API** (7day/route.ts:100)
   - Metric: verifiedCount
   - Expected: All manually verified outcomes
   - Actual: Only "verified" state

---

## Contract Violations

### Violation 1: Invalid State "flagged"

**Problem:**
```typescript
// verification.ts:150 (P2B implementation)
const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";

// evidence.ts:92 (Schema contract)
verificationStatus: z.enum(["unverified", "verified", "disputed"]),

// Result: "flagged" not in enum
```

**Evidence:**
- verification.ts line 150 sets "flagged" unconditionally
- evidence.ts defines only ["unverified", "verified", "disputed"]
- No validation enforces contract at database level
- Silent violation (database accepts string, no enum constraint)

**Impact:**
- Downstream code checking === "verified" never matches "flagged"
- Metrics silently incomplete
- Type contract broken (JSON schema != TypeScript enum)

### Violation 2: No "Verified" State Transition

**Problem:**
No code path sets verificationStatus = "verified"

**Evidence:**
```
Writers:
  - verification.ts:150 → "flagged" OR "unverified"
  - All other writers inherit from verification.ts
  
Result: "verified" value never written
```

**Impact:**
- Readers checking === "verified" always find 0 results
- Admin has no way to manually verify outcomes
- Metrics showing verified count always 0

---

## Contract Classification

**VERDICT: FAIL** ❌

**Reasons:**
1. Writer (verification.ts) produces "flagged" which violates enum contract
2. No writer produces "verified" state (only reader expects it)
3. Metrics broken (verifiedCount always 0)
4. Silent failure (database accepts any string)

**Contract Status:**
- ✗ All writers compatible with contract: NO
- ✗ All readers can access expected values: NO
- ✗ Filters produce correct results: NO
- ✗ Metrics accurate: NO

---

## Required Before Proceeding

To proceed to TASK 1-6:

1. **Resolve "flagged" violation**
   - Either: Add "flagged" to evidence.ts enum
   - Or: Map "flagged" → "disputed" in verification.ts
   
2. **Implement "verified" state transition**
   - Admin endpoint to set verificationStatus = "verified"
   - Or: Document that "verified" is not used

3. **Update metrics**
   - If using "flagged": Update readers to check for "flagged" instead of "verified"
   - If using "disputed": Clarify difference between "disputed" and "flagged"

---

## Recommendation

**Minimal Fix (Use Existing States Only):**

Option A: Map to existing states
```
P2B produces:
  - "flagged" → "disputed" (suspicious/conflicting)
  - "unverified" → "unverified" (not verified)
  
Contract maintained: All values in ["unverified", "verified", "disputed"]
Readers updated: Check for "disputed" instead of "verified"
```

Option B: Add new state
```
evidence.ts:
  verificationStatus: z.enum(["unverified", "verified", "disputed", "flagged"]),
  
Cost: Schema change, but no code changes
```

**Recommendation:** Option A (use "disputed") - minimal, no schema changes needed

---

**Classification:** FAIL

**Next Step:** Cannot proceed to TASK 1 until contract is resolved.

Do you authorize Option A (map "flagged" → "disputed")?
