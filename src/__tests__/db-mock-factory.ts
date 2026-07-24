/**
 * Canonical DB mock factory — Completion Factory (bundle-3.x+)
 *
 * Provides a standardized mock for `@/lib/db` that always includes both
 * `db` (Prisma client mock) and `getDbInstance` (async initializer mock).
 *
 * Usage in tests:
 *   import { createMockDbModule, createPrismaMock } from "@/__tests__/db-mock-factory";
 *   vi.mock("@/lib/db", () => createMockDbModule());
 *
 * Contract:
 *  - createPrismaMock() returns a typed mock with all common Prisma models
 *  - createMockDbModule() returns the full module shape including getDbInstance
 *  - Both are stable across bundles; extend modelMethods() to add new models
 */

import { vi } from "vitest";

const CRUD_METHODS = [
  "findFirst",
  "findUnique",
  "findMany",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
] as const;

function modelMethods() {
  return Object.fromEntries(CRUD_METHODS.map((m) => [m, vi.fn()])) as Record<
    (typeof CRUD_METHODS)[number],
    ReturnType<typeof vi.fn>
  >;
}

const MODELS = [
  "action",
  "aiProposalSandbox",
  "alert",
  "approvalRequest",
  "auditEvent",
  "billingAccount",
  "browserImportSession",
  "businessConditionProfile",
  "businessObjective",
  "businessRiskEntry",
  "canonicalEvent",
  "caseStudy",
  "clientAccount",
  "clientContact",
  "constraintResolutionRecord",
  "controlledLearningCandidate",
  "decisionConfidenceRecord",
  "decisionSnapshot",
  "delegatedTask",
  "deliverable",
  "engagement",
  "engagementMembership",
  "entity",
  "evidence",
  "evidenceBundle",
  "evidenceBundleItem",
  "evidenceItem",
  "explainabilityRecord",
  "externalConnection",
  "externalOAuthToken",
  "externalOpportunitySignal",
  "externalRawRecord",
  "externalSyncJob",
  "fileBlob",
  "financialBaseline",
  "finding",
  "goalArbitrationRecord",
  "idempotencyRecord",
  "interventionState",
  "kpi",
  "kpiOwnershipRecord",
  "kpiSnapshot",
  "leadRecord",
  "operatingMemoryEntry",
  "operatingPolicy",
  "operatorItem",
  "opportunityExecutionTask",
  "opportunityValidationOutcome",
  "overrideRecord",
  "ownerActionOutcome",
  "ownerApprovalMemory",
  "ownerArbitrationOverride",
  "ownerArchetypeMetric",
  "ownerBusiness",
  "ownerCashflowSnapshot",
  "ownerComplianceItem",
  "ownerDataIntake",
  "ownerDoNotRepeatRule",
  "ownerEquipment",
  "ownerFinancialSnapshot",
  "ownerGoal",
  "ownerGoalMilestone",
  "ownerInputRecord",
  "ownerInputQualityAssessment",
  "ownerMetricSnapshot",
  "ownerProcess",
  "ownerReassessmentEvent",
  "ownerSelfEvaluation",
  "ownerSopDocument",
  "ownerStaffSkill",
  "ownerTrainingRecommendation",
  "ownerWorkloadSnapshot",
  "plan",
  "planCapability",
  "processExecutionTask",
  "proof",
  "proofRequirement",
  "recommendation",
  "recommendationBusinessImpact",
  "resource",
  "resourceAllocation",
  "resourcePool",
  "risk",
  "scheduledTask",
  "session",
  "shockEvent",
  "stage",
  "subscription",
  "user",
  "userRoleAssignment",
  "vendorRecord",
  "wasteLeakageEvent",
  "workOrder",
  "workspace",
  "workspaceMembership",
] as const;

export type PrismaMockClient = {
  [K in (typeof MODELS)[number]]: Record<
    (typeof CRUD_METHODS)[number],
    ReturnType<typeof vi.fn>
  >;
} & {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  $connect: ReturnType<typeof vi.fn>;
  $disconnect: ReturnType<typeof vi.fn>;
};

export function createPrismaMock(): PrismaMockClient {
  const client = Object.fromEntries(
    MODELS.map((model) => [model, modelMethods()])
  ) as unknown as PrismaMockClient;

  client.$transaction = vi.fn(
    (callbackOrOps: unknown) => {
      if (typeof callbackOrOps === "function") {
        return callbackOrOps(createPrismaMock());
      }
      // Array of promises
      return Promise.all(callbackOrOps as Promise<unknown>[]);
    }
  );
  client.$queryRaw = vi.fn();
  client.$executeRaw = vi.fn();
  client.$connect = vi.fn().mockResolvedValue(undefined);
  client.$disconnect = vi.fn().mockResolvedValue(undefined);

  return client;
}

/**
 * Returns the full module shape for `vi.mock("@/lib/db", () => createMockDbModule())`.
 * Always includes `getDbInstance` so vitest.setup.ts never hits a missing-export error.
 */
export function createMockDbModule() {
  const mockDb = createPrismaMock();
  return {
    db: mockDb,
    getDbInstance: vi.fn().mockResolvedValue(mockDb),
    default: mockDb,
  };
}

/**
 * Helper: reset all mocks on a previously created PrismaMockClient.
 * Call in beforeEach when you share a mock across tests.
 */
export function resetPrismaMock(mock: PrismaMockClient) {
  for (const model of MODELS) {
    const m = mock[model];
    for (const method of CRUD_METHODS) {
      m[method].mockReset();
    }
  }
  mock.$transaction.mockReset();
  mock.$queryRaw.mockReset();
  mock.$executeRaw.mockReset();
}
