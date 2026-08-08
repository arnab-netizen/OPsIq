/**
 * GET /api/public/kpis
 * List KPIs with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace membership (read-only)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicKPIDTO, PublicAPIError } from "@/services/public-api.service";
import { db } from "@/lib/db";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const querySchema = z.object({
  engagementId: z.string().optional(),
  trend: z.enum(["improving", "stable", "deteriorating"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

function computeTrend(currentValue: number | null, target: number | null): "improving" | "stable" | "deteriorating" {
  if (currentValue === null || target === null || target === 0) return "stable";
  const ratio = currentValue / target;
  if (ratio >= 0.9) return "improving";
  if (ratio <= 0.5) return "deteriorating";
  return "stable";
}

function dbDirectionToPublic(direction: string): "increase" | "decrease" | "maintain" {
  if (direction === "up") return "increase";
  if (direction === "down") return "decrease";
  return "maintain";
}

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

      const kpis = await db.kPI.findMany({
        where: {
          engagement: { workspaceId },
          ...(queryParams.engagementId ? { engagementId: queryParams.engagementId } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: limit + offset,
        select: {
          id: true,
          engagementId: true,
          name: true,
          currentValue: true,
          target: true,
          direction: true,
          updatedAt: true,
        },
      });

      const mapped = kpis.map((kpi: any) => {
        const trend = computeTrend(kpi.currentValue, kpi.target);
        const percentOfTarget =
          kpi.currentValue !== null && kpi.target !== null && kpi.target !== 0
            ? Math.round((kpi.currentValue / kpi.target) * 100)
            : undefined;
        return {
          id: kpi.id,
          engagementId: kpi.engagementId,
          name: kpi.name,
          currentValue: kpi.currentValue ?? undefined,
          targetValue: kpi.target ?? undefined,
          direction: dbDirectionToPublic(kpi.direction),
          trend,
          percentOfTarget,
          lastUpdated: kpi.updatedAt.toISOString(),
        };
      });

      const filtered = queryParams.trend
        ? mapped.filter((k: any) => k.trend === queryParams.trend)
        : mapped;

      const paginated = filtered.slice(offset, offset + limit);
      const publicDTOs = paginated.map((k: any) => toPublicKPIDTO(k));

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
