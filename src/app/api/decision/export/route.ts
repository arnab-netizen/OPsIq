import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
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

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // Parse query parameter for decision ID
    const searchParams = ctx.request!.nextUrl.searchParams;
    const decisionId = searchParams.get("decisionId");

    if (!decisionId) {
      throw new Error("Missing required parameter: decisionId");
    }

    // Fetch operator item
    const item = await db.operatorItem.findFirst({
      where: {
        id: decisionId,
        workspaceId: ctx.verifiedWorkspaceId,
      },
    });

    if (!item) {
      throw new Error("Decision not found");
    }

    // Fetch audit trail for this decision
    const auditEvents = await queryAuditEvents({
      workspaceId: ctx.verifiedWorkspaceId,
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
      auditTrail: auditEvents.map((event: Prisma.AuditEventGetPayload<unknown>) => ({
        eventName: event.eventName,
        actorId: event.actorId,
        occurredAt: event.occurredAt ? event.occurredAt.toISOString() : null,
        payload: event.payload as Record<string, unknown> | null,
      })),
    };

    // Serialize with deterministic JSON (sorted keys)
    const jsonString = JSON.stringify(exportData, Object.keys(exportData).sort(), 2);
    const deterministicData = JSON.parse(jsonString);

    return deterministicData;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.AUDIT_VIEW],
  }
);
