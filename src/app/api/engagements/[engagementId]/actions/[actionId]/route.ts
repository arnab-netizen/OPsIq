import { NextRequest, NextResponse } from "next/server";
import { updateActionStatus } from "@/services/action";
import { requireAuth } from "@/infra/auth";
import { ValidationError } from "@/infra/errors";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ engagementId: string; actionId: string }> }
) {
  const user = await requireAuth();
  const { actionId } = await context.params;
  const body = await request.json();

  try {
    if (!body.version) {
      throw new ValidationError("Version is required");
    }

    const updated = await updateActionStatus(
      actionId,
      body,
      user.id
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating action:", error);
    return NextResponse.json(
      { error: "Failed to update action" },
      { status: 500 }
    );
  }
}
