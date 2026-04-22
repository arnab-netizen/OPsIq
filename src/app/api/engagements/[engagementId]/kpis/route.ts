import { NextRequest, NextResponse } from "next/server";
import { getKPIsForEngagement } from "@/services/kpi";
import { requireAuth } from "@/infra/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ engagementId: string }> }
) {
  const user = await requireAuth();
  const { engagementId } = await context.params;

  try {
    const kpis = await getKPIsForEngagement(engagementId);
    return NextResponse.json(kpis);
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    return NextResponse.json(
      { error: "Failed to fetch KPIs" },
      { status: 500 }
    );
  }
}
