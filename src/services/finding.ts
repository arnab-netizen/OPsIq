import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateFindingInput {
  engagementId: string;
  title: string;
  description?: string;
  findingType: "technical" | "operational" | "human_factor" | "market";
  impactArea?: "revenue" | "cost" | "execution" | "risk";
  severity: "low" | "medium" | "high" | "critical";
  rootCause?: string;
  linkedEvidenceIds?: string[];
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate finding type
  const validFindingTypes = ["technical", "operational", "human_factor", "market"];
  if (!validFindingTypes.includes(input.findingType)) {
    throw new ValidationError(
      `Invalid finding type: ${input.findingType}. Must be one of: ${validFindingTypes.join(", ")}`
    );
  }

  // Validate severity
  const validSeverities = ["low", "medium", "high", "critical"];
  if (!validSeverities.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${validSeverities.join(", ")}`
    );
  }

  // Validate linked evidence if provided
  if (input.linkedEvidenceIds && input.linkedEvidenceIds.length > 0) {
    const evidence = await db.evidence.findMany({
      where: {
        id: { in: input.linkedEvidenceIds },
        engagementId: input.engagementId,
      },
    });
    if (evidence.length !== input.linkedEvidenceIds.length) {
      throw new ValidationError(
        "One or more linked evidence items not found or do not belong to this engagement"
      );
    }
  }

  const finding = await db.finding.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      findingType: input.findingType,
      impactArea: input.impactArea ?? null,
      severity: input.severity,
      rootCause: input.rootCause ?? null,
      linkedEvidence: input.linkedEvidenceIds ?? [],
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_CREATED,
    actorId,
    entityType: "finding",
    entityId: finding.id,
    payload: {
      engagementId: input.engagementId,
      findingType: input.findingType,
      severity: input.severity,
      title: input.title,
    },
    visibility: "internal",
  });

  logger.info("Finding created", {
    findingId: finding.id,
    engagementId: input.engagementId,
  });

  return { id: finding.id };
}

export async function getFindingById(findingId: string) {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      recommendations: { select: { id: true, title: true, status: true } },
    },
  });

  if (!finding) throw new NotFoundError("Finding", findingId);
  return finding;
}

export async function listFindings(params: {
  engagementId?: string;
  severity?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { engagementId, severity, limit = 25, offset = 0 } = params;

  const where = {
    ...(engagementId && { engagementId }),
    ...(severity && { severity }),
  };

  const [findings, total] = await Promise.all([
    db.finding.findMany({
      where,
      select: {
        id: true,
        title: true,
        findingType: true,
        severity: true,
        impactArea: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.finding.count({ where }),
  ]);

  return { findings, total, limit, offset };
}
