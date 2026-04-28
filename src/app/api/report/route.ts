import { NextResponse } from "next/server";
import { generateReport } from "@/services/report/engine";

export async function GET() {
  try {
    const report = generateReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
