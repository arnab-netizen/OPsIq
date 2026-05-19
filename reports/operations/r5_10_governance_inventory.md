# R5.10: Platform UX Governance Inventory

**Date**: 2026-05-19  
**Objective**: Convert manual patching → systemic governance  
**Approach**: Centralize patterns, enforce globally

---

## ERROR RENDERING PATTERNS

### Pattern 1: Raw Error Display (UNSAFE)
**Current**: `setError(err instanceof Error ? err.message : "Error")`  
**Locations**: 70+ across codebase  
**Operator exposure**: HIGH  
**Technical leakage**: SEVERE (Prisma, DB, UUIDs)  
**Governance solution**: `<GovError error={err} context="decision" />`

### Pattern 2: Toast Notifications
**Current**: Direct error message to toast  
**Locations**: 40+  
**Operator exposure**: HIGH  
**Technical leakage**: MODERATE  
**Governance solution**: `useOperatorError()` hook

### Pattern 3: Error Boundaries
**Current**: Generic error pages  
**Locations**: 5-10  
**Operator exposure**: HIGH  
**Technical leakage**: SEVERE  
**Governance solution**: `<OperatorErrorBoundary />`

---

## MUTATION PATTERNS

### Pattern 1: Form Submission
**Current**: Manual try-catch, no loading state feedback  
**Locations**: 30+  
**Operator exposure**: HIGH  
**Leakage risk**: MODERATE  
**Governance solution**: `useOperatorMutation()`

### Pattern 2: Action Buttons
**Current**: Click handler, no safety checks  
**Locations**: 25+  
**Operator exposure**: HIGH  
**Leakage risk**: HIGH (duplicate-submit panic)  
**Governance solution**: `<GovMutationButton />`

### Pattern 3: Optimistic Updates
**Current**: Manual state updates  
**Locations**: 15+  
**Operator exposure**: MEDIUM  
**Leakage risk**: MODERATE  
**Governance solution**: `useOperatorOptimisticMutation()`

---

## METRIC RENDERING PATTERNS

### Pattern 1: Raw Metric Display
**Current**: `<div>{confidence}%</div>`  
**Locations**: 50+  
**Operator exposure**: HIGH  
**Clarity gap**: SEVERE (no explanation)  
**Governance solution**: `<GovMetric name="confidence" value={val} />`

### Pattern 2: Metric Cards
**Current**: Manual card layout with metrics  
**Locations**: 15+  
**Operator exposure**: HIGH  
**Clarity gap**: SEVERE  
**Governance solution**: `<GovMetricCard metric={metric} />`

### Pattern 3: Metric Lists
**Current**: Table/list of metrics  
**Locations**: 10+  
**Operator exposure**: MEDIUM  
**Clarity gap**: MODERATE  
**Governance solution**: `<GovMetricList metrics={metrics} />`

---

## EMPTY STATE PATTERNS

### Pattern 1: Blank Page
**Current**: "No data" or nothing  
**Locations**: 20+  
**Operator exposure**: HIGH  
**Guidance gap**: SEVERE  
**Governance solution**: `<GovEmptyState reason="no_actions" />`

### Pattern 2: Spinner Only
**Current**: Loading spinner with no context  
**Locations**: 15+  
**Operator exposure**: MEDIUM  
**Guidance gap**: MODERATE  
**Governance solution**: `<GovLoading context="loading_engagements" />`

### Pattern 3: Error + Retry
**Current**: Manual error display + retry button  
**Locations**: 10+  
**Operator exposure**: MEDIUM  
**Guidance gap**: MODERATE  
**Governance solution**: `<GovErrorRetry error={err} />`

---

## RETRY + RECOVERY PATTERNS

### Pattern 1: Network Timeout
**Current**: Generic error, unclear if safe to retry  
**Locations**: 40+  
**Operator exposure**: HIGH  
**Panic risk**: HIGH  
**Governance solution**: Automatic in `useOperatorMutation()`

### Pattern 2: Duplicate Submit
**Current**: No client-side prevention  
**Locations**: 30+  
**Operator exposure**: HIGH  
**Panic risk**: HIGH  
**Governance solution**: Built into `useOperatorMutation()`

### Pattern 3: Session Expiration
**Current**: Manual refresh + re-auth  
**Locations**: 5-10  
**Operator exposure**: MEDIUM  
**Panic risk**: MEDIUM  
**Governance solution**: `useOperatorSession()` middleware

---

## GOVERNANCE INVESTMENT ROI

| Pattern | Locations | Manual Fixes | Gov Component | ROI |
|---------|-----------|--------------|---------------|-----|
| Raw errors | 70 | 70 hours | 2 hours | 35x |
| Mutations | 55 | 15 hours | 3 hours | 5x |
| Metrics | 75 | 10 hours | 2 hours | 5x |
| Empty states | 35 | 8 hours | 1 hour | 8x |
| **Total** | **235** | **103 hours** | **8 hours** | **13x** |

**By building governance first, reduce manual work by 13x**

---

## IMPLEMENTATION SEQUENCE

### Quick Win (High ROI)
1. Error governance (`useOperatorError`, `renderOperatorError`)
   - Fixes 70 locations with 1 component
   - 35x ROI

2. Mutation governance (`useOperatorMutation`)
   - Fixes 55 locations with 1 hook
   - 5x ROI

### Medium Win
3. Metric governance (`GovMetric`, `metric-registry.ts`)
   - Fixes 75 locations with 1 component
   - 5x ROI

### Final Push
4. Empty state governance (`GovEmptyState`)
   - Fixes 35 locations with 1 component
   - 8x ROI

5. Session governance (`useOperatorSession`)
   - Covers auth/session recovery
   - 2x ROI

---

**Total**: 8 hours of governance work = 103 hours of manual fixing prevented

