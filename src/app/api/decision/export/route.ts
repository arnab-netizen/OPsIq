import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";
import { queryAuditEvents } from "@/infra/audit";
import type { Prisma } from "@/generated/prisma/client";

interface DecisionExport {
  decision: {
    id: string;
    workspaceId: string;
    problem: string;
    action: string;
    impactExpected: number;
    impactLow: number;
    impactHigh: number;
    confidence: number;
    decisionType: string;
    status: string;
    createdAt: string;
    ownerUserId: string;
    createdBy: string;
  };
  inputs: Record<string, unknown> | null;
  outputs: {
    expectedOutcome: string | null;
    actualOutcome: string | null;
    explanation: Record<string, unknown> | undefined;
  };
  expectedImpact: number;
  actualOutcome: string | null;
  delta: number | null;
  accuracy: number | null;
  auditTrail: Array<{
    eventName: string;
    actorId: string | null;
    occurredAt: string;
    payload: Record<string, unknown> | null;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Parse query parameter for decision ID
    const searchParams = request.nextUrl.searchParams;
    const decisionId = searchParams.get("decisionId");

    if (!decisionId) {
      return NextResponse.json(
        { error: "Missing required parameter: decisionId" },
        { status: 400 }
      );
    }

    // Fetch operator item
    const item = await db.operatorItem.findFirst({
      where: {
        id: decisionId,
        workspaceId: workspace.workspaceId,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    // Fetch audit trail for this decision
    const auditEvents = await queryAuditEvents({
      workspaceId: workspace.workspaceId,
      entityId: decisionId,
    });

    // Build export object with deterministic structure
    const exportData: DecisionExport = {
      decision: {
        id: item!.id,
        workspaceId: item!.workspaceId,
        problem: item!.problem,
        action: item!.action,
        impactExpected: Number(item!.impactExpected),
        impactLow: Number(item!.impactLow),
        impactHigh: Number(item!.impactHigh),
        confidence: Number(item!.confidence),
        decisionType: item!.decisionType || "general",
        status: item!.status,
        createdAt: item!.createdAt.toISOString(),
        ownerUserId: item!.ownerUserId,
        createdBy: item!.createdBy,
      },
      inputs: item!.inputsSnapshot ? (item!.inputsSnapshot as Record<string, unknown>) : null,
      outputs: {
        expectedOutcome: item!.expectedOutcome,
        actualOutcome: item!.actualOutcome,
        explanation: item!.explanation ? (item!.explanation as Record<string, unknown>) : undefined,
      },
      expectedImpact: Number(item!.impactExpected),
      actualOutcome: item!.actualOutcome,
      delta: item!.outcomeDelta ? Number(item!.outcomeDelta) : null,
      accuracy: item!.decisionAccuracy ? Number(item!.decisionAccuracy) : null,
      auditTrail: auditEvents.map((event: Prisma.AuditEventGetPayload<{}>) => ({
        eventName: event.eventName,
        actorId: event.actorId,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload as Record<string, unknown> | null,
      })),
    };

    // Serialize with deterministic JSON (sorted keys)
    const jsonString = JSON.stringify(exportData, Object.keys(exportData).sort(), 2);
    const deterministicData = JSON.parse(jsonString);

    return NextResponse.json(deterministicData);
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
