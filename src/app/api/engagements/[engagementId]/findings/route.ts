import { NextRequest, NextResponse } from "next/server";
import { getFindingsForEngagement } from "@/services/finding";
import { requireAuth } from "@/infra/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ engagementId: string }> }
) {
  const user = await requireAuth();
  const { engagementId } = await context.params;

  try {
    const findings = await getFindingsForEngagement(engagementId);
    return NextResponse.json(findings);
  } catch (error) {
    console.error("Error fetching findings:", error);
    return NextResponse.json(
      { error: "Failed to fetch findings" },
      { status: 500 }
    );
  }
}
