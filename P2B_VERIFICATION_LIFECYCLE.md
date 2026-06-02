# P2B_VERIFICATION_LIFECYCLE.md

**Complete Verification Lifecycle Trace**  
**Question:** Who sets verificationStatus = "verified"? Where? When? How?

---

## State Transitions

### Possible verificationStatus States

```
From Schema Contract:
  "unverified" → "verified" → "disputed"
```

### Transition Map

| From State | To State | Mechanism | Status |
|-----------|---------|-----------|--------|
| (initial) | "unverified" | Database default | ✓ Implemented |
| "unverified" | "verified" | ??? | ❌ MISSING |
| "unverified" | "disputed" | Fraud detection | ✓ Implemented |
| "verified" | "disputed" | ??? | ❓ Unknown |
| "disputed" | "verified" | ??? | ❓ Unknown |

---

## State 1: "unverified" (Initial State)

### Who Sets It?

1. **Database Default** (PRIMARY)
   ```
   Location: prisma/schema.prisma:661
   @default("unverified")
   ```

2. **Services** (SECONDARY)
   ```
   verification.ts:150
   fraudRisk.riskLevel === "high" ? "flagged" : "unverified"
   ```

### When?

- At record creation (database default)
- When capturing verification metadata (verification.ts)

### How?

**Via Database:**
```typescript
const item = await db.operatorItem.create({
  // ...
  // verificationStatus defaults to "unverified"
});
```

**Via Outcome Recording:**
```typescript
const verificationMetadata = captureOutcomeVerificationMetadata(
  actualOutcomeValue,
  impactExpected,
  currentValue,
  actorId
);
// Returns: { verificationStatus: "unverified" or "flagged", ... }
```

**Current Coverage: COMPLETE** ✓

---

## State 2: "verified" (Manual Verification)

### Who Sets It?

**SEARCH RESULT: NOT FOUND** ❌

```
Grep search for verificationStatus = "verified":
  - No assignments found
  - No updates found
  - No migrations found
```

### Where?

**NO CODE PATH FOUND** ❌

No route, service, or migration sets verificationStatus to "verified"

### When?

**UNDEFINED** ❌

No defined workflow for manual verification

### How?

**NO MECHANISM** ❌

No API endpoint or admin tool to set "verified" state

---

## State 3: "disputed" (Suspicious)

### Who Sets It?

**P2B Fraud Detection** (Currently writes "flagged", should map to "disputed")

```
Location: verification.ts:150
fraudRisk.riskLevel === "high" → "flagged" (maps to "disputed")
```

### When?

**During Outcome Recording**

```
Timeline:
1. Outcome recorded
2. Fraud risk calculated
3. If risk = high → state = "disputed" (via "flagged" mapping)
```

### How?

**Via checkFraudRisk() Function**

```typescript
export function checkFraudRisk(
  actualOutcome: number,
  impactExpected: number,
  previousActualOutcomeValue: number | null
): FraudRiskAssessment {
  // Calculates 5 risk indicators:
  const indicators: string[] = [];
  let riskScore = 0;
  
  // 1. Exact match to expected
  if (impactExpected > 0 && actualOutcome === impactExpected) {
    indicators.push("Outcome exactly matches expected");
    riskScore += 1;
  }
  
  // 2. Round number
  if (actualOutcome > 0 && actualOutcome % 100000 === 0) {
    indicators.push("Round number outcome");
    riskScore += 0.5;
  }
  
  // 3. Extreme variance (>500%)
  if (impactExpected > 0) {
    const variance = Math.abs(actualOutcome - impactExpected) / impactExpected;
    if (variance > 5) {
      indicators.push("Extreme variance");
      riskScore += 1;
    }
  }
  
  // 4. Retroactive modification
  if (previousActualOutcomeValue !== null && previousActualOutcomeValue !== actualOutcome) {
    indicators.push("Retroactive modification");
    riskScore += 2;
  }
  
  // 5. High-impact outcome
  if (actualOutcome > 1000000 && impactExpected > 1000000) {
    indicators.push("High-impact outcome");
    riskScore += 0.5;
  }
  
  // Risk level determination
  const riskLevel = riskScore >= 2.5 ? "high" : riskScore >= 1.5 ? "medium" : "low";
  
  return { riskLevel, indicators, confidence };
}
```

**Current Coverage: COMPLETE** ✓

---

## Complete Lifecycle Visualization

```
INITIAL STATE
┌─────────────┐
│ unverified  │ ← Database default on creation
└────────┬────┘
         │
         │ Outcome recorded with fraud detection
         │
         ├─→ Low/Medium Risk ──────────→ STAYS: unverified
         │
         └─→ High Risk ────────────────→ BECOMES: disputed (via "flagged" mapping)
         
MANUAL VERIFICATION
┌──────────────────┐
│ ??? = "verified" │ ← NO CODE PATH EXISTS
└──────────────────┘

FUTURE TRANSITIONS
┌────────────────────┐
│ verified ←→ disputed│ ← UNDEFINED
└────────────────────┘
```

---

## Lifecycle Gap Analysis

### What Exists

**Starting:** ✓
- Initial state: "unverified" (database default)

**Automatic:** ✓
- Fraud detection sets to "disputed" (via "flagged" mapping)

**Manual:** ❌
- **NO mechanism to set "verified"**
- **NO mechanism to transition between "verified" and "disputed"**
- **NO admin workflow for manual verification**

### Required for Complete Lifecycle

**Missing Piece 1: Manual Verification Endpoint**

```
POST /api/decisions/{id}/verify
  or
POST /api/operator/{id}/verify

Authorization: admin_only
Body: { verificationStatus: "verified" | "disputed", reason?: string }
```

**Missing Piece 2: Transition Logic**

```typescript
if (newStatus === "verified") {
  validateOutcomeNotDisputedForGoodReason();  // ← Not implemented
  emitVerificationEvent();  // ← Not implemented
}
```

**Missing Piece 3: Audit Trail**

```typescript
auditTrail: [
  { action: "OUTCOME_RECORDED", verificationStatus: "disputed", ... },
  { action: "OUTCOME_VERIFIED", verificationStatus: "verified", reason: "...", ... },
  // ← Verification transition not logged
]
```

---

## Who Can Set "Verified"?

| Actor | Current | Should Be |
|-------|---------|-----------|
| System (auto) | Sets "disputed" | ✓ Correct |
| Admin | Cannot set | ✗ Should be able to |
| User | Cannot set | ✗ Should not be able to |
| Fraud engine | Cannot modify | ✓ Correct |

---

## When Should "Verified" Be Set?

**Missing Workflow:**

```
Possible workflows:

Option A: Admin Review
  1. Outcome recorded as "disputed" (high fraud risk)
  2. Admin reviews evidence
  3. Admin sets "verified" if evidence looks good
  4. Audit trail records verification

Option B: External Verification
  1. Outcome recorded as "disputed"
  2. Integration with external system (accounting, etc.)
  3. External system confirms value
  4. Auto-transition to "verified"

Option C: Manual Approval
  1. Outcome recorded as "unverified"
  2. Stakeholder manually approves
  3. Set to "verified"
  4. Triggers downstream processes
```

**Current Implementation:** None of the above

---

## Downstream Impact of Missing "Verified" State

### Metric 1: Attribution Service (attribution.ts:93)

```typescript
const itemsVerified = itemsCompleted.filter(i => i.verificationStatus === "verified");
```

**Current Result:** Always empty (nothing ever sets "verified")  
**Expected Result:** Should contain manually verified outcomes  
**Status:** ❌ Broken metric

### Metric 2: 7-Day Value API (7day/route.ts:100)

```typescript
if (item.verificationStatus === "verified") {
  verifiedCount++;
}
```

**Current Result:** verifiedCount always 0  
**Expected Result:** Should count manually verified outcomes  
**Status:** ❌ Broken metric

### Downstream Systems

Any code that checks for "verified" state:
- ✗ Will always find zero results
- ✗ Metrics incomplete
- ✗ Workflows blocked

---

## Classification: PARTIAL

**Implemented:**
- ✓ Initial "unverified" state
- ✓ Automatic transition to "disputed" on fraud detection
- ✓ Fraud risk assessment triggers

**Missing:**
- ❌ Manual "verified" state transition
- ❌ Admin verification endpoint
- ❌ Verification audit trail
- ❌ Transition validation
- ❌ Event emission for verification events

**Completeness:** 40%

---

## Requirements to Complete Lifecycle

### Requirement 1: Verification Endpoint

**Endpoint Definition:**
```
POST /api/decisions/{id}/verify
  Authorization: admin_role
  Body: {
    verificationStatus: "verified" | "disputed",
    reason: string,  // Why verifying or re-disputing
  }
```

**Logic:**
```typescript
export async function verifyOutcome(
  decisionId: string,
  verificationStatus: "verified" | "disputed",
  reason: string,
  actorId: string
) {
  // Validate current state
  const decision = await db.operatorItem.findUnique({id: decisionId});
  if (!decision?.actualOutcome) {
    throw new Error("Cannot verify outcome that hasn't been recorded");
  }
  
  // Update verification status
  await db.operatorItem.update({
    where: {id: decisionId},
    data: {
      verificationStatus,
      // Add verification reason to evidence
      verificationEvidence: {
        ...decision.verificationEvidence,
        adminVerification: {
          status: verificationStatus,
          reason,
          verifiedBy: actorId,
          verifiedAt: new Date().toISOString(),
        }
      },
      auditTrail: [
        ...decision.auditTrail,
        {
          action: "OUTCOME_VERIFIED",
          verificationStatus,
          reason,
          timestamp: new Date().toISOString(),
          actorId,
        }
      ]
    }
  });
  
  // Emit event
  await emitAuditEvent({
    eventName: "outcome.verified",
    entityId: decisionId,
    payload: {from: decision.verificationStatus, to: verificationStatus, reason}
  });
}
```

### Requirement 2: Validation Rules

```typescript
// Cannot verify if critical blocker exists
if (decision.blockReason && verificationStatus === "verified") {
  throw new ValidationError("Cannot verify blocked outcome");
}

// Must provide reason
if (!reason?.trim()) {
  throw new ValidationError("Verification reason required");
}
```

### Requirement 3: Authorization Check

```typescript
if (!isAdmin(actorId)) {
  throw new UnauthorizedError("Only admins can verify outcomes");
}
```

---

## Status Summary

| Aspect | Status | Evidence |
|--------|--------|----------|
| Initial "unverified" | ✓ COMPLETE | DB default |
| Auto "disputed" | ✓ COMPLETE | Fraud detection |
| Manual "verified" | ❌ MISSING | No code path |
| Verification audit | ❌ MISSING | No trail logic |
| Admin endpoint | ❌ MISSING | No route |
| Metrics using "verified" | ❌ BROKEN | Always empty results |

**Overall Classification: PARTIAL** ⚠

**To reach COMPLETE:** Need manual verification endpoint + audit trail
