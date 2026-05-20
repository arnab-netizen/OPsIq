import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { z } from "zod";

const IntakeSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  risk: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

type IntakeInput = z.infer<typeof IntakeSchema>;

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
  const auditContext = createServiceCapabilityContext({ capability: "mutation" });
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
    data: {
      workspaceId,
      createdBy: userId,
      ownerUserId: userId,
      problem: input.title,
      action: input.description,
      confidence: input.confidence,
      impactExpected: 0,
      impactLow: 0,
      impactHigh: 0,
      status: "pending",
      blockStage: null,
      blockReason: null,
      decisionType: "general",
      problemType: input.risk === "high" ? "growth_block" : "revenue_leak",
      inputsSnapshot: {
        title: input.title,
        description: input.description,
        confidence: input.confidence,
        risk: input.risk,
        createdAt: new Date().toISOString(),
      },
      priorityScore: 0.5,
      executionStatus: "not_started",
      engineVersion: "v1.0.0",
    },
  });

  // Log intake event
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
  }).catch((auditError) => {
    console.error(`Audit logging failed: ${auditError}`);
  });

  return {
    decisionId: decision.id,
    status: "pending",
    createdAt: decision.createdAt,
  };
});
