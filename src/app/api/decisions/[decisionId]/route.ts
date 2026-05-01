import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getSession } from "@/services/auth";
import {
  enforceWorkspaceScoping,
  hasPermission,
  canActOnDecision,
  canOverride,
} from "@/middleware/workspace-enforcement";
import { z } from "zod";

const UpdateDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  override_reason: z.string().optional(),
  override_approved_at: z.string().optional(),
});

type UpdateDecisionInput = z.infer<typeof UpdateDecisionSchema>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const userId = session.user.id;
    const { decisionId } = await params;

    // Get workspace ID from query
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
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

    // Fetch decision with workspace scoping
    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId, workspaceId },  // Scope at DB level
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found in this workspace" },
        { status: 404 }
      );
    }

    // Parse input first to check what action is being requested
    const body = await request.json();
    const input = UpdateDecisionSchema.parse(body);

    // Check permission based on action
    if (input.override_reason) {
      // Override attempt - only admin can override
      if (!hasPermission(membership.role, "override")) {
        return NextResponse.json(
          { error: "Only administrators can override blocked decisions" },
          { status: 403 }
        );
      }
    } else {
      // Approve/reject attempt - reviewer can do this
      if (!hasPermission(membership.role, input.status === "approved" ? "approve" : "reject")) {
        return NextResponse.json(
          { error: `Insufficient permissions to ${input.status} decision` },
          { status: 403 }
        );
      }
    }

    // Check if user can act on this decision (must be assigned or admin)
    if (!canActOnDecision(userId, membership.role, decision)) {
      return NextResponse.json(
        {
          error: "Only assigned user can act on this decision",
        },
        { status: 403 }
      );
    }

    // Only allow status updates on pending decisions
    if (decision.status !== "pending" && decision.status !== "blocked") {
      return NextResponse.json(
        { error: `Cannot update ${decision.status} decision. Only pending or blocked decisions can be updated.` },
        { status: 400 }
      );
    }

    // Update decision status (with workspace scoping)
    const updated = await db.operatorItem.update({
      where: { id: decisionId, workspaceId },  // Scope at DB level
      data: {
        status: input.status,
        ...(input.override_reason && {
          override_reason: input.override_reason,
          override_approved_at: input.override_approved_at,
          reviewedBy: userId, // Track who reviewed/approved the override
        }),
        updatedAt: new Date(),
      },
    });

    // Log audit event
    await logAuditEvent({
      eventName: decision.status === "blocked" && input.override_reason ? "DECISION_OVERRIDDEN" : "DECISION_UPDATED",
      entityType: "Decision",
      entityId: decisionId,
      actorId: userId,
      role: null,
      before: {
        status: decision.status,
      },
      after: {
        status: input.status,
        override_reason: input.override_reason || null,
      },
      metadata: {
        action: input.status === "approved" ? "approve_decision" : "reject_decision",
        ...(input.override_reason && { override_reason: input.override_reason }),
        timestamp: new Date().toISOString(),
      },
      workspaceId,
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(
      {
        decisionId,
        status: updated.status,
        message: `Decision ${input.status} successfully.`,
      },
      { status: 200 }
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
    console.error(`Decision update failed: ${message}`);

    return NextResponse.json(
      { error: "Update failed", details: message },
      { status: 500 }
    );
  }
}
