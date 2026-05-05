# OPSIQ v7.2 Execution Control File

## Objective
Integrate v7.2 as an extension of OPSIQ, not a parallel system.

System must:
- remain deterministic
- remain fail-closed
- reuse existing services
- preserve audit chain
- remain deployable at every step

---

## CRITICAL RULES

1. NEVER duplicate existing logic
2. ALWAYS inspect repo before building
3. EXTEND instead of REBUILD
4. FAIL CLOSED on uncertainty
5. PRESERVE:
   - auth
   - RBAC
   - workspace isolation
   - idempotency
   - audit events

---

# Phase 0 — ENGINE MAPPING (MANDATORY)

For EACH engine:

1. Inspect repo
2. Find:
   - existing service
   - schema
   - API
   - tests

3. Classify:
   - EXISTS → reuse
   - PARTIAL → extend
   - MISSING → build

4. Record:

Engine:
- mapped_to:
- status:
- reuse_strategy:
- duplication_risk:

RULE:
DO NOT PROCEED TO PHASE A until mapping is COMPLETE.

---

# SYSTEM ARCHITECTURE (UPDATED)

Use LAYERED GRAPH, not linear pipeline:

1. Validation Layer
2. Baseline Layer
3. Diagnostic Layer
4. Constraint Layer
5. Decision Layer
6. Execution Layer
7. Outcome Layer
8. Output Layer

---

# ENGINE LIST (v7.2)

## Validation Layer
1. Input Contract
2. Data Quality
3. Contradiction Detection
4. Fail-State System

## Baseline Layer
5. Financial Health
6. Archetype
7. Maturity

## Diagnostic Layer
8. Root Cause
9. Customer RFM
10. Offer Metrics
11. Funnel
12. Bottleneck

## Constraint Layer
13. Compliance
14. Decision Halt
15. Capacity + Friction

## Decision Layer
16. Prioritization
17. Scenario
18. Monetization
19. BEST PATH ENGINE (NEW, CRITICAL)

## Execution Layer
20. Action FSM
21. Dependency Graph
22. Sequencer
23. Failure Containment

## Outcome Layer
24. Impact Tracker
25. Confidence
26. Feedback

## Output Layer
27. Output Mode
28. Quick Win

---

# VALIDATION GATES

Run only after inspecting package.json:

- npm run test / npm test
- npm run build
- npm run lint (if exists)
- prisma validate (if exists)

---

# CURRENT EXECUTION LOG

## Phase A-5 Complete ✓ (2026-05-05 09:35)

**Best Path Engine (CRITICAL - Master Orchestrator)**
- ✓ Created: src/domain/decision/best-path.ts (types + scoring models)
- ✓ Created: src/services/best-path-engine/orchestrator.ts (orchestration logic)
- ✓ Created: src/services/best-path-engine/__tests__/orchestrator.test.ts (14/14 passing)
- ✓ Tests: All best path engine tests passing
- ✓ Status: Phase A COMPLETE - All 5 missing engines built

**Slice Summary**:
- Orchestrates all diagnostic + constraint engines
- 4-factor path scoring: Financial (30%), Probability (30%), Feasibility (25%), Constraint (15%)
- Multi-path analysis with ranking
- Best path selection + alternatives (top 3)
- Reasoning generation with diagnostic/constraint summary
- Financial projection extraction
- Confidence calculation based on score margin
- Risk assessment per path
- Fallback options generation
- Default path handling for no scenarios
- Workspace-scoped orchestration

**Files Changed**: 3 new files
- src/domain/decision/best-path.ts
- src/services/best-path-engine/orchestrator.ts
- src/services/best-path-engine/__tests__/orchestrator.test.ts

---

## PHASE A SUMMARY: 5/5 Engines Built ✓

| Phase | Engine | Status | Tests |
|-------|--------|--------|-------|
| A-1 | Input Contract | ✓ Complete | 11/11 |
| A-2 | Contradiction Detection | ✓ Complete | 12/12 |
| A-3 | Funnel Analysis | ✓ Complete | 11/11 |
| A-4 | Failure Containment | ✓ Complete | 16/16 |
| A-5 | Best Path Engine | ✓ Complete | 14/14 |
| **TOTAL** | **5 Missing Engines** | **✓ COMPLETE** | **64/64** |

---

## Phase A-4 Complete ✓ (2026-05-05 09:24)

**Failure Containment Service**
- ✓ Created: src/domain/execution/failure.ts (types + enums)
- ✓ Created: src/services/failure-containment/containment-engine.ts (containment logic)
- ✓ Created: src/services/failure-containment/__tests__/containment-engine.test.ts (16/16 passing)
- ✓ Tests: All failure containment tests passing
- ✓ Status: Ready for Phase A-5 (Best Path Engine - CRITICAL)

**Slice Summary**:
- 6 failure types: ACTION_FAILED, TIMEOUT, DEPENDENCY_FAILURE, RESOURCE_EXHAUSTED, STATE_VIOLATION, UNKNOWN
- 4 severity levels: LOW, MEDIUM, HIGH, CRITICAL
- 3 containment strategies: ISOLATE, ROLLBACK, ESCALATE
- Severity calculation based on failure type
- Strategy selection: ESCALATE on critical, ROLLBACK on state violation, ISOLATE on others
- Cascade prevention validation (ISOLATE always prevents, ROLLBACK for ≤50%, ESCALATE never)
- Rollback logic with state transitions (running→pending, paused→running, etc.)
- Affected actions estimation from state transitions
- Recommendations generation per failure type
- Workspace-scoped failure handling

**Files Changed**: 3 new files
- src/domain/execution/failure.ts
- src/services/failure-containment/containment-engine.ts
- src/services/failure-containment/__tests__/containment-engine.test.ts

---

## Phase A-3 Complete ✓ (2026-05-05 09:14)

**Funnel Analysis Service**
- ✓ Created: src/domain/diagnostic/funnel.ts (types + enums)
- ✓ Created: src/services/funnel-analysis/funnel-analyzer.ts (analysis engine)
- ✓ Created: src/services/funnel-analysis/__tests__/funnel-analyzer.test.ts (11/11 passing)
- ✓ Tests: All funnel analysis tests passing
- ✓ Status: Ready for Phase A-4

**Slice Summary**:
- 7 funnel stages: DECISION_PROPOSED → VALIDATION → REVIEW → EXECUTION_COMPLETE
- Calculates stage conversion rates and drop-off analysis
- Identifies critical drop-offs (>25% loss rate)
- Detects bottlenecks from timing delays
- Provides stage-specific recommendations
- Overall conversion rate calculation
- Severity classification for bottlenecks (LOW/MEDIUM/HIGH/CRITICAL)
- Reuses no existing logic (independent diagnostic service)
- Workspace-scoped analysis

**Files Changed**: 3 new files
- src/domain/diagnostic/funnel.ts
- src/services/funnel-analysis/funnel-analyzer.ts
- src/services/funnel-analysis/__tests__/funnel-analyzer.test.ts

---

## Phase A-2 Complete ✓ (2026-05-05 09:11)

**Contradiction Detection Service**
- ✓ Created: src/domain/validation/contradiction.ts (types)
- ✓ Created: src/services/contradiction-detector/detector.ts (detection logic)
- ✓ Created: src/services/contradiction-detector/__tests__/detector.test.ts (12/12 passing)
- ✓ Tests: All contradiction detection tests passing
- ✓ Status: Ready for Phase A-3

**Slice Summary**:
- Detects logical contradictions in validated contracts
- Rules implemented:
  - Critical health vs high revenue: Warning
  - Strong health vs zero revenue: Error
  - Owner absence + critical urgency: Error
  - Low budget + critical urgency: Warning
- Provides suggestions for resolution
- Throws on error-level contradictions
- Reuses validation contract from Phase A-1
- Maintains workspace isolation
- Logging for all detection results

**Files Changed**: 3 new files
- src/domain/validation/contradiction.ts
- src/services/contradiction-detector/detector.ts
- src/services/contradiction-detector/__tests__/detector.test.ts

---

## Phase A-1 Complete ✓ (2026-05-05 09:10)

**Input Contract Service**
- ✓ Created: src/domain/validation/contract.ts (schema + types)
- ✓ Created: src/services/validation-contracts/contract-validator.ts (validation logic)
- ✓ Created: src/services/validation-contracts/__tests__/contract-validator.test.ts (11/11 passing)
- ✓ Tests: All contract validation tests passing
- ✓ Status: Ready for integration into Phase A-2

**Slice Summary**:
- DecisionRequestContract schema (Zod) with required fields: engagementId, workspaceId, requestType, businessCondition
- Optional fields: constraints, context
- ContractValidator class with validate() and validateAndThrow() methods
- Comprehensive test coverage: valid/invalid inputs, UUIDs, enums, ranges, optional fields, error handling
- No duplication: reuses existing validation patterns from decision-validation service
- Workspace isolation: inherited from request context
- Audit: logging implemented for all validations

**Files Changed**: 3 new files
- src/domain/validation/contract.ts
- src/services/validation-contracts/contract-validator.ts
- src/services/validation-contracts/__tests__/contract-validator.test.ts

---

## Phase 0 Complete ✓

**Date**: 2026-05-05  
**Status**: Mapping complete - Ready for Phase A

### Engine Summary

| Status | Count | Details |
|--------|-------|---------|
| EXISTS (reuse) | 23 | Ready to integrate |
| PARTIAL | 0 | N/A |
| MISSING (build) | 5 | See build order below |
| **TOTAL** | **28** | |

### Mapping Results

#### ✓ EXISTS: 23 Engines (Ready)

**Validation**: Data Quality (integrity), Fail-State (control)  
**Baseline**: Financial (financial), Archetype (segmentation), Maturity (baseline)  
**Diagnostic**: Root Cause (intelligence), RFM (segmentation), Offer Metrics (governance), Bottleneck (reality-awareness)  
**Constraint**: Compliance (policy), Decision Halt (decision-control), Capacity (execution-drift)  
**Decision**: Prioritization (consulting-engine), Scenario (scenario), Monetization (value)  
**Execution**: FSM, Dependency Graph, Sequencer (all in execution)  
**Outcome**: Impact Tracker (outcome), Confidence (decision-confidence), Feedback (learning)  
**Output**: Output Mode (report), Quick Win (firstwin)  

#### ✗ MISSING: 5 Engines (MUST BUILD - Dependency Order)

1. **Input Contract** (Validation Layer)
   - Maps to: `src/services/validation-contracts`
   - Purpose: Schema contracts, ZOD validation
   - Build: NEW service, extend existing validation domain
   - Blocker: None (start first)

2. **Contradiction Detection** (Validation Layer)
   - Maps to: `src/services/contradiction-detector`
   - Purpose: Logical contradiction detection
   - Build: NEW service on top of integrity + decision-validation
   - Blocker: Input Contract must exist

3. **Funnel Analysis** (Diagnostic Layer)
   - Maps to: `src/services/funnel-analysis`
   - Purpose: Conversion funnel analysis
   - Build: NEW service or extend execution tracking
   - Blocker: None (diagnostic layer)

4. **Failure Containment** (Execution Layer)
   - Maps to: `src/services/failure-containment`
   - Purpose: Failure isolation, rollback logic
   - Build: NEW service, integrate with execution + control
   - Blocker: None (execution layer)

5. **BEST PATH ENGINE** (Decision Layer - CRITICAL)
   - Maps to: `src/services/best-path-engine`
   - Purpose: Multi-path routing, optimization, orchestration
   - Build: NEW service, orchestrates all 23 + 4 other engines
   - Blocker: All diagnostic + constraint engines must be complete
   - Risk: HIGHEST - mission-critical

### Build Order (Dependency Chain)

```
Phase A-1: Input Contract Validation
    ↓
Phase A-2: Contradiction Detection
    ↓
Phase A-3: Funnel Analysis
    ↓
Phase A-4: Failure Containment
    ↓
Phase A-5: Best Path Engine (master orchestrator)
```

### Integration Constraints

- **NO duplication**: Reuse all 23 existing services as-is
- **NO schema migrations**: 23 services have schemas; use existing tables
- **Preserve**: Workspace isolation, audit events, RBAC, idempotency
- **Audit**: All mutations must emit events (existing audit system)
- **Type safety**: TypeScript, Zod contracts for all new services

### Critical Rules (Non-Negotiable)

1. **NEVER** call existing service code from UI directly
2. **ALWAYS** use API layer for authorization checks
3. **FAIL CLOSED** if any engine fails (no silent degradation)
4. **VALIDATE** all inputs at boundary (API layer)
5. **AUDIT** all mutations immediately (no batch delays)

---


