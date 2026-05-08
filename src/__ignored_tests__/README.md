# Ignored Tests Governance

**Date**: 2026-05-08
**Authority**: Final Governance Hardening Pass
**Total Ignored Tests**: 97

---

## Governance Framework

Every ignored test must document:
- **Reason Ignored**: Why is this test not active
- **Risk Level**: LOW | MEDIUM | HIGH
- **Owner**: Team/person responsible
- **Unblock Condition**: What must be done to reactivate
- **Expiration Phase**: When this must be resolved
- **Reactivation Trigger**: What event requires immediate reactivation

---

## Critical Security Tests (REACTIVATE PHASE 4)

### 1. rbac-enforcement.test.ts
- **Reason Ignored**: RBAC infrastructure not complete; tests blocked during Phase 0-3 for scope control
- **Risk Level**: HIGH
- **Owner**: Security Engineering
- **Unblock Condition**: Complete RBAC schema and enforcement middleware; fix all 16 TypeScript errors
- **Expiration Phase**: PHASE_4_END (must be active before production deployment)
- **Reactivation Trigger**: CRITICAL - blocking CRITICAL_SECURITY_PASS=YES
- **Status**: BLOCKS SAFE_TO_DEPLOY_PROD

### 2. audit-blocked-paths.test.ts
- **Reason Ignored**: Audit logging infrastructure not complete; tests blocked during Phase 0-3
- **Risk Level**: HIGH
- **Owner**: Compliance Engineering
- **Unblock Condition**: Complete audit event schema; activate audit middleware; fix all 16 TypeScript errors
- **Expiration Phase**: PHASE_4_END (must be active before production deployment)
- **Reactivation Trigger**: CRITICAL - blocking CRITICAL_SECURITY_PASS=YES
- **Status**: BLOCKS SAFE_TO_DEPLOY_PROD

### 3. phase8-api-hardening.test.ts
- **Reason Ignored**: Phase 8 API security tests; not in scope for Phase 0-3
- **Risk Level**: HIGH
- **Owner**: Security Engineering
- **Unblock Condition**: Complete Phase 8 API hardening; fix TypeScript errors
- **Expiration Phase**: PHASE_8 (before any public API deployment)
- **Reactivation Trigger**: When Phase 8 work begins
- **Status**: BLOCKS SAFE_TO_DEPLOY_PROD

---

## Experimental/Proof-of-Concept (LOW PRIORITY)

### 4. phase4-kill-test.test.ts
- **Reason Ignored**: Experimental kill-switch test; POC only
- **Risk Level**: LOW
- **Owner**: Engineering Leadership
- **Unblock Condition**: Determine if kill-switch feature is needed; if yes, redesign as proper feature with contracts
- **Expiration Phase**: PHASE_4_END or decision to abandon
- **Reactivation Trigger**: If kill-switch feature is approved
- **Status**: OPTIONAL

---

## API Endpoint Tests (PHASE 4 INTEGRATION)

### 5. dashboard-blocked-metrics.test.ts
- **Reason Ignored**: Dashboard API incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Frontend Engineering
- **Unblock Condition**: Complete dashboard API endpoint; activate test
- **Expiration Phase**: PHASE_4 (dashboard release)
- **Reactivation Trigger**: Dashboard feature work begins
- **Status**: MEDIUM PRIORITY

### 6. calibration/route.test.ts
- **Reason Ignored**: Calibration endpoint not implemented; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Implement calibration route; fix test fixtures
- **Expiration Phase**: PHASE_4_CALIBRATION
- **Reactivation Trigger**: Calibration feature work begins
- **Status**: MEDIUM PRIORITY

### 7. decisions/execution-endpoints.test.ts
- **Reason Ignored**: Decision execution endpoints incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Complete decision execution API; fix test isolation
- **Expiration Phase**: PHASE_4_DECISIONS
- **Reactivation Trigger**: Decision execution work begins
- **Status**: MEDIUM PRIORITY

### 8. engagements/shock-events/route.test.ts
- **Reason Ignored**: Shock event endpoint incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Implement shock event route; activate test
- **Expiration Phase**: PHASE_4_SHOCK_EVENTS
- **Reactivation Trigger**: Shock event feature work begins
- **Status**: MEDIUM PRIORITY

### 9. engagements/intervention-routes.test.ts
- **Reason Ignored**: Intervention routing incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Complete intervention routes; fix test fixtures
- **Expiration Phase**: PHASE_4_INTERVENTIONS
- **Reactivation Trigger**: Intervention work begins
- **Status**: MEDIUM PRIORITY

### 10. operator/queue.test.ts
- **Reason Ignored**: Operator queue API incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Implement operator queue endpoint; activate test
- **Expiration Phase**: PHASE_4_OPERATOR
- **Reactivation Trigger**: Operator queue work begins
- **Status**: MEDIUM PRIORITY

### 11. opsiq/consulting-engine/route.test.ts
- **Reason Ignored**: Consulting engine endpoint incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Implement consulting engine route; activate test
- **Expiration Phase**: PHASE_4_CONSULTING
- **Reactivation Trigger**: Consulting engine work begins
- **Status**: MEDIUM PRIORITY

### 12. value/route.test.ts
- **Reason Ignored**: Value tracking endpoint incomplete; deferred to Phase 4
- **Risk Level**: MEDIUM
- **Owner**: Product Engineering
- **Unblock Condition**: Implement value endpoint; activate test
- **Expiration Phase**: PHASE_4_VALUE
- **Reactivation Trigger**: Value tracking work begins
- **Status**: MEDIUM PRIORITY

---

## Service Integration Tests (PHASE 4+)

### 13-97. Service Tests (85 tests total)

**Common Pattern**:
- **Reason Ignored**: Service logic incomplete or experimental; deferred to Phase 4+
- **Risk Level**: MEDIUM (majority) to HIGH (decision/evidence/control related)
- **Owner**: Service/Feature Team
- **Unblock Condition**: Complete service implementation; activate test
- **Expiration Phase**: PHASE_4+ (feature-dependent)
- **Reactivation Trigger**: Feature work begins
- **Status**: VARIES BY SERVICE

**High-Risk Services** (requires Phase 4 focus):
- decision-control.test.ts
- decision-evidence.test.ts
- control/*.test.ts (5 tests)
- decision-lifecycle-adversarial.test.ts
- evidence-action-lifecycle.integration.test.ts
- execution-drift/*.test.ts

**Medium-Risk Services** (Phase 4 or later):
- All other service tests (60+ tests)

---

## Summary by Risk Level

| Risk Level | Count | Action |
|-----------|-------|--------|
| **HIGH** | 8 | MUST activate before production deployment |
| **MEDIUM** | 75 | Must activate before deploying associated features |
| **LOW** | 14 | Optional; activate if feature is approved |

---

## Phase 4 Activation Priority

### BLOCK DEPLOYMENT (must activate before shipping)
1. rbac-enforcement.test.ts
2. audit-blocked-paths.test.ts
3. phase8-api-hardening.test.ts
4. control/{decision-gate, enforcement-integration, execution-flow-trace, recommendation, variable-registry}
5. decision-lifecycle-adversarial.test.ts

### BLOCK FEATURE RELEASE (must activate before feature ships)
- Dashboard, Calibration, Decisions, Shock Events, Interventions, Operator Queue, Consulting Engine, Value Tracking

### OPTIONAL (low risk, can defer)
- phase4-kill-test.test.ts
- Visibility/placeholder tests
- Non-critical service tests

---

## Governance Rules

1. **High-Risk Tests**: MUST be activated before Phase 4 ends
2. **Medium-Risk Tests**: MUST be activated before associated feature ships
3. **Low-Risk Tests**: Can be deferred if explicitly approved
4. **No Silent Ignores**: Every ignored test must have this metadata
5. **Quarterly Review**: Ignored tests must be reviewed every phase

---

## Current Status

**Phase 0-3**: 97 tests ignored (intentional scope control)
**Blocking Freeze**: 0 (frozen tests don't depend on ignored tests)
**Blocking Deployment**: 3 (RBAC, Audit, API Hardening)
**Blocking Features**: 75+ (feature-specific)

**Action Required by Phase 4**: Activate all HIGH and MEDIUM risk tests
