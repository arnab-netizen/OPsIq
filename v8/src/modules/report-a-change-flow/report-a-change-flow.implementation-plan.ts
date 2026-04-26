import type { ModuleImplementationPlan } from '../module-readiness/implementation-plan.types';

export const OPSIQ_REPORT_A_CHANGE_FLOW_IMPLEMENTATION_PLAN: ModuleImplementationPlan = {
  "moduleKey": "report-a-change-flow",
  "packNumber": 17,
  "moduleName": "Report-a-Change Flow",
  "objective": "Low-friction event reporting and impact preview",
  "dependencies": [
    "business-state-engine",
    "action-orchestration-engine",
    "audit-log-transparency-center"
  ],
  "requiredArtifacts": [
    "src/modules/report-a-change-flow/report-a-change-flow.service.ts",
    "src/modules/report-a-change-flow/report-a-change-flow.repository.ts",
    "src/modules/report-a-change-flow/report-a-change-flow.validation.ts",
    "src/modules/report-a-change-flow/__tests__/report-a-change-flow.service.test.ts",
    "app/api/v1/report/a/change/flow/route.ts"
  ],
  "recommendedDataModels": [],
  "featureFlags": [
    "OPSIQ_REPORT_A_CHANGE_FLOW_ENABLED",
    "OPSIQ_REPORT_A_CHANGE_FLOW_READ_ONLY_MODE"
  ],
  "permissionKeys": [
    "report_a_change_flow:read",
    "report_a_change_flow:write",
    "report_a_change_flow:admin"
  ],
  "enterpriseGates": [
    "Tenant scoping cannot be optional.",
    "RBAC/policy gate must be executed before state mutation or sensitive read.",
    "All public API output must use the standard response envelope.",
    "Every state mutation must produce an audit event or explicit no-audit rationale.",
    "All persistence changes require migration review and rollback notes.",
    "Tests must cover success, unauthorized, invalid input, and tenant-isolation cases."
  ],
  "implementationPhases": [
    "contract_present",
    "schema_designed",
    "repository_implemented",
    "service_implemented",
    "routes_wired",
    "tests_green",
    "production_enabled"
  ],
  "runtimeExposure": "none"
} as const;

export function getReportAChangeFlowImplementationPlan(): ModuleImplementationPlan {
  return OPSIQ_REPORT_A_CHANGE_FLOW_IMPLEMENTATION_PLAN;
}
