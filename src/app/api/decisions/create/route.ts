import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { checkRateLimit } from "@/services/production/safety-config";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { z } from "zod";

// Input validation schema
const CreateDecisionSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  confidence: z.number().min(0).max(1),
  risk: z.enum(["low", "medium", "high"]),
  financialInputs: z.object({
    revenue: z.number().optional().default(0),
    cost: z.number().optional().default(0),
    expectedROI: z.number().optional().default(0),
  }).optional(),
});

type CreateDecisionInput = z.infer<typeof CreateDecisionSchema>;

/**
 * POST /api/decisions/create
 *
 * Create a new decision in pending state without evaluation.
 * Returns decisionId for use in decision detail/action flows.
 *
 * Does NOT run guardrails, decision gates, or blocking logic.
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

    // Get workspace ID from request body
    const body = await request.json();
    const workspaceId = body.workspaceId;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized or invalid workspace" },
        { status: 403 }
      );
    }

    // Check permission to create
    if (!hasPermission(membership.role, "create")) {
      return NextResponse.json(
        { error: "Insufficient permissions to create decision" },
        { status: 403 }
      );
    }

    // Check rate limit per workspace
    if (!checkRateLimit(workspaceId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Parse and validate input
    const input = CreateDecisionSchema.parse(body);

    // Calculate expected impact from financial inputs
    const impactExpected = (input.financialInputs?.revenue || 0) - (input.financialInputs?.cost || 0);
    const impactRange = Math.abs(impactExpected * 0.3); // ±30% range

    // Create decision in pending state
    const decision = await db.operatorItem.create({
      data: {
        // IDs and workspace
        workspaceId,
        createdBy: userId,
        ownerUserId: userId,

        // Decision content (raw input, no evaluation)
        problem: input.title,
        action: input.description,
        confidence: input.confidence,

        // Financial impact
        impactExpected,
        impactLow: impactExpected - impactRange,
        impactHigh: impactExpected + impactRange,

        // Status and metadata
        status: "pending", // Raw intake, not evaluated
        blockStage: null,
        blockReason: null,
        decisionType: "general",
        problemType: input.risk === "high" ? "growth_block" : "revenue_leak",

        // Input snapshot for audit trail
        inputsSnapshot: {
          title: input.title,
          description: input.description,
          confidence: input.confidence,
          risk: input.risk,
          financialInputs: input.financialInputs,
          createdAt: new Date().toISOString(),
        },

        // Defaults
        priorityScore: 0.5,
        executionStatus: "not_started",
        engineVersion: "v1.0.0",
      },
    });

    // Log decision creation audit event
    await logAuditEvent({
      eventName: "DECISION_CREATED",
      entityType: "Decision",
      entityId: decision.id,
      actorId: userId,
      role: null,
      before: null,
      after: {
        id: decision.id,
        status: "pending",
        title: input.title,
        impactExpected,
      },
      metadata: {
        action: "create_decision",
        risk: input.risk,
        confidence: input.confidence,
        financialInputs: input.financialInputs,
        createdAt: new Date().toISOString(),
      },
      workspaceId,
    }).catch((auditError) => {
      // Log but don't fail on audit error
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(
      {
        decisionId: decision.id,
        status: decision.status,
        createdAt: decision.createdAt,
        message: "Decision created successfully. Status is pending.",
      },
      { status: 201 }
    );
  } catch (error) {
    // Handle validation errors
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

    // Handle other errors
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Decision creation failed: ${message}`);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
