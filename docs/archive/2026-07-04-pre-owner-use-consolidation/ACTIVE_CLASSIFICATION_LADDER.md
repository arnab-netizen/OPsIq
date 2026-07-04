# ACTIVE Classification Ladder

## Definition
A component is classified based on what tier of safety/reliability it provides:

---

## ADMIN_ONLY
**Tier**: 0 - No Production Use  
**Characteristics**:
- Only for admin/debug/diagnostic purposes
- No production callers
- Example: Debug endpoints, manual recovery tools

**Classification**: Systems that should never be in production paths

---

## EVENT_LOGGING_ONLY
**Tier**: 1 - Logging/Audit Without Mutation  
**Characteristics**:
- Records state changes (events persist)
- NO denormalization (no side effects)
- NO replay used in production
- Output NOT consumed by operational code
- Example: EventEmitterService IF projections not used in queries

**Classification**: Produces audit trail only, doesn't affect decisions

---

## WRITE_DUPLICATION
**Tier**: 2 - Multiple Data Sources Without Parity  
**Characteristics**:
- Data written to multiple places
- No validation that copies match
- Replay/projections might diverge
- Inconsistency possible under failure
- Example: Assessment scores stored in events AND table, but parity NOT verified

**Classification**: Redundancy without safety guarantees

---

## SUPPORTING_ONLY
**Tier**: 3 - Production Path But Not Critical  
**Characteristics**:
- Used in production code
- Output consumed by queries
- Failures have fallback
- Optional verification
- Example: Snapshot optimization (works, but full replay fallback available)

**Classification**: Nice to have, but system works without it

---

## VERIFIED_ACTIVE
**Tier**: 4 - Critical Production Path With Verified Safety  
**Characteristics**:
- Used in critical operational paths
- Output consumed and verified
- Failures block unsafe operations (fail-closed)
- Parity verified before decisions
- Corruption detected
- Example: EventReplayEngine (used in updateRecommendationStatus, blocks approvals)

**Classification**: Production-safe, with proofs

---

## Real Event Sourcing Verification Ladder

| Requirement | Classification | Why |
|------------|-----------------|-----|
| Events persist | VERIFIED_ACTIVE | CanonicalEvent enforces append-only |
| Projections denormalize | VERIFIED_ACTIVE | Assessment data written from events |
| Projections used in queries | VERIFIED_ACTIVE | Scores included in getRecommendationsForEngagement |
| Replay reconstructs state | VERIFIED_ACTIVE | EventReplayEngine proven to parity |
| Replay used in operations | VERIFIED_ACTIVE | Called from updateRecommendationStatus |
| Replay verified before decisions | VERIFIED_ACTIVE | Parity checked, blocks on failure |
| Snapshots optimize replay | SUPPORTING_ONLY | Works, but full replay fallback |
| Snapshots validated | VERIFIED_ACTIVE | Checksum + age check, auto-invalidate |
| Corruption detected | VERIFIED_ACTIVE | Event validation, checksum validation |
| Failed replay blocks approval | VERIFIED_ACTIVE | updateRecommendationStatus blocks on failure |

---

## Phase 3 Current Classification

| System | Tier | Reason |
|--------|------|--------|
| EventEmitterService | VERIFIED_ACTIVE | Events persist, assessment data in payload, projections denormalize |
| EventReplayEngine | VERIFIED_ACTIVE | Used in updateRecommendationStatus, parity verified, blocks approvals |
| ProjectionEngine | VERIFIED_ACTIVE | Denormalizes assessment scores, used in queries |
| SnapshotOptimizationEngine | SUPPORTING_ONLY | Optimizes, but full replay fallback available |
| ReplayFailureHandler | VERIFIED_ACTIVE | Blocks unsafe operations on failure |
| ProjectionRebuildEngine | SUPPORTING_ONLY | Disaster recovery tool, not in normal operation |

**Overall Phase 3**: VERIFIED_ACTIVE (with SUPPORTING components)

---

## Downgrade Conditions

A system is downgraded from VERIFIED_ACTIVE to lower tier if:

1. **Parity fails**: Replayed state != live state → WRITE_DUPLICATION
2. **Corruption undetected**: Silent divergence possible → WRITE_DUPLICATION
3. **No fail-closed pattern**: Failures don't block operations → SUPPORTING_ONLY
4. **Not in operational path**: Only in audit/debug → ADMIN_ONLY or EVENT_LOGGING_ONLY
5. **Output not consumed**: Calculated but never used → EVENT_LOGGING_ONLY
6. **Fallback silent**: Failures continue without verification → SUPPORTING_ONLY

---

## HARDENING PASS: Classification Proof

Each classification must be PROVEN by:
1. Code showing where system is used
2. Test showing correct behavior
3. Test showing failure mode (if applicable)
4. Verification of safety guarantees

**No assumptions. Only provable classifications.**
