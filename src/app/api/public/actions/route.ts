/**
 * GET /api/public/actions
 * List actions with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace membership (read-only)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicActionDTO, PublicAPIError } from "@/services/public-api.service";
import { db } from "@/lib/db";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const querySchema = z.object({
  status: z.enum(["draft", "assigned", "in_progress", "blocked", "completed", "verified"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

const PUBLIC_STATUS_TO_DB: Record<string, string[]> = {
  draft: ["draft"],
  assigned: ["pending"],
  in_progress: ["in_progress"],
  blocked: ["blocked"],
  completed: ["done", "outcome_recorded", "closed"],
  verified: ["verified"],
};

function dbStatusToPublic(status: string): "draft" | "assigned" | "in_progress" | "blocked" | "completed" | "verified" {
  if (status === "pending") return "assigned";
  if (status === "in_progress") return "in_progress";
  if (status === "done" || status === "outcome_recorded" || status === "closed") return "completed";
  if (status === "blocked") return "blocked";
  if (status === "verified") return "verified";
  return "draft";
}

function priorityScoreToPriority(score: number): "low" | "medium" | "high" | "critical" {
  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "critical";
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const url = ctx.request?.nextUrl;

    try {
      const queryParams = querySchema.parse({
        status: url?.searchParams.get("status"),
        priority: url?.searchParams.get("priority"),
        limit: url?.searchParams.get("limit"),
        offset: url?.searchParams.get("offset"),
      });

      const limit = Math.min(parseInt(queryParams.limit), 1000);
      const offset = parseInt(queryParams.offset);

      const dbStatusFilter = queryParams.status
        ? { status: { in: PUBLIC_STATUS_TO_DB[queryParams.status] } }
        : {};

      const items = await db.operatorItem.findMany({
        where: { workspaceId, ...dbStatusFilter },
        orderBy: { createdAt: "desc" },
        take: limit + offset,
        select: {
          id: true,
          problem: true,
          action: true,
          status: true,
          priorityScore: true,
          dueAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const mapped = items.map((item: any) => ({
        id: item.id,
        name: item.problem,
        description: item.action,
        status: dbStatusToPublic(item.status),
        priority: priorityScoreToPriority(item.priorityScore),
        dueDate: item.dueAt?.toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));

      const filtered = queryParams.priority
        ? mapped.filter((a: any) => a.priority === queryParams.priority)
        : mapped;

      const paginated = filtered.slice(offset, offset + limit);
      const publicDTOs = paginated.map((a: any) => toPublicActionDTO(a));

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.OPERATOR_QUEUE_VIEWED,
        workspaceId,
        actorId: ctx.verifiedActorId,
        entityType: "action",
        entityId: "list",
        payload: {
          count: publicDTOs.length,
          total: filtered.length,
          status: queryParams.status,
          priority: queryParams.priority,
        },
      });

      return {
        workspaceId,
        actions: publicDTOs,
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
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ACTION_VIEW] }
);
