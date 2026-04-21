import { NextRequest, NextResponse } from "next/server";
import { updateAction, type UpdateActionInput } from "@/services/action-execution";
import { db } from "@/lib/db";
import { z } from "zod";

/**
 * PATCH /api/opsiq/actions/{actionId}
 *
 * Updates action status and tracking with state machine validation.
 *
 * Request body:
 * {
 *   status?: "DRAFT" | "READY" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "FAILED"
 *   notes?: string (required for COMPLETED status)
 *   blockReason?: string (required for BLOCKED status)
 *   ownerUserId?: string
 *   dueDate?: ISO8601 datetime string
 * }
 */

const UpdateActionSchema = z.object({
  status: z
    .enum(["DRAFT", "READY", "IN_PROGRESS", "BLOCKED", "COMPLETED", "FAILED"])
    .optional(),
  notes: z.string().optional(),
  blockReason: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { actionId: string } }
) {
  try {
    const { actionId } = params;

    // Verify action exists
    const action = await db.actionRecord.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      return NextResponse.json(
        { error: "Action not found" },
        { status: 404 }
      );
    }

    // Verify engagement exists
    const engagement = await db.engagement.findUnique({
      where: { id: action.engagementId },
      select: { id: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    // Parse and validate input
    const body = await request.json();
    const validation = UpdateActionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = validation.data;

    // Convert ISO date string to Date if provided
    const updateInput: UpdateActionInput = {
      ...input,
    } as UpdateActionInput;

    if (input.dueDate) {
      updateInput.dueDate = new Date(input.dueDate);
    }

    // Get actor ID from session context (TODO: implement session integration)
    const actorId = "system";

    // Update action with state machine validation
    const updatedAction = await updateAction(
      actionId,
      updateInput,
      actorId
    );

    return NextResponse.json(updatedAction, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid transition")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes("Cannot")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("Action update error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
