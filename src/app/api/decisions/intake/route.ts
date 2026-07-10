import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { ValidationError, UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { buildIntakeOperatorItemData } from "./intake-data";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";

const IntakeSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  risk: z.enum(["low", "medium", "high"]).optional().default("medium"),
  recommendationId: z.string().uuid().optional(),
});

/**
 * POST /api/decisions/intake
 *
 * Simple decision intake endpoint.
 * Accepts minimal fields and auto-creates pending decision.
 *
 * Future: webhook, email parser, CSV upload will use this.
 */
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Unauthorized");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new ValidationError("idempotency-key header is required");
  }

  const userId = session.user.id;

  // Get workspace ID from query param
  let workspaceId: string;
  const queryWorkspaceId = request.nextUrl.searchParams.get("workspaceId");

  // If no workspace specified, use user's oldest active workspace (deterministic for multi-workspace users)
  if (!queryWorkspaceId) {
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new Error("No active workspace found");
    }

    workspaceId = membership.workspaceId;
  } else {
    // Verify user is member of specified workspace
    const membership = await enforceWorkspaceScoping(request, queryWorkspaceId);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }
    workspaceId = queryWorkspaceId;
  }

  // Parse and validate input
  const body = await request.json();
  const input = IntakeSchema.parse(body);

  // Idempotency check — deduplicates network retries before any DB mutation
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "intakeDecision",
    actorId: userId,
    workspaceId,
    payload: { title: input.title, workspaceId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return idempotencyCheck.cachedResponse.body;
  }

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
    throw idempotencyCheck.cachedError;
  }

  try {
    // Create decision
    const decision = await db.operatorItem.create({
      data: buildIntakeOperatorItemData(input, workspaceId, userId),
    });

    // Log intake event — fail-closed: audit failure aborts the route handler
    await logAuditEvent({
      eventName: "DECISION_INTAKE",
      entityType: "Decision",
      entityId: decision.id,
      actorId: userId,
      role: null,
      before: null,
      after: {
        id: decision.id,
        status: "pending",
        title: input.title,
      },
      metadata: {
        action: "intake_decision",
        source: "api",
        confidence: input.confidence,
        risk: input.risk,
        createdAt: new Date().toISOString(),
      },
      workspaceId,
    });

    const responseBody = {
      decisionId: decision.id,
      status: "pending" as const,
      createdAt: decision.createdAt instanceof Date
        ? decision.createdAt.toISOString()
        : decision.createdAt,
    };

    await recordIdempotencyResponse(idempotencyKey, 200, responseBody, workspaceId);

    return responseBody;
  } catch (error) {
    await recordIdempotencyError(
      idempotencyKey,
      error instanceof Error ? error : new Error(String(error)),
      workspaceId
    );
    throw error;
  }
});
