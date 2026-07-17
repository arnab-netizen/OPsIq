import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError, ForbiddenError, FeatureDisabledError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { EvidenceStatus } from "@/domain/constants/statuses";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { EventEmitterService } from "@/services/event-emitter";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  engagementId: string;
  title?: string;
  description?: string;
  evidenceType?: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
  // Backward compatibility with old field names
  category?: string;
  type?: string;
  sourceType?: string;
  sourceLabel?: string;
  sourceOwner?: string;
  captureMethod?: string;
  capturedAt?: string;
  statement?: string;
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
  // Backward compatibility
  statement?: string;
  validationStatus?: "submitted" | "validated" | "rejected";
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEvidence(
  input: CreateEvidenceInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string; engagementId?: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // Map old field names to new ones for backward compatibility
  const title = input.title || input.sourceLabel || "";

  // Map sourceType to evidenceType
  let mappedSourceType = input.sourceType || input.evidenceType || "observation";
  if (mappedSourceType === "client_feedback") {
    mappedSourceType = "observation";
  }

  const evidenceType = (input.evidenceType || mappedSourceType) as "document" | "interview" | "metric" | "observation";
  const sourceReference = input.sourceReference || input.sourceType || null;
  const description = input.description || input.statement || null;

  // Validate category if using old interface
  if (input.category) {
    const validCategories = ["financial", "operational", "human", "resilience", "client", "commercial", "leadership", "execution"];
    if (!validCategories.includes(input.category)) {
      throw new ValidationError(`Invalid evidence category: ${input.category}`);
    }
  }

  // Validate source type if using old interface
  if (input.sourceType && !["document", "interview", "metric", "observation", "client_feedback"].includes(input.sourceType)) {
    throw new ValidationError(`Invalid source type: ${input.sourceType}`);
  }

  // Validate capture method if using old interface
  if (input.captureMethod) {
    const validMethods = ["uploaded", "manual", "extracted", "generated"];
    if (!validMethods.includes(input.captureMethod)) {
      throw new ValidationError(`Invalid capture method: ${input.captureMethod}`);
    }
  }

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate evidence type
  const validTypes = ["document", "interview", "metric", "observation"];
  if (!validTypes.includes(evidenceType)) {
    throw new ValidationError(
      `Invalid evidence type: ${evidenceType}. Must be one of: ${validTypes.join(", ")}`
    );
  }

  const idempotencyKey = `evidence-create:${input.engagementId}:${title}:${userId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence.create",
    async () => {
      // GAP-EVIDENCE-DRIFT-01: Evidence is scoped via its engagement (no
      // workspaceId column). Map to the real columns: sourceReference→source,
      // severity→severityRating; supply id + updatedAt (no DB defaults); drop
      // the non-existent workspaceId/visibility columns.
      const evidence = await db.evidence.create({
        data: {
          id: randomUUID(),
          engagement: { connect: { id: input.engagementId } },
          title,
          description,
          evidenceType,
          source: sourceReference ?? "", // `source` is NOT NULL in the schema
          severityRating: input.severity ?? null,
          submittedBy: userId,
          status: "submitted",
          updatedAt: new Date(),
        },
      });

      // Emit event sourcing event (non-blocking)
      try {
        await EventEmitterService.emit({
          aggregateId: evidence.id,
          aggregateType: "evidence",
          eventType: "evidence.submitted",
          eventVersion: 1,
          payload: {
            title,
            evidenceType,
            severity: input.severity || "medium",
            sourceReference: sourceReference || "",
          },
          actorId: userId,
          workspaceId: validatedWorkspaceId,
        });
      } catch (error) {
        const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
        logger.error("Evidence event emission failed", {
          evidenceId: evidence.id,
          error: governed.operatorMessage,
        });
      }

      return { id: evidence.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId: userId,
    entityType: "evidence",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      evidenceType,
      title,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new evidence
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "evidence",
    entityId: result.result.id,
    engagementId: input.engagementId,
    workspaceId: validatedWorkspaceId,
    severity: (input.severity ?? "medium") as "low" | "medium" | "high" | "critical",
    description: `Evidence submitted: ${title}`,
    triggeredBy: userId,
  });

  logger.info("Evidence created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
  });

  return { id: result.result.id, engagementId: input.engagementId };
}

export async function updateEvidence(
  evidenceId: string,
  input: UpdateEvidenceInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // GAP-EVIDENCE-DRIFT-01: scope via engagement (Evidence has no workspaceId).
  const evidence = await db.evidence.findFirst({
    where: { id: evidenceId, engagement: { workspaceId: validatedWorkspaceId } },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check version first
  if (evidence.version !== input.version) {
    throw new ValidationError(
      `Version conflict: current version is ${evidence.version}, expected ${input.version}`
    );
  }

  // Cannot update validated or rejected evidence
  if (evidence.status === "validated" || evidence.status === "rejected") {
    throw new ValidationError(
      `Cannot update evidence with status: ${evidence.status}`
    );
  }

  const { version, statement, validationStatus } = input;
  const data: Record<string, unknown> = {};

  // Map backward compatibility + drifted field names to real columns.
  const actualStatus = input.status || validationStatus;
  const actualDescription = input.description || statement;
  if (input.title !== undefined) data.title = input.title;
  if (input.evidenceType !== undefined) data.evidenceType = input.evidenceType;
  if (input.rejectionReason !== undefined) data.rejectionReason = input.rejectionReason;
  if (input.sourceReference !== undefined) data.source = input.sourceReference;
  if (input.severity !== undefined) data.severityRating = input.severity;
  if (actualDescription !== undefined) data.description = actualDescription;
  if (actualStatus !== undefined) data.status = actualStatus;

  const statusChanged = actualStatus && actualStatus !== evidence.status;

  await optimisticUpdate("evidence", evidenceId, version, () =>
    db.evidence.update({
      where: withVersionCheck({ id: evidenceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId: userId,
    entityType: "evidence",
    entityId: evidenceId,
    workspaceId: validatedWorkspaceId,
    payload: data,
    visibility: "internal",
  });

  if (statusChanged && input.status === "validated") {
    // Emit event sourcing event for validation (non-blocking)
    try {
      await EventEmitterService.emit({
        aggregateId: evidenceId,
        aggregateType: "evidence",
        eventType: "evidence.validated",
        eventVersion: 1,
        payload: {
          previousStatus: evidence.status,
          title: evidence.title,
          evidenceType: evidence.evidenceType,
        },
        actorId: userId,
        workspaceId: validatedWorkspaceId,
      });
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.error("Evidence validation event emission failed", {
        evidenceId,
        error: governed.operatorMessage,
      });
    }

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_VALIDATED,
      actorId: userId,
      entityType: "evidence",
      entityId: evidenceId,
      workspaceId: validatedWorkspaceId,
      payload: { previousStatus: evidence.status },
      visibility: "internal",
    });
  } else if (statusChanged && input.status === "rejected") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_REJECTED,
      actorId: userId,
      entityType: "evidence",
      entityId: evidenceId,
      workspaceId: validatedWorkspaceId,
      payload: { previousStatus: evidence.status, reason: input.rejectionReason },
      visibility: "internal",
    });
  }

  logger.info("Evidence updated", { evidenceId });
  return { id: evidenceId };
}

export async function getEvidenceById(
  evidenceId: string,
  workspaceId: string,
  userIdOrVisibility?: string
) {
  enforceWorkspaceId(workspaceId, "getEvidenceById", "evidence");

  // Detect if param is visibility or userId
  let userId: string | undefined;
  let visibility: "internal" | "client_visible" | "all" | undefined;

  if (userIdOrVisibility && ["internal", "client_visible", "all"].includes(userIdOrVisibility)) {
    visibility = userIdOrVisibility as "internal" | "client_visible" | "all";
  } else {
    userId = userIdOrVisibility;
  }

  // GAP-EVIDENCE-DRIFT-01: scope via engagement (Evidence has no workspaceId);
  // there is no `visibility` column, and no submitter/validator relations
  // (only scalar submittedBy/validatedBy).
  void visibility;
  const evidence = await db.evidence.findFirst({
    where: { id: evidenceId, engagement: { workspaceId } },
  });

  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, evidence.engagementId, workspaceId);
  }

  const fullEvidence = await db.evidence.findFirst({
    where: { id: evidenceId, engagement: { workspaceId } },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
    },
  });

  if (!fullEvidence) throw new NotFoundError("Evidence", evidenceId);

  // Add backward compatibility fields for old interface
  const result: any = fullEvidence;
  result.category = fullEvidence.evidenceType === "document" ? "financial" : "operational";
  result.type = fullEvidence.evidenceType;
  result.sourceType = fullEvidence.evidenceType;
  result.sourceLabel = fullEvidence.title;
  result.statement = fullEvidence.description;
  result.validationStatus = fullEvidence.status;

  return result;
}

export async function listEvidence(
  workspaceId: string,
  engagementIdOrParams?: string | {
    engagementId?: string;
    status?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  },
  userIdOrUndefined?: string,
  visibilityFilter?: "internal" | "client_visible" | "all"
) {
  enforceWorkspaceId(workspaceId, "listEvidence", "evidence");

  // Handle both calling conventions
  let engagementId: string | undefined;
  let userId: string | undefined;
  let visibility: string | undefined;
  let status: string | undefined;
  let limit = 25;
  let offset = 0;

  if (typeof engagementIdOrParams === "string") {
    // Positional arguments: listEvidence(engagementId, userId?, visibility?)
    engagementId = engagementIdOrParams;
    userId = userIdOrUndefined;
    visibility = visibilityFilter;
  } else if (typeof engagementIdOrParams === "object" && engagementIdOrParams) {
    // Object argument: listEvidence({ engagementId, status, ... })
    engagementId = engagementIdOrParams.engagementId;
    userId = engagementIdOrParams.userId;
    status = engagementIdOrParams.status;
    limit = engagementIdOrParams.limit ?? 25;
    offset = engagementIdOrParams.offset ?? 0;
  }

  // Check engagement exists if provided
  if (engagementId) {
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId, workspaceId },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError("Engagement", engagementId);
  }

  // Check engagement access if userId provided
  if (engagementId && userId) {
    await assertEngagementAccess(userId, engagementId, workspaceId);
  }

  // GAP-EVIDENCE-DRIFT-01: Evidence has no workspaceId/visibility columns; scope
  // via the engagement relation. When an engagementId is given it is already
  // workspace-verified above; otherwise constrain to the workspace's engagements.
  void visibility;
  const where = {
    ...(engagementId
      ? { engagementId }
      : { engagement: { workspaceId } }),
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
        severityRating: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.evidence.count({ where }),
  ]);

  // Return array for positional argument calls, object for backward compatibility
  if (typeof engagementIdOrParams === "string") {
    return evidence;
  }
  return { evidence, total, limit, offset };
}

export async function validateEvidence(
  input: { evidenceItemId: string; isValid: boolean; version: number } | string,
  authContextOrActorId?: any | string,
  workspaceIdOrUndefined?: string
) {
  // Handle both function signatures: new (any) and old (actorId) for backward compatibility
  let userId: string;
  let workspaceId: string;

  if (typeof authContextOrActorId === "string") {
    // Old signature: validateEvidence(input, actorId, workspaceId)
    userId = authContextOrActorId;
    workspaceId = workspaceIdOrUndefined || "";
  } else if (authContextOrActorId) {
    // New signature: validateEvidence(input, authContext, workspaceId)
    const [uid, wid] = requireServiceContext(authContextOrActorId, workspaceIdOrUndefined || "");
    userId = uid;
    workspaceId = wid;
  } else {
    throw new Error("authContext or actorId is required");
  }

  if (!workspaceId) throw new Error("workspaceId is required");
  enforceWorkspaceId(workspaceId, "validateEvidence", "evidence");

  // Handle both function signatures for backward compatibility
  const evidenceId = typeof input === "string" ? input : input.evidenceItemId;
  const actor = userId;

  if (!actor) throw new Error("userId is required");

  // GAP-EVIDENCE-DRIFT-01: scope via engagement (Evidence has no workspaceId).
  const evidence = await db.evidence.findFirst({
    where: { id: evidenceId, engagement: { workspaceId } },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (evidence.status === "validated") {
    throw new ValidationError("Evidence is already validated");
  }

  // SEPARATION OF DUTIES: the submitter cannot validate their own evidence.
  if (evidence.submittedBy && evidence.submittedBy === actor) {
    throw new ForbiddenError(
      "Evidence cannot be validated by the same actor who submitted it (separation of duties)"
    );
  }

  // Honor the explicit verdict: isValid=false records a rejection, not a validation.
  const isValid = typeof input === "string" ? true : input.isValid !== false;
  const expectedVersion = typeof input === "string" ? undefined : input.version;
  const nextStatus: EvidenceStatus = (isValid ? "validated" : "rejected") as EvidenceStatus;

  let updated;
  try {
    updated = await db.evidence.update({
      // Optimistic-lock on version when the caller supplied it (concurrency-safe).
      where:
        typeof expectedVersion === "number"
          ? { id: evidenceId, version: expectedVersion }
          : { id: evidenceId },
      data: {
        status: nextStatus,
        validatedBy: actor,
        validatedAt: new Date(),
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2025") {
      throw new ValidationError("Evidence was modified concurrently; reload and retry validation");
    }
    throw err;
  }

  await emitAuditEvent({
    eventName: isValid ? AUDIT_EVENTS.EVIDENCE_VALIDATED : AUDIT_EVENTS.EVIDENCE_REJECTED,
    actorId: actor,
    entityType: "evidence",
    entityId: evidenceId,
    workspaceId,
    payload: {
      engagementId: evidence.engagementId,
    },
    visibility: "internal",
  });

  return updated;
}

// ─── Evidence bundles (DEC-EVID-01: SAFELY DISABLED FOR OWNER USE) ───────────
//
// Evidence bundles group `EvidenceItem` rows — a model that is DIVORCED from the
// canonical `Evidence` proof pipeline this service actually writes (`db.evidence`).
// No active service writes `EvidenceItem`, and no verification / recommendation /
// scoring path reads `EvidenceBundle`, so bundles cannot (and must not) act as a
// parallel proof truth. The bundle code below also carries irreconcilable schema
// drift (references a non-existent `workspaceId` column on both bundle tables,
// mismatched relation/field names, and validates against `db.evidence` while
// writing an `evidenceItemId` FK that resolves against `EvidenceItem`) — it has
// never functioned against the current schema.
//
// Re-enabling requires a deliberate model-reconciliation (merge `EvidenceItem`
// into canonical `Evidence`, or vice-versa) with its own migration and proof
// tests. Until then every bundle entry point fails closed at THIS single
// chokepoint so no route (present or future) can reach the broken code path or
// expose a competing proof surface. See docs EVIDENCE_BUNDLE_AND_PRECHECK_CLOSURE.
// Unconditional fail-closed. Typed `: never` so the disabled entry points below
// carry no unreachable (and drift-broken) database code — the subsystem is off,
// not half-implemented. Flip this to a real implementation only as part of the
// EvidenceItem/Evidence reconciliation described above.
function assertEvidenceBundlesEnabled(): never {
  throw new FeatureDisabledError(
    "Evidence bundles",
    "grouping is disabled pending reconciliation of the EvidenceItem and canonical Evidence models; canonical evidence, verification and proof are unaffected"
  );
}

export interface CreateEvidenceBundleInput {
  engagementId: string;
  title: string;
  description?: string;
}

export interface UpdateEvidenceBundleInput {
  title?: string;
  description?: string;
  status?: "active" | "archived";
  version: number;
}

export interface AddEvidenceToBundleInput {
  bundleId: string;
  evidenceItemId: string;
}

export interface RemoveEvidenceFromBundleInput {
  bundleId: string;
  evidenceItemId: string;
}

// Every entry point below is a fail-closed disabled surface. The parameters are
// retained so the disablement is transparent at the call sites (routes) and so
// re-enabling is a body change, not a signature change.

export async function createEvidenceBundle(
  _input: CreateEvidenceBundleInput,
  _authContext: CanonicalAuthContext,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}

export async function getEvidenceBundleById(
  _bundleId: string,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}

export async function listEvidenceBundles(
  _engagementId: string,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}

export async function addEvidenceToBundle(
  _input: AddEvidenceToBundleInput,
  _authContext: CanonicalAuthContext,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}

export async function removeEvidenceFromBundle(
  _input: RemoveEvidenceFromBundleInput,
  _authContext: CanonicalAuthContext,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}

export async function updateEvidenceBundle(
  _bundleId: string,
  _input: UpdateEvidenceBundleInput,
  _authContext: CanonicalAuthContext,
  _workspaceId: string
): Promise<never> {
  assertEvidenceBundlesEnabled();
}
