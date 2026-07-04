# P2B_VERIFIED_STATE_PROOF.md

**Verification Lifecycle Completeness Audit**  
**Question:** Who can set verificationStatus = "verified"? Where? When? How?

---

## Contract States

From evidence.ts: `["unverified", "verified", "disputed"]`

### State Transition Map (Complete)

| From | To | Mechanism | Code Path | Status |
|------|----|----|----------|--------|
| (initial) | unverified | DB default | Database default | ✓ EXISTS |
| unverified | disputed | Fraud detection | verification.ts:150 | ✓ EXISTS |
| unverified | verified | Manual | ??? | ✗ MISSING |
| verified | disputed | Manual | ??? | ✗ MISSING |
| disputed | verified | Manual | ??? | ✗ MISSING |

---

## Search Results: "verified" in codebase

**Looking for who sets verificationStatus = "verified":**

```bash
$ grep -r "verificationStatus.*verified\|verified.*verificationStatus" src --include="*.ts"
```

**Results:**
1. evidence.ts:88 - Schema definition (allows "verified")
2. attribution.ts:93 - Reader only (checks === "verified")
3. 7day/route.ts:100 - Reader only (checks === "verified")

**Writers that set "verified":** NONE FOUND ❌

---

## Detailed Trace

### Who Can Set "Verified"?

**Current Capability:**
- ✗ System (no auto-transition)
- ✗ Admin (no endpoint)
- ✗ User (no UI)
- ✗ API (no route)
- ✗ Fraud engine (only sets "disputed")

**Answer:** NOBODY CAN SET "VERIFIED" ❌

---

### Where Would "Verified" Be Written?

**Existing Write Locations:**

**Location 1: Database Default (sets "unverified")**
```sql
ALTER TABLE "operator_items"
ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'unverified';
```

**Location 2: verification.ts (sets "disputed")**
```typescript
const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";
```

**Location 3: For "Verified" - DOES NOT EXIST**
```
No code path sets verificationStatus = "verified"
```

**Answer:** NOWHERE ❌

---

### When Should "Verified" Be Set?

**Possible Workflows (Not Implemented):**

**Workflow A: Admin Manual Review**
```
1. Outcome recorded (state: unverified or disputed)
2. Admin reviews evidence
3. Admin decides: verified or keep disputed
4. Admin clicks "verify outcome"
5. verificationStatus → "verified"
6. Audit event logged
```

**Workflow B: External System Confirmation**
```
1. Outcome recorded (state: unverified)
2. Integration with accounting system
3. Accounting system confirms amount
4. Auto-transition to "verified"
5. Webhook sent to client
```

**Workflow C: Time-based Auto-verification**
```
1. Outcome recorded (state: unverified)
2. After 30 days with no disputes
3. Auto-transition to "verified"
4. Notification sent to stakeholder
```

**Current Implementation:** NONE OF ABOVE ❌

**Answer:** NO DEFINED WORKFLOW ❌

---

### How Would "Verified" Be Set?

**Missing Implementation Components:**

**Component 1: Verification Endpoint**
```
Endpoint: Missing
Method: Would be POST /api/decisions/{id}/verify
Auth: Would require admin role
Body: Would accept { verificationStatus: "verified" | "disputed", reason: string }
```

**Component 2: Verification Logic**
```
Logic: Missing
Steps: Would be:
  1. Validate outcome exists
  2. Check current verificationStatus
  3. Determine if transition allowed
  4. Update verificationStatus
  5. Capture audit trail
  6. Emit event
```

**Component 3: Authorization**
```
Check: Missing
Rule: Would only allow admin to verify
Fallback: Currently no endpoint exists
```

**Component 4: Audit Trail**
```
Logging: Missing
Event: Would log "outcome.verified"
Metadata: Who verified, when, reason
```

**Current Implementation:** ALL MISSING ❌

**Answer:** NO MECHANISM ❌

---

## Complete Lifecycle Assessment

### State Distribution (Current)

```
At Runtime:

Unverified: ✓ Set by DB default, set by fraud detection (low risk)
Disputed: ✓ Set by fraud detection (high risk)
Verified: ✗ Never set, never readable

In Tests:
  Only states that appear: "unverified", "disputed"
  Never tested: "verified"

In Readers:
  attribution.ts: Filters for "verified" → Always 0 results
  7day/route.ts: Counts "verified" → Always 0 count
```

### Completeness Checklist

| Component | Implemented | Working | Status |
|-----------|-------------|---------|--------|
| Initial state (unverified) | ✓ | ✓ | COMPLETE |
| Auto-flag (disputed) | ✓ | ✓ | COMPLETE |
| Manual verification endpoint | ✗ | ✗ | MISSING |
| Verification audit trail | ✗ | ✗ | MISSING |
| Verification event emission | ✗ | ✗ | MISSING |
| Verification authorization | ✗ | ✗ | MISSING |
| "Verified" state transition logic | ✗ | ✗ | MISSING |

---

## Classification

**LIFECYCLE STATUS: MISSING** ❌

**Evidence:**
1. No code path sets verificationStatus = "verified"
2. No endpoint for manual verification
3. No authorization check for verification
4. No audit trail for verification events
5. Readers expect "verified" but get nothing

**Completeness:** 30% (only initial + disputed transitions)

---

## What Minimum "Verified" Workflow Would Look Like

**Minimum Viable Implementation:**

### 1. Verification Endpoint

```typescript
// POST /api/decisions/{id}/verify
export async function verifyOutcome(
  decisionId: string,
  verificationStatus: "verified" | "disputed",
  reason: string,
  actorId: string
) {
  // 1. Get current outcome
  const decision = await db.operatorItem.findUnique({id: decisionId});
  if (!decision?.actualOutcome) {
    throw new Error("Cannot verify non-existent outcome");
  }

  // 2. Validate status transition
  if (!["unverified", "disputed"].includes(decision.verificationStatus)) {
    throw new Error(`Cannot change status from ${decision.verificationStatus}`);
  }

  // 3. Check authorization
  const actor = await getActor(actorId);
  if (!actor.hasRole("admin")) {
    throw new UnauthorizedError("Only admins can verify outcomes");
  }

  // 4. Update database
  await db.operatorItem.update({
    where: {id: decisionId},
    data: {
      verificationStatus,
      verificationEvidence: {
        ...decision.verificationEvidence,
        adminVerification: {
          verifiedBy: actorId,
          verifiedAt: new Date().toISOString(),
          reason,
        }
      },
      auditTrail: [
        ...decision.auditTrail,
        {
          action: "OUTCOME_VERIFIED",
          verificationStatus,
          timestamp: new Date().toISOString(),
          actorId,
        }
      ]
    }
  });

  // 5. Emit event
  await emitAuditEvent({
    eventName: "outcome.verified",
    entityId: decisionId,
    payload: {verificationStatus, reason}
  });
}
```

### 2. Route Handler

```typescript
// POST /api/decisions/{id}/verify
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const {id} = ctx.params;
  const {verificationStatus, reason} = await ctx.request.json();
  
  await verifyOutcome(id, verificationStatus, reason, ctx.verifiedActorId);
  
  return {success: true};
});
```

### 3. Authorization Rule

```typescript
// In policy engine
canVerifyOutcome(actor): boolean {
  return actor.hasRole("admin") || actor.hasRole("finance_manager");
}
```

### 4. Audit Trail

Entry format:
```typescript
{
  timestamp: "2026-06-02T12:34:56Z",
  action: "OUTCOME_VERIFIED",
  actorId: "admin-123",
  verificationStatus: "verified",
  reason: "Confirmed against accounting system",
}
```

---

## Impact Assessment: Missing "Verified" State

### Metrics Affected

**Metric 1: itemsVerified (attribution.ts:93)**
```typescript
const itemsVerified = itemsCompleted.filter(
  i => i.verificationStatus === "verified"
);
```

**Current Result:** Always 0 (no items have "verified" state)  
**Expected Result:** Count manually verified outcomes  
**Impact:** BROKEN ❌

**Metric 2: verifiedCount (7day/route.ts:100)**
```typescript
if (item.verificationStatus === "verified") {
  verifiedCount++;
}
```

**Current Result:** Always 0  
**Expected Result:** Count verified outcomes in value calculation  
**Impact:** METRICS INCOMPLETE ❌

### Downstream Systems

**Any system checking for "verified":**
- ✗ Always gets empty results
- ✗ Cannot build workflows around verified outcomes
- ✗ Cannot distinguish between unverified and verified

---

## Recommendations

### To Complete "Verified" Lifecycle:

**Priority 1: Add Verification Endpoint**
- Time: 2-3 hours
- Risk: Low (new feature, backward compatible)
- Files: new route + service function

**Priority 2: Add Admin Authorization**
- Time: 1 hour
- Risk: Low (reuses existing auth framework)
- Files: policy engine rule

**Priority 3: Add Audit Trail**
- Time: 1 hour
- Risk: Low (reuses existing audit system)
- Files: none (use existing audit event system)

**Priority 4: Update Metrics**
- Time: 30 minutes
- Risk: Low (just update readers)
- Files: attribution.ts, 7day/route.ts

**Total Effort:** 4-5 hours

---

## Current Status

**VERDICT: LIFECYCLE IS MISSING** ❌

**What Works:**
- ✓ Unverified state (initial)
- ✓ Disputed state (auto-flagged)

**What's Broken:**
- ✗ Verified state (unreachable)
- ✗ Manual verification (no endpoint)
- ✗ Verification audit (not logged)
- ✗ Metrics using "verified" (always zero)

**Can Deploy:** Yes (with limitation)
**Should Deploy:** Recommend Phase 2 for complete verification workflow
