/**
 * GET /api/public/actions
 * List actions with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace ID but no auth capability (read-only)
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicActionDTO, PublicAPIError } from "@/services/public-api.service";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";

const querySchema = z.object({
  status: z.enum(["draft", "assigned", "in_progress", "blocked", "completed", "verified"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
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
      priority: url.searchParams.get("priority"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    });

    const limit = Math.min(parseInt(queryParams.limit), 1000);
    const offset = parseInt(queryParams.offset);

    const mockActions = [
      {
        id: "550e8400-e29b-41d4-a716-446655440100",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Conduct market research",
        description: "Interview 20+ potential customers in target market",
        status: queryParams.status || "in_progress",
        priority: queryParams.priority || "high",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assignee: "sarah@company.com",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440101",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Implement process automation",
        description: "Deploy workflow automation in procurement",
        status: queryParams.status || "assigned",
        priority: queryParams.priority || "medium",
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        assignee: "john@company.com",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    let filtered = mockActions;
    if (queryParams.status) {
      filtered = filtered.filter((a) => a.status === queryParams.status);
    }
    if (queryParams.priority) {
      filtered = filtered.filter((a) => a.priority === queryParams.priority);
    }

    const paginated = filtered.slice(offset, offset + limit);
    const publicDTOs = paginated.map((a) => toPublicActionDTO(a));

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OPERATOR_QUEUE_VIEWED,
      workspaceId,
      actorId: "public-api",
      entityType: "action",
      entityId: "list",
      payload: {
        count: publicDTOs.length,
        total: filtered.length,
        status: queryParams.status,
        priority: queryParams.priority,
      },
    });

    return Response.json(
      {
        workspaceId,
        actions: publicDTOs,
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
      return Response.json({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});