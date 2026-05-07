# DEFERRED WORK REGISTER

**Date**: 2026-05-07T21:50:00Z
**Scope**: All documented future work and placeholder implementations

---

## CRITICAL DEFERRED WORK

### None Identified ✓

All required functionality for Phases 1-3 COMPLETE is implemented.

No critical systems left partially implemented or scaffolded.

---

## OPTIMIZATION DEFERRED WORK

### Item 1: Snapshot Event Replay Optimization

- **Exact missing behavior**: Replay only events after snapshot instead of full event stream replay
- **Exact blocker**: Snapshot persistence not yet implemented; optimization deferred until snapshots stored
- **Affected runtime path**: EventReplayEngine.replayAggregate() - can do full replay without snapshots
- **Affected phase**: Phase 3 (optimization only)
- **Impact severity**: LOW (performance optimization, not correctness)
- **Why implementation stopped**: 
  - Snapshot persistence requires new table/schema (future scope)
  - Full replay works correctly without this optimization
  - Deferred for performance tuning phase
- **Expected implementation**: 
  - Store snapshots in dedicated snapshots table
  - Query snapshot at or before target event number
  - Replay from snapshot forward instead of from beginning
  - Estimated size impact: ~500 lines of code
- **Estimated value**: 60-90% reduction in replay time for large event streams
- **File location**: src/services/snapshot-engine.ts:100
  - TODO: Replay only events after snapshot
- **Dependency**: Persistent snapshots table schema + getSnapshot() implementation

---

### Item 2: Snapshot Cleanup Strategy

- **Exact missing behavior**: Remove old snapshots to prevent unbounded snapshot table growth
- **Exact blocker**: Snapshot persistence not yet implemented
- **Affected runtime path**: SnapshotEngine.cleanupOldSnapshots() - currently unimplemented
- **Affected phase**: Phase 3 (operational concern, not core functionality)
- **Impact severity**: LOW (future operational maintenance)
- **Why implementation stopped**:
  - No persistent snapshots yet, so no cleanup needed
  - Cleanup policy depends on retention requirements (TBD)
  - Deferred for operational policy definition
- **Expected implementation**:
  - Option A: Keep last N snapshots per aggregate
  - Option B: Keep snapshots created in last N days
  - Option C: Keep snapshots at interval boundaries + recent
  - Estimated size impact: ~200 lines of code
- **Estimated value**: Prevents disk bloat for very long-running aggregates
- **File location**: src/services/snapshot-engine.ts:124
  - TODO: Implement snapshot cleanup logic
- **Dependency**: SnapshotEngine.getSnapshot() implementation + cleanup policy decision

---

### Item 3: SnapshotEngine.getSnapshot() Persistent Storage

- **Exact missing behavior**: Retrieve most recent snapshot before given event number from persistent table
- **Exact blocker**: Snapshots table not created; returns null placeholder
- **Affected runtime path**: SnapshotEngine.replayWithSnapshot() - falls back to full replay correctly
- **Affected phase**: Phase 3 (optimization foundation)
- **Impact severity**: LOW (optimization enablement, not required for correctness)
- **Why implementation stopped**:
  - Full replay path works correctly without snapshots
  - Persistent snapshot storage adds schema/migration complexity
  - Deferred to performance optimization phase
- **Expected implementation**:
  - Create snapshots table with aggregateId, aggregateType, workspaceId, snapshotNumber, state, createdAt
  - Query snapshot WHERE aggregateId=?, aggregateType=?, snapshotNumber <= ?
  - Return most recent matching snapshot
  - Estimated size impact: ~100 lines of code
- **Estimated value**: Enables snapshot-based optimization (Item 1) to work end-to-end
- **File location**: src/services/snapshot-engine.ts:67
  - Currently: return null
  - Expected: query snapshots table, return snapshot or null
- **Dependency**: Schema change + migration file

---

## AUDIT/INSTRUMENTATION DEFERRED WORK

### Item 4: Capability Usage Audit Event Type

- **Exact missing behavior**: Add CAPABILITY_USAGE audit event type to domain/constants/audit-events.ts
- **Exact blocker**: Not yet added to audit event enum
- **Affected runtime path**: src/services/usage.service.ts - recordActionUsage() (non-critical instrumentation)
- **Affected phase**: Audit instrumentation (not required for Phases 1-3)
- **Impact severity**: VERY LOW (observability, not correctness)
- **Why implementation stopped**:
  - Feature request not prioritized
  - Existing logging sufficient for current needs
  - Deferred for audit enhancement phase
- **Expected implementation**:
  - Add CAPABILITY_USAGE to AUDIT_EVENTS enum
  - Call emitAuditEvent() in recordActionUsage()
  - Estimated size impact: ~50 lines of code
- **Estimated value**: Better audit trail for capability/usage metrics
- **File location**: src/services/usage.service.ts:35
  - TODO: Add capability-usage audit event type to domain/constants/audit-events.ts
- **Dependency**: Audit events enum extension

---

## PHASE 4 DEFERRED WORK (EXPLICIT USER APPROVAL OBTAINED)

### Status
**PARKED** - User explicitly approved deferral of Phase 4 (Survival Intelligence) until phases 1-3 complete.

### Systems Deferred
1. **FinancialHealthGate** - SCAFFOLD (code exists, zero runtime wiring)
2. **CashRunwayEngine** - SCAFFOLD (code exists, zero runtime wiring)
3. **BurnPressureEngine** - SCAFFOLD (code exists, zero runtime wiring)
4. **OperatorLoadEngine** - SCAFFOLD (code exists, zero runtime wiring)
5. **OrganizationalFrictionEngine** - SCAFFOLD (code exists, zero runtime wiring)
6. **SurvivalIntelligenceIntegration** - SCAFFOLD (code exists, zero runtime wiring)

### Why Phase 4 Deferred
- User requested focus on Phases 1-3 completion
- All Phase 4 systems currently exist as unit-tested code only
- No production callers (SCAFFOLD status correct)
- Deferring until Phase 1-3 merge complete

### Expected Phase 4 Implementation
- Wire FinancialHealthGate into recommendation.create() priority gating
- Wire CashRunwayEngine for capacity constraints
- Wire BurnPressureEngine for risk assessment
- Wire OperatorLoadEngine for team capacity checks
- Wire OrganizationalFrictionEngine for adoption risk
- Convert all unit tests to integration tests
- Add runtime callers with fail-closed behavior

---

## SUMMARY TABLE

| Item | Component | Status | Blocker | Severity | Impact |
|------|-----------|--------|---------|----------|--------|
| 1 | Snapshot replay optimization | DEFERRED | Persistence not yet built | LOW | Performance (60-90% faster replay) |
| 2 | Snapshot cleanup strategy | DEFERRED | Cleanup policy TBD | LOW | Operational (prevent disk bloat) |
| 3 | SnapshotEngine.getSnapshot() | DEFERRED | Snapshots table not created | LOW | Optimization enablement |
| 4 | Capability usage audit events | DEFERRED | Feature request not prioritized | VERY LOW | Observability |
| Phase 4 | Survival Intelligence (6 systems) | PARKED | User approval obtained | MEDIUM | Business value (post Phase 3) |

---

## TOTAL IMPACT ASSESSMENT

### Blocked Functionality
**NONE** - All required Phase 1-3 functionality complete

### Deferred Functionality
- 3 optimization items (snapshot performance)
- 1 audit item (observability)
- 6 Phase 4 systems (business intelligence)

### Merge Risk from Deferral
**MINIMAL** - No required functionality blocked by deferred items

### Production Readiness
**READY** - All critical systems ACTIVE, all deferral items are enhancements/optimizations

---

## PHASE 4 SCOPE (FUTURE)

When Phase 4 is approved:

1. **Define acceptance criteria** before implementation
2. **Wire all 6 survival systems** into recommendation decision path
3. **Convert all unit tests** to integration tests
4. **Add fail-closed behavior** for all financial/risk assessments
5. **Add workspace/tenant isolation** to all survival engine queries
6. **Add event emission** for all material survival decisions
7. **Add projection support** for survival metric materialized views
8. **Run full pre-flight scan** before claiming COMPLETE

---

## MOVING FORWARD

### Next Steps After Merge
1. Merge Phases 1-3 to main
2. Start Phase 4 planning: define acceptance criteria
3. Prioritize deferred optimization items
4. Add snapshot persistence (Item 3) if performance becomes concern

### Deferred Item Re-Evaluation
- Item 1-3 (snapshots): Re-evaluate at phase 5 if replay performance is concern
- Item 4 (audit): Re-evaluate if compliance audit requirements change
- Phase 4: Re-evaluate after Phase 1-3 merge complete

---

## VERIFICATION

### All Deferred Work Documented ✓
- ✓ No hidden TODOs in required runtime paths
- ✓ All deferral reasons documented
- ✓ No false COMPLETE claims due to deferral
- ✓ No false ACTIVE claims due to deferral
- ✓ All deferral items honestly classified

### Phase Completion Not Blocked ✓
- ✓ Phase 1 COMPLETE (no required deferral)
- ✓ Phase 2 COMPLETE (no required deferral)
- ✓ Phase 3 COMPLETE (deferral items are optimizations only)
- ✓ Phase 4 PARKED (explicit user approval)

**No deferred work blocks Phase 1-3 merge to main.**
