# Phase 0: Engine Mapping Report

**Date**: 2026-05-05  
**Status**: ✅ COMPLETE  
**Responsibility**: Mandatory inspection before Phase A build

---

## Executive Summary

Out of 28 v7.2 engines:
- **23 already exist** in OPSIQ and are ready to reuse
- **5 must be built** as new services
- **0 require major refactoring** of existing code

**Conclusion**: Integration is safe. No code duplication. Reuse existing 23 services. Build only the 5 missing engines in strict dependency order.

---

## Detailed Engine Mapping

### ✓ VALIDATION LAYER (2/4 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 1 | Input Contract | ✗ MISSING | NEW | Create `validation-contracts` service |
| 2 | Data Quality | ✓ EXISTS | `integrity` | Reuse as-is |
| 3 | Contradiction Detection | ✗ MISSING | NEW | Create `contradiction-detector` service |
| 4 | Fail-State System | ✓ EXISTS | `control` | Reuse as-is |

**Status**: 2/4 ready. 2 must build.

---

### ✓ BASELINE LAYER (3/3 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 5 | Financial Health | ✓ EXISTS | `financial` | Reuse as-is |
| 6 | Archetype | ✓ EXISTS | `segmentation` | Reuse as-is |
| 7 | Maturity | ✓ EXISTS | `baseline` | Reuse as-is |

**Status**: 3/3 ready. No build needed.

---

### ✓ DIAGNOSTIC LAYER (4/5 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 8 | Root Cause | ✓ EXISTS | `intelligence` | Reuse as-is |
| 9 | Customer RFM | ✓ EXISTS | `segmentation` | Reuse as-is |
| 10 | Offer Metrics | ✓ EXISTS | `governance` | Reuse as-is |
| 11 | Funnel | ✗ MISSING | NEW | Create `funnel-analysis` service |
| 12 | Bottleneck | ✓ EXISTS | `reality-awareness` | Reuse as-is |

**Status**: 4/5 ready. 1 must build.

---

### ✓ CONSTRAINT LAYER (3/3 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 13 | Compliance | ✓ EXISTS | `policy` | Reuse as-is |
| 14 | Decision Halt | ✓ EXISTS | `decision-control` | Reuse as-is |
| 15 | Capacity + Friction | ✓ EXISTS | `execution-drift` | Reuse as-is |

**Status**: 3/3 ready. No build needed.

---

### ⚠️ DECISION LAYER (3/4 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 16 | Prioritization | ✓ EXISTS | `consulting-engine` | Reuse as-is |
| 17 | Scenario | ✓ EXISTS | `scenario` | Reuse as-is |
| 18 | Monetization | ✓ EXISTS | `value` | Reuse as-is |
| 19 | BEST PATH ENGINE | ✗ MISSING | NEW | Create `best-path-engine` service (CRITICAL) |

**Status**: 3/4 ready. 1 CRITICAL engine must build.

**Note**: Engine #19 is the master orchestrator. It must integrate all diagnostic + constraint engines and route to optimal path. This is highest complexity and highest risk.

---

### ✓ EXECUTION LAYER (3/4 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 20 | Action FSM | ✓ EXISTS | `execution` | Reuse as-is |
| 21 | Dependency Graph | ✓ EXISTS | `execution` | Reuse as-is |
| 22 | Sequencer | ✓ EXISTS | `execution` | Reuse as-is |
| 23 | Failure Containment | ✗ MISSING | NEW | Create `failure-containment` service |

**Status**: 3/4 ready. 1 must build.

---

### ✓ OUTCOME LAYER (3/3 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 24 | Impact Tracker | ✓ EXISTS | `outcome` | Reuse as-is |
| 25 | Confidence | ✓ EXISTS | `decision-confidence` | Reuse as-is |
| 26 | Feedback | ✓ EXISTS | `learning` | Reuse as-is |

**Status**: 3/3 ready. No build needed.

---

### ✓ OUTPUT LAYER (2/2 exist)

| # | Engine | Status | Service | Reuse Strategy |
|---|--------|--------|---------|-----------------|
| 27 | Output Mode | ✓ EXISTS | `report` | Reuse as-is |
| 28 | Quick Win | ✓ EXISTS | `firstwin` | Reuse as-is |

**Status**: 2/2 ready. No build needed.

---

## Summary by Layer

| Layer | Exist | Missing | % Ready |
|-------|-------|---------|---------|
| Validation | 2 | 2 | 50% |
| Baseline | 3 | 0 | 100% |
| Diagnostic | 4 | 1 | 80% |
| Constraint | 3 | 0 | 100% |
| Decision | 3 | 1 | 75% |
| Execution | 3 | 1 | 75% |
| Outcome | 3 | 0 | 100% |
| Output | 2 | 0 | 100% |
| **TOTAL** | **23** | **5** | **82%** |

---

## Missing Engines: Build Specification

### Engine 1: Input Contract (VALIDATION LAYER)

**Purpose**: Define and enforce input schema contracts for all decision requests.

**Function**:
- Accept incoming request/data
- Validate structure against ZOD schema
- Validate types, ranges, required fields
- Return contract validation result or fail-fast error

**Build Location**: `src/services/validation-contracts/`

**Dependencies**: 
- `src/domain/validation/` (extend with contract types)
- ZOD (existing)
- Workspace scoping (inherit from auth context)

**Reuse**:
- Extend existing validation domain structures
- Use existing request context patterns
- Leverage workspace isolation already in place

**API Surface**:
```typescript
validateInputContract(
  request: DecisionRequest,
  workspaceId: string
): Promise<ValidationResult>
```

**Audit**: All contract violations must be logged to audit trail.

**Failure Mode**: Fail-closed. Invalid inputs rejected, never silent truncation.

---

### Engine 3: Contradiction Detection (VALIDATION LAYER)

**Purpose**: Detect logical contradictions in input data or system state.

**Function**:
- Analyze input data for internal contradictions
- Check state consistency (e.g., revenue vs budget conflict)
- Detect impossible combinations of constraints
- Return list of detected contradictions or clear

**Build Location**: `src/services/contradiction-detector/`

**Dependencies**:
- Engine 1 (Input Contract must exist)
- `src/services/integrity` (reuse contradiction detection logic)
- `src/services/decision-validation` (reuse validation context)

**Reuse**:
- Build on top of existing integrity checks
- Leverage decision validation framework
- Use existing rule engine patterns

**API Surface**:
```typescript
detectContradictions(
  data: DecisionInput,
  context: DecisionContext,
  workspaceId: string
): Promise<Contradiction[]>
```

**Audit**: Detected contradictions logged with severity.

**Failure Mode**: If contradiction detected, decision halted. Clear error to user.

---

### Engine 11: Funnel Analysis (DIAGNOSTIC LAYER)

**Purpose**: Analyze customer conversion funnel, drop-off points, bottlenecks.

**Function**:
- Track user progression through decision funnel
- Identify drop-off stages
- Calculate conversion rates
- Link to bottleneck engine results
- Surface improvement opportunities

**Build Location**: `src/services/funnel-analysis/`

**Dependencies**:
- Engine 12 (Bottleneck detection - existing, can use)
- `src/services/execution` (reuse execution flow tracking)
- Outcome data from funnel events

**Reuse**:
- Use execution flow tracking already in place
- Reuse bottleneck detection results
- Leverage learning service for historical funnel data

**API Surface**:
```typescript
analyzeFunnel(
  engagementId: string,
  workspaceId: string,
  dateRange?: DateRange
): Promise<FunnelAnalysis>
```

**Audit**: Funnel analysis triggers logged; recommendations audited.

**Failure Mode**: Graceful degradation. Return partial funnel if intermediate data missing.

---

### Engine 23: Failure Containment (EXECUTION LAYER)

**Purpose**: Isolate failures, prevent cascade, enable rollback of in-flight decisions.

**Function**:
- Detect execution failures (action FSM failure, sequencer deadlock, etc.)
- Isolate failure to minimal scope (single action, single sequence)
- Prevent cascade to dependent actions
- Support manual rollback of decision execution
- Audit all failure events + recovery actions

**Build Location**: `src/services/failure-containment/`

**Dependencies**:
- Engine 20 (Action FSM - existing)
- Engine 22 (Sequencer - existing)
- `src/services/execution-drift` (reuse failure detection patterns)
- `src/services/control` (reuse fail-state logic)

**Reuse**:
- Build on execution-drift failure detection
- Use control system fail-state patterns
- Leverage audit trail for recovery logging
- Inherit workspace isolation from execution layer

**API Surface**:
```typescript
containeFailure(
  executionId: string,
  failureEvent: ExecutionFailure,
  workspaceId: string
): Promise<ContainmentResult>

rollbackDecision(
  decisionId: string,
  workspaceId: string
): Promise<RollbackResult>
```

**Audit**: All failures + containment actions logged with full context.

**Failure Mode**: Fail-closed. If containment fails, escalate to manual review. Never allow cascade.

---

### Engine 19: BEST PATH ENGINE (DECISION LAYER - CRITICAL)

**Purpose**: Master orchestrator. Analyze multiple paths, optimize for business value and execution likelihood.

**Function**:
- Receive decision context (business condition, constraints, available actions)
- Invoke all diagnostic engines (8-12) to gather intelligence
- Invoke all constraint engines (13-15) to identify constraints
- Generate multiple candidate paths (leveraging scenario engine)
- Score each path by:
  - Expected financial impact (monetization engine)
  - Success probability (confidence engine)
  - Execution feasibility (reality-awareness, bottleneck)
  - Constraint satisfaction (compliance, decision-halt)
- Rank paths and return best option + alternatives
- Explain reasoning for each path (audit trail)

**Build Location**: `src/services/best-path-engine/`

**Dependencies**: 
- ALL diagnostic engines (8-12)
- ALL constraint engines (13-15)
- Engine 16 (Prioritization)
- Engine 17 (Scenario)
- Engine 18 (Monetization)
- Engine 25 (Confidence)
- Existing workspace + audit infrastructure

**Reuse**:
- Do NOT rebuild diagnostic logic; call existing services
- Do NOT rebuild constraint logic; call existing services
- Compose results from 23 existing engines
- Use scenario engine for path generation
- Use prioritization logic for ranking
- Leverage confidence engine for probability scoring

**API Surface**:
```typescript
analyzePaths(
  context: DecisionContext,
  workspaceId: string,
  engagementId: string
): Promise<BestPathAnalysis>

interface BestPathAnalysis {
  bestPath: DecisionPath;
  alternatives: DecisionPath[];
  reasoning: PathReasoning;
  constraints: ConstraintSummary;
  financialProjection: FinancialProjection;
  successProbability: number;
  auditTrail: AuditEvent[];
}
```

**Audit**: Every path analysis logged with:
- Input context
- Engines invoked
- Results from each engine
- Scoring calculation
- Final ranking
- Recommendation + alternatives

**Failure Mode**: If any diagnostic/constraint engine fails, abort analysis and return error. Never fall back silently.

**Risk Mitigation**:
- Extensive logging (every step)
- Fail-closed on any component failure
- Timeout protection (if engine hangs, abort)
- Validation of engine output (type + range checks)
- Audit trail for all decisions + reasoning
- Canary rollout (test with small subset first)

---

## Phase A: Implementation Roadmap

### Phase A-1: Input Contract Service
- **Deliverable**: `src/services/validation-contracts/`
- **Timeline**: 1-2 days
- **Blocking**: Other validation services
- **Tests**: Contract validation scenarios
- **Review**: Input validation patterns

### Phase A-2: Contradiction Detection Service
- **Deliverable**: `src/services/contradiction-detector/`
- **Timeline**: 1 day
- **Blocking**: None (after A-1)
- **Tests**: Contradiction detection scenarios
- **Review**: Edge cases in contradiction logic

### Phase A-3: Funnel Analysis Service
- **Deliverable**: `src/services/funnel-analysis/`
- **Timeline**: 1-2 days
- **Blocking**: None (diagnostic, independent)
- **Tests**: Funnel tracking scenarios
- **Review**: Execution flow integration

### Phase A-4: Failure Containment Service
- **Deliverable**: `src/services/failure-containment/`
- **Timeline**: 2 days
- **Blocking**: None (execution layer)
- **Tests**: Failure isolation scenarios, rollback paths
- **Review**: Failure cascade prevention

### Phase A-5: Best Path Engine Service (CRITICAL)
- **Deliverable**: `src/services/best-path-engine/`
- **Timeline**: 3-4 days
- **Blocking**: All others complete
- **Tests**: Integration tests across 23 + 4 services
- **Review**: Heavy security + correctness review

**Total Phase A Timeline**: 8-10 days

---

## Integration Checklist

- [ ] Input Contract service created and tested
- [ ] Contradiction Detection service created and tested
- [ ] Funnel Analysis service created and tested
- [ ] Failure Containment service created and tested
- [ ] Best Path Engine service created and tested
- [ ] All API routes added
- [ ] Authorization checks in place
- [ ] Workspace isolation verified
- [ ] Audit events emitted for all mutations
- [ ] Integration tests passing (all 28 engines together)
- [ ] TypeScript compiles (0 errors)
- [ ] Build succeeds
- [ ] All existing tests still passing

---

## Critical Rules (Phase A)

1. **REUSE**: Do not duplicate existing service logic. Call it instead.
2. **ISOLATE**: Each new service in its own directory with clear boundaries.
3. **AUDIT**: All mutations emit events immediately (no batch delays).
4. **VALIDATE**: All inputs validated at API boundary.
5. **FAIL CLOSED**: On any error, abort gracefully. Never silent degradation.
6. **PRESERVE**: Workspace isolation, RBAC, idempotency, audit trail.

---

## No Changes Needed

The following are working correctly and require NO modifications:
- All 23 existing services
- Workspace isolation (already enforced)
- Audit event system (already in place)
- RBAC / authorization (already centralized)
- API request/response patterns (reuse existing)
- Database schema (no migrations needed)
- Test structure (follow existing patterns)

---

## Phase 0 Conclusion

**Status**: ✅ Mapping Complete

**Finding**: Integration is feasible. 82% of v7.2 already exists. Build only 5 missing services. Follow strict dependency order. Reuse all 23 existing services. No duplication. Audit trail preserved.

**Recommendation**: Proceed to Phase A when team is ready. Best Path Engine is critical path item.

---

**Report Generated**: 2026-05-05  
**Prepared for**: Phase A Implementation Team
