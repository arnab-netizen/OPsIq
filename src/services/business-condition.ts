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
import {
  deriveHardeningContextFromConditionProfile,
  type ConditionProfileLike,
  type ProfileHardeningContext,
} from "@/domain/business-condition/business-condition";

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

  // Count previous profiles to determine if this is initial diagnosis
  const previousProfiles = await db.businessConditionProfile.count({
    where: { engagementId: input.engagementId },
  });

  // Only trigger re-evaluation if this is NOT the first condition assessment
  // Initial diagnosis establishes the baseline and should not re-evaluate
  if (previousProfiles > 1) {
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
  }

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

// ─── Read-only hardening exposure (P2C) ──────────────────────────────────────

/**
 * Read-only pairing of a persisted condition profile with its derived
 * recommendation hardening context.
 */
export interface ConditionHardeningSummary<
  P extends ConditionProfileLike = ConditionProfileLike,
> {
  /** The persisted profile passed in (or null when none is available). */
  profile: P | null;
  /** Deterministic hardening context derived from the profile. */
  hardeningContext: ProfileHardeningContext;
}

/**
 * Pure, deterministic composer: pair a persisted condition profile (or null)
 * with its derived hardening context.
 *
 * No DB access, no route dependency, no workspace lookup, no AI, no side
 * effects, and no mutation of the input. When the profile is absent the
 * hardening context is the caution-preserving default from the adapter, so
 * missing data never reads as confidence.
 */
export function summarizeConditionHardening<P extends ConditionProfileLike>(
  profile: P | null | undefined
): ConditionHardeningSummary<P> {
  return {
    profile: profile ?? null,
    hardeningContext: deriveHardeningContextFromConditionProfile(profile ?? null),
  };
}

/**
 * Read-only service surface: fetch the current persisted condition profile for
 * an engagement and pair it with its derived hardening context.
 *
 * Delegates the DB read and workspace enforcement to the unchanged
 * getCurrentCondition; performs no writes of its own.
 */
export async function getCurrentConditionWithHardening(
  engagementId: string,
  workspaceId: string
) {
  const profile = await getCurrentCondition(engagementId, workspaceId);
  return summarizeConditionHardening(profile);
}
