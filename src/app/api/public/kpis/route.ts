/**
 * GET /api/public/kpis
 * List KPIs with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace membership (read-only)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicKPIDTO, PublicAPIError } from "@/services/public-api.service";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const querySchema = z.object({
  engagementId: z.string().optional(),
  trend: z.enum(["improving", "stable", "deteriorating"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const url = ctx.request?.nextUrl;

    try {
      const queryParams = querySchema.parse({
        engagementId: url?.searchParams.get("engagementId"),
        trend: url?.searchParams.get("trend"),
        limit: url?.searchParams.get("limit"),
        offset: url?.searchParams.get("offset"),
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
        actorId: ctx.verifiedActorId,
        entityType: "kpi",
        entityId: "list",
        payload: {
          count: publicDTOs.length,
          total: filtered.length,
          engagementId: queryParams.engagementId,
          trend: queryParams.trend,
        },
      });

      return {
        workspaceId,
        kpis: publicDTOs,
        count: publicDTOs.length,
        total: filtered.length,
        limit,
        offset,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw Object.assign(new Error("Validation error"), { statusCode: 400, code: "VALIDATION_ERROR", details: error.issues });
      }
      if (error instanceof PublicAPIError) {
        const governed = classifyOperatorError(error, { context: "load" });
        throw Object.assign(new Error(governed.operatorMessage), { statusCode: 400, code: error.code });
      }
      throw error;
    }
  },
  { requireWorkspace: true }
);
