import type { ModuleImplementationPlan } from '../module-readiness/implementation-plan.types';

export const OPSIQ_FOUNDATION_IMPLEMENTATION_PLAN: ModuleImplementationPlan = {
  "moduleKey": "foundation",
  "packNumber": 1,
  "moduleName": "Repo Foundation",
  "objective": "Application shell, shared UI, errors, constants, base repo conventions",
  "dependencies": [],
  "requiredArtifacts": [
    "src/modules/foundation/foundation.service.ts",
    "src/modules/foundation/foundation.repository.ts",
    "src/modules/foundation/foundation.validation.ts",
    "src/modules/foundation/__tests__/foundation.service.test.ts"
  ],
  "recommendedDataModels": [],
  "featureFlags": [
    "OPSIQ_FOUNDATION_ENABLED",
    "OPSIQ_FOUNDATION_READ_ONLY_MODE"
  ],
  "permissionKeys": [
    "foundation:read",
    "foundation:write",
    "foundation:admin"
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

export function getFoundationImplementationPlan(): ModuleImplementationPlan {
  return OPSIQ_FOUNDATION_IMPLEMENTATION_PLAN;
}
