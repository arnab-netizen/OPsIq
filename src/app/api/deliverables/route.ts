import { NextRequest, NextResponse } from "next/server";
import { getDeliverablesForEngagement } from "@/services/deliverable";
import { requireAuth } from "@/infra/auth";

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  const engagementId = request.nextUrl.searchParams.get("engagementId");

  if (!engagementId) {
    return NextResponse.json(
      { error: "engagementId is required" },
      { status: 400 }
    );
  }

  try {
    const deliverables = await getDeliverablesForEngagement(engagementId);
    return NextResponse.json(deliverables);
  } catch (error) {
    console.error("Error fetching deliverables:", error);
    return NextResponse.json(
      { error: "Failed to fetch deliverables" },
      { status: 500 }
    );
  }
}
