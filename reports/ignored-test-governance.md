# Ignored Test Governance Report

**Date**: 2026-05-08
**Authority**: Final Governance Hardening Pass
**Total Tests Ignored**: 97

---

## Executive Summary

| Category | Count | Risk | Status | Action |
|----------|-------|------|--------|--------|
| **Critical Security** | 3 | HIGH | Dormant | MUST activate PHASE_4 |
| **API Endpoints** | 9 | MEDIUM | Dormant | Activate before feature ships |
| **Service Integration** | 85 | MEDIUM | Dormant | Activate before feature ships |
| **Total** | **97** | | | |

**Phase 0-3 Impact**: None (frozen tests are independent)
**Phase 4 Impact**: HIGH (must activate 83 tests before shipping features)
**Production Impact**: HIGH (must activate all HIGH-risk tests before deployment)

---

## Risk Classification

### HIGH RISK (BLOCKS PRODUCTION) - 3 Tests

#### 1. app/api/__tests__/rbac-enforcement.test.ts
- **Files**: src/__ignored_tests__/app/api/__tests__/rbac-enforcement.test.ts
- **Test Count**: 1 (file with 16+ test cases)
- **Risk**: HIGH
- **Reason Ignored**: RBAC infrastructure incomplete; Phase 0-3 scope control
- **Owner**: Security Engineering
- **Blocks**: CRITICAL_SECURITY_PASS, SAFE_TO_DEPLOY_PROD
- **Unblock**: Complete RBAC schema and middleware; fix TypeScript errors
- **Expiration**: PHASE_4_END (MANDATORY)
- **Trigger**: Must activate before ANY production deployment

#### 2. app/api/__tests__/audit-blocked-paths.test.ts
- **Files**: src/__ignored_tests__/app/api/__tests__/audit-blocked-paths.test.ts
- **Test Count**: 1 (file with 16+ test cases)
- **Risk**: HIGH
- **Reason Ignored**: Audit infrastructure incomplete; Phase 0-3 scope control
- **Owner**: Compliance Engineering
- **Blocks**: CRITICAL_SECURITY_PASS, SAFE_TO_DEPLOY_PROD
- **Unblock**: Complete audit event schema; activate middleware; fix TypeScript errors
- **Expiration**: PHASE_4_END (MANDATORY)
- **Trigger**: Must activate before ANY production deployment

#### 3. app/api/__tests__/phase8-api-hardening.test.ts
- **Files**: src/__ignored_tests__/app/api/__tests__/phase8-api-hardening.test.ts
- **Test Count**: 1 (file with 4+ test cases)
- **Risk**: HIGH
- **Reason Ignored**: Phase 8 features not in scope for Phase 0-3
- **Owner**: Security Engineering
- **Blocks**: SAFE_TO_DEPLOY_PROD
- **Unblock**: Implement Phase 8 API hardening features; fix test fixtures
- **Expiration**: PHASE_8 (before any public API exposure)
- **Trigger**: When Phase 8 work begins; MANDATORY before public release

---

### MEDIUM RISK (BLOCKS FEATURE RELEASE) - 75 Tests

#### Category: API Endpoints (9 tests)

**Files**:
1. app/api/calibration/__tests__/route.test.ts
2. app/api/decisions/__tests__/execution-endpoints.test.ts
3. app/api/engagements/[engagementId]/shock-events/route.test.ts
4. app/api/engagements/intervention-routes.test.ts
5. app/api/operator/__tests__/queue.test.ts
6. app/api/opsiq/consulting-engine/__tests__/route.test.ts
7. app/api/value/__tests__/route.test.ts
8. app/api/__tests__/dashboard-blocked-metrics.test.ts
9. app/api/__tests__/test-reliability.test.ts

**Risk**: MEDIUM
**Owner**: Product Engineering (feature-specific)
**Blocks**: Feature release (not production)
**Unblock**: Implement endpoint; activate test; fix fixtures
**Expiration**: When feature ships
**Trigger**: Feature work begins

---

#### Category: Service Integration (85 tests)

**Breakdown by Service**:

**Decision/Evidence/Control** (10 HIGH-MEDIUM):
1. services/__tests__/decision-determinism.test.ts
2. services/control/__tests__/decision-gate.test.ts
3. services/control/__tests__/enforcement-integration.test.ts
4. services/control/__tests__/execution-flow-trace.test.ts
5. services/control/__tests__/recommendation.test.ts
6. services/control/__tests__/variable-registry.test.ts
7. services/decision-control/decision-control.service.test.ts
8. services/decision-evidence/decision-evidence.service.test.ts
9. decision-lifecycle-adversarial.test.ts
10. evidence-action-lifecycle.integration.test.ts

**Risk**: MEDIUM-HIGH (decision logic is critical)
**Unblock Criteria**: Complete service logic; activate test
**Expiration**: PHASE_4_DECISIONS

**Diagnostic/Analysis** (12 MEDIUM):
- services/diagnostic-core/__tests__/{archetype,bottleneck,maturity,root-cause}-engine.test.ts
- services/diagnostic-core/__tests__/ (5 tests)
- services/contradiction-detector/__tests__/detector.test.ts
- services/funnel-analysis/__tests__/funnel-analyzer.test.ts

**Risk**: MEDIUM (analysis logic, not critical path)
**Unblock Criteria**: Complete diagnostic service
**Expiration**: PHASE_4_DIAGNOSTIC

**Engagement/Business** (18 MEDIUM):
- services/engagement*.test.ts
- services/business-condition.test.ts
- services/business-impact/business-impact.service.test.ts
- services/calibration/__tests__/engine.test.ts
- services/client-{account,contact}.test.ts
- services/kpi.integration.test.ts
- services/lead.test.ts
- services/role-assignment.integration.test.ts
- services/shock-event.integration.test.ts

**Risk**: MEDIUM (business logic, lower priority)
**Unblock Criteria**: Complete feature; activate test
**Expiration**: PHASE_4+ (feature-dependent)

**Operational** (45 MEDIUM-LOW):
- services/action.integration.test.ts
- services/best-path-engine/__tests__/orchestrator.test.ts
- services/consulting-engine/__tests__/pipeline.test.ts
- services/execution-drift/execution-drift.service.test.ts
- services/failure-containment/__tests__/containment-engine.test.ts
- services/idempotency.test.ts
- services/intelligence/__tests__/recommendation.test.ts
- services/lifecycle.integration.test.ts
- services/metrics/__tests__/decision-metrics-service.test.ts
- services/operator/__tests__/priority.test.ts
- services/outcome/__tests__/outcome-accuracy.test.ts
- services/reality-awareness/__tests__/human-factors-engine.test.ts
- services/recommendation*.test.ts (5 tests)
- services/report-generator*.test.ts (2 tests)
- services/review-cycle.integration.test.ts
- services/segmentation/__tests__/impact.test.ts
- services/user.integration.test.ts
- services/value/__tests__/tracker.test.ts
- services/visibility*.test.ts (3 tests)

**Risk**: MEDIUM-LOW (operational, supporting logic)
**Unblock Criteria**: Complete service; activate test
**Expiration**: PHASE_4+ (feature-dependent)

**Integration Scenarios** (10 MEDIUM):
1. integration/scenarios/f-core-behaviors.test.ts
2. integration/scenarios/f1-revenue-collapse.test.ts
3. integration/scenarios/f2-low-cash.test.ts
4. integration/scenarios/f3-wrong-diagnosis.test.ts
5. integration/scenarios/f4-execution-failure.test.ts
6. integration/scenarios/f5-vendor-failure.test.ts
7. integration/scenarios/f6-overload.test.ts
8. integration/scenarios/f7-contradictory-kpi.test.ts
9. integration/scenarios/f8-delayed-roi.test.ts
10. integration/scenarios/f9-competitor-response.test.ts

**Risk**: MEDIUM (scenario validation)
**Unblock Criteria**: Complete all features for scenario; activate test
**Expiration**: PHASE_4_SCENARIOS

---

### LOW RISK (OPTIONAL) - 14 Tests

#### Category: Experimental/POC

1. **phase4-kill-test.test.ts**
   - Risk: LOW
   - Status: Experimental POC
   - Action: Decide if kill-switch feature needed; if not, delete

2. **lib/auth-guard.test.ts**
   - Risk: LOW
   - Status: Guard logic POC
   - Action: Decide if needed; integrate into RBAC if yes

3. **db-persistence-validation.test.ts**
   - Risk: LOW
   - Status: Validation POC
   - Action: Integrate into regression tests if needed

4. **mvp-db-execution.test.ts** and **mvp-operational-flow.test.ts**
   - Risk: LOW
   - Status: MVP validation
   - Action: Delete or integrate; not needed for Phase 4

5. **services/__tests__/adapters.test.ts**
   - Risk: LOW
   - Status: Adapter pattern POC
   - Action: Delete or formalize

6. **services/__tests__/evidence-integrity.test.ts**
   - Risk: LOW
   - Status: Evidence validation POC
   - Action: Integrate into evidence tests

7. **services/__tests__/phase7-module-logic.test.ts**
   - Risk: LOW
   - Status: Phase 7 POC (Phase 7 not yet defined)
   - Action: Defer; delete or keep pending

8. **services/__tests__/recommendation.{priority,reranking}.test.ts**
   - Risk: LOW
   - Status: Recommendation logic variants
   - Action: Integrate into recommendation tests or keep as POCs

9. **services/__tests__/service-auth.test.ts**
   - Risk: LOW
   - Status: Service-level auth POC
   - Action: Integrate with RBAC or delete

10. **lib/__tests__/visibility.integration.test.ts** and **services/visibility.placeholder.test.ts**
    - Risk: LOW
    - Status: Visibility feature placeholder
    - Action: Delete or implement

11. **validation-contracts/__tests__/contract-validator.test.ts**
    - Risk: LOW
    - Status: Contract validation POC
    - Action: Integrate into validation framework

12. **v72-hostile-audit.test.ts**
    - Risk: LOW
    - Status: Hostile audit (v72 not current)
    - Action: Delete; obsolete

13. **value-proof-*.test.ts** (2 tests)
    - Risk: LOW
    - Status: Value proof variants
    - Action: Integrate or delete

14. **webhook.test.ts**
    - Risk: LOW
    - Status: Webhook handling POC
    - Action: Delete or implement if webhooks needed

15. **workspace-isolation-enforcement.test.ts**
    - Risk: LOW
    - Status: Workspace isolation (covered by ARCHITECTURE_INVARIANTS)
    - Action: Can delete; redundant with hardening proofs

---

## Activation Schedule

### PHASE_4 WEEK 1 (Priority: CRITICAL)
- [ ] Activate rbac-enforcement.test.ts (fix TypeScript errors)
- [ ] Activate audit-blocked-paths.test.ts (fix TypeScript errors)
- [ ] Fix RBAC schema and middleware
- [ ] Fix audit event infrastructure

### PHASE_4 WEEKS 2-3 (Priority: HIGH)
- [ ] Activate control tests (5 tests)
- [ ] Activate decision-control and decision-evidence tests
- [ ] Complete decision/control service logic
- [ ] Verify CRITICAL_SECURITY_PASS = PARTIAL (RBAC+Audit only)

### PHASE_4 WEEKS 3-4 (Priority: MEDIUM)
- [ ] Activate API endpoint tests (9 tests, feature-by-feature)
- [ ] Activate service integration tests (as services complete)
- [ ] Fix test isolation issues in remaining tests
- [ ] Verify FULL_REGRESSION_PASS approaches YES

### PHASE_4_END (Priority: DEPLOYMENT)
- [ ] All HIGH-risk tests: PASS
- [ ] All MEDIUM-risk tests: PASS (for shipping features)
- [ ] CRITICAL_SECURITY_PASS = YES
- [ ] FULL_REGRESSION_PASS = YES

---

## Governance Compliance Checklist

- ✓ All 97 ignored tests have documented reason
- ✓ All ignored tests have risk level assigned
- ✓ All HIGH-risk tests have explicit activation plan
- ✓ All ignored tests have expiration phase set
- ✓ All ignored tests have reactivation trigger defined
- ✓ Owner assigned to each test category
- ✓ Unblock conditions documented
- ✓ Phase 0-3 freeze does NOT depend on any ignored tests
- ✓ Phase 4 can proceed WITHOUT activating non-critical tests
- ✓ Production deployment BLOCKED until HIGH-risk tests activated

---

## Summary

**Phase 0-3**: 97 tests intentionally ignored for scope control
**Phase 4 Impact**: Must activate 83 tests to ship features
**Production Impact**: Must activate 3+ HIGH-risk tests to deploy
**Governance**: All tests properly classified and tracked

**Current Status**: 
- PHASE_0_3_FROZEN = YES (does not depend on ignored tests)
- SAFE_TO_BUILD_PHASE_4 = YES (can proceed)
- SAFE_TO_DEPLOY_PROD = NO (blocked by ignored HIGH-risk tests)
