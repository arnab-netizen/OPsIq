# Replay Parity Verification Results

**Test Suite**: phase-3-hardening-proofs.test.ts  
**Test**: PROOF 2: Replay output equals live Recommendation state  
**Status**: DESIGNED AND READY TO EXECUTE

---

## Parity Test Design

### Scenario
1. Create recommendation with values:
   - title: "Parity Test"
   - priority: "critical"
   - description: "Testing parity"
   - evidenceValidationScore: 92
   - reliabilityLevel: "high"
   - kpiHealthScore: 88
   - kpiRiskLevel: "low"

2. Emit event with same values

3. Query live state from database

4. Replay state via EventReplayEngine

5. Compare all fields

### Fields Verified
- title ✓
- priority ✓
- description ✓
- evidenceValidationScore ✓
- reliabilityLevel ✓
- kpiHealthScore ✓
- kpiRiskLevel ✓

### Parity Expectations
| Field | Live Value | Replayed Value | Match |
|-------|-----------|----------------|-------|
| title | "Parity Test" | "Parity Test" | ✓ |
| priority | "critical" | "critical" | ✓ |
| description | "Testing parity" | "Testing parity" | ✓ |
| evidenceValidationScore | 92 | 92 | ✓ |
| reliabilityLevel | "high" | "high" | ✓ |
| kpiHealthScore | 88 | 88 | ✓ |
| kpiRiskLevel | "low" | "low" | ✓ |

### Execution Flow
```typescript
// Get live state
const live = await db.recommendation.findUnique({
  where: { id: recommendationId }
});

// Get replayed state
const replayed = await EventReplayEngine.replayAggregate(
  recommendationId,
  "recommendation",
  workspaceId
);

// Verify parity on all fields
expect(live.title).toEqual(replayed.state.title);
expect(live.priority).toEqual(replayed.state.priority);
expect(live.description).toEqual(replayed.state.description);
expect(live.evidenceValidationScore).toEqual(replayed.state.evidenceValidationScore);
expect(live.reliabilityLevel).toEqual(replayed.state.reliabilityLevel);
expect(live.kpiHealthScore).toEqual(replayed.state.kpiHealthScore);
expect(live.kpiRiskLevel).toEqual(replayed.state.kpiRiskLevel);
```

### Expected Test Result
✓ All 7 parity assertions pass  
✓ Replayed state matches live state exactly  
✓ No divergence detected  

---

## Parity Critical Path

### When Parity is Checked
1. **updateRecommendationStatus** (approval operation)
   - Calls verifyRecommendationState()
   - Gets live state and replayed state
   - Compares for parity
   - Blocks approval if parity fails

2. **Failed Parity Handling**
   - Error logged: "Replay parity mismatch on approval (blocking unsafe decision)"
   - Approval rejected
   - Fail-closed pattern applied

### Parity Importance
- **Critical for approvals**: Cannot approve recommendation if state is uncertain
- **Indicates corruption**: Mismatch means either events corrupted or projection corrupted
- **Requires investigation**: Human intervention needed if parity fails

---

## Parity Safety Guarantees

### Guarantee 1: No Silent Divergence
- Parity check runs BEFORE approval
- Mismatches BLOCK approval
- Never proceeds with uncertain state

### Guarantee 2: Event-Based Truth
- Replayed state comes from events only (CanonicalEvent)
- Database state comes from projections
- Comparison detects drift

### Guarantee 3: Fail-Closed
- Parity failure = approval blocked
- No fallback to unverified approval
- Error propagates to caller

---

## Test Execution Prerequisites

```bash
# Ensure test database running
docker ps | grep postgres

# Run single parity test
npx jest phase-3-hardening-proofs.test.ts -t "Replay output equals live"

# Expected output:
# PASS  src/__tests__/phase-3-hardening-proofs.test.ts
#   HARDENING: Phase 3 Critical Properties
#     PROOF 2: Compare replay with live DB state (PARITY)
#       ✓ should have identical parity between replayed and live state (45ms)
```

---

## Parity Verdict

**Current Status**: Test designed and ready to execute  
**Expected Result**: PASS  
**Confidence**: HIGH (parity checks implemented in code)

**If Test Passes**:
- Parity verification working correctly
- Replayed state matches database
- Safe to approve recommendations

**If Test Fails**:
- Indicates projection/event corruption
- Requires investigation of:
  - Event payload integrity
  - Projection denormalization logic
  - Database constraints
- System would downgrade to WRITE_DUPLICATION tier

---

## Parity Results Summary Table

| Test Case | Expected | Result | Status |
|-----------|----------|--------|--------|
| Live state exists | TRUE | TBD | Ready |
| Replayed state exists | TRUE | TBD | Ready |
| Field parity: title | TRUE | TBD | Ready |
| Field parity: priority | TRUE | TBD | Ready |
| Field parity: description | TRUE | TBD | Ready |
| Field parity: evidenceValidationScore | TRUE | TBD | Ready |
| Field parity: reliabilityLevel | TRUE | TBD | Ready |
| Field parity: kpiHealthScore | TRUE | TBD | Ready |
| Field parity: kpiRiskLevel | TRUE | TBD | Ready |
| Overall parity | EXACT_MATCH | TBD | Ready |

