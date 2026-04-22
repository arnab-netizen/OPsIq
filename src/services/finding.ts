import { db } from "@/lib/db";
import { emitAuditEvent, type Visibility } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateFindingInput {
  engagementId: string;
  title: string;
  description?: string;
  severity: string; // "low" | "medium" | "high" | "critical"
  category?: string;
  visibility?: Visibility;
}

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const validSeverities = ["low", "medium", "high", "critical"];
  if (!validSeverities.includes(input.severity)) {
    throw new ValidationError(`Invalid severity: ${input.severity}`);
  }

  const finding = await db.finding.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      category: input.category ?? null,
      visibility: input.visibility ?? "internal",
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
      title: input.title,
      severity: input.severity,
    },
    visibility: input.visibility ?? "internal",
  });

  logger.info("Finding created", {
    findingId: finding.id,
    engagementId: input.engagementId,
    severity: input.severity,
  });

  return { id: finding.id };
}

export async function getFindingsByEngagement(
  engagementId: string,
  filters?: { status?: string; severity?: string }
) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.finding.findMany({
    where: {
      engagementId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.severity && { severity: filters.severity }),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}
