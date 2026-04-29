import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { queryAuditEvents } from "@/infra/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
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
      workspaceId: workspace.workspaceId,
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
      try {
        filter.from = new Date(fromDate);
      } catch {
        return NextResponse.json(
          { error: "Invalid fromDate format" },
          { status: 400 }
        );
      }
    }

    if (toDate) {
      try {
        filter.to = new Date(toDate);
      } catch {
        return NextResponse.json(
          { error: "Invalid toDate format" },
          { status: 400 }
        );
      }
    }

    // Validate date range if both provided
    if (filter.from && filter.to && filter.from > filter.to) {
      return NextResponse.json(
        { error: "fromDate must be before toDate" },
        { status: 400 }
      );
    }

    // Set limit with max of 100
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json(
          { error: "Invalid limit" },
          { status: 400 }
        );
      }
      filter.limit = Math.min(parsedLimit, 100);
    } else {
      filter.limit = 100;
    }

    // Query audit events
    const events = await queryAuditEvents(filter);

    return NextResponse.json({
      events: events.map((event: Prisma.AuditEventGetPayload<{}>) => ({
        id: event.id,
        eventName: event.eventName,
        actorId: event.actorId,
        actorType: event.actorType,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        correlationId: event.correlationId,
        visibility: event.visibility,
        occurredAt: event.occurredAt.toISOString(),
      })),
      count: events.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
