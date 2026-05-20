/**
 * GET /api/public/engagements
 * List engagements with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace ID but no auth capability (read-only)
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicEngagementDTO, PublicAPIError } from "@/services/public-api.service";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";

const querySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

export const GET = withEnforcementFull(async (request) => {
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");

  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const url = new URL(request.url);
    const queryParams = querySchema.parse({
      status: url.searchParams.get("status"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    });

    const limit = Math.min(parseInt(queryParams.limit), 1000);
    const offset = parseInt(queryParams.offset);

    const mockEngagements = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Market Expansion Initiative",
        status: queryParams.status || "active",
        industry: "Technology",
        currentStage: "Execution Phase",
        progress: 65,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Cost Optimization Program",
        status: queryParams.status || "active",
        industry: "Manufacturing",
        currentStage: "Analysis Phase",
        progress: 40,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const filtered = mockEngagements.filter((e) => !queryParams.status || e.status === queryParams.status);
    const paginated = filtered.slice(offset, offset + limit);
    const publicDTOs = paginated.map((e) => toPublicEngagementDTO(e));

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OPERATOR_QUEUE_VIEWED,
      workspaceId,
      actorId: "public-api",
      entityType: "engagement",
      entityId: "list",
      payload: {
        count: publicDTOs.length,
        total: filtered.length,
        status: queryParams.status,
      },
    });

    return Response.json(
      {
        workspaceId,
        engagements: publicDTOs,
        count: publicDTOs.length,
        total: filtered.length,
        limit,
        offset,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof PublicAPIError || error instanceof Error) {
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classified.operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});