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
import { isValidTransition } from "@/services/decision/status-management";
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

    // Fetch decision
    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    // Verify decision belongs to workspace
    if (decision.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Decision not found in this workspace" },
        { status: 404 }
      );
    }

    // Parse input first to check what action is being requested
    const body = await request.json();
    const input = UpdateDecisionSchema.parse(body);

    // Validate status transition
    if (!isValidTransition(decision.status, input.status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${decision.status} to ${input.status}`,
          code: "INVALID_TRANSITION",
        },
        { status: 400 }
      );
    }

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

    // Update decision status with timestamp
    const timestamp = new Date();
    const updated = await db.operatorItem.update({
      where: { id: decisionId },
      data: {
        status: input.status,
        ...(input.override_reason && {
          override_reason: input.override_reason,
          override_approved_at: input.override_approved_at || timestamp.toISOString(),
          reviewedBy: userId, // Track who reviewed/approved the override
        }),
        updatedAt: timestamp,
      },
    });

    // Determine event name based on transition
    let eventName = "DECISION_STATUS_CHANGED";
    if (input.override_reason) {
      eventName = "DECISION_OVERRIDDEN";
    } else if (input.status === "approved") {
      eventName = "DECISION_APPROVED";
    } else if (input.status === "rejected") {
      eventName = "DECISION_REJECTED";
    }

    // Log audit event with complete details
    await logAuditEvent({
      eventName,
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
        from: decision.status,
        to: input.status,
        ...(input.override_reason && { override_reason: input.override_reason }),
        timestamp: timestamp.toISOString(),
      },
      workspaceId,
    }).catch((auditError: unknown) => {
      console.error(
        `Audit logging failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`
      );
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
