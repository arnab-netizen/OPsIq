import { NextRequest, NextResponse } from "next/server";
import { getActionsForEngagement } from "@/services/action";
import { requireAuth } from "@/infra/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ engagementId: string }> }
) {
  const user = await requireAuth();
  const { engagementId } = await context.params;

  try {
    const actions = await getActionsForEngagement(engagementId);
    return NextResponse.json(actions);
  } catch (error) {
    console.error("Error fetching actions:", error);
    return NextResponse.json(
      { error: "Failed to fetch actions" },
      { status: 500 }
    );
  }
}
