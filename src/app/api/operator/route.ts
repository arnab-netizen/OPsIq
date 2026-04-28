import { NextResponse } from "next/server";
import { getItems } from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";

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
