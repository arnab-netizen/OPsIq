import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/services/integrity/sign";
import {
  generateDecisionHash,
  canonicalStringify,
  createCanonicalPayload,
} from "@/services/integrity/hash";
import { verifyAsymmetricSignature, getPublicKey } from "@/services/integrity/asymmetric";
import { createDecisionResult } from "@/services/explanation/generate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inputs, decisionHash, signedHash, signature, timestamp } = body;

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

    // Legacy HMAC verification (backward compatibility)
    let legacySignatureValid = false;
    if (signedHash && typeof signedHash === "string") {
      legacySignatureValid = verifySignature(decisionHash, signedHash);
    }

    // New asymmetric signature verification
    let asymmetricValid = false;
    if (signature && typeof signature === "string") {
      const canonicalPayload = createCanonicalPayload(tempResult, inputs, timestamp);
      const canonicalString = canonicalStringify(canonicalPayload);
      const publicKey = getPublicKey();
      asymmetricValid = verifyAsymmetricSignature(
        canonicalString,
        signature,
        publicKey
      );
    }

    return NextResponse.json({
      valid: hashMatches && (legacySignatureValid || asymmetricValid),
      recomputedHash,
      signatureValid: legacySignatureValid,
      asymmetricValid,
      hashMatches,
      originalHash: decisionHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
