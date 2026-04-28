import { NextResponse } from "next/server";
import { getCalibrationRecords } from "@/services/operator/store";
import { calculateSummary } from "@/services/calibration/summary";

export async function GET() {
  try {
    const records = getCalibrationRecords();
    const summary = calculateSummary(records);

    return NextResponse.json({
      records,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
