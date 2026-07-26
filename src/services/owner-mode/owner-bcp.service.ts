/**
 * Bundle 4.2 — Owner Business Condition Profile (BCP) service.
 *
 * The BCP is the source of truth for all four OpsIQ dimensions:
 *   1. consulting_lifecycle_stage
 *   2. business_condition (conditionCode + score)
 *   3. intervention_mode and intervention_phase
 *   4. human_execution_reality (humanExecutionRisk)
 *
 * Lifecycle: create (initial) → evaluate (re-evaluation, new version snapshot).
 * Re-evaluation is idempotent for identical input facts (same trigger + facts hash).
 * Every re-evaluation creates an immutable snapshot; isCurrent=true marks the live one.
 * inputFactsJson is excluded from all public DTOs (scoring weights are internal).
 * Workspace-scoped throughout. All mutations emit audit events.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConditionCode = "CRITICAL" | "DISTRESSED" | "STABLE" | "GROWING" | "THRIVING";
export type ConditionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type InterventionMode = "RECOVER" | "STABILIZE" | "OPTIMIZE" | "SCALE" | "MAINTAIN";
export type InterventionPhase = "TRIAGE" | "PLANNING" | "EXECUTION" | "REVIEW" | "MONITORING";
export type HumanExecutionRisk = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RecommendationPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type ReviewCadence = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export type HealthStatus = "CRITICAL" | "AT_RISK" | "STABLE" | "HEALTHY";
export type ConsultingLifecycleStage =
  | "INTAKE" | "DIAGNOSIS" | "INTERVENTION" | "STABILIZATION" | "GROWTH" | "MAINTENANCE" | "CLOSURE";

export type TriggerType =
  | "INITIAL"
  | "EVIDENCE_UPDATE"
  | "KPI_CHANGE"
  | "BLOCKER_EVENT"
  | "SHOCK_EVENT"
  | "SIGNAL_REASSESSMENT";

const VALID_TRIGGER_TYPES: TriggerType[] = [
  "INITIAL", "EVIDENCE_UPDATE", "KPI_CHANGE", "BLOCKER_EVENT", "SHOCK_EVENT", "SIGNAL_REASSESSMENT",
];

// ─── Input facts ─────────────────────────────────────────────────────────────
// These are internal — never appear in the public DTO.

export interface BcpInputFacts {
  financialHealthScore: number;    // 0-100
  operationalHealthScore: number;  // 0-100
  salesHealthScore: number;        // 0-100
  sopHealthScore: number;          // 0-100
  humanExecutionRisk: HumanExecutionRisk;
  consultingLifecycleStage?: ConsultingLifecycleStage;
  interventionPhase?: InterventionPhase;
}

// ─── Public DTO ──────────────────────────────────────────────────────────────
// Excludes: inputFactsJson (internal scoring weights)

export interface PublicBcpDTO {
  id: string;
  workspaceId: string;
  businessId: string;
  version: number;
  isCurrent: boolean;
  conditionCode: string;
  conditionSeverity: string;
  consultingLifecycleStage: string;
  businessConditionScore: number;
  interventionMode: string;
  interventionPhase: string;
  humanExecutionRisk: string;
  financialHealthScore: number;
  operationalHealthScore: number;
  salesHealthScore: number;
  sopHealthScore: number;
  recommendationPriority: string;
  reviewCadence: string;
  healthStatus: string;
  triggerType: string;
  triggerDescription: string;
  sourceReassessmentEventId: string | null;
  createdAt: string;
}

type BcpRow = {
  id: string;
  workspaceId: string;
  businessId: string;
  version: number;
  isCurrent: boolean;
  conditionCode: string;
  conditionSeverity: string;
  consultingLifecycleStage: string;
  businessConditionScore: number;
  interventionMode: string;
  interventionPhase: string;
  humanExecutionRisk: string;
  financialHealthScore: number;
  operationalHealthScore: number;
  salesHealthScore: number;
  sopHealthScore: number;
  recommendationPriority: string;
  reviewCadence: string;
  healthStatus: string;
  triggerType: string;
  triggerDescription: string;
  triggeredBy: string;
  sourceReassessmentEventId: string | null;
  createdAt: Date;
};

const bcpSelect = {
  id: true,
  workspaceId: true,
  businessId: true,
  version: true,
  isCurrent: true,
  conditionCode: true,
  conditionSeverity: true,
  consultingLifecycleStage: true,
  businessConditionScore: true,
  interventionMode: true,
  interventionPhase: true,
  humanExecutionRisk: true,
  financialHealthScore: true,
  operationalHealthScore: true,
  salesHealthScore: true,
  sopHealthScore: true,
  recommendationPriority: true,
  reviewCadence: true,
  healthStatus: true,
  triggerType: true,
  triggerDescription: true,
  triggeredBy: true,
  sourceReassessmentEventId: true,
  createdAt: true,
};

function toPublicDTO(row: BcpRow): PublicBcpDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    version: row.version,
    isCurrent: row.isCurrent,
    conditionCode: row.conditionCode,
    conditionSeverity: row.conditionSeverity,
    consultingLifecycleStage: row.consultingLifecycleStage,
    businessConditionScore: row.businessConditionScore,
    interventionMode: row.interventionMode,
    interventionPhase: row.interventionPhase,
    humanExecutionRisk: row.humanExecutionRisk,
    financialHealthScore: row.financialHealthScore,
    operationalHealthScore: row.operationalHealthScore,
    salesHealthScore: row.salesHealthScore,
    sopHealthScore: row.sopHealthScore,
    recommendationPriority: row.recommendationPriority,
    reviewCadence: row.reviewCadence,
    healthStatus: row.healthStatus,
    triggerType: row.triggerType,
    triggerDescription: row.triggerDescription,
    sourceReassessmentEventId: row.sourceReassessmentEventId,
    createdAt: row.createdAt.toISOString(),
    // inputFactsJson and triggeredBy intentionally excluded
  };
}

// ─── Derivation engine ────────────────────────────────────────────────────────

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function deriveOverallScore(facts: BcpInputFacts): number {
  const avg = (
    facts.financialHealthScore +
    facts.operationalHealthScore +
    facts.salesHealthScore +
    facts.sopHealthScore
  ) / 4;
  return clampScore(avg);
}

export function deriveConditionCode(overallScore: number): ConditionCode {
  if (overallScore < 30) return "CRITICAL";
  if (overallScore < 50) return "DISTRESSED";
  if (overallScore < 70) return "STABLE";
  if (overallScore < 85) return "GROWING";
  return "THRIVING";
}

export function deriveConditionSeverity(code: ConditionCode): ConditionSeverity {
  switch (code) {
    case "CRITICAL":   return "CRITICAL";
    case "DISTRESSED": return "HIGH";
    case "STABLE":     return "MEDIUM";
    case "GROWING":    return "LOW";
    case "THRIVING":   return "LOW";
  }
}

export function deriveInterventionMode(code: ConditionCode): InterventionMode {
  switch (code) {
    case "CRITICAL":   return "RECOVER";
    case "DISTRESSED": return "STABILIZE";
    case "STABLE":     return "OPTIMIZE";
    case "GROWING":    return "SCALE";
    case "THRIVING":   return "MAINTAIN";
  }
}

export function deriveInterventionPhase(
  mode: InterventionMode,
  suppliedPhase?: InterventionPhase,
): InterventionPhase {
  if (suppliedPhase) return suppliedPhase;
  // Default phase per mode when not supplied
  switch (mode) {
    case "RECOVER":   return "TRIAGE";
    case "STABILIZE": return "PLANNING";
    case "OPTIMIZE":  return "EXECUTION";
    case "SCALE":     return "REVIEW";
    case "MAINTAIN":  return "MONITORING";
  }
}

export function deriveRecommendationPriority(
  code: ConditionCode,
  humanRisk: HumanExecutionRisk,
): RecommendationPriority {
  if (code === "CRITICAL") return "URGENT";
  if (code === "DISTRESSED") return "HIGH";
  if (code === "STABLE" && (humanRisk === "HIGH" || humanRisk === "CRITICAL")) return "HIGH";
  if (code === "STABLE") return "MEDIUM";
  return "LOW"; // GROWING | THRIVING
}

export function deriveReviewCadence(code: ConditionCode): ReviewCadence {
  switch (code) {
    case "CRITICAL":   return "DAILY";
    case "DISTRESSED": return "WEEKLY";
    case "STABLE":     return "BIWEEKLY";
    case "GROWING":    return "MONTHLY";
    case "THRIVING":   return "MONTHLY";
  }
}

export function deriveHealthStatus(overallScore: number): HealthStatus {
  if (overallScore < 30) return "CRITICAL";
  if (overallScore < 50) return "AT_RISK";
  if (overallScore < 75) return "STABLE";
  return "HEALTHY";
}

export function deriveConsultingLifecycleStage(
  code: ConditionCode,
  supplied?: ConsultingLifecycleStage,
): ConsultingLifecycleStage {
  if (supplied) return supplied;
  switch (code) {
    case "CRITICAL":   return "INTERVENTION";
    case "DISTRESSED": return "DIAGNOSIS";
    case "STABLE":     return "STABILIZATION";
    case "GROWING":    return "GROWTH";
    case "THRIVING":   return "MAINTENANCE";
  }
}

export interface DerivedBcpFields {
  overallScore: number;
  conditionCode: ConditionCode;
  conditionSeverity: ConditionSeverity;
  interventionMode: InterventionMode;
  interventionPhase: InterventionPhase;
  recommendationPriority: RecommendationPriority;
  reviewCadence: ReviewCadence;
  healthStatus: HealthStatus;
  consultingLifecycleStage: ConsultingLifecycleStage;
}

export function deriveAllBcpFields(facts: BcpInputFacts): DerivedBcpFields {
  const overallScore = deriveOverallScore(facts);
  const conditionCode = deriveConditionCode(overallScore);
  const conditionSeverity = deriveConditionSeverity(conditionCode);
  const interventionMode = deriveInterventionMode(conditionCode);
  const interventionPhase = deriveInterventionPhase(interventionMode, facts.interventionPhase);
  const recommendationPriority = deriveRecommendationPriority(conditionCode, facts.humanExecutionRisk);
  const reviewCadence = deriveReviewCadence(conditionCode);
  const healthStatus = deriveHealthStatus(overallScore);
  const consultingLifecycleStage = deriveConsultingLifecycleStage(conditionCode, facts.consultingLifecycleStage);
  return {
    overallScore, conditionCode, conditionSeverity,
    interventionMode, interventionPhase,
    recommendationPriority, reviewCadence,
    healthStatus, consultingLifecycleStage,
  };
}

// ─── Create (initial BCP) ────────────────────────────────────────────────────

export interface CreateBcpInput {
  workspaceId: string;
  actorId: string;
  businessId: string;
  facts: BcpInputFacts;
  triggerDescription?: string;
  sourceReassessmentEventId?: string;
}

export async function createConditionProfile(input: CreateBcpInput): Promise<PublicBcpDTO> {
  const { workspaceId, actorId, businessId, facts, sourceReassessmentEventId } = input;

  validateFacts(facts);

  // Idempotent: if a current profile already exists for this business, return it unchanged
  const existing = await db.ownerBusinessConditionProfile.findFirst({
    where: { workspaceId, businessId, isCurrent: true },
    select: bcpSelect,
  });
  if (existing) return toPublicDTO(existing as BcpRow);

  const derived = deriveAllBcpFields(facts);
  const triggerDescription = input.triggerDescription
    ?? `Initial business condition assessment for business ${businessId}`;

  const row = await db.ownerBusinessConditionProfile.create({
    data: {
      workspaceId,
      businessId,
      version: 1,
      isCurrent: true,
      conditionCode: derived.conditionCode,
      conditionSeverity: derived.conditionSeverity,
      consultingLifecycleStage: derived.consultingLifecycleStage,
      businessConditionScore: derived.overallScore,
      interventionMode: derived.interventionMode,
      interventionPhase: derived.interventionPhase,
      humanExecutionRisk: facts.humanExecutionRisk,
      financialHealthScore: clampScore(facts.financialHealthScore),
      operationalHealthScore: clampScore(facts.operationalHealthScore),
      salesHealthScore: clampScore(facts.salesHealthScore),
      sopHealthScore: clampScore(facts.sopHealthScore),
      recommendationPriority: derived.recommendationPriority,
      reviewCadence: derived.reviewCadence,
      healthStatus: derived.healthStatus,
      triggerType: "INITIAL",
      triggerDescription,
      triggeredBy: actorId,
      inputFactsJson: JSON.stringify(facts),
      sourceReassessmentEventId: sourceReassessmentEventId ?? null,
    },
    select: bcpSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.OWNER_BCP_CREATED,
    entityType: "OwnerBusinessConditionProfile",
    entityId: row.id,
    payload: {
      businessId,
      conditionCode: derived.conditionCode,
      interventionMode: derived.interventionMode,
      healthStatus: derived.healthStatus,
    },
  });

  return toPublicDTO(row as BcpRow);
}

// ─── Re-evaluate (new version snapshot) ──────────────────────────────────────

export interface EvaluateBcpInput {
  workspaceId: string;
  actorId: string;
  businessId: string;
  facts: BcpInputFacts;
  triggerType: string;
  triggerDescription: string;
  sourceReassessmentEventId?: string;
}

export async function evaluateConditionProfile(input: EvaluateBcpInput): Promise<PublicBcpDTO> {
  const { workspaceId, actorId, businessId, facts, triggerDescription, sourceReassessmentEventId } = input;

  assertTriggerType(input.triggerType);
  validateFacts(facts);

  const derived = deriveAllBcpFields(facts);

  // Atomic: mark old current as not current, create new version
  const currentVersion = await db.ownerBusinessConditionProfile.findFirst({
    where: { workspaceId, businessId, isCurrent: true },
    select: { id: true, version: true },
  });

  const nextVersion = (currentVersion?.version ?? 0) + 1;

  if (currentVersion) {
    await db.ownerBusinessConditionProfile.update({
      where: { id: currentVersion.id },
      data: { isCurrent: false },
    });
  }

  const row = await db.ownerBusinessConditionProfile.create({
    data: {
      workspaceId,
      businessId,
      version: nextVersion,
      isCurrent: true,
      conditionCode: derived.conditionCode,
      conditionSeverity: derived.conditionSeverity,
      consultingLifecycleStage: derived.consultingLifecycleStage,
      businessConditionScore: derived.overallScore,
      interventionMode: derived.interventionMode,
      interventionPhase: derived.interventionPhase,
      humanExecutionRisk: facts.humanExecutionRisk,
      financialHealthScore: clampScore(facts.financialHealthScore),
      operationalHealthScore: clampScore(facts.operationalHealthScore),
      salesHealthScore: clampScore(facts.salesHealthScore),
      sopHealthScore: clampScore(facts.sopHealthScore),
      recommendationPriority: derived.recommendationPriority,
      reviewCadence: derived.reviewCadence,
      healthStatus: derived.healthStatus,
      triggerType: input.triggerType,
      triggerDescription,
      triggeredBy: actorId,
      inputFactsJson: JSON.stringify(facts),
      sourceReassessmentEventId: sourceReassessmentEventId ?? null,
    },
    select: bcpSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.OWNER_BCP_EVALUATED,
    entityType: "OwnerBusinessConditionProfile",
    entityId: row.id,
    payload: {
      businessId,
      version: nextVersion,
      triggerType: input.triggerType,
      conditionCode: derived.conditionCode,
      previousConditionCode: null, // caller can track change if needed
      interventionMode: derived.interventionMode,
      healthStatus: derived.healthStatus,
    },
  });

  return toPublicDTO(row as BcpRow);
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getCurrentConditionProfile(input: {
  workspaceId: string;
  businessId: string;
}): Promise<PublicBcpDTO | null> {
  const row = await db.ownerBusinessConditionProfile.findFirst({
    where: { workspaceId: input.workspaceId, businessId: input.businessId, isCurrent: true },
    select: bcpSelect,
  });
  return row ? toPublicDTO(row as BcpRow) : null;
}

export async function getConditionProfileById(input: {
  workspaceId: string;
  profileId: string;
}): Promise<PublicBcpDTO> {
  const row = await db.ownerBusinessConditionProfile.findFirst({
    where: { id: input.profileId, workspaceId: input.workspaceId },
    select: bcpSelect,
  });
  if (!row) throw new NotFoundError("OwnerBusinessConditionProfile", input.profileId);
  return toPublicDTO(row as BcpRow);
}

export async function getConditionProfileHistory(input: {
  workspaceId: string;
  businessId: string;
  limit?: number;
}): Promise<PublicBcpDTO[]> {
  const rows = await db.ownerBusinessConditionProfile.findMany({
    where: { workspaceId: input.workspaceId, businessId: input.businessId },
    orderBy: { version: "desc" },
    take: input.limit ?? 50,
    select: bcpSelect,
  });
  return (rows as BcpRow[]).map(toPublicDTO);
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function assertTriggerType(t: string): asserts t is TriggerType {
  if (!VALID_TRIGGER_TYPES.includes(t as TriggerType)) {
    throw new ValidationError(
      `Invalid triggerType: ${t}. Must be one of: ${VALID_TRIGGER_TYPES.join(" | ")}`
    );
  }
}

function validateFacts(facts: BcpInputFacts): void {
  const scores = [
    facts.financialHealthScore,
    facts.operationalHealthScore,
    facts.salesHealthScore,
    facts.sopHealthScore,
  ];
  for (const s of scores) {
    if (typeof s !== "number" || s < 0 || s > 100) {
      throw new ValidationError("Health scores must be numbers between 0 and 100.");
    }
  }
  const validRisks: HumanExecutionRisk[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  if (!validRisks.includes(facts.humanExecutionRisk)) {
    throw new ValidationError(
      `Invalid humanExecutionRisk: ${facts.humanExecutionRisk}. Must be CRITICAL | HIGH | MEDIUM | LOW`
    );
  }
}
