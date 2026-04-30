import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { z } from "zod";

const IntakeSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  risk: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

type IntakeInput = z.infer<typeof IntakeSchema>;

/**
 * POST /api/decisions/intake
 *
 * Simple decision intake endpoint.
 * Accepts minimal fields and auto-creates pending decision.
 *
 * Future: webhook, email parser, CSV upload will use this.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    // Get workspace ID from query param
    let workspaceId: string;
    const queryWorkspaceId = request.nextUrl.searchParams.get("workspaceId");

    // If no workspace specified, use user's first active workspace
    if (!queryWorkspaceId) {
      const membership = await db.workspaceMembership.findFirst({
        where: {
          userId,
          isActive: true,
        },
      });

      if (!membership) {
        return NextResponse.json(
          { error: "No active workspace found" },
          { status: 400 }
        );
      }

      workspaceId = membership.workspaceId;
    } else {
      // Verify user is member of specified workspace
      const membership = await enforceWorkspaceScoping(request, queryWorkspaceId);
      if (!membership) {
        return NextResponse.json(
          { error: "Unauthorized or invalid workspace" },
          { status: 403 }
        );
      }
      workspaceId = queryWorkspaceId;
    }

    // Parse and validate input
    const body = await request.json();
    const input = IntakeSchema.parse(body);

    // Create decision
    const decision = await db.operatorItem.create({
      data: {
        workspaceId,
        createdBy: userId,
        ownerUserId: userId,
        problem: input.title,
        action: input.description,
        confidence: input.confidence,
        impactExpected: 0,
        impactLow: 0,
        impactHigh: 0,
        status: "pending",
        blockStage: null,
        blockReason: null,
        decisionType: "general",
        problemType: input.risk === "high" ? "growth_block" : "revenue_leak",
        inputsSnapshot: {
          title: input.title,
          description: input.description,
          confidence: input.confidence,
          risk: input.risk,
          createdAt: new Date().toISOString(),
        },
        priorityScore: 0.5,
        executionStatus: "not_started",
        engineVersion: "v1.0.0",
      },
    });

    // Log intake event
    await logAuditEvent({
      eventName: "DECISION_INTAKE",
      entityType: "Decision",
      entityId: decision.id,
      actorId: userId,
      role: null,
      before: null,
      after: {
        id: decision.id,
        status: "pending",
        title: input.title,
      },
      metadata: {
        action: "intake_decision",
        source: "api",
        confidence: input.confidence,
        risk: input.risk,
        createdAt: new Date().toISOString(),
      },
      workspaceId,
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(
      {
        decisionId: decision.id,
        status: "pending",
        createdAt: decision.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Intake failed: ${message}`);

    return NextResponse.json(
      { error: "Intake failed", details: message },
      { status: 500 }
    );
  }
}
