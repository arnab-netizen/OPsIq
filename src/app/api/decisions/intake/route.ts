import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { buildIntakeOperatorItemData } from "./intake-data";
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

  const userId = session.user.id;

  // Get workspace ID from query param
  let workspaceId: string;
  const queryWorkspaceId = request.nextUrl.searchParams.get("workspaceId");

  // If no workspace specified, use user's first active workspace
  if (!queryWorkspaceId) {
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId,
        isActive: true,
      },
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

  return {
    decisionId: decision.id,
    status: "pending",
    createdAt: decision.createdAt,
  };
});
