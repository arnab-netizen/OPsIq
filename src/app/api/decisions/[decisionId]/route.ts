import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getSession } from "@/services/auth";
import { UnauthorizedError } from "@/infra/errors";
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
    const workspace = await requireWorkspaceContext();
    const session = await getSession();
    const userId = session?.user.id ?? null;

    if (!userId) {
      throw new UnauthorizedError("Authentication required");
    }

    const { decisionId } = await params;

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

    // Verify workspace access
    if (decision.workspaceId !== workspace.workspaceId) {
      throw new UnauthorizedError("Cross-workspace access denied");
    }

    // Only allow status updates on pending decisions
    if (decision.status !== "pending" && decision.status !== "blocked") {
      return NextResponse.json(
        { error: `Cannot update ${decision.status} decision. Only pending or blocked decisions can be updated.` },
        { status: 400 }
      );
    }

    // Parse and validate input
    const body = await request.json();
    const input = UpdateDecisionSchema.parse(body);

    // Update decision status
    const updated = await db.operatorItem.update({
      where: { id: decisionId },
      data: {
        status: input.status,
        ...(input.status === "approved" && {
          override_reason: input.override_reason || null,
          override_approved_at: input.override_approved_at || null,
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
      workspaceId: workspace.workspaceId,
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
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

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
