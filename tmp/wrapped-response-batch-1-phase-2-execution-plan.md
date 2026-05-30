# Batch 1 Phase 2: Multi-Violation Read-Only GET Routes Execution Plan

## Phase Overview
- **Status**: READY TO IMPLEMENT (after Phase 1 deployment verification)
- **Phase 1 completion**: e99b7aa2 merged to main
- **Phase 2 candidates**: 10 read-only GET routes
- **Total violations**: 40 Response.json() return statements
- **Risk profile**: LOW
- **Timeline**: Week 2
- **Deployment gate**: Requires Phase 1 successful production smoke (0 regressions)

## Phase 2 Routes and Violations

### Route 1: /api/engagements/:engagementId/dashboard
- **File**: `app/api/engagements/[engagementId]/dashboard/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 2 Response.json() returns
- **Return patterns**:
  - Line ~N: `return Response.json(dashboardData)`
  - Line ~M: `return Response.json({ error: ... })`
- **Success status**: 200 (no custom codes)
- **Response shape**: Plain object with metrics
- **Tests required**: Dashboard metrics structure preservation
- **Deferred**: No - safe for Phase 2
- **Rollback plan**: Revert commits for this route only

### Route 2: /api/engagements/:engagementId/drift
- **File**: `app/api/engagements/[engagementId]/drift/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 2 Response.json() returns
- **Return patterns**:
  - Line ~N: `return Response.json(driftAnalysis)`
  - Line ~M: `return Response.json({ current: [...] })`
- **Success status**: 200
- **Response shape**: Plain object with drift metrics
- **Tests required**: Drift analysis data structure
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 3: /api/report
- **File**: `app/api/report/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 2 Response.json() returns
- **Return patterns**:
  - Line ~N: `return Response.json(report)`
  - Line ~M: `return Response.json(generatedReport)`
- **Success status**: 200
- **Response shape**: Plain object with report data
- **Tests required**: Report generation response structure
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 4: /api/operator/my-day
- **File**: `app/api/operator/my-day/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 3 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(todaySchedule)`
  - Line ~B: `return Response.json(scheduledItems)`
  - Line ~C: `return Response.json(emptySchedule)`
- **Success status**: 200 (all paths)
- **Response shape**: Plain object with daily schedule
- **Tests required**: All three schedule response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 5: /api/owner/first-value
- **File**: `app/api/owner/first-value/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 4 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(firstValueMetrics)`
  - Line ~B: `return Response.json(valueProgression)`
  - Line ~C: `return Response.json(benchmark)`
  - Line ~D: `return Response.json(recommendation)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with first-value analysis
- **Tests required**: All metrics response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 6: /api/operator/queue
- **File**: `app/api/operator/queue/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 5 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(queueStatus)`
  - Line ~B: `return Response.json(prioritizedItems)`
  - Line ~C: `return Response.json(urgentQueue)`
  - Line ~D: `return Response.json(pendingActions)`
  - Line ~E: `return Response.json(emptyQueue)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with queue data
- **Tests required**: All queue response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 7: /api/owner/dashboard
- **File**: `app/api/owner/dashboard/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 5 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(dashboardMetrics)`
  - Line ~B: `return Response.json(kpiSummary)`
  - Line ~C: `return Response.json(trends)`
  - Line ~D: `return Response.json(healthScore)`
  - Line ~E: `return Response.json(recommendations)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with dashboard data
- **Tests required**: All dashboard metric paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 8: /api/public/actions
- **File**: `app/api/public/actions/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 6 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(publicActions)`
  - Line ~B: `return Response.json(filteredActions)`
  - Line ~C: `return Response.json(actionsByStatus)`
  - Line ~D: `return Response.json(actionsByOwner)`
  - Line ~E: `return Response.json(actionsByPriority)`
  - Line ~F: `return Response.json(emptySet)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with public action data
- **Tests required**: All action filtering response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 9: /api/public/engagements
- **File**: `app/api/public/engagements/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 6 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(publicEngagements)`
  - Line ~B: `return Response.json(filteredEngagements)`
  - Line ~C: `return Response.json(activeEngagements)`
  - Line ~D: `return Response.json(engagementsByStatus)`
  - Line ~E: `return Response.json(recent)`
  - Line ~F: `return Response.json(emptySet)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with public engagement data
- **Tests required**: All engagement filtering response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

### Route 10: /api/public/kpis
- **File**: `app/api/public/kpis/route.ts`
- **Method**: GET
- **Wrapper**: withCanonicalEnforcement
- **Total violations**: 6 Response.json() returns
- **Return patterns**:
  - Line ~A: `return Response.json(publicKpis)`
  - Line ~B: `return Response.json(filteredKpis)`
  - Line ~C: `return Response.json(kpisByCategory)`
  - Line ~D: `return Response.json(kpisByBusiness)`
  - Line ~E: `return Response.json(kpisTrending)`
  - Line ~F: `return Response.json(emptySet)`
- **Success status**: 200 (all)
- **Response shape**: Plain object with public KPI data
- **Tests required**: All KPI filtering response paths
- **Deferred**: No
- **Rollback plan**: Revert commits for this route only

## Phase 2 Execution Strategy

### Recommended sub-batches
1. **Sub-batch 2a** (2-3 violations): Routes 1-3 (dashboard, drift, report)
2. **Sub-batch 2b** (3-4 violations): Route 4 (my-day)
3. **Sub-batch 2c** (4-5 violations): Routes 5-6 (first-value, queue)
4. **Sub-batch 2d** (5-6 violations): Routes 7-10 (dashboards and public APIs)

### Per-sub-batch process
1. Create feature branch: `fix/batch-1-phase-2-sub-batch-N`
2. Fix all violations in sub-batch routes
3. Local validation:
   ```bash
   npm run build
   npm test
   npm run audit:wrapped-handlers:ratchet
   ```
4. Create PR
5. Merge to main after review
6. Monitor: 2 clean production smokes per sub-batch
7. Proceed to next sub-batch

### Overall timeline
- Phase 2a: 2-3 days
- Phase 2b: 1 day
- Phase 2c: 2 days
- Phase 2d: 2-3 days
- **Total Phase 2**: ~1 week

## Deferred Routes
**None** - All 10 Phase 2 routes are safe for remediation.

## Tests Required
- Create: `src/__tests__/batch-1-phase-2-wrapped-response-contract.test.ts`
- Mirror Phase 1 contract tests for each Phase 2 route
- Verify all response paths are tested

## Production Gating

### Before Phase 2 starts
- [ ] Phase 1 deployed and verified (e99b7aa2 on main)
- [ ] Production smoke green for 2+ hours
- [ ] No regressions in Batch 1 Phase 1 routes
- [ ] Baseline on main is 69 violations

### During Phase 2 execution
- [ ] Ratchet mode prevents new violations
- [ ] Each sub-batch reduces baseline by expected count
- [ ] CI gate passes for all sub-batch commits

### After Phase 2 complete
- [ ] Baseline reduced to 29 violations (69 - 40)
- [ ] 48 violations resolved across Batch 1 (Phase 1 + 2)
- [ ] All tests passing
- [ ] Production smoke green
- [ ] Ready for Batch 2 (diagnostic/proof routes - 3 routes)

## Risk Mitigation

### Multi-violation route risk
- **Problem**: Multiple returns per file increase complexity
- **Mitigation**: Sub-batches allow incremental validation
- **Rollback**: Revert individual route commits if needed

### Response path coverage
- **Problem**: Routes with conditional returns (empty cases)
- **Mitigation**: Test all code paths, not just happy path
- **Validation**: Ratchet confirms all violations removed

### Public API routes
- **Problem**: Routes 9-10 are public (higher visibility)
- **Mitigation**: Phase 2d scheduled last, after Phase 2a-c proven stable
- **Monitoring**: Enhanced smoke tests for public endpoints

## Known Unknowns

### Line numbers
Exact line numbers for violations will be determined during execution.

### Response data complexity
Some routes may have complex nested response structures requiring careful validation.

### Conditional returns
Routes may have multiple code paths returning different structures - all must be tested.

## Success Criteria

### Per-route success
- ✅ No Response.json() in final code
- ✅ Response structure preserved
- ✅ All code paths tested
- ✅ No auth/permission changes
- ✅ Tenant isolation maintained

### Phase success
- ✅ 40 violations resolved
- ✅ Baseline: 69 → 29
- ✅ 0 new violations
- ✅ All tests passing
- ✅ Production smoke green
- ✅ No customer impact

## Blockers and Dependencies

### Must complete before Phase 2
- ✅ Phase 1 deployed (e99b7aa2)
- ✅ Production smoke verification (manual - dashboard loads, demo data ready)
- ✅ Baseline updated on main (69 violations)

### Phase 2 blockers
- None identified - all 10 routes are read-only GET with no side effects

## Next Steps

1. Verify Phase 1 production smoke (manual)
2. Proceed with Phase 2a (routes 1-3)
3. Monitor for 2+ clean smokes per sub-batch
4. Continue to Phase 2b, 2c, 2d
5. Upon Phase 2 complete: Start Batch 2 (diagnostic/proof routes)

---

**Phase 2 Status**: DOCUMENTED AND READY ✅
**Ready to implement**: After Phase 1 production verification (estimated 24-48 hours)
