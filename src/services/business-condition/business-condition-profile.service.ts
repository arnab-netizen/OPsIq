/**
 * B12-S2, S3, S4: Business Condition Profile DB Service
 *
 * S2: Persistence with version increment, isCurrent flag management, idempotency
 * S3: Workspace isolation queries
 * S4: Audit event emission on transitions
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { randomUUID } from "crypto";
import type { BusinessConditionProfileAssessment, ConditionTransition } from "../../domain/business-facts/business-condition-profile";

interface CreateProfileInput {
  engagement_id: string;
  workspace_id: string;
  assessment: BusinessConditionProfileAssessment;
  diagnosis_id?: string;
  assessed_by_user_id?: string;
}

interface UpdateProfileInput {
  profile_id: string;
  workspace_id: string;
  assessment: BusinessConditionProfileAssessment;
  diagnosis_id?: string;
  transition?: ConditionTransition;
}

/**
 * B12-S2: Create new business condition profile.
 * Enforces workspace isolation. Returns persisted profile.
 */
export async function createBusinessConditionProfile(
  prisma: PrismaClient,
  input: CreateProfileInput,
  userId?: string,
): Promise<any> {
  const { engagement_id, workspace_id, assessment, diagnosis_id, assessed_by_user_id } = input;

  // Verify engagement exists in workspace (workspace isolation)
  const engagement = await prisma.engagement.findFirst({
    where: {
      id: engagement_id,
      workspaceId: workspace_id,
    },
  });

  if (!engagement) {
    throw new Error(`Unauthorized: engagement not found in workspace`);
  }

  // Mark previous profiles as not current (soft replace)
  await prisma.businessConditionProfile.updateMany({
    where: {
      engagementId: engagement_id,
      isCurrent: true,
    },
    data: {
      isCurrent: false,
    },
  });

  // Create new profile
  const now = new Date();
  const profile = await prisma.businessConditionProfile.create({
    data: {
      id: randomUUID(),
      engagementId: engagement_id,
      workspaceId: workspace_id,
      businessStatus: assessment.condition_status,
      severityScore: assessment.condition_score,
      urgencyLevel: assessment.urgency_level,
      cashPressureLevel: "unknown",
      marginPressureLevel: "unknown",
      clientConcentrationRisk: "unknown",
      ownerDependencyRisk: "unknown",
      keyPersonDependencyRisk: "unknown",
      processMaturityLevel: "unknown",
      managementMaturityLevel: "unknown",
      executionCapacityLevel: "unknown",
      moralFragilityLevel: "unknown",
      resilienceLevel: "unknown",
      growthReadinessLevel: "unknown",
      conditionScore: assessment.condition_score,
      ownerHealthScore: assessment.health_scores.owner_health_score,
      teamHealthScore: assessment.health_scores.team_health_score,
      customerHealthScore: assessment.health_scores.customer_health_score,
      financialHealthScore: assessment.health_scores.financial_health_score,
      riskFactors: assessment.risk_factors,
      strengths: assessment.strengths,
      diagnosisId: diagnosis_id || null,
      assessedBy: assessed_by_user_id || null,
      version: 1,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Emit audit event (S4)
  try {
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "BUSINESS_CONDITION_PROFILE_CREATED",
        actorId: userId || undefined,
        entityType: "BusinessConditionProfile",
        entityId: profile.id,
        workspaceId: workspace_id,
        payload: {
          engagement_id,
          condition_status: assessment.condition_status,
          condition_score: assessment.condition_score,
          previous_version: 0,
          new_version: 1,
        },
        occurredAt: new Date(),
      },
    });
  } catch (e) {
    // Audit event emission failure should not block profile creation
    console.error("Failed to emit audit event", e);
  }

  return profile;
}

/**
 * B12-S2: Update existing business condition profile.
 * Increments version, manages isCurrent flag, enforces idempotency.
 */
export async function updateBusinessConditionProfile(
  prisma: PrismaClient,
  input: UpdateProfileInput,
  userId?: string,
): Promise<any> {
  const { profile_id, workspace_id, assessment, diagnosis_id, transition } = input;

  // Verify profile exists in workspace (workspace isolation - S3)
  const profile = await prisma.businessConditionProfile.findFirst({
    where: {
      id: profile_id,
      workspaceId: workspace_id,
    },
  });

  if (!profile) {
    throw new Error(`Unauthorized: profile not found in workspace`);
  }

  // Check if this is idempotent (same assessment, same diagnosis) - S2 idempotency
  if (
    profile.conditionScore === assessment.condition_score &&
    profile.diagnosisId === (diagnosis_id || null)
  ) {
    // No change, return existing record (idempotent)
    return profile;
  }

  // Create new version
  const newVersion = profile.version + 1;
  const now = new Date();
  const newProfile = await prisma.businessConditionProfile.create({
    data: {
      id: randomUUID(),
      engagementId: profile.engagementId,
      workspaceId: workspace_id,
      businessStatus: assessment.condition_status,
      severityScore: assessment.condition_score,
      urgencyLevel: assessment.urgency_level,
      cashPressureLevel: profile.cashPressureLevel,
      marginPressureLevel: profile.marginPressureLevel,
      clientConcentrationRisk: profile.clientConcentrationRisk,
      ownerDependencyRisk: profile.ownerDependencyRisk,
      keyPersonDependencyRisk: profile.keyPersonDependencyRisk,
      processMaturityLevel: profile.processMaturityLevel,
      managementMaturityLevel: profile.managementMaturityLevel,
      executionCapacityLevel: profile.executionCapacityLevel,
      moralFragilityLevel: profile.moralFragilityLevel,
      resilienceLevel: profile.resilienceLevel,
      growthReadinessLevel: profile.growthReadinessLevel,
      conditionScore: assessment.condition_score,
      ownerHealthScore: assessment.health_scores.owner_health_score,
      teamHealthScore: assessment.health_scores.team_health_score,
      customerHealthScore: assessment.health_scores.customer_health_score,
      financialHealthScore: assessment.health_scores.financial_health_score,
      riskFactors: assessment.risk_factors,
      strengths: assessment.strengths,
      diagnosisId: diagnosis_id || null,
      assessedBy: userId || null,
      version: newVersion,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Mark old version as not current
  await prisma.businessConditionProfile.update({
    where: { id: profile_id },
    data: { isCurrent: false },
  });

  // Emit transition audit event if transition detected (S4)
  if (transition && transition.changed) {
    try {
      await prisma.auditEvent.create({
        data: {
          id: randomUUID(),
          eventName: "BUSINESS_CONDITION_PROFILE_TRANSITIONED",
          actorId: userId || undefined,
          entityType: "BusinessConditionProfile",
          entityId: newProfile.id,
          workspaceId: workspace_id,
          payload: {
            engagement_id: profile.engagementId,
            previous_status: transition.previous_status,
            new_status: transition.new_status,
            previous_score: transition.previous_status ? 50 : null,
            new_score: assessment.condition_score,
            requires_adaptive_reevaluation: transition.requires_adaptive_reevaluation,
            transition_reason: transition.transition_reason,
            previous_version: profile.version,
            new_version: newVersion,
          },
          occurredAt: new Date(),
        },
      });
    } catch (e) {
      console.error("Failed to emit transition audit event", e);
    }
  }

  return newProfile;
}

/**
 * B12-S3: Get effective (current) business condition profile for engagement.
 * Enforces workspace isolation.
 */
export async function getEffectiveBusinessConditionProfile(
  prisma: PrismaClient,
  engagement_id: string,
  workspace_id: string,
): Promise<any | null> {
  // Verify engagement exists in workspace
  const engagement = await prisma.engagement.findFirst({
    where: {
      id: engagement_id,
      workspaceId: workspace_id,
    },
  });

  if (!engagement) {
    throw new Error(`Unauthorized: engagement not found in workspace`);
  }

  // Get current profile
  return prisma.businessConditionProfile.findFirst({
    where: {
      engagementId: engagement_id,
      workspaceId: workspace_id,
      isCurrent: true,
    },
  });
}

/**
 * Phase 1 — Reality Engine: pure signal derivation.
 *
 * Maps the snapshot scalars that assembleGuidanceContext already reads into the 11
 * risk-dimension strings stored on BusinessConditionProfile. No DB query — pure
 * deterministic mapping so callers can derive inline without a second round-trip.
 *
 * When a source signal is genuinely absent (zero across the board with no financial data),
 * the field stays "unknown" — never fabricated.
 */

const CONDITION_STATE_TO_PRESSURE: Record<string, string> = {
  INSOLVENT_RISK: "CRITICAL",
  CRITICAL: "CRITICAL",
  AT_RISK: "HIGH",
  WATCH: "MEDIUM",
  SAFE: "LOW",
};

export interface BusinessConditionSignalInputs {
  cashState?: string | null;
  finState?: string | null;
  cashRunwayDays: number;
  supplierInventoryRiskScore: number;
  ownerLoadPct: number;
  staffOverloadPct: number;
  ownerOverloaded: boolean;
  staffOverloaded: boolean;
  capacityUtilizationPct: number;
  complaintsCount: number;
  reworkCount: number;
  overdueProofCount: number;
  outcomeChecksDue: number;
  churnRiskScore: number;
  growthReadinessTier: string;
}

export interface DerivedBusinessConditionSignals {
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
}

export function deriveBusinessConditionSignals(
  input: BusinessConditionSignalInputs,
): DerivedBusinessConditionSignals {
  const {
    cashState, finState, cashRunwayDays, supplierInventoryRiskScore,
    ownerLoadPct, staffOverloadPct, ownerOverloaded, staffOverloaded,
    capacityUtilizationPct, complaintsCount, reworkCount, overdueProofCount,
    outcomeChecksDue, churnRiskScore, growthReadinessTier,
  } = input;

  const hasFinancialData = cashState != null || finState != null;

  const cashPressureLevel = cashState
    ? (CONDITION_STATE_TO_PRESSURE[cashState] ?? "unknown")
    : "unknown";

  const marginPressureLevel = finState
    ? (CONDITION_STATE_TO_PRESSURE[finState] ?? "unknown")
    : "unknown";

  // Client concentration proxy: churn risk score. High churn → repeat-customer base is thin →
  // likely high concentration on new-client acquisition.
  const clientConcentrationRisk =
    churnRiskScore >= 0.7 ? "HIGH"
    : churnRiskScore >= 0.4 ? "MEDIUM"
    : churnRiskScore >= 0.1 ? "LOW"
    : "unknown";

  // Owner dependency: bottleneck flag is the primary signal; daily load % is secondary.
  const ownerDependencyRisk =
    ownerOverloaded ? "HIGH"
    : ownerLoadPct >= 0.85 ? "HIGH"
    : ownerLoadPct >= 0.55 ? "MEDIUM"
    : ownerLoadPct > 0 ? "LOW"
    : "unknown";

  // Key-person dependency: staff utilisation is the proxy for single-point-of-failure risk.
  const keyPersonDependencyRisk =
    staffOverloaded ? "HIGH"
    : staffOverloadPct >= 0.9 ? "HIGH"
    : staffOverloadPct >= 0.65 ? "MEDIUM"
    : staffOverloadPct > 0 ? "LOW"
    : "unknown";

  // Process maturity: inverted defect count. More complaints/rework → lower maturity.
  const processMaturityLevel =
    complaintsCount >= 5 || reworkCount >= 5 ? "LOW"
    : complaintsCount >= 2 || reworkCount >= 2 ? "MEDIUM"
    : hasFinancialData ? "HIGH"
    : "unknown";

  // Management maturity: governance compliance proxy. Overdue proofs + unresolved outcome checks.
  const managementMaturityLevel =
    overdueProofCount >= 3 || outcomeChecksDue >= 5 ? "LOW"
    : overdueProofCount >= 1 || outcomeChecksDue >= 2 ? "MEDIUM"
    : hasFinancialData ? "HIGH"
    : "unknown";

  // Execution capacity: headroom remaining (inverted utilisation).
  const executionCapacityLevel =
    capacityUtilizationPct >= 95 ? "CRITICAL"
    : capacityUtilizationPct >= 85 ? "LOW"
    : capacityUtilizationPct >= 65 ? "MEDIUM"
    : capacityUtilizationPct > 0 ? "HIGH"
    : "unknown";

  // Morale fragility: staff overload + churn together signal a fragile culture.
  const moralFragilityLevel =
    staffOverloaded && churnRiskScore >= 0.5 ? "HIGH"
    : staffOverloaded || churnRiskScore >= 0.5 ? "MEDIUM"
    : churnRiskScore >= 0.2 || staffOverloadPct > 0 ? "LOW"
    : "unknown";

  // Resilience: composite of three independent dimensions — cash runway, supply stability, staffing headroom.
  const cashResil: number | null = cashRunwayDays >= 60 ? 1 : cashRunwayDays >= 30 ? 0.5 : cashRunwayDays > 0 ? 0 : null;
  const supplResil = supplierInventoryRiskScore <= 0.25 ? 1 : supplierInventoryRiskScore <= 0.5 ? 0.5 : 0;
  const staffResil = !staffOverloaded && !ownerOverloaded ? 1 : staffOverloaded && ownerOverloaded ? 0 : 0.5;
  const resilienceScore = cashResil === null ? null : (cashResil + supplResil + staffResil) / 3;
  const resilienceLevel =
    resilienceScore === null ? "unknown"
    : resilienceScore >= 0.75 ? "HIGH"
    : resilienceScore >= 0.45 ? "MEDIUM"
    : "LOW";

  // Growth readiness: the growth gate result is the authoritative signal.
  const growthReadinessLevel =
    growthReadinessTier === "GROWTH_READY" ? "HIGH"
    : cashPressureLevel === "CRITICAL" ? "BLOCKED"
    : cashRunwayDays > 0 ? "LOW"
    : "unknown";

  return {
    cashPressureLevel,
    marginPressureLevel,
    clientConcentrationRisk,
    ownerDependencyRisk,
    keyPersonDependencyRisk,
    processMaturityLevel,
    managementMaturityLevel,
    executionCapacityLevel,
    moralFragilityLevel,
    resilienceLevel,
    growthReadinessLevel,
  };
}

/**
 * B12-S3: Get profile history for engagement (all versions).
 * Enforces workspace isolation.
 */
export async function getBusinessConditionProfileHistory(
  prisma: PrismaClient,
  engagement_id: string,
  workspace_id: string,
): Promise<any[]> {
  // Verify engagement exists in workspace
  const engagement = await prisma.engagement.findFirst({
    where: {
      id: engagement_id,
      workspaceId: workspace_id,
    },
  });

  if (!engagement) {
    throw new Error(`Unauthorized: engagement not found in workspace`);
  }

  // Get all versions ordered by version descending
  return prisma.businessConditionProfile.findMany({
    where: {
      engagementId: engagement_id,
      workspaceId: workspace_id,
    },
    orderBy: { version: "desc" },
  });
}
