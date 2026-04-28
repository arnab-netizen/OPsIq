import { NextRequest, NextResponse } from "next/server";
import { runSystem } from "@/services/system/run";
import { createBaseline } from "@/services/onboarding/basic";
import { generateOperatorItems } from "@/services/operator/generate";
import { addItems } from "@/services/operator/store";

export async function POST(request: NextRequest) {
  try {
    // 1. Parse body
    const body = await request.json();
    const { revenue, cost } = body;

    // Validate input types
    if (typeof revenue !== "number" || typeof cost !== "number") {
      return NextResponse.json(
        { error: "Invalid input: revenue and cost must be numbers" },
        { status: 400 }
      );
    }

    // 2. Create baseline using onboarding service
    const baseline = createBaseline(revenue, cost);

    // 3. Build inputMetrics
    const inputMetrics: Record<string, number> = {
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      confidence: 0.75,
      risk: 5,
    };

    // 4. Call runSystem
    const result = runSystem(inputMetrics);

    // 5. Generate operator items and store them
    const operatorItems = generateOperatorItems(result.decisions, result.impact);
    await addItems(operatorItems);

    // 6. Return JSON
    return NextResponse.json({
      decisions: result.decisions,
      impact: result.impact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
