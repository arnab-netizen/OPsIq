import { NextRequest, NextResponse } from "next/server";
import { runSystem } from "@/services/system/run";
import { createBaseline } from "@/services/onboarding/basic";
import { generateOperatorItems } from "@/services/operator/generate";
import { addItems } from "@/services/operator/store";
import { resolveServerRole, getSession } from "@/services/auth/server-role";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { createDecisionResult } from "@/services/explanation/generate";
import { DecisionResult } from "@/domain/decision/types";

export async function POST(request: NextRequest) {
  let decisionResult: DecisionResult | null = null;

  try {
    // Enforce server-side auth
    const role = await resolveServerRole();
    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canEdit(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // 1. Parse body
    const body = await request.json();
    const { revenue, cost } = body;

    // Validate input types
    if (typeof revenue !== "number" || typeof cost !== "number") {
      decisionResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        "INVALID_INPUT"
      );
      return NextResponse.json(decisionResult, { status: 400 });
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

    // 4. Call runSystem with error handling for decision validation
    let result;
    try {
      result = runSystem(inputMetrics);
    } catch (systemError) {
      const errorMsg =
        systemError instanceof Error ? systemError.message : "Unknown error";

      if (errorMsg === "LOW_CONFIDENCE_BLOCKED") {
        decisionResult = createDecisionResult(
          {
            baselineRevenue: revenue,
            baselineCost: cost,
            deltaRevenue: revenue * 0.1,
            deltaCost: cost * 0.05,
            confidence: 0.75,
            expectedImpact: revenue * 0.1 - cost * 0.05,
          },
          false,
          "LOW_CONFIDENCE"
        );
      } else if (errorMsg === "NON_POSITIVE_IMPACT_BLOCKED") {
        decisionResult = createDecisionResult(
          {
            baselineRevenue: revenue,
            baselineCost: cost,
            deltaRevenue: revenue * 0.1,
            deltaCost: cost * 0.05,
            confidence: 0.75,
            expectedImpact: revenue * 0.1 - cost * 0.05,
          },
          false,
          "NON_POSITIVE_IMPACT"
        );
      } else {
        decisionResult = createDecisionResult(
          {
            baselineRevenue: revenue,
            baselineCost: cost,
            deltaRevenue: revenue * 0.1,
            deltaCost: cost * 0.05,
            confidence: 0.75,
            expectedImpact: revenue * 0.1 - cost * 0.05,
          },
          false,
          "INVALID_INPUT"
        );
      }
      return NextResponse.json(decisionResult, { status: 400 });
    }

    // 5. Create approved decision result with explanation
    decisionResult = createDecisionResult(
      {
        baselineRevenue: revenue,
        baselineCost: cost,
        deltaRevenue: revenue * 0.1,
        deltaCost: cost * 0.05,
        confidence: 0.75,
        expectedImpact: result.impact.impactExpected,
      },
      true
    );

    // 6. Generate operator items and store them
    const operatorItems = generateOperatorItems(result.decisions, result.impact);
    await addItems(operatorItems);

    // Get actor ID for audit
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    // Log audit event for run execution
    await logAuditEvent({
      eventName: "RUN",
      entityType: "Decision",
      entityId: "system-run",
      actorId,
      role,
      before: null,
      after: decisionResult,
      metadata: {
        inputRevenue: revenue,
        inputCost: cost,
      },
    });

    // 7. Return decision result with explanation
    return NextResponse.json(decisionResult);
  } catch (error) {
    if (decisionResult) {
      return NextResponse.json(decisionResult, { status: 400 });
    }
    return NextResponse.json(
      {
        decision: "BLOCKED",
        expectedImpact: 0,
        confidence: 0,
        explanation: {
          summary: "Decision blocked due to internal error",
          drivers: [],
          assumptions: [],
          risks: ["System error occurred"],
          missingData: [],
        },
        reason: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }
}
