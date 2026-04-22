import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { RISK_SEVERITIES, type RiskSeverity, FINDING_STATUSES, type FindingStatus, EVIDENCE_STATUSES, INTERVENTION_PHASES, type InterventionPhase } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateFindingInput {
  engagementId: string;
  shockEventId?: string;
  title: string;
  statement: string;
  severity: RiskSeverity;
  status?: FindingStatus;
  rationale?: string;
  linkedEvidenceIds?: string[];
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
): Promise<{ id: string; engagementId: string; severity: RiskSeverity }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
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

  // Validate severity
  if (!RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate status if provided
  if (input.status && !FINDING_STATUSES.includes(input.status)) {
    throw new ValidationError(
      `Invalid status: ${input.status}. Must be one of: ${FINDING_STATUSES.join(", ")}`
    );
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: input.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot create findings when intervention is in closed phase"
    );
  }

  // Validate evidence items if provided
  const linkedEvidenceIds: string[] = [];
  if (input.linkedEvidenceIds && input.linkedEvidenceIds.length > 0) {
    // Check for duplicates
    const uniqueIds = new Set(input.linkedEvidenceIds);
    if (uniqueIds.size !== input.linkedEvidenceIds.length) {
      throw new ValidationError(
        "Duplicate evidence items in linkedEvidenceIds"
      );
    }

    for (const evidenceId of input.linkedEvidenceIds) {
      const evidence = await db.evidenceItem.findUnique({
        where: { id: evidenceId },
      });

      if (!evidence) {
        throw new NotFoundError("EvidenceItem", evidenceId);
      }

      if (evidence.engagementId !== input.engagementId) {
        throw new ValidationError(
          "Evidence item does not belong to the specified engagement"
        );
      }

      linkedEvidenceIds.push(evidenceId);
    }
  }

  const finding = await db.finding.create({
    data: {
      engagementId: input.engagementId,
      shockEventId: input.shockEventId ?? null,
      title: input.title,
      statement: input.statement,
      severity: input.severity,
      status: input.status ?? "draft",
      rationale: input.rationale ?? null,
      createdBy: actorId,
      evidenceLinks: {
        create: linkedEvidenceIds.map((evidenceItemId) => ({
          evidenceItemId,
        })),
      },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_CREATED,
    actorId,
    entityType: "finding",
    entityId: finding.id,
    payload: {
      engagementId: input.engagementId,
      findingId: finding.id,
      severity: input.severity,
      status: finding.status,
      linkedEvidenceIds: linkedEvidenceIds,
    },
    visibility: "internal",
  });

  // Emit FINDING_LINKED for each linked evidence
  for (const evidenceId of linkedEvidenceIds) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_LINKED,
      actorId,
      entityType: "finding_evidence_link",
      entityId: finding.id,
      payload: {
        findingId: finding.id,
        evidenceItemId: evidenceId,
        engagementId: input.engagementId,
      },
      visibility: "internal",
    });
  }

  logger.info("Finding created", {
    findingId: finding.id,
    engagementId: input.engagementId,
    severity: input.severity,
    linkedEvidenceCount: linkedEvidenceIds.length,
  });

  return {
    id: finding.id,
    engagementId: finding.engagementId,
    severity: finding.severity as RiskSeverity,
  };
}

export async function listFindingsForEngagement(
  engagementId: string,
  params: {
    limit?: number;
    offset?: number;
    severity?: string;
    status?: string;
  } = {}
) {
  const { limit = 25, offset = 0, severity, status } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const where = {
    engagementId,
    ...(severity && { severity }),
    ...(status && { status }),
  };

  const [findings, total] = await Promise.all([
    db.finding.findMany({
      where,
      select: {
        id: true,
        title: true,
        statement: true,
        severity: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.finding.count({ where }),
  ]);

  return { findings, total, limit, offset };
}

export async function getFindingById(findingId: string, engagementId?: string) {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      evidenceLinks: {
        select: {
          evidenceItem: {
            select: {
              id: true,
              category: true,
              sourceType: true,
              title: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  });

  if (!finding) {
    throw new NotFoundError("Finding", findingId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && finding.engagementId !== engagementId) {
    throw new ValidationError(
      "Finding does not belong to the specified engagement"
    );
  }

  return {
    id: finding.id,
    engagementId: finding.engagementId,
    shockEventId: finding.shockEventId,
    title: finding.title,
    statement: finding.statement,
    severity: finding.severity as RiskSeverity,
    status: finding.status as FindingStatus,
    rationale: finding.rationale,
    createdBy: finding.createdBy,
    version: finding.version,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    evidence: finding.evidenceLinks.map((link) => ({
      id: link.evidenceItem.id,
      category: link.evidenceItem.category,
      sourceType: link.evidenceItem.sourceType,
      title: link.evidenceItem.title,
      capturedAt: link.evidenceItem.capturedAt,
    })),
  };
}
