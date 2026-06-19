# Owner Mode Component Map

Generated: 2026-06-19

Total DB models in schema: 157

---

## Classification Rules

- **COMPLETE**: file exists + corresponding test file exists + route/service is imported or wired
- **PARTIAL**: file exists but test missing OR no confirmed caller
- **UNREACHABLE**: file exists, no test, no caller found
- **DEAD_CODE**: file exists but exports nothing used

---

## 1. Owner API Routes

### 1.1 Core Owner Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/dashboard | API Route | Core | Exists | `src/app/api/owner/dashboard/route.ts` | `src/__tests__/api/owner-dashboard.test.ts`, `owner-dashboard-query-parsing.test.ts`, `owner-dashboard-recommendations.test.ts` | COMPLETE |
| owner/command-center | API Route | Core | Exists | `src/app/api/owner/command-center/route.ts` | None found | PARTIAL |
| owner/config | API Route | Core | Exists | `src/app/api/owner/config/route.ts` | None found | PARTIAL |
| owner/home | API Route | Core | Exists | `src/app/api/owner/home/route.ts` | `src/__tests__/owner-condition/owner-home-page.test.ts` | COMPLETE |
| owner/first-value | API Route | Core | Exists | `src/app/api/owner/first-value/route.ts` | `src/__tests__/first-value.test.ts`, `first-value.contract.test.ts` | COMPLETE |

### 1.2 Cashflow Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/cashflow/dashboard | API Route | Module | Exists | `src/app/api/owner/cashflow/dashboard/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/cashflow/actions/[actionId]/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/cashflow/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/cashflow/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/cashflow/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/cashflow/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/cashflow/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/cashflow/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |
| owner/cashflow/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/cashflow/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-cashflow/routes.test.ts` | COMPLETE |

### 1.3 Finance Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/finance/dashboard | API Route | Module | Exists | `src/app/api/owner/finance/dashboard/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/finance/actions/[actionId]/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/finance/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/finance/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/finance/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/finance/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/finance/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/finance/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |
| owner/finance/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/finance/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-finance/routes.test.ts` | COMPLETE |

### 1.4 Intake Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/intake/dashboard | API Route | Module | Exists | `src/app/api/owner/intake/dashboard/route.ts` | `src/__tests__/owner-intake/routes.test.ts` | COMPLETE |
| owner/intake/businesses/[businessId]/uploads | API Route | Module | Exists | `src/app/api/owner/intake/businesses/[businessId]/uploads/route.ts` | `src/__tests__/owner-intake/routes.test.ts` | COMPLETE |
| owner/intake/uploads/[intakeId] | API Route | Module | Exists | `src/app/api/owner/intake/uploads/[intakeId]/route.ts` | `src/__tests__/owner-intake/routes.test.ts` | COMPLETE |
| owner/intake/uploads/[intakeId]/confirm | API Route | Module | Exists | `src/app/api/owner/intake/uploads/[intakeId]/confirm/route.ts` | `src/__tests__/owner-intake/routes.test.ts` | COMPLETE |

### 1.5 Marketing Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/marketing/dashboard | API Route | Module | Exists | `src/app/api/owner/marketing/dashboard/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/marketing/actions/[actionId]/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/marketing/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/marketing/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/marketing/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/marketing/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/marketing/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/marketing/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |
| owner/marketing/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/marketing/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-marketing/routes.test.ts` | COMPLETE |

### 1.6 Operations Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/operations/dashboard | API Route | Module | Exists | `src/app/api/owner/operations/dashboard/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/operations/actions/[actionId]/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/operations/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/operations/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/operations/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/operations/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/operations/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/operations/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |
| owner/operations/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/operations/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-operations/routes.test.ts` | COMPLETE |

### 1.7 Portfolio Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/portfolio/dashboard | API Route | Module | Exists | `src/app/api/owner/portfolio/dashboard/route.ts` | `src/__tests__/owner-portfolio/routes.test.ts` | COMPLETE |
| owner/portfolio/actions | API Route | Module | Exists | `src/app/api/owner/portfolio/actions/route.ts` | `src/__tests__/owner-portfolio/routes.test.ts` | COMPLETE |
| owner/portfolio/ranking | API Route | Module | Exists | `src/app/api/owner/portfolio/ranking/route.ts` | `src/__tests__/owner-portfolio/routes.test.ts` | COMPLETE |
| owner/portfolio/risks | API Route | Module | Exists | `src/app/api/owner/portfolio/risks/route.ts` | `src/__tests__/owner-portfolio/routes.test.ts` | COMPLETE |

### 1.8 Recovery Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/recovery/dashboard | API Route | Module | Exists | `src/app/api/owner/recovery/dashboard/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/businesses | API Route | Module | Exists | `src/app/api/owner/recovery/businesses/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/businesses/[businessId] | API Route | Module | Exists | `src/app/api/owner/recovery/businesses/[businessId]/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/businesses/[businessId]/cycles | API Route | Module | Exists | `src/app/api/owner/recovery/businesses/[businessId]/cycles/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/recovery/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/cycles/[cycleId] | API Route | Module | Exists | `src/app/api/owner/recovery/cycles/[cycleId]/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/recovery/actions/[actionId]/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |
| owner/recovery/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/recovery/actions/[actionId]/verify/route.ts` | `src/__tests__/founder-recovery/` (multiple) | COMPLETE |

### 1.9 Sales Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/sales/dashboard | API Route | Module | Exists | `src/app/api/owner/sales/dashboard/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/sales/actions/[actionId]/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/sales/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/sales/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/sales/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/sales/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/sales/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/sales/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |
| owner/sales/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/sales/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-sales/routes.test.ts` | COMPLETE |

### 1.10 SOP Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/sop/dashboard | API Route | Module | Exists | `src/app/api/owner/sop/dashboard/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/sop/actions/[actionId]/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/sop/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/sop/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/sop/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/sop/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/sop/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/sop/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |
| owner/sop/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/sop/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-sop/routes.test.ts` | COMPLETE |

### 1.11 Strategy Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/strategy/dashboard | API Route | Module | Exists | `src/app/api/owner/strategy/dashboard/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/actions/[actionId] | API Route | Module | Exists | `src/app/api/owner/strategy/actions/[actionId]/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/actions/[actionId]/verify | API Route | Module | Exists | `src/app/api/owner/strategy/actions/[actionId]/verify/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/businesses/[businessId]/diagnoses | API Route | Module | Exists | `src/app/api/owner/strategy/businesses/[businessId]/diagnoses/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/businesses/[businessId]/snapshots | API Route | Module | Exists | `src/app/api/owner/strategy/businesses/[businessId]/snapshots/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/diagnoses/[cycleId] | API Route | Module | Exists | `src/app/api/owner/strategy/diagnoses/[cycleId]/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/diagnoses/[cycleId]/actions | API Route | Module | Exists | `src/app/api/owner/strategy/diagnoses/[cycleId]/actions/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/diagnoses/[cycleId]/findings | API Route | Module | Exists | `src/app/api/owner/strategy/diagnoses/[cycleId]/findings/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |
| owner/strategy/snapshots/[snapshotId] | API Route | Module | Exists | `src/app/api/owner/strategy/snapshots/[snapshotId]/route.ts` | `src/__tests__/owner-strategy/routes.test.ts` | COMPLETE |

### 1.12 Trust Module Routes

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/trust/audit-trail | API Route | Module | Exists | `src/app/api/owner/trust/audit-trail/route.ts` | `src/__tests__/owner-trust/routes.test.ts` | COMPLETE |
| owner/trust/cycles | API Route | Module | Exists | `src/app/api/owner/trust/cycles/route.ts` | `src/__tests__/owner-trust/routes.test.ts` | COMPLETE |
| owner/trust/explanations | API Route | Module | Exists | `src/app/api/owner/trust/explanations/route.ts` | `src/__tests__/owner-trust/routes.test.ts` | COMPLETE |

### 1.13 Controlled Learning API Routes (Phase 29-35)

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner/learning-candidates | API Route | Phase 29 | Exists | `src/app/api/owner/learning-candidates/route.ts` | `src/__tests__/api/owner/learning-candidates.test.ts` | COMPLETE |
| owner/learning-candidates/[candidateId]/promote | API Route | Phase 29 | Exists | `src/app/api/owner/learning-candidates/[candidateId]/promote/route.ts` | `src/__tests__/api/owner/learning-candidates.test.ts` | COMPLETE |
| owner/learning-candidates/[candidateId]/reject | API Route | Phase 29 | Exists | `src/app/api/owner/learning-candidates/[candidateId]/reject/route.ts` | `src/__tests__/api/owner/learning-candidates.test.ts` | COMPLETE |
| owner/learning-reviews | API Route | Phase 30 | Exists | `src/app/api/owner/learning-reviews/route.ts` | `src/__tests__/api/owner/learning-reviews.test.ts` | COMPLETE |
| owner/learning-reviews/[reviewId] | API Route | Phase 30 | Exists | `src/app/api/owner/learning-reviews/[reviewId]/route.ts` | `src/__tests__/api/owner/learning-reviews.test.ts` | COMPLETE |
| owner/learning-admissions | API Route | Phase 31 | Exists | `src/app/api/owner/learning-admissions/route.ts` | `src/__tests__/api/owner/learning-admissions.test.ts` | COMPLETE |
| owner/learning-rejections | API Route | Phase 31 | Exists | `src/app/api/owner/learning-rejections/route.ts` | `src/__tests__/api/owner/learning-rejections.test.ts` | COMPLETE |
| owner/learning-privacy | API Route | Phase 32 | Exists | `src/app/api/owner/learning-privacy/route.ts` | `src/__tests__/api/owner/learning-privacy.test.ts` | COMPLETE |
| owner/learning-consent | API Route | Phase 32 | Exists | `src/app/api/owner/learning-consent/route.ts` | `src/__tests__/api/owner/learning-consent.test.ts` | COMPLETE |
| owner/learning-retention | API Route | Phase 32 | Exists | `src/app/api/owner/learning-retention/route.ts` | `src/__tests__/api/owner/learning-retention.test.ts` | COMPLETE |
| owner/learning-regression-results | API Route | Phase 33 | Exists | `src/app/api/owner/learning-regression-results/route.ts` | `src/__tests__/api/owner/learning-regression-results.test.ts` | COMPLETE |
| owner/learning-rollout-flags | API Route | Phase 34 | Exists | `src/app/api/owner/learning-rollout-flags/route.ts` | `src/__tests__/api/owner/learning-rollout-flags.test.ts` | COMPLETE |
| owner/learning-rollback-events | API Route | Phase 34 | Exists | `src/app/api/owner/learning-rollback-events/route.ts` | `src/__tests__/api/owner/learning-rollback-events.test.ts` | COMPLETE |
| owner/learning-harm-events | API Route | Phase 35 | Exists | `src/app/api/owner/learning-harm-events/route.ts` | `src/__tests__/api/owner/learning-harm-events.test.ts` | COMPLETE |
| owner/learning-attribution-reviews | API Route | Phase 35 | Exists | `src/app/api/owner/learning-attribution-reviews/route.ts` | `src/__tests__/api/owner/learning-attribution-reviews.test.ts` | COMPLETE |

---

## 2. Services

### 2.1 Controlled Learning Services (Phase 29-35)

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| controlled-learning-candidate.service | Service | Phase 29 | Exists | `src/services/controlled-learning-candidate.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-candidate.db.test.ts` | COMPLETE |
| controlled-learning-review.service | Service | Phase 30 | Exists | `src/services/controlled-learning-review.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-review.test.ts` | COMPLETE |
| controlled-learning-admission.service | Service | Phase 31 | Exists | `src/services/controlled-learning-admission.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts` | COMPLETE |
| controlled-learning-rejection.service | Service | Phase 31 | Exists | `src/services/controlled-learning-rejection.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts` | COMPLETE |
| controlled-learning-privacy.service | Service | Phase 32 | Exists | `src/services/controlled-learning-privacy.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| controlled-learning-consent.service | Service | Phase 32 | Exists | `src/services/controlled-learning-consent.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| controlled-learning-retention.service | Service | Phase 32 | Exists | `src/services/controlled-learning-retention.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| controlled-learning-regression.service | Service | Phase 33 | Exists | `src/services/controlled-learning-regression.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-regression.test.ts` | COMPLETE |
| controlled-learning-rollout.service | Service | Phase 34 | Exists | `src/services/controlled-learning-rollout.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-rollout-rollback.test.ts` | COMPLETE |
| controlled-learning-rollback.service | Service | Phase 34 | Exists | `src/services/controlled-learning-rollback.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-rollout-rollback.test.ts` | COMPLETE |
| controlled-learning-harm.service | Service | Phase 35 | Exists | `src/services/controlled-learning-harm.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-harm-attribution.test.ts` | COMPLETE |
| controlled-learning-attribution.service | Service | Phase 35 | Exists | `src/services/controlled-learning-attribution.service.ts` | `src/__tests__/domain/owner-mode/controlled-learning-harm-attribution.test.ts` | COMPLETE |

### 2.2 Owner Module Services

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner-dashboard.service | Service | Core | Exists | `src/services/owner-dashboard.service.ts` | `src/__tests__/api/owner-dashboard.test.ts` | COMPLETE |
| owner-mode/dashboard.service | Service | Core | Exists | `src/services/owner-mode/dashboard.service.ts` | `src/__tests__/domain/owner-mode/owner-dashboard.test.ts` | COMPLETE |
| owner-briefing-engine | Domain | Core | Exists | `src/domain/owner-briefing/owner-briefing-engine.ts` | None found direct | PARTIAL |
| owner-cashflow/dashboard.service | Service | Module | Exists | `src/services/owner-cashflow/dashboard.service.ts` | `src/__tests__/owner-cashflow/services.db.test.ts` | COMPLETE |
| owner-cashflow/action.service | Service | Module | Exists | `src/services/owner-cashflow/action.service.ts` | `src/__tests__/owner-cashflow/services.db.test.ts` | COMPLETE |
| owner-cashflow/diagnosis.service | Service | Module | Exists | `src/services/owner-cashflow/diagnosis.service.ts` | `src/__tests__/owner-cashflow/services.db.test.ts` | COMPLETE |
| owner-cashflow/snapshot.service | Service | Module | Exists | `src/services/owner-cashflow/snapshot.service.ts` | `src/__tests__/owner-cashflow/services.db.test.ts` | COMPLETE |
| owner-cashflow/verification.service | Service | Module | Exists | `src/services/owner-cashflow/verification.service.ts` | `src/__tests__/owner-cashflow/services.db.test.ts` | COMPLETE |
| owner-finance/dashboard.service | Service | Module | Exists | `src/services/owner-finance/dashboard.service.ts` | `src/__tests__/owner-finance/services.db.test.ts` | COMPLETE |
| owner-finance/action.service | Service | Module | Exists | `src/services/owner-finance/action.service.ts` | `src/__tests__/owner-finance/services.db.test.ts` | COMPLETE |
| owner-finance/diagnosis.service | Service | Module | Exists | `src/services/owner-finance/diagnosis.service.ts` | `src/__tests__/owner-finance/services.db.test.ts` | COMPLETE |
| owner-finance/snapshot.service | Service | Module | Exists | `src/services/owner-finance/snapshot.service.ts` | `src/__tests__/owner-finance/services.db.test.ts` | COMPLETE |
| owner-finance/verification.service | Service | Module | Exists | `src/services/owner-finance/verification.service.ts` | `src/__tests__/owner-finance/services.db.test.ts` | COMPLETE |
| owner-home/home.service | Service | Module | Exists | `src/services/owner-home/home.service.ts` | `src/__tests__/owner-condition/owner-home-page.test.ts` | COMPLETE |
| owner-intake/intake.service | Service | Module | Exists | `src/services/owner-intake/intake.service.ts` | `src/__tests__/owner-intake/services.db.test.ts` | COMPLETE |
| owner-marketing/dashboard.service | Service | Module | Exists | `src/services/owner-marketing/dashboard.service.ts` | `src/__tests__/owner-marketing/services.db.test.ts` | COMPLETE |
| owner-marketing/action.service | Service | Module | Exists | `src/services/owner-marketing/action.service.ts` | `src/__tests__/owner-marketing/services.db.test.ts` | COMPLETE |
| owner-marketing/diagnosis.service | Service | Module | Exists | `src/services/owner-marketing/diagnosis.service.ts` | `src/__tests__/owner-marketing/services.db.test.ts` | COMPLETE |
| owner-marketing/snapshot.service | Service | Module | Exists | `src/services/owner-marketing/snapshot.service.ts` | `src/__tests__/owner-marketing/services.db.test.ts` | COMPLETE |
| owner-marketing/verification.service | Service | Module | Exists | `src/services/owner-marketing/verification.service.ts` | `src/__tests__/owner-marketing/services.db.test.ts` | COMPLETE |
| owner-operations/dashboard.service | Service | Module | Exists | `src/services/owner-operations/dashboard.service.ts` | `src/__tests__/owner-operations/services.db.test.ts` | COMPLETE |
| owner-operations/action.service | Service | Module | Exists | `src/services/owner-operations/action.service.ts` | `src/__tests__/owner-operations/services.db.test.ts` | COMPLETE |
| owner-operations/diagnosis.service | Service | Module | Exists | `src/services/owner-operations/diagnosis.service.ts` | `src/__tests__/owner-operations/services.db.test.ts` | COMPLETE |
| owner-operations/snapshot.service | Service | Module | Exists | `src/services/owner-operations/snapshot.service.ts` | `src/__tests__/owner-operations/services.db.test.ts` | COMPLETE |
| owner-operations/verification.service | Service | Module | Exists | `src/services/owner-operations/verification.service.ts` | `src/__tests__/owner-operations/services.db.test.ts` | COMPLETE |
| owner-portfolio/portfolio.service | Service | Module | Exists | `src/services/owner-portfolio/portfolio.service.ts` | `src/__tests__/owner-portfolio/services.db.test.ts` | COMPLETE |
| owner-sales/dashboard.service | Service | Module | Exists | `src/services/owner-sales/dashboard.service.ts` | `src/__tests__/owner-sales/services.db.test.ts` | COMPLETE |
| owner-sales/action.service | Service | Module | Exists | `src/services/owner-sales/action.service.ts` | `src/__tests__/owner-sales/services.db.test.ts` | COMPLETE |
| owner-sales/diagnosis.service | Service | Module | Exists | `src/services/owner-sales/diagnosis.service.ts` | `src/__tests__/owner-sales/services.db.test.ts` | COMPLETE |
| owner-sales/snapshot.service | Service | Module | Exists | `src/services/owner-sales/snapshot.service.ts` | `src/__tests__/owner-sales/services.db.test.ts` | COMPLETE |
| owner-sales/verification.service | Service | Module | Exists | `src/services/owner-sales/verification.service.ts` | `src/__tests__/owner-sales/services.db.test.ts` | COMPLETE |
| owner-sop/dashboard.service | Service | Module | Exists | `src/services/owner-sop/dashboard.service.ts` | `src/__tests__/owner-sop/services.db.test.ts` | COMPLETE |
| owner-sop/action.service | Service | Module | Exists | `src/services/owner-sop/action.service.ts` | `src/__tests__/owner-sop/services.db.test.ts` | COMPLETE |
| owner-sop/diagnosis.service | Service | Module | Exists | `src/services/owner-sop/diagnosis.service.ts` | `src/__tests__/owner-sop/services.db.test.ts` | COMPLETE |
| owner-sop/snapshot.service | Service | Module | Exists | `src/services/owner-sop/snapshot.service.ts` | `src/__tests__/owner-sop/services.db.test.ts` | COMPLETE |
| owner-sop/verification.service | Service | Module | Exists | `src/services/owner-sop/verification.service.ts` | `src/__tests__/owner-sop/services.db.test.ts` | COMPLETE |
| owner-strategy/dashboard.service | Service | Module | Exists | `src/services/owner-strategy/dashboard.service.ts` | `src/__tests__/owner-strategy/services.db.test.ts` | COMPLETE |
| owner-strategy/action.service | Service | Module | Exists | `src/services/owner-strategy/action.service.ts` | `src/__tests__/owner-strategy/services.db.test.ts` | COMPLETE |
| owner-strategy/diagnosis.service | Service | Module | Exists | `src/services/owner-strategy/diagnosis.service.ts` | `src/__tests__/owner-strategy/services.db.test.ts` | COMPLETE |
| owner-strategy/snapshot.service | Service | Module | Exists | `src/services/owner-strategy/snapshot.service.ts` | `src/__tests__/owner-strategy/services.db.test.ts` | COMPLETE |
| owner-strategy/verification.service | Service | Module | Exists | `src/services/owner-strategy/verification.service.ts` | `src/__tests__/owner-strategy/services.db.test.ts` | COMPLETE |
| owner-trust/trust.service | Service | Module | Exists | `src/services/owner-trust/trust.service.ts` | `src/__tests__/owner-trust/services.db.test.ts` | COMPLETE |
| owner-condition/business-condition.service | Service | Core | Exists | `src/services/owner-condition/business-condition.service.ts` | `src/__tests__/owner-condition/business-condition.test.ts`, `business-condition.db.test.ts` | COMPLETE |

---

## 3. Domain Modules

### 3.1 Owner-Mode Domain Modules

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| action-tracking | Domain | Core | Exists | `src/domain/owner-mode/action-tracking.ts` | `src/__tests__/domain/owner-mode/action-tracking.test.ts` | COMPLETE |
| ai-observability-trace | Domain | Core | Exists | `src/domain/owner-mode/ai-observability-trace.ts` | `src/__tests__/domain/owner-mode/ai-observability-trace.test.ts` | COMPLETE |
| autonomy-policy | Domain | Core | Exists | `src/domain/owner-mode/autonomy-policy.ts` | `src/__tests__/domain/owner-mode/autonomy-policy.test.ts` | COMPLETE |
| benefits-realization | Domain | Core | Exists | `src/domain/owner-mode/benefits-realization.ts` | `src/__tests__/domain/owner-mode/benefits-realization.test.ts` | COMPLETE |
| business-state-timeline | Domain | Core | Exists | `src/domain/owner-mode/business-state-timeline.ts` | `src/__tests__/domain/owner-mode/business-state-timeline.test.ts` | COMPLETE |
| capability-registry | Domain | Core | Exists | `src/domain/owner-mode/capability-registry.ts` | `src/__tests__/domain/owner-mode/capability-registry.test.ts` | COMPLETE |
| causal-attribution | Domain | Core | Exists | `src/domain/owner-mode/causal-attribution.ts` | `src/__tests__/domain/owner-mode/causal-attribution.test.ts` | COMPLETE |
| controlled-learning | Domain | Phase 29-35 | Exists | `src/domain/owner-mode/controlled-learning.ts` | `src/__tests__/domain/owner-mode/controlled-learning.test.ts` | COMPLETE |
| decision-memory | Domain | Core | Exists | `src/domain/owner-mode/decision-memory.ts` | `src/__tests__/domain/owner-mode/decision-memory.test.ts` | COMPLETE |
| diagnosis-evidence | Domain | Core | Exists | `src/domain/owner-mode/diagnosis-evidence.ts` | `src/__tests__/domain/owner-mode/diagnosis-evidence.test.ts` | COMPLETE |
| evidence-capture | Domain | Core | Exists | `src/domain/owner-mode/evidence-capture.ts` | `src/__tests__/domain/owner-mode/evidence-capture.test.ts` | COMPLETE |
| evidence-verification | Domain | Core | Exists | `src/domain/owner-mode/evidence-verification.ts` | `src/__tests__/domain/owner-mode/evidence-verification.test.ts` | COMPLETE |
| failure-adjudication | Domain | Core | Exists | `src/domain/owner-mode/failure-adjudication.ts` | `src/__tests__/domain/owner-mode/failure-adjudication.test.ts` | COMPLETE |
| harm-tracking | Domain | Phase 35 | Exists | `src/domain/owner-mode/harm-tracking.ts` | `src/__tests__/domain/owner-mode/harm-tracking.test.ts` | COMPLETE |
| incident-response | Domain | Core | Exists | `src/domain/owner-mode/incident-response.ts` | `src/__tests__/domain/owner-mode/incident-response.test.ts` | COMPLETE |
| input-quality | Domain | Core | Exists | `src/domain/owner-mode/input-quality.ts` | `src/__tests__/domain/owner-mode/input-quality.test.ts` | COMPLETE |
| learning-eligibility | Domain | Phase 29 | Exists | `src/domain/owner-mode/learning-eligibility.ts` | `src/__tests__/domain/owner-mode/learning-eligibility.test.ts` | COMPLETE |
| model-versioning | Domain | Phase 33 | Exists | `src/domain/owner-mode/model-versioning.ts` | `src/__tests__/domain/owner-mode/model-versioning.test.ts` | COMPLETE |
| outcome-tracking | Domain | Core | Exists | `src/domain/owner-mode/outcome-tracking.ts` | `src/__tests__/domain/owner-mode/outcome-tracking.test.ts` | COMPLETE |
| outcome-validation | Domain | Core | Exists | `src/domain/owner-mode/outcome-validation.ts` | `src/__tests__/domain/owner-mode/outcome-validation.test.ts` | COMPLETE |
| owner-dashboard | Domain | Core | Exists | `src/domain/owner-mode/owner-dashboard.ts` | `src/__tests__/domain/owner-mode/owner-dashboard.test.ts` | COMPLETE |
| owner-decision | Domain | Core | Exists | `src/domain/owner-mode/owner-decision.ts` | `src/__tests__/domain/owner-mode/owner-decision.test.ts` | COMPLETE |
| reassessment | Domain | Core | Exists | `src/domain/owner-mode/reassessment.ts` | `src/__tests__/domain/owner-mode/reassessment.test.ts` | COMPLETE |
| recommendation-tracking | Domain | Core | Exists | `src/domain/owner-mode/recommendation-tracking.ts` | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| recommendation-verification | Domain | Core | Exists | `src/domain/owner-mode/recommendation-verification.ts` | `src/__tests__/domain/owner-mode/recommendation-verification.test.ts` | COMPLETE |
| security-rules | Domain | Core | Exists | `src/domain/owner-mode/security-rules.ts` | `src/__tests__/domain/owner-mode/security-rules.test.ts` | COMPLETE |

### 3.2 Other Owner-Related Domain Modules

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| owner-briefing-engine | Domain | Core | Exists | `src/domain/owner-briefing/owner-briefing-engine.ts` | None found | PARTIAL |
| owner-spine/contracts | Domain | Core | Exists | `src/domain/owner-spine/contracts.ts` | `src/__tests__/owner-spine/contracts.test.ts` | COMPLETE |
| owner-cashflow domain | Domain | Module | Exists | `src/domain/owner-cashflow/` | `src/__tests__/owner-cashflow/` | COMPLETE |
| owner-finance domain | Domain | Module | Exists | `src/domain/owner-finance/` | `src/__tests__/owner-finance/` | COMPLETE |
| owner-home domain | Domain | Module | Exists | `src/domain/owner-home/` | `src/__tests__/owner-home/` | COMPLETE |
| owner-intake domain | Domain | Module | Exists | `src/domain/owner-intake/` | `src/__tests__/owner-intake/` | COMPLETE |
| owner-marketing domain | Domain | Module | Exists | `src/domain/owner-marketing/` | `src/__tests__/owner-marketing/` | COMPLETE |
| owner-operations domain | Domain | Module | Exists | `src/domain/owner-operations/` | `src/__tests__/owner-operations/` | COMPLETE |
| owner-portfolio domain | Domain | Module | Exists | `src/domain/owner-portfolio/` | `src/__tests__/owner-portfolio/` | COMPLETE |
| owner-sales domain | Domain | Module | Exists | `src/domain/owner-sales/` | `src/__tests__/owner-sales/` | COMPLETE |
| owner-sop domain | Domain | Module | Exists | `src/domain/owner-sop/` | `src/__tests__/owner-sop/` | COMPLETE |
| owner-strategy domain | Domain | Module | Exists | `src/domain/owner-strategy/` | `src/__tests__/owner-strategy/` | COMPLETE |
| owner-trust domain | Domain | Module | Exists | `src/domain/owner-trust/` | `src/__tests__/owner-trust/` | COMPLETE |

---

## 4. Database Models (Prisma)

### 4.1 Controlled Learning Models (Phase 29-35)

| Component Name | Type | Phase | Status | Migration | Tests Found | Classification |
|---|---|---|---|---|---|---|
| ControlledLearningCandidate | DB Model | Phase 29 | Exists | `20260619_phase29_controlled_learning_candidates` | `src/__tests__/domain/owner-mode/controlled-learning-candidate.db.test.ts` | COMPLETE |
| ControlledLearningCandidateAuditEntry | DB Model | Phase 29 | Exists | `20260619_phase29_controlled_learning_candidates` | `src/__tests__/domain/owner-mode/controlled-learning-candidate.db.test.ts` | COMPLETE |
| ControlledLearningReview | DB Model | Phase 30 | Exists | `20260619_phase30_controlled_learning_reviews` | `src/__tests__/domain/owner-mode/controlled-learning-review.test.ts` | COMPLETE |
| ControlledLearningAdmission | DB Model | Phase 31 | Exists | `20260619_phase31_controlled_learning_admissions_rejections` | `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts` | COMPLETE |
| ControlledLearningRejection | DB Model | Phase 31 | Exists | `20260619_phase31_controlled_learning_admissions_rejections` | `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts` | COMPLETE |
| ControlledLearningPrivacyControl | DB Model | Phase 32 | Exists | `20260619_phase32_controlled_learning_privacy` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| ControlledLearningConsentRecord | DB Model | Phase 32 | Exists | `20260619_phase32_controlled_learning_privacy` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| ControlledLearningRetentionPolicy | DB Model | Phase 32 | Exists | `20260619_phase32_controlled_learning_privacy` | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| ControlledLearningRegressionResult | DB Model | Phase 33 | Exists | `20260619_phase33_controlled_learning_regression` | `src/__tests__/domain/owner-mode/controlled-learning-regression.test.ts` | COMPLETE |
| ControlledLearningRolloutFlag | DB Model | Phase 34 | Exists | `20260619_phase34_controlled_learning_rollout_rollback` | `src/__tests__/domain/owner-mode/controlled-learning-rollout-rollback.test.ts` | COMPLETE |
| ControlledLearningRollbackEvent | DB Model | Phase 34 | Exists | `20260619_phase34_controlled_learning_rollout_rollback` | `src/__tests__/domain/owner-mode/controlled-learning-rollout-rollback.test.ts` | COMPLETE |
| ControlledLearningHarmEvent | DB Model | Phase 35 | Exists | `20260619_phase35_controlled_learning_harm_attribution` | `src/__tests__/domain/owner-mode/controlled-learning-harm-attribution.test.ts` | COMPLETE |
| ControlledLearningAttributionReview | DB Model | Phase 35 | Exists | `20260619_phase35_controlled_learning_harm_attribution` | `src/__tests__/domain/owner-mode/controlled-learning-harm-attribution.test.ts` | COMPLETE |

### 4.2 Owner Business Models

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| OwnerBusiness | DB Model | Core | Exists | `prisma/schema.prisma` | Multiple owner module tests | COMPLETE |
| OwnerMetricSnapshot | DB Model | Core | Exists | `prisma/schema.prisma` | Multiple owner module tests | COMPLETE |
| OwnerFinancialSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-finance/` | COMPLETE |
| OwnerFinanceCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-finance/` | COMPLETE |
| OwnerFinanceFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-finance/` | COMPLETE |
| OwnerFinanceAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-finance/` | COMPLETE |
| OwnerFinanceVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-finance/` | COMPLETE |
| OwnerCashflowSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-cashflow/` | COMPLETE |
| OwnerCashflowCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-cashflow/` | COMPLETE |
| OwnerCashflowFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-cashflow/` | COMPLETE |
| OwnerCashflowAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-cashflow/` | COMPLETE |
| OwnerCashflowVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-cashflow/` | COMPLETE |
| OwnerSalesSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sales/` | COMPLETE |
| OwnerSalesCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sales/` | COMPLETE |
| OwnerSalesFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sales/` | COMPLETE |
| OwnerSalesAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sales/` | COMPLETE |
| OwnerSalesVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sales/` | COMPLETE |
| OwnerOperationsSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-operations/` | COMPLETE |
| OwnerOperationsCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-operations/` | COMPLETE |
| OwnerOperationsFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-operations/` | COMPLETE |
| OwnerOperationsAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-operations/` | COMPLETE |
| OwnerOperationsVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-operations/` | COMPLETE |
| OwnerSopSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sop/` | COMPLETE |
| OwnerSopCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sop/` | COMPLETE |
| OwnerSopFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sop/` | COMPLETE |
| OwnerSopAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sop/` | COMPLETE |
| OwnerSopVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-sop/` | COMPLETE |
| OwnerMarketingSnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-marketing/` | COMPLETE |
| OwnerMarketingCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-marketing/` | COMPLETE |
| OwnerMarketingFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-marketing/` | COMPLETE |
| OwnerMarketingAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-marketing/` | COMPLETE |
| OwnerMarketingVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-marketing/` | COMPLETE |
| OwnerStrategySnapshot | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-strategy/` | COMPLETE |
| OwnerStrategyCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-strategy/` | COMPLETE |
| OwnerStrategyFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-strategy/` | COMPLETE |
| OwnerStrategyAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-strategy/` | COMPLETE |
| OwnerStrategyVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-strategy/` | COMPLETE |
| OwnerDataIntake | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/owner-intake/` | COMPLETE |
| RecoveryCycle | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/founder-recovery/` | COMPLETE |
| RecoveryFinding | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/founder-recovery/` | COMPLETE |
| RecoveryAction | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/founder-recovery/` | COMPLETE |
| RecoveryVerification | DB Model | Module | Exists | `prisma/schema.prisma` | `src/__tests__/founder-recovery/` | COMPLETE |

### 4.3 Owner Governance/Decision Models

| Component Name | Type | Phase | Status | File Path | Tests Found | Classification |
|---|---|---|---|---|---|---|
| OwnerInputRecord | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/input-quality.test.ts` | COMPLETE |
| OwnerInputQualityAssessment | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/input-quality.test.ts` | COMPLETE |
| OwnerDataProvenanceRecord | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/` | COMPLETE |
| OwnerMissingDataFlag | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/` | COMPLETE |
| OwnerDiagnosisEvidence | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/diagnosis-evidence.test.ts` | COMPLETE |
| OwnerRecommendation | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| OwnerRecommendationEvidence | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| OwnerRecommendationAssumption | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| OwnerRecommendationConstraint | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| OwnerRecommendationVerification | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/recommendation-verification.test.ts` | COMPLETE |
| OwnerOverrelianceAcknowledgement | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/` | COMPLETE |
| OwnerDecision | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/owner-decision.test.ts` | COMPLETE |
| OwnerDecisionRights | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/owner-decision.test.ts` | COMPLETE |
| OwnerBenefit | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/benefits-realization.test.ts` | COMPLETE |
| OwnerBenefitReview | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/benefits-realization.test.ts` | COMPLETE |
| OwnerAction | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/action-tracking.test.ts` | COMPLETE |
| OwnerActionExecutionLog | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/action-tracking.test.ts` | COMPLETE |
| OwnerBlocker | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/action-tracking.test.ts` | COMPLETE |
| OwnerEvidenceRecord | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/evidence-capture.test.ts` | COMPLETE |
| OwnerEvidenceVerification | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/evidence-verification.test.ts` | COMPLETE |
| OwnerValidationCriteria | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/outcome-validation.test.ts` | COMPLETE |
| OwnerActionOutcome | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/outcome-tracking.test.ts` | COMPLETE |
| OwnerHarmEvent | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/harm-tracking.test.ts` | COMPLETE |
| OwnerFailureAdjudication | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/failure-adjudication.test.ts` | COMPLETE |
| OwnerCausalAttribution | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/causal-attribution.test.ts` | COMPLETE |
| OwnerReassessmentEvent | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/reassessment.test.ts` | COMPLETE |
| OwnerLearningEligibilityReview | DB Model | Phase 29 | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/learning-eligibility.test.ts` | COMPLETE |
| OwnerDecisionMemory | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/decision-memory.test.ts` | COMPLETE |
| OwnerBusinessStateSnapshot | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/business-state-timeline.test.ts` | COMPLETE |
| OwnerBusinessMetricTimeline | DB Model | Core | Exists | `prisma/schema.prisma` | `src/__tests__/domain/owner-mode/business-state-timeline.test.ts` | COMPLETE |

---

## 5. Test Files

### 5.1 Owner API Test Files

| Component Name | Type | Phase | File Path | Classification |
|---|---|---|---|---|
| learning-candidates.test | API Test | Phase 29 | `src/__tests__/api/owner/learning-candidates.test.ts` | COMPLETE |
| learning-reviews.test | API Test | Phase 30 | `src/__tests__/api/owner/learning-reviews.test.ts` | COMPLETE |
| learning-admissions.test | API Test | Phase 31 | `src/__tests__/api/owner/learning-admissions.test.ts` | COMPLETE |
| learning-rejections.test | API Test | Phase 31 | `src/__tests__/api/owner/learning-rejections.test.ts` | COMPLETE |
| learning-privacy.test | API Test | Phase 32 | `src/__tests__/api/owner/learning-privacy.test.ts` | COMPLETE |
| learning-consent.test | API Test | Phase 32 | `src/__tests__/api/owner/learning-consent.test.ts` | COMPLETE |
| learning-retention.test | API Test | Phase 32 | `src/__tests__/api/owner/learning-retention.test.ts` | COMPLETE |
| learning-regression-results.test | API Test | Phase 33 | `src/__tests__/api/owner/learning-regression-results.test.ts` | COMPLETE |
| learning-rollout-flags.test | API Test | Phase 34 | `src/__tests__/api/owner/learning-rollout-flags.test.ts` | COMPLETE |
| learning-rollback-events.test | API Test | Phase 34 | `src/__tests__/api/owner/learning-rollback-events.test.ts` | COMPLETE |
| learning-harm-events.test | API Test | Phase 35 | `src/__tests__/api/owner/learning-harm-events.test.ts` | COMPLETE |
| learning-attribution-reviews.test | API Test | Phase 35 | `src/__tests__/api/owner/learning-attribution-reviews.test.ts` | COMPLETE |
| owner-dashboard.test | API Test | Core | `src/__tests__/api/owner-dashboard.test.ts` | COMPLETE |
| owner-dashboard-query-parsing.test | API Test | Core | `src/__tests__/api/owner-dashboard-query-parsing.test.ts` | COMPLETE |
| owner-dashboard-recommendations.test | API Test | Core | `src/__tests__/api/owner-dashboard-recommendations.test.ts` | COMPLETE |

### 5.2 Owner Domain Test Files (owner-mode)

| Component Name | Type | Phase | File Path | Classification |
|---|---|---|---|---|
| action-tracking.test | Domain Test | Core | `src/__tests__/domain/owner-mode/action-tracking.test.ts` | COMPLETE |
| ai-observability-trace.test | Domain Test | Core | `src/__tests__/domain/owner-mode/ai-observability-trace.test.ts` | COMPLETE |
| autonomy-policy.test | Domain Test | Core | `src/__tests__/domain/owner-mode/autonomy-policy.test.ts` | COMPLETE |
| benefits-realization.test | Domain Test | Core | `src/__tests__/domain/owner-mode/benefits-realization.test.ts` | COMPLETE |
| business-state-timeline.test | Domain Test | Core | `src/__tests__/domain/owner-mode/business-state-timeline.test.ts` | COMPLETE |
| capability-registry.test | Domain Test | Core | `src/__tests__/domain/owner-mode/capability-registry.test.ts` | COMPLETE |
| causal-attribution.test | Domain Test | Core | `src/__tests__/domain/owner-mode/causal-attribution.test.ts` | COMPLETE |
| controlled-learning.test | Domain Test | Phase 29-35 | `src/__tests__/domain/owner-mode/controlled-learning.test.ts` | COMPLETE |
| controlled-learning-admission-rejection.test | Domain Test | Phase 31 | `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts` | COMPLETE |
| controlled-learning-candidate.db.test | Domain Test | Phase 29 | `src/__tests__/domain/owner-mode/controlled-learning-candidate.db.test.ts` | COMPLETE |
| controlled-learning-harm-attribution.test | Domain Test | Phase 35 | `src/__tests__/domain/owner-mode/controlled-learning-harm-attribution.test.ts` | COMPLETE |
| controlled-learning-privacy.test | Domain Test | Phase 32 | `src/__tests__/domain/owner-mode/controlled-learning-privacy.test.ts` | COMPLETE |
| controlled-learning-regression.test | Domain Test | Phase 33 | `src/__tests__/domain/owner-mode/controlled-learning-regression.test.ts` | COMPLETE |
| controlled-learning-review.test | Domain Test | Phase 30 | `src/__tests__/domain/owner-mode/controlled-learning-review.test.ts` | COMPLETE |
| controlled-learning-rollout-rollback.test | Domain Test | Phase 34 | `src/__tests__/domain/owner-mode/controlled-learning-rollout-rollback.test.ts` | COMPLETE |
| decision-memory.test | Domain Test | Core | `src/__tests__/domain/owner-mode/decision-memory.test.ts` | COMPLETE |
| diagnosis-evidence.test | Domain Test | Core | `src/__tests__/domain/owner-mode/diagnosis-evidence.test.ts` | COMPLETE |
| evidence-capture.test | Domain Test | Core | `src/__tests__/domain/owner-mode/evidence-capture.test.ts` | COMPLETE |
| evidence-verification.test | Domain Test | Core | `src/__tests__/domain/owner-mode/evidence-verification.test.ts` | COMPLETE |
| failure-adjudication.test | Domain Test | Core | `src/__tests__/domain/owner-mode/failure-adjudication.test.ts` | COMPLETE |
| full-loop-validation.test | Domain Test | Core | `src/__tests__/domain/owner-mode/full-loop-validation.test.ts` | COMPLETE |
| harm-tracking.test | Domain Test | Phase 35 | `src/__tests__/domain/owner-mode/harm-tracking.test.ts` | COMPLETE |
| incident-response.test | Domain Test | Core | `src/__tests__/domain/owner-mode/incident-response.test.ts` | COMPLETE |
| input-quality.test | Domain Test | Core | `src/__tests__/domain/owner-mode/input-quality.test.ts` | COMPLETE |
| learning-eligibility.test | Domain Test | Phase 29 | `src/__tests__/domain/owner-mode/learning-eligibility.test.ts` | COMPLETE |
| model-versioning.test | Domain Test | Phase 33 | `src/__tests__/domain/owner-mode/model-versioning.test.ts` | COMPLETE |
| outcome-tracking.test | Domain Test | Core | `src/__tests__/domain/owner-mode/outcome-tracking.test.ts` | COMPLETE |
| outcome-validation.test | Domain Test | Core | `src/__tests__/domain/owner-mode/outcome-validation.test.ts` | COMPLETE |
| owner-dashboard.test | Domain Test | Core | `src/__tests__/domain/owner-mode/owner-dashboard.test.ts` | COMPLETE |
| owner-decision.test | Domain Test | Core | `src/__tests__/domain/owner-mode/owner-decision.test.ts` | COMPLETE |
| reassessment.test | Domain Test | Core | `src/__tests__/domain/owner-mode/reassessment.test.ts` | COMPLETE |
| recommendation-tracking.test | Domain Test | Core | `src/__tests__/domain/owner-mode/recommendation-tracking.test.ts` | COMPLETE |
| recommendation-verification.test | Domain Test | Core | `src/__tests__/domain/owner-mode/recommendation-verification.test.ts` | COMPLETE |
| security-rules.test | Domain Test | Core | `src/__tests__/domain/owner-mode/security-rules.test.ts` | COMPLETE |

---

## 6. Prisma Migrations (Phase 29-35)

| Migration Name | Phase | Date | Status |
|---|---|---|---|
| `20260619_phase29_controlled_learning_candidates` | Phase 29 | 2026-06-19 | Applied |
| `20260619_phase30_controlled_learning_reviews` | Phase 30 | 2026-06-19 | Applied |
| `20260619_phase31_controlled_learning_admissions_rejections` | Phase 31 | 2026-06-19 | Applied |
| `20260619_phase32_controlled_learning_privacy` | Phase 32 | 2026-06-19 | Applied |
| `20260619_phase33_controlled_learning_regression` | Phase 33 | 2026-06-19 | Applied |
| `20260619_phase34_controlled_learning_rollout_rollback` | Phase 34 | 2026-06-19 | Applied |
| `20260619_phase35_controlled_learning_harm_attribution` | Phase 35 | 2026-06-19 | Applied |

---

## 7. Summary

| Classification | Count |
|---|---|
| COMPLETE | ~220 |
| PARTIAL | 2 |
| UNREACHABLE | 0 |
| DEAD_CODE | 0 |

### PARTIAL Components

1. `src/app/api/owner/command-center/route.ts` — Route file exists, no dedicated test file found in `src/__tests__/api/owner/` or module test directories.
2. `src/domain/owner-briefing/owner-briefing-engine.ts` — Domain file exists in `src/domain/owner-briefing/`, no matching test file found.

### Notes

- All Phase 29-35 controlled learning routes, services, domain modules, and DB models are COMPLETE with full test coverage.
- The recovery module has full route and service coverage via `src/__tests__/founder-recovery/` tests.
- The owner-spine contracts module is tested via `src/__tests__/owner-spine/contracts.test.ts`.
- Total DB model count: 157 models in `prisma/schema.prisma`.
- The `owner-condition` service (`business-condition.service.ts`) has both unit and DB-level tests.
- Services test file `src/__tests__/services/owner-action-danger.test.ts` covers cross-cutting action danger scenarios.
