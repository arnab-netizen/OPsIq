import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { queryAuditEvents } from "@/infra/audit";
import type { Prisma } from "@/generated/prisma/client";

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // Parse query parameters
    const searchParams = ctx.request!.nextUrl.searchParams;
    const decisionId = searchParams.get("decisionId");
    const userId = searchParams.get("userId");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const limit = searchParams.get("limit");

    // Build filter object
    const filter: {
      workspaceId: string;
      entityId?: string;
      entityType?: string;
      actorId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {
      workspaceId: ctx.verifiedWorkspaceId,
    };

    // Add decisionId filter (maps to entityId for OperatorItem)
    if (decisionId) {
      filter.entityId = decisionId;
      filter.entityType = "Decision";
    }

    // Add user filter (maps to actorId)
    if (userId) {
      filter.actorId = userId;
    }

    // Add date range filters
    if (fromDate) {
      filter.from = new Date(fromDate);
    }

    if (toDate) {
      filter.to = new Date(toDate);
    }

    // Validate date range if both provided
    if (filter.from && filter.to && filter.from > filter.to) {
      throw new Error("fromDate must be before toDate");
    }

    // Set limit with max of 100
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        throw new Error("Invalid limit");
      }
      filter.limit = Math.min(parsedLimit, 100);
    } else {
      filter.limit = 100;
    }

    // Query audit events
    const events = await queryAuditEvents(filter);

    return {
      events: events.map((event: Prisma.AuditEventGetPayload<unknown>) => ({
        id: event.id,
        eventName: event.eventName,
        actorId: event.actorId,
        actorType: event.actorType,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        correlationId: event.correlationId,
        visibility: event.visibility,
        occurredAt: event.occurredAt ? event.occurredAt.toISOString() : null,
      })),
      count: events.length,
    };
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.AUDIT_VIEW],
  }
);
