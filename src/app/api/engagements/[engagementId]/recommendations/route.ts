import { NextRequest, NextResponse } from "next/server";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { requireAuth } from "@/infra/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ engagementId: string }> }
) {
  const user = await requireAuth();
  const { engagementId } = await context.params;

  try {
    const recommendations = await getRecommendationsForEngagement(engagementId);
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
