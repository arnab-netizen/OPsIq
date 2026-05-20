/**
 * GET /api/public/kpis
 * List KPIs with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace ID but no auth capability (read-only)
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicKPIDTO, PublicAPIError } from "@/services/public-api.service";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";

const querySchema = z.object({
  engagementId: z.string().optional(),
  trend: z.enum(["improving", "stable", "deteriorating"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

export const GET = withEnforcementFull(async (request) => {
  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;

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
      engagementId: url.searchParams.get("engagementId"),
      trend: url.searchParams.get("trend"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    });

    const limit = Math.min(parseInt(queryParams.limit), 1000);
    const offset = parseInt(queryParams.offset);

    const mockKPIs = [
      {
        id: "revenue-growth-2024",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Revenue Growth Rate",
        currentValue: 125000,
        targetValue: 150000,
        direction: "increase" as const,
        trend: queryParams.trend || "improving",
        percentOfTarget: 83,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "kpi-retention-rate",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Customer Retention Rate",
        currentValue: 92,
        targetValue: 95,
        direction: "increase" as const,
        trend: queryParams.trend || "stable",
        percentOfTarget: 97,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "kpi-cost-per-unit",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Cost Per Unit",
        currentValue: 45,
        targetValue: 35,
        direction: "decrease" as const,
        trend: queryParams.trend || "deteriorating",
        percentOfTarget: 78,
        lastUpdated: new Date().toISOString(),
      },
    ];

    let filtered = mockKPIs;
    if (queryParams.engagementId) {
      filtered = filtered.filter((k) => k.engagementId === queryParams.engagementId);
    }
    if (queryParams.trend) {
      filtered = filtered.filter((k) => k.trend === queryParams.trend);
    }

    const paginated = filtered.slice(offset, offset + limit);
    const publicDTOs = paginated.map((k) => toPublicKPIDTO(k));

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
      workspaceId,
      actorId: "public-api",
      entityType: "kpi",
      entityId: "list",
      payload: {
        count: publicDTOs.length,
        total: filtered.length,
        engagementId: queryParams.engagementId,
        trend: queryParams.trend,
      },
    });

    return Response.json(
      {
        workspaceId,
        kpis: publicDTOs,
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
    if (error instanceof PublicAPIError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});