/**
 * GET /api/public/engagements
 * List engagements with public-safe DTOs (no cost, profitability, internal fields)
 * Public API - requires workspace membership (read-only)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toPublicEngagementDTO, PublicAPIError } from "@/services/public-api.service";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const querySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  limit: z.string().optional().default("100"),
  offset: z.string().optional().default("0"),
});

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
        actorId: ctx.verifiedActorId,
        entityType: "engagement",
        entityId: "list",
        payload: {
          count: publicDTOs.length,
          total: filtered.length,
          status: queryParams.status,
        },
      });

      return {
        workspaceId,
        engagements: publicDTOs,
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
