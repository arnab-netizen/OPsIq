import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { withIdempotency } from "@/infra/idempotency";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
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
  moraleFragilityLevel: string;
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
    "moraleFragilityLevel",
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
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (engagement.status === "archived") {
    throw new ValidationError("Cannot assess condition for an archived engagement");
  }

  validateConditionInput(input);

  const idempotencyKey = `condition-assess:${input.engagementId}:${JSON.stringify(input)}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "business_condition.assess",
    async () => {
      // Mark previous current profile as non-current
      await db.businessConditionProfile.updateMany({
        where: { engagementId: input.engagementId, isCurrent: true },
        data: { isCurrent: false },
      });

      const profile = await db.businessConditionProfile.create({
        data: {
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
          moraleFragilityLevel: input.moraleFragilityLevel,
          resilienceLevel: input.resilienceLevel,
          growthReadinessLevel: input.growthReadinessLevel,
          notes: input.notes ?? null,
          assessedBy: actorId,
          isCurrent: true,
        },
      });

      return { id: profile.id, severityScore: profile.severityScore };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONDITION_ASSESSED,
    actorId,
    entityType: "business_condition_profile",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      businessStatus: input.businessStatus,
      severityScore: input.severityScore,
    },
    visibility: "internal",
  });

  // Trigger V3 re-evaluation — condition assessment is always significant
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "business_condition_profile",
    entityId: result.result.id,
    engagementId: input.engagementId,
    severity: result.result.severityScore >= 7 ? "high" : "medium",
    description: `Business condition assessed: ${input.businessStatus} (severity ${result.result.severityScore}/10)`,
    triggeredBy: actorId,
  });

  logger.info("Business condition assessed", {
    profileId: result.result.id,
    engagementId: input.engagementId,
    businessStatus: input.businessStatus,
    severityScore: input.severityScore,
  });

  return { id: result.result.id };
}

export async function getConditionHistory(engagementId: string) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.businessConditionProfile.findMany({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCurrentCondition(engagementId: string) {
  const profile = await db.businessConditionProfile.findFirst({
    where: { engagementId, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });

  return profile;
}
