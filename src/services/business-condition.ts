import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { randomUUID } from "crypto";
import {
  BUSINESS_CONDITION_RATINGS,
  PRESSURE_LEVELS,
  MATURITY_LEVELS,
  type BusinessConditionRating,
  type PressureLevel,
  type MaturityLevel,
} from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateConditionProfileInput {
  engagementId: string;
  workspaceId: string;
  businessStatus: string;
  severityScore: number;
  urgencyLevel: string;
  cashPressureLevel: string;
  marginPressureLevel: string;
  clientConcentrationRisk: string;
  ownerDependencyRisk: string;
  keyPersonDependencyRisk: string;
  processMaturityLevel: string;
  managementMaturityLevel: string;
  executionCapacityLevel: string;
  moralFragilityLevel: string;
  resilienceLevel: string;
  growthReadinessLevel: string;
  notes?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────

function validateConditionInput(input: CreateConditionProfileInput): void {
  if (!BUSINESS_CONDITION_RATINGS.includes(input.businessStatus as BusinessConditionRating)) {
    throw new ValidationError(
      `Invalid businessStatus: ${input.businessStatus}. Must be one of: ${BUSINESS_CONDITION_RATINGS.join(", ")}`
    );
  }

  if (input.severityScore < 1 || input.severityScore > 10) {
    throw new ValidationError("severityScore must be between 1 and 10");
  }

  const pressureFields = [
    "urgencyLevel",
    "cashPressureLevel",
    "marginPressureLevel",
  ] as const;

  for (const field of pressureFields) {
    if (!PRESSURE_LEVELS.includes(input[field] as PressureLevel)) {
      throw new ValidationError(
        `Invalid ${field}: ${input[field]}. Must be one of: ${PRESSURE_LEVELS.join(", ")}`
      );
    }
  }

  const riskFields = [
    "clientConcentrationRisk",
    "ownerDependencyRisk",
    "keyPersonDependencyRisk",
  ] as const;

  for (const field of riskFields) {
    if (!PRESSURE_LEVELS.includes(input[field] as PressureLevel)) {
      throw new ValidationError(
        `Invalid ${field}: ${input[field]}. Must be one of: ${PRESSURE_LEVELS.join(", ")}`
      );
    }
  }

  const maturityFields = [
    "processMaturityLevel",
    "managementMaturityLevel",
    "executionCapacityLevel",
    "moralFragilityLevel",
    "resilienceLevel",
    "growthReadinessLevel",
  ] as const;

  for (const field of maturityFields) {
    if (!MATURITY_LEVELS.includes(input[field] as MaturityLevel)) {
      throw new ValidationError(
        `Invalid ${field}: ${input[field]}. Must be one of: ${MATURITY_LEVELS.join(", ")}`
      );
    }
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function assessCondition(
  input: CreateConditionProfileInput,
  authContext: CanonicalAuthContext
): Promise<{ id: string }> {
  const actorId = authContext.session?.user?.id;
  if (!actorId) {
    throw new ValidationError("User ID is required in auth context");
  }
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: input.workspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (engagement.status === "archived") {
    throw new ValidationError("Cannot assess condition for an archived engagement");
  }

  validateConditionInput(input);

  const idempotencyKey = `condition-assess:${input.engagementId}:${input.businessStatus}:${input.severityScore}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "business_condition.assess",
    async () => {
      // Use transaction to prevent race condition on isCurrent flag
      // Both updateMany and create happen atomically
      const profile = await db.$transaction(async (tx: any) => {
        // Mark previous current profile as non-current
        await tx.businessConditionProfile.updateMany({
          where: { engagementId: input.engagementId, isCurrent: true },
          data: { isCurrent: false },
        });

        // Create new profile as current
        const newProfile = await tx.businessConditionProfile.create({
          data: {
            id: randomUUID(),
            engagementId: input.engagementId,
            businessStatus: input.businessStatus,
            severityScore: input.severityScore,
            urgencyLevel: input.urgencyLevel,
            cashPressureLevel: input.cashPressureLevel,
            marginPressureLevel: input.marginPressureLevel,
            clientConcentrationRisk: input.clientConcentrationRisk,
            ownerDependencyRisk: input.ownerDependencyRisk,
            keyPersonDependencyRisk: input.keyPersonDependencyRisk,
            processMaturityLevel: input.processMaturityLevel,
            managementMaturityLevel: input.managementMaturityLevel,
            executionCapacityLevel: input.executionCapacityLevel,
            moralFragilityLevel: input.moralFragilityLevel,
            resilienceLevel: input.resilienceLevel,
            growthReadinessLevel: input.growthReadinessLevel,
            notes: input.notes ?? null,
            assessedBy: actorId,
            isCurrent: true,
            updatedAt: new Date(),
          },
        });

        return newProfile;
      });

      return {
        id: profile.id,
        businessStatus: profile.businessStatus,
        severityScore: profile.severityScore,
      };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONDITION_ASSESSED,
    actorId,
    entityType: "business_condition_profile",
    entityId: result.result.id,
    workspaceId: engagement.workspaceId,
    payload: {
      engagementId: input.engagementId,
      businessStatus: result.result.businessStatus,
      severityScore: result.result.severityScore,
    },
    visibility: "internal",
  });

  // Trigger V3 re-evaluation — condition assessment is always significant
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "business_condition_profile",
    entityId: result.result.id,
    engagementId: input.engagementId,
    workspaceId: input.workspaceId,
    severity: result.result.severityScore >= 7 ? "high" : "medium",
    description: `Business condition assessed: ${input.businessStatus} (severity ${result.result.severityScore}/10)`,
    triggeredBy: actorId,
  });

  logger.info("Business condition assessed", {
    profileId: result.result.id,
    engagementId: input.engagementId,
    businessStatus: result.result.businessStatus,
    severityScore: result.result.severityScore,
  });

  return { id: result.result.id };
}

export async function getConditionHistory(engagementId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getConditionHistory", "businessConditionProfile");

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.businessConditionProfile.findMany({
    where: { engagementId, engagement: { workspaceId } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCurrentCondition(engagementId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getCurrentCondition", "businessConditionProfile");

  const profile = await db.businessConditionProfile.findFirst({
    where: {
      engagementId,
      isCurrent: true,
      engagement: { workspaceId },
    },
    orderBy: { createdAt: "desc" },
  });

  return profile;
}
