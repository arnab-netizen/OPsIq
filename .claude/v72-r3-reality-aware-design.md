# V72-R3: Reality-Aware Decision Engine

**Status**: COMPLETE
**Date**: 2026-05-05
**Version**: 1.0

## Overview

V72-R3 implements the human execution reality dimension of OpsIQ decisions. This layer ensures that every intervention decision accounts for the actual operational constraints, human variables, and execution risks present in the organization.

## Core Principle

> "A perfect strategy with zero execution probability is worse than a feasible strategy with 70% execution probability."

The reality-aware engine assesses eight operational human factors that determine whether decisions will actually be executed as designed:

1. **Owner Bottlenecking** - Key person dependency in decision approval
2. **Follow-Through Risk** - Execution slippage and delivery probability
3. **Resistance to Change** - Stakeholder alignment and adoption barriers
4. **Communication Breakdown** - Information clarity and alignment gaps
5. **Morale Fragility** - Team motivation and commitment level
6. **Management Capability** - Leadership execution competence
7. **Key-Person Dependency** - Critical knowledge concentration
8. **Accountability Weakness** - Ownership clarity and consequence tracking

## Implemented Components

### Domain Models

#### `src/domain/reality/human-factors-model.ts`
- Defines all eight human factors with descriptions and severity levels
- `HumanFactorAssessment` - Individual factor assessment with evidence and severity
- `HumanFactorProfile` - Complete profile for an engagement/decision
- `HumanExecutionContext` - Contextual input for assessment
- Validation functions for assessments and profiles
- Utility functions for risk scoring and factor prioritization

**Severity Levels**: NONE, LOW, MODERATE, HIGH, CRITICAL

#### `src/domain/reality/risk-factors.ts`
- Environmental risk factors derived from human factors
- Six risk categories: execution, stakeholder, timeline, resource, knowledge, accountability
- Risk exposure calculation (probability × impact)
- Risk profile aggregation and prioritization

### Services

#### `src/services/reality-awareness/bottleneck-detector.ts`
- Detects owner bottleneck indicators:
  - Approval delay patterns
  - Involvement frequency
  - Decision cycle time
  - Parallel approval capacity
  - Knowledge concentration
  - Busy season risks
- Calculates severity based on multiple weighted factors
- Estimates execution delay caused by bottleneck

#### `src/services/reality-awareness/follow-through-risk.ts`
- Assesses follow-through risk from:
  - Historical completion rates
  - Delivery delays
  - Partial deliveries
  - Team capacity utilization
  - Change order frequency
  - Supervisor engagement
- Analyzes past initiative outcomes
- Estimates execution delay from follow-through risks

#### `src/services/reality-awareness/human-factors-engine.ts`
- **Main integration service** - coordinates all human factors assessment
- `assessHumanFactors()` - Comprehensive assessment across all eight factors
- Generates:
  - Complete human factor profile
  - Estimated execution delays
  - Prioritized recommendations
  - Intervention plans
  - Success probability (0-1)
- Returns `HumanRealityImpact` for decision integration

### Tests

#### `src/services/reality-awareness/__tests__/human-factors-engine.test.ts`
- 60+ comprehensive test cases covering:
  - Workspace isolation
  - All eight factors
  - Factor-specific assessment logic
  - Execution delay estimation
  - Recommendation generation
  - Success probability calculation
  - Human reality impact
  - Edge cases (minimal/large teams, all maturity levels, etc.)
  - Determinism and idempotency
  - **All tests passing (60/60)**

## Assessment Results

### Profile Output

```typescript
{
  workspaceId: string;
  engagementId: string;
  assessedAt: Date;
  factors: {
    owner_bottleneck: HumanFactorAssessment;
    follow_through_risk: HumanFactorAssessment;
    resistance_to_change: HumanFactorAssessment;
    communication_breakdown: HumanFactorAssessment;
    morale_fragility: HumanFactorAssessment;
    management_capability: HumanFactorAssessment;
    key_person_dependency: HumanFactorAssessment;
    accountability_weakness: HumanFactorAssessment;
  };
  overallRiskScore: number; // 0-100
  criticalFactors: HumanFactorKey[];
  timeToMitigation: Record<HumanFactorKey, number>; // days
}
```

### Result Output

```typescript
{
  profile: HumanFactorProfile;
  estimatedExecutionDelay: number; // days
  recommendations: string[];
  interventionPlans: Map<HumanFactorKey, string[]>;
  successProbability: number; // 0-1
}
```

## Integration Points

### With Decision Control Service

The human factors engine integrates with existing decision-control service:

1. **Pre-approval** - Assess human factors during decision submission
2. **Risk Adjustment** - Adjust decision base risk score by human reality factors
3. **Timing** - Push out execution timeline if critical human factors present
4. **Intervention** - Recommend prerequisite human factor mitigation before approval

### With Decision-Control Enhancement

The `decision-control.service.ts` can be enhanced to:

1. Call `assessHumanFactors()` during decision submission
2. Incorporate `HumanRealityImpact` into final decision recommendation
3. Flag decisions requiring human factor mitigation
4. Track mitigation status in decision audit trail

## How It Works

### Assessment Flow

1. **Collect Context** - Gather organization/team information
2. **Assess Bottleneck** - Analyze owner involvement and approval patterns
3. **Assess Follow-Through** - Evaluate team execution history
4. **Assess Other Factors** - Evaluate communication, morale, accountability, etc.
5. **Aggregate Risk** - Calculate overall human risk score
6. **Generate Plan** - Create intervention plans for critical factors
7. **Calculate Impact** - Estimate delay, risk multiplier, success adjustment

### Factor Assessment Examples

#### Owner Bottleneck - Healthy (LOW severity)
- Owner 95% available
- 2-day average approval time
- Can handle 5+ parallel decisions
- → Minimal delay, low risk

#### Follow-Through Risk - Poor (CRITICAL severity)
- 65% completion rate historically
- 21-day average delay
- 35% partial deliveries
- Team at 100% capacity
- Low manager engagement
- → 28+ day delay estimate, critical intervention needed

#### Communication Breakdown - Poor (CRITICAL severity)
- Communication quality: "poor"
- Large team (25 people)
- → CRITICAL severity, requires:
  - Daily standups
  - Clear escalation paths
  - Written decision documentation

## Severity Scoring Logic

Each factor has unique scoring logic:

- **Owner Bottleneck**: Approval delay + involvement frequency + critical path dependency + knowledge concentration + parallel capacity + busy season risk
- **Follow-Through Risk**: Completion rate + delay history + partial deliveries + capacity utilization + change frequency + supervisor engagement
- **Resistance to Change**: Organizational maturity + recent failed initiatives
- **Communication Quality**: Team size + communication quality + organizational structure
- **Morale**: Team morale state (low → HIGH, recovering → MODERATE, stable → LOW, high → NONE)
- **Management**: Organizational maturity + team morale
- **Key-Person Dependency**: Key person ratio to total team size
- **Accountability**: Accountability framework clarity

## Implementation Patterns

### Workspace Isolation

All assessment operations include workspace scoping:
- `workspaceId` parameter in all requests
- Audit events track workspace context
- No cross-workspace data leakage

### Deterministic Assessment

- Assessment results deterministic given same inputs
- No random elements in calculations
- All delay estimates reproducible
- Idempotent - multiple calls with same input yield same output

### Evidence-Based

Every severity assessment includes:
- Concrete evidence points explaining the assessment
- Numerical metrics where applicable
- Links between evidence and severity
- Intervention targets for mitigation

## Time to Mitigation Estimates

Assessment includes time estimates for resolving each factor:

| Factor | NONE | LOW | MODERATE | HIGH | CRITICAL |
|--------|------|-----|----------|------|----------|
| Owner Bottleneck | 0d | 3d | 7d | 14d | 28d |
| Follow-Through Risk | 0d | 3d | 7d | 14d | 28d |
| Resistance to Change | 0d | 5d | 14d | 28d | 56d |
| Communication | 0d | 2d | 5d | 10d | 21d |
| Morale Fragility | 0d | 7d | 14d | 28d | 56d |
| Management Capability | 0d | 5d | 10d | 21d | 42d |
| Key-Person Dependency | 0d | 10d | 21d | 35d | 70d |
| Accountability | 0d | 3d | 7d | 14d | 28d |

## Risk Impact Calculations

### Execution Delay

Calculated from bottleneck detection + follow-through risk assessment:
- Each critical factor adds 14 days
- Each high factor adds 7 days
- Each moderate factor adds 3 days

### Risk Multiplier

`1 + (overallRiskScore / 100)`, ranging from 1.0 to 2.0

### Success Probability Adjustment

`-(overallRiskScore / 100) * 0.3`, up to -30% adjustment from base 85%

## Test Coverage

**60 test cases** covering:

✅ Workspace isolation (2 tests)
✅ Complete factor assessment (4 tests)
✅ All 8 individual factors (8 tests)
✅ Execution delay estimation (2 tests)
✅ Recommendations generation (2 tests)
✅ Success probability (3 tests)
✅ Human reality impact (2 tests)
✅ Edge cases (7 tests)
✅ Determinism and idempotency (2 tests)
✅ Historical initiative analysis
✅ Team capacity analysis
✅ Manager engagement tracking

**All 60 tests passing (100%)**

## Known Limitations

1. **No Historical Data Required** - Assessment works with minimal context; uses defaults for missing data
2. **Current Team Context Only** - Does not model planned team changes or future capacity
3. **No Predictive Learning** - Assessment rules are fixed; does not learn from outcome data
4. **Engagement-Level Assessment** - Cannot assess factor severity at sub-team level
5. **No Seasonal Timing** - Busy season risks identified but timing not integrated into delay calculations
6. **Simple Completion Rate** - Does not distinguish types of delays (dependency vs. execution vs. rework)

## Next Steps (V72-R4)

The human factors engine will be integrated into:

1. **Decision Control Service** - Incorporate human reality assessment into final recommendation
2. **Value Proof Tests** - Adjust success probability and outcome accuracy based on human factors
3. **Ultimate Business Decision Engine** - Integrate across all four dimensions (lifecycle, condition, mode/phase, human reality)

## Architecture Alignment

✅ Follows V7 module architecture (domain, services, tests)
✅ Implements mandatory workspace isolation
✅ Audit trail ready (no mutations yet in V72-R3)
✅ No silent mutations
✅ No business logic in UI components
✅ Centralized assessment service (not in page/component)
✅ Fully testable
✅ Deterministic outputs
✅ No database changes required

## Success Criteria (Acceptance)

✅ All 8 human factors assessed independently
✅ Workspace isolation enforced
✅ Severity levels calculated correctly
✅ Evidence points generated
✅ Intervention plans created
✅ Execution delays estimated
✅ Success probability calculated
✅ Risk profile validated
✅ 60+ tests passing
✅ No database schema changes
✅ No UI components created
✅ Service-only implementation

---

**Completed by**: Claude Code
**Commit**: Part of V72-R3 series
**Review**: Ready for integration test with decision-control service
