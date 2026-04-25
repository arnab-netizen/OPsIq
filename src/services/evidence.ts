import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { EvidenceStatus } from "@/domain/constants/statuses";
import { EVIDENCE_STATUSES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  engagementId: string;
  title: string;
  description?: string;
  evidenceType: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface UpdateEvidenceInput {
  title?: string;
  description?: string;
  evidenceType?: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
  status?: EvidenceStatus;
  rejectionReason?: string;
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEvidence(
  input: CreateEvidenceInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate evidence type
  const validTypes = ["document", "interview", "metric", "observation"];
  if (!validTypes.includes(input.evidenceType)) {
    throw new ValidationError(
      `Invalid evidence type: ${input.evidenceType}. Must be one of: ${validTypes.join(", ")}`
    );
  }

  const idempotencyKey = `evidence-create:${input.engagementId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence.create",
    async () => {
      const evidence = await db.evidence.create({
        data: {
          engagementId: input.engagementId,
          title: input.title,
          description: input.description ?? null,
          evidenceType: input.evidenceType,
          sourceReference: input.sourceReference ?? null,
          severity: input.severity ?? null,
          submittedBy: actorId,
          status: "submitted",
        },
      });
      return { id: evidence.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      evidenceType: input.evidenceType,
      title: input.title,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new evidence
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "evidence",
    entityId: result.result.id,
    engagementId: input.engagementId,
    severity: input.severity ?? "medium",
    description: `Evidence submitted: ${input.title}`,
    triggeredBy: actorId,
  });

  logger.info("Evidence created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
  });

  return { id: result.result.id };
}

export async function updateEvidence(
  evidenceId: string,
  input: UpdateEvidenceInput,
  actorId: string
): Promise<void> {
  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Cannot update validated or rejected evidence
  if (evidence.status === "validated" || evidence.status === "rejected") {
    throw new ValidationError(
      `Cannot update evidence with status: ${evidence.status}`
    );
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    data[k] = v;
  }

  const statusChanged = input.status && input.status !== evidence.status;

  await optimisticUpdate("evidence", evidenceId, version, () =>
    db.evidence.update({
      where: withVersionCheck({ id: evidenceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence",
    entityId: evidenceId,
    payload: data,
    visibility: "internal",
  });

  if (statusChanged && input.status === "validated") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_VALIDATED,
      actorId,
      entityType: "evidence",
      entityId: evidenceId,
      payload: { previousStatus: evidence.status },
      visibility: "internal",
    });
  } else if (statusChanged && input.status === "rejected") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_REJECTED,
      actorId,
      entityType: "evidence",
      entityId: evidenceId,
      payload: { previousStatus: evidence.status, reason: input.rejectionReason },
      visibility: "internal",
    });
  }

  logger.info("Evidence updated", { evidenceId });
}

export async function getEvidenceById(evidenceId: string, userId: string) {
  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    select: { engagementId: true },
  });

  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check engagement access
  await assertEngagementAccess(userId, evidence.engagementId);

  const fullEvidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      submitter: { select: { id: true, name: true, email: true } },
      validator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!fullEvidence) throw new NotFoundError("Evidence", evidenceId);
  return fullEvidence;
}

export async function listEvidence(params: {
  engagementId?: string;
  status?: string;
  limit?: number;
  offset?: number;
  userId?: string;
} = {}) {
  const { engagementId, status, limit = 25, offset = 0, userId } = params;

  // Check engagement access if engagementId provided
  if (engagementId && userId) {
    await assertEngagementAccess(userId, engagementId);
  }

  const where = {
    ...(engagementId && { engagementId }),
    ...(status && { status }),
  };

  const [evidence, total] = await Promise.all([
    db.evidence.findMany({
      where,
      select: {
        id: true,
        title: true,
        evidenceType: true,
        status: true,
        severity: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.evidence.count({ where }),
  ]);

  return { evidence, total, limit, offset };
}
