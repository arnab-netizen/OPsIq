import { NextRequest, NextResponse } from "next/server";
import { getDeliverableById } from "@/services/deliverable";
import { requireAuth } from "@/infra/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deliverableId: string }> }
) {
  const user = await requireAuth();
  const { deliverableId } = await context.params;

  try {
    const deliverable = await getDeliverableById(deliverableId);
    if (!deliverable) {
      return NextResponse.json(
        { error: "Deliverable not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(deliverable);
  } catch (error) {
    console.error("Error fetching deliverable:", error);
    return NextResponse.json(
      { error: "Failed to fetch deliverable" },
      { status: 500 }
    );
  }
}
