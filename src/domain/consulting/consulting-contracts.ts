/**
 * Bundle 6 — Consulting Mode domain contracts.
 *
 * Defines the consulting lifecycle FSM, all four OpsIQ dimensions at engagement
 * level, and the client/consultant DTO boundary (consultant-internal fields
 * are NEVER returned in client-facing DTOs).
 */
import { z } from "zod";

// ─── Consulting Phase FSM ──────────────────────────────────────────────────────

export const CONSULTING_PHASES = [
  "DISCOVERY",
  "DIAGNOSIS",
  "IMPLEMENTATION",
  "REVIEW",
] as const;

export type ConsultingPhase = (typeof CONSULTING_PHASES)[number];

/** Valid forward-only phase transitions. No skipping, no reversal. */
export const CONSULTING_PHASE_TRANSITIONS: Record<ConsultingPhase, ConsultingPhase | null> = {
  DISCOVERY: "DIAGNOSIS",
  DIAGNOSIS: "IMPLEMENTATION",
  IMPLEMENTATION: "REVIEW",
  REVIEW: null, // terminal phase — engagement can be closed from REVIEW only
};

export function isValidPhaseTransition(from: ConsultingPhase, to: ConsultingPhase): boolean {
  return CONSULTING_PHASE_TRANSITIONS[from] === to;
}

export function getNextPhase(current: ConsultingPhase): ConsultingPhase | null {
  return CONSULTING_PHASE_TRANSITIONS[current];
}

// ─── Engagement Status ────────────────────────────────────────────────────────

export const CONSULTING_ENGAGEMENT_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
] as const;

export type ConsultingEngagementStatus = (typeof CONSULTING_ENGAGEMENT_STATUSES)[number];

// ─── Consulting Action Target ─────────────────────────────────────────────────

export const CONSULTING_ACTION_TARGETS = ["CLIENT", "CONSULTANT"] as const;
export type ConsultingActionTarget = (typeof CONSULTING_ACTION_TARGETS)[number];

// ─── Human Factors (4th OpsIQ Dimension) ─────────────────────────────────────

export interface HumanFactors {
  ownerBottleneckRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  followThroughRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  resistanceToChange: "LOW" | "MEDIUM" | "HIGH" | null;
  communicationBreakdownRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  moraleFragility: "LOW" | "MEDIUM" | "HIGH" | null;
  managementCapabilityGap: "LOW" | "MEDIUM" | "HIGH" | null;
  keyPersonDependency: boolean;
  accountabilityWeakness: "LOW" | "MEDIUM" | "HIGH" | null;
  notes?: string;
}

// ─── Engagement Health ────────────────────────────────────────────────────────

export type ConsultingHealthStatus = "HEALTHY" | "AT_RISK" | "BLOCKED";

export interface ConsultingEngagementHealth {
  status: ConsultingHealthStatus;
  reasons: string[];
  criticalFindingsUnresolved: number;
  criticalActionsUnresolved: number;
  overdueActions: number;
}

// ─── Zod Input Schemas ────────────────────────────────────────────────────────

export const CreateEngagementSchema = z.object({
  title: z.string().min(1).max(255),
  clientId: z.string().uuid(),
  assignedConsultantId: z.string().uuid().optional(),
  description: z.string().optional(),
  interventionMode: z.enum(["recovery", "growth", "transformation", "stabilization"]).default("recovery"),
  interventionPhase: z.enum(["triage", "stabilize", "rebuild", "optimize"]).default("triage"),
  businessConditionSummary: z.string().optional(),
  humanFactors: z
    .object({
      ownerBottleneckRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      followThroughRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      resistanceToChange: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      communicationBreakdownRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      moraleFragility: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      managementCapabilityGap: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      keyPersonDependency: z.boolean().default(false),
      accountabilityWeakness: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
      notes: z.string().optional(),
    })
    .optional(),
});

export const AdvancePhaseSchema = z.object({
  engagementId: z.string().uuid(),
  targetPhase: z.enum(["DIAGNOSIS", "IMPLEMENTATION", "REVIEW"]),
  rationale: z.string().min(1),
});

export const CreateFindingSchema = z.object({
  engagementId: z.string().uuid(),
  primaryEvidenceId: z.string().uuid(),
  title: z.string().min(1).max(255),
  summary: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  impactArea: z.string().min(1),
  confidenceScore: z.number().min(0).max(100).optional(),
  hypothesis: z.string().optional(),
  rootCause: z.string().optional(),
  consequence: z.string().optional(),
  consultantNotes: z.string().optional(),
});

export const GenerateRecommendationSchema = z.object({
  engagementId: z.string().uuid(),
  findingId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  rationale: z.string().min(1),
  priority: z.enum(["critical", "high", "medium", "low"]),
  estimatedImpact: z.string().optional(),
  consultingTarget: z.enum(["CLIENT", "CONSULTANT"]).default("CLIENT"),
  visibility: z.enum(["internal", "client"]).default("client"),
});

export const AssignConsultingActionSchema = z.object({
  engagementId: z.string().uuid(),
  recommendationId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  consultingTarget: z.enum(["CLIENT", "CONSULTANT"]),
  assignedToUserId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
});

export const CloseEngagementSchema = z.object({
  engagementId: z.string().uuid(),
  closureRationale: z.string().min(1),
  outcomeSummary: z.string().optional(),
});

// ─── Public DTO (client-visible) — no consultant-internal fields ──────────────

export interface ConsultingEngagementClientDTO {
  id: string;
  title: string;
  clientId: string;
  consultingPhase: ConsultingPhase;
  status: string;
  healthStatus: ConsultingHealthStatus | string;
  interventionMode: string;
  interventionPhase: string;
  description: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  // 4th OpsIQ dimension — business-operational human factors (summary only for client)
  humanFactors: Pick<HumanFactors, "ownerBottleneckRisk" | "followThroughRisk" | "keyPersonDependency"> | null;
  // NEVER included: consultantNotes, assignedConsultantId, internal scoring
}

/** Consultant sees all fields including consultant-internal notes and scoring. */
export interface ConsultingEngagementConsultantDTO extends ConsultingEngagementClientDTO {
  assignedConsultantId: string | null;
  consultantNotes: string | null;
  humanFactors: HumanFactors | null;
  createdBy: string | null;
}

export interface ConsultingFindingClientDTO {
  id: string;
  engagementId: string;
  title: string;
  summary: string;
  severity: string;
  impactArea: string;
  status: string;
  confidenceScore: number | null;
  createdAt: string;
  // NEVER included: consultantNotes, rootCause (internal only), hypothesis (internal)
}

export interface ConsultingFindingConsultantDTO extends ConsultingFindingClientDTO {
  primaryEvidenceId: string;
  hypothesis: string | null;
  rootCause: string | null;
  consequence: string | null;
  consultantNotes?: string;
}

export interface ConsultingRecommendationDTO {
  id: string;
  engagementId: string;
  findingId: string;
  title: string;
  description: string | null;
  rationale: string;
  priority: string;
  estimatedImpact: string | null;
  status: string;
  consultingTarget: ConsultingActionTarget;
  visibility: string;
  createdAt: string;
}

export interface ConsultingActionDTO {
  id: string;
  engagementId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  consultingTarget: ConsultingActionTarget;
  assignedToUserId: string | null;
  dueAt: string | null;
  createdAt: string;
}

// ─── DTO redaction helpers ────────────────────────────────────────────────────

export function toClientDTO(row: {
  id: string;
  title: string;
  clientId: string;
  consultingPhase: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  interventionPhase: string;
  description: string | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  humanFactors: unknown;
}): ConsultingEngagementClientDTO {
  const hf = row.humanFactors as HumanFactors | null;
  return {
    id: row.id,
    title: row.title,
    clientId: row.clientId,
    consultingPhase: row.consultingPhase as ConsultingPhase,
    status: row.status,
    healthStatus: row.healthStatus as ConsultingHealthStatus,
    interventionMode: row.interventionMode,
    interventionPhase: row.interventionPhase,
    description: row.description,
    startDate: row.startDate?.toISOString() ?? null,
    targetEndDate: row.targetEndDate?.toISOString() ?? null,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    humanFactors: hf
      ? {
          ownerBottleneckRisk: hf.ownerBottleneckRisk ?? null,
          followThroughRisk: hf.followThroughRisk ?? null,
          keyPersonDependency: hf.keyPersonDependency ?? false,
        }
      : null,
    // consultantNotes: OMITTED
    // assignedConsultantId: OMITTED
  };
}

export function toConsultantDTO(row: {
  id: string;
  title: string;
  clientId: string;
  consultingPhase: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  interventionPhase: string;
  description: string | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  humanFactors: unknown;
  assignedConsultantId: string | null;
  consultantNotes: string | null;
  createdBy: string | null;
}): ConsultingEngagementConsultantDTO {
  const clientDTO = toClientDTO(row);
  return {
    ...clientDTO,
    assignedConsultantId: row.assignedConsultantId,
    consultantNotes: row.consultantNotes,
    humanFactors: (row.humanFactors as HumanFactors | null) ?? null,
    createdBy: row.createdBy,
  };
}
