import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { EVIDENCE_CATEGORIES, type EvidenceCategory, EVIDENCE_SOURCE_TYPES, type EvidenceSourceType, VISIBILITY_LEVELS, type VisibilityLevel, INTERVENTION_PHASES, type InterventionPhase } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEvidenceItemInput {
  engagementId: string;
  shockEventId?: string;
  category: EvidenceCategory;
  sourceType: EvidenceSourceType;
  title: string;
  description?: string;
  capturedAt: string;
  visibilityClassification: VisibilityLevel;
}

// ─── Phase-Aware Gating ────────────────────────────────────────────────────
// Evidence submission is allowed in phases where analysis occurs.
// Draft and assessment: yes. Execution+: yes. Closed: no.

const EVIDENCE_SUBMISSION_PHASE_GATES: Partial<Record<InterventionPhase, boolean>> = {
  assessment: true,   // Collecting evidence during assessment
  planning: true,     // Evidence informs planning
  execution: true,    // Ongoing evidence during execution
  review: true,       // Evidence supports review
  handover: false,    // No new evidence in handover
  closed: false,      // No new evidence when closed
};

function validateEvidenceSubmissionPhaseGate(phase: InterventionPhase): void {
  const allowed = EVIDENCE_SUBMISSION_PHASE_GATES[phase];
  if (allowed === false) {
    throw new ValidationError(
      `Evidence cannot be submitted in "${phase}" phase`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEvidenceItem(
  input: CreateEvidenceItemInput,
  actorId: string
): Promise<{ id: string; engagementId: string; category: EvidenceCategory; sourceType: EvidenceSourceType }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    include: {
      interventionState: true,
      shockEvents: {
        select: { id: true, engagementId: true },
      },
    },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Validate shock event if provided and belongs to same engagement
  if (input.shockEventId) {
    const shockEvent = await db.shockEvent.findUnique({
      where: { id: input.shockEventId },
    });

    if (!shockEvent) {
      throw new NotFoundError("ShockEvent", input.shockEventId);
    }

    if (shockEvent.engagementId !== input.engagementId) {
      throw new ValidationError(
        "Shock event does not belong to the specified engagement"
      );
    }
  }

  // Validate category
  if (!EVIDENCE_CATEGORIES.includes(input.category)) {
    throw new ValidationError(
      `Invalid evidence category: ${input.category}. Must be one of: ${EVIDENCE_CATEGORIES.join(", ")}`
    );
  }

  // Validate source type
  if (!EVIDENCE_SOURCE_TYPES.includes(input.sourceType)) {
    throw new ValidationError(
      `Invalid evidence source type: ${input.sourceType}. Must be one of: ${EVIDENCE_SOURCE_TYPES.join(", ")}`
    );
  }

  // Validate visibility classification
  if (!VISIBILITY_LEVELS.includes(input.visibilityClassification)) {
    throw new ValidationError(
      `Invalid visibility classification: ${input.visibilityClassification}. Must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    );
  }

  // Validate phase gate if intervention state exists
  if (engagement.interventionState) {
    validateEvidenceSubmissionPhaseGate(engagement.interventionState.currentPhase as InterventionPhase);
  }

  const item = await db.evidenceItem.create({
    data: {
      engagementId: input.engagementId,
      shockEventId: input.shockEventId ?? null,
      category: input.category,
      sourceType: input.sourceType,
      title: input.title,
      description: input.description ?? null,
      capturedAt: new Date(input.capturedAt),
      visibilityClassification: input.visibilityClassification,
      recordedBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence_item",
    entityId: item.id,
    payload: {
      engagementId: input.engagementId,
      evidenceItemId: item.id,
      category: input.category,
      sourceType: input.sourceType,
      visibilityClassification: input.visibilityClassification,
      shockEventId: input.shockEventId ?? null,
    },
    visibility: "internal",
  });

  logger.info("Evidence item created", {
    evidenceItemId: item.id,
    engagementId: input.engagementId,
    category: input.category,
    sourceType: input.sourceType,
  });

  return {
    id: item.id,
    engagementId: item.engagementId,
    category: item.category as EvidenceCategory,
    sourceType: item.sourceType as EvidenceSourceType,
  };
}

export async function listEvidenceForEngagement(
  engagementId: string,
  params: {
    limit?: number;
    offset?: number;
    category?: string;
    sourceType?: string;
  } = {}
) {
  const { limit = 25, offset = 0, category, sourceType } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const where = {
    engagementId,
    ...(category && { category }),
    ...(sourceType && { sourceType }),
  };

  const [items, total] = await Promise.all([
    db.evidenceItem.findMany({
      where,
      select: {
        id: true,
        category: true,
        sourceType: true,
        title: true,
        capturedAt: true,
        visibilityClassification: true,
        createdAt: true,
      },
      orderBy: { capturedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.evidenceItem.count({ where }),
  ]);

  return { items, total, limit, offset };
}

export async function getEvidenceItemById(evidenceItemId: string, engagementId?: string) {
  const item = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
  });

  if (!item) {
    throw new NotFoundError("EvidenceItem", evidenceItemId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && item.engagementId !== engagementId) {
    throw new ValidationError(
      "Evidence item does not belong to the specified engagement"
    );
  }

  return {
    id: item.id,
    engagementId: item.engagementId,
    shockEventId: item.shockEventId,
    category: item.category as EvidenceCategory,
    sourceType: item.sourceType as EvidenceSourceType,
    title: item.title,
    description: item.description,
    capturedAt: item.capturedAt,
    visibilityClassification: item.visibilityClassification as VisibilityLevel,
    recordedBy: item.recordedBy,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
