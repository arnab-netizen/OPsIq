import { NextResponse, NextRequest } from "next/server";
import { getItems } from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";
import { updateItem } from "@/services/operator/store";

export async function GET() {
  try {
    const items = getItems();
    const sorted = sortByPriority(items);
    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, actualOutcome } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    updateItem(id, { status, actualOutcome });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
