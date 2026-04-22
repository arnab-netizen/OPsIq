import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateFindingInput {
  engagementId: string;
  category: string;
  severity: string;
  title: string;
  description?: string;
  evidence?: string;
}

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const finding = await db.finding.create({
    data: {
      engagementId: input.engagementId,
      category: input.category,
      severity: input.severity,
      title: input.title,
      description: input.description ?? null,
      evidence: input.evidence ?? null,
      discoveredBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: "finding_created",
    actorId,
    entityType: "finding",
    entityId: finding.id,
    payload: {
      engagementId: input.engagementId,
      category: input.category,
      severity: input.severity,
    },
    visibility: "internal",
  });

  logger.info("Finding created", {
    findingId: finding.id,
    engagementId: input.engagementId,
  });

  return finding;
}

export async function getFindingsForEngagement(engagementId: string) {
  return db.finding.findMany({
    where: { engagementId },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}
