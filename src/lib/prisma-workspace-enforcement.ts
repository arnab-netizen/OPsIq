import { Prisma } from "@/generated/prisma/client";

/**
 * SEC-04 / GAP-TEN-01 — DB-level tenant backstop (corrected).
 *
 * Previously this extension keyed its model set in camelCase while Prisma passes
 * `model` in PascalCase ("Engagement"), so nothing ever matched and the backstop
 * was INERT while still being registered on the client (false confidence). It also
 * listed models that have no direct `workspaceId` column at all.
 *
 * This version is generated from the schema: the set below is every model with a
 * REQUIRED direct `workspaceId` column (PascalCase, matching Prisma's `model`
 * argument). The 3 models with a *nullable* workspaceId — AuditEvent,
 * RecommendationLegacy, BehavioralLearningArtifact — are intentionally EXCLUDED so
 * that audit-event append/cleanup (which legitimately writes tenant-less rows) is
 * not broken. Global/system models are not workspace-owned and are never checked.
 *
 * SCOPE (documented downgrade — see docs/remediation/.../TENANT_MODEL_CLASSIFICATION.md):
 * Prisma cannot express a `workspaceId` filter in a single `update`/`delete` whose
 * `where` is a bare unique id, and legitimate bulk writes are frequently scoped by
 * an INDIRECT key (engagementId, businessId, clientId). So this backstop enforces
 * only the invariants that are both SAFE (no false positives on legitimate code) and
 * HIGH-VALUE against accidental cross-tenant damage:
 *   1. create / createMany MUST include a workspaceId in the row data.
 *   2. updateMany / deleteMany MUST carry a non-empty WHERE (never an all-tenant wipe).
 *   3. update / delete / read scoping for workspace-owned models is enforced at the
 *      SERVICE layer (e.g. src/services/operator/store.ts requires workspaceId; route
 *      guards withCanonicalEnforcement + assertEngagementAccess + enforceWorkspaceScoping).
 * The extension is no longer inert: (1) and (2) actually execute and throw.
 */
export const WORKSPACE_OWNED_MODELS: ReadonlySet<string> = new Set<string>([
  "AIProposalSandbox", "AggregateLock", "ApprovalRequest", "BillingAccount", "BrowserImportConsent", "BrowserImportSession", "BudgetAuthority",
  "BudgetLine", "BudgetPeriod", "BudgetPlanSnapshot", "BudgetReassessment", "BusinessConditionProfile", "CanonicalEvent",
  "ControlledLearningAdmission", "ControlledLearningAttributionReview", "ControlledLearningCandidate", "ControlledLearningCandidateAuditEntry", "ControlledLearningConsentRecord", "ControlledLearningHarmEvent",
  "ControlledLearningPrivacyControl", "ControlledLearningRegressionResult", "ControlledLearningRejection", "ControlledLearningRetentionPolicy", "ControlledLearningReview", "ControlledLearningRollbackEvent",
  "ControlledLearningRolloutFlag", "DelegatedTask", "Engagement", "Escalation", "ExternalConnection", "ExternalConnectionConsent",
  "ExternalDataLineage", "ExternalImportTemplate", "ExternalRawRecord", "FactReviewAction", "FundedInitiativeOutcome", "OperatorItem",
  "OverrideRecord", "OwnerActionOutcome", "OwnerApprovalMemory", "OwnerArchetypeMetric", "OwnerAttentionEvent", "OwnerBudgetAction", "OwnerBudgetOverride",
  "OwnerBusiness", "QboOAuthState", "QboConnection", "QboConnectionToken", "OwnerCapacitySnapshot", "OwnerCashflowAction", "OwnerCashflowCycle", "OwnerCashflowFinding", "OwnerCashflowSnapshot",
  "OwnerCashflowVerification", "OwnerComplianceItem", "OwnerDataIntake", "OwnerDecisionRecord", "OwnerDoNotRepeatRule", "OwnerEmployeeWorkloadSnapshot", "OwnerEquipment",
  "OwnerFinanceAction", "OwnerFinanceCycle", "OwnerFinanceFinding", "OwnerFinanceVerification", "OwnerFinancialSnapshot", "OwnerGuidanceSnapshot",
  "OwnerInputQualityAssessment", "OwnerInputRecord", "OwnerMarketingAction", "OwnerMarketingCycle", "OwnerMarketingFinding", "OwnerMarketingSnapshot",
  "OwnerMarketingVerification", "OwnerMetricSnapshot", "OwnerOperationsAction", "OwnerOperationsCycle", "OwnerOperationsFinding", "OwnerOperationsSnapshot",
  "OwnerOperationsVerification", "OwnerOutcomeAssessment", "OwnerProcess", "OwnerReassessmentEvent", "OwnerSalesAction", "OwnerSalesCycle", "OwnerSalesFinding",
  "OwnerSalesSnapshot", "OwnerSalesVerification", "OwnerSelfEvaluation", "OwnerServiceEconomics", "OwnerSopAction", "OwnerSopCycle",
  "OwnerSopDocument", "OwnerSopFinding", "OwnerSopSnapshot", "OwnerSopVerification", "OwnerStaffSkill", "OwnerStandingInstruction",
  "OwnerStrategyAction", "OwnerStrategyCycle", "OwnerStrategyFinding", "OwnerStrategySnapshot", "OwnerStrategyVerification", "OwnerSupplierInventorySnapshot",
  "OwnerTrainingRecommendation", "OwnerWorkingCapitalItem", "OwnerWorkloadSnapshot", "PrivateModeAccess", "Proof", "ProofRequirement",
  "Recommendation", "RecommendationBusinessImpact", "RecommendationExpiryPolicy", "RecoveryAction", "RecoveryCycle", "RecoveryFinding",
  "RecoveryVerification", "SnapshotData", "SpendEntry", "TaskStatusHistory", "ThresholdConfig", "UsageEvent",
  "VendorRecord", "WorkOrder", "WorkspaceMembership",
]);

function whereHasAnyConstraint(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  return Object.keys(where as Record<string, unknown>).length > 0;
}

function createDataHasWorkspaceId(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const rows = Array.isArray(data) ? data : [data];
  return rows.every(
    (row) =>
      row &&
      typeof row === "object" &&
      "workspaceId" in (row as Record<string, unknown>) &&
      Boolean((row as Record<string, unknown>).workspaceId)
  );
}

/**
 * Build the workspace-isolation backstop Prisma client extension.
 * Fails closed on the two compatible, high-value invariants; passes everything
 * else through to be enforced at the service layer.
 */
export function createWorkspaceEnforcementMiddleware() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // `model` is PascalCase (e.g. "OperatorItem"). Match the set directly.
            if (!WORKSPACE_OWNED_MODELS.has(model as string)) {
              return query(args);
            }

            const a = args as { data?: unknown; where?: unknown };

            // Invariant 1: no unscoped INSERT of a workspace-owned row.
            if (operation === "create" || operation === "createMany") {
              if (!createDataHasWorkspaceId(a.data)) {
                throw new Error(
                  `WORKSPACE ISOLATION VIOLATION: ${operation} on ${model} requires workspaceId in data`
                );
              }
            }

            // Invariant 2: no all-tenant bulk mutation (empty/absent WHERE).
            if (operation === "updateMany" || operation === "deleteMany") {
              if (!whereHasAnyConstraint(a.where)) {
                throw new Error(
                  `WORKSPACE ISOLATION VIOLATION: ${operation} on ${model} requires a non-empty WHERE ` +
                  `(refusing an all-tenant bulk mutation)`
                );
              }
            }

            return query(args);
          },
        },
      },
    })
  );
}
