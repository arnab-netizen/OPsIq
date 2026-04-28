import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/services/integrity/sign";
import { generateDecisionHash } from "@/services/integrity/hash";
import { createDecisionResult } from "@/services/explanation/generate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, decisionHash, signedHash } = body;

    // Validate inputs
    if (!inputs || typeof inputs !== "object") {
      return NextResponse.json(
        { error: "Invalid inputs: must be an object" },
        { status: 400 }
      );
    }

    if (!decisionHash || typeof decisionHash !== "string") {
      return NextResponse.json(
        { error: "Invalid decisionHash: must be a string" },
        { status: 400 }
      );
    }

    if (!signedHash || typeof signedHash !== "string") {
      return NextResponse.json(
        { error: "Invalid signedHash: must be a string" },
        { status: 400 }
      );
    }

    // Verify signature
    const signatureValid = verifySignature(decisionHash, signedHash);

    // Recompute hash from inputs
    const inputMetrics: Record<string, number> = {
      baselineRevenue: inputs.baselineRevenue || 0,
      baselineCost: inputs.baselineCost || 0,
      revenueChange: inputs.revenueChange || 0,
      costChange: inputs.costChange || 0,
      confidence: inputs.confidence || 0,
      risk: inputs.risk || 0,
    };

    // Create a temporary decision result to recompute hash
    const tempResult = createDecisionResult(
      {
        baselineRevenue: inputMetrics.baselineRevenue,
        baselineCost: inputMetrics.baselineCost,
        deltaRevenue: inputMetrics.revenueChange,
        deltaCost: inputMetrics.costChange,
        confidence: inputMetrics.confidence,
        expectedImpact:
          inputMetrics.revenueChange - inputMetrics.costChange,
      },
      inputMetrics.confidence >= 0.5 &&
        inputMetrics.revenueChange - inputMetrics.costChange > 0
    );

    const recomputedHash = generateDecisionHash(tempResult);
    const hashMatches = recomputedHash === decisionHash;

    return NextResponse.json({
      valid: hashMatches && signatureValid,
      recomputedHash,
      signatureValid,
      hashMatches,
      originalHash: decisionHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
