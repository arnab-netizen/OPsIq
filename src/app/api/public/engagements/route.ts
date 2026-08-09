/**
 * GET /api/public/engagements
 * List engagements with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace membership (read-only)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicEngagementDTO, PublicAPIError } from "@/services/public-api.service";
import { db } from "@/lib/db";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const querySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

const PUBLIC_STATUS_TO_DB: Record<string, string[]> = {
  active: ["active", "draft", "in_progress"],
  completed: ["completed", "done", "closed"],
  cancelled: ["cancelled", "abandoned"],
};

function dbStatusToPublic(status: string): "active" | "completed" | "cancelled" {
  if (status === "completed" || status === "done" || status === "closed") return "completed";
  if (status === "cancelled" || status === "abandoned") return "cancelled";
  return "active";
}

const PHASE_PROGRESS: Record<string, number> = {
  DISCOVERY: 10,
  DIAGNOSIS: 25,
  STABILIZATION: 45,
  GROWTH: 65,
  CONSOLIDATION: 80,
  EXIT: 95,
};

function phaseToProgress(phase: string, status: string): number {
  if (status === "completed" || status === "done" || status === "closed") return 100;
  return PHASE_PROGRESS[phase?.toUpperCase()] ?? 0;
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const url = ctx.request?.nextUrl;

    try {
      const queryParams = querySchema.parse({
        status: url?.searchParams.get("status"),
        limit: url?.searchParams.get("limit"),
        offset: url?.searchParams.get("offset"),
      });

      const limit = Math.min(parseInt(queryParams.limit), 1000);
      const offset = parseInt(queryParams.offset);

      const dbStatusFilter = queryParams.status
        ? { status: { in: PUBLIC_STATUS_TO_DB[queryParams.status] } }
        : {};

      const engagements = await db.engagement.findMany({
        where: { workspaceId, ...dbStatusFilter },
        orderBy: { createdAt: "desc" },
        take: limit + offset,
        select: {
          id: true,
          title: true,
          status: true,
          consultingPhase: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const mapped = engagements.map((eng: any) => ({
        id: eng.id,
        name: eng.title,
        status: dbStatusToPublic(eng.status),
        currentStage: eng.consultingPhase || "DISCOVERY",
        progress: phaseToProgress(eng.consultingPhase, eng.status),
        createdAt: eng.createdAt.toISOString(),
        updatedAt: eng.updatedAt.toISOString(),
      }));

      const paginated = mapped.slice(offset, offset + limit);
      const publicDTOs = paginated.map((e: any) => toPublicEngagementDTO(e));

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.OPERATOR_QUEUE_VIEWED,
        workspaceId,
        actorId: ctx.verifiedActorId,
        entityType: "engagement",
        entityId: "list",
        payload: {
          count: publicDTOs.length,
          total: mapped.length,
          status: queryParams.status,
        },
      });

      return {
        workspaceId,
        engagements: publicDTOs,
        count: publicDTOs.length,
        total: mapped.length,
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
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
