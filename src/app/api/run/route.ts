import { NextRequest, NextResponse } from "next/server";
import { runSystem } from "@/services/system/run";
import { createBaseline } from "@/services/onboarding/basic";
import { generateOperatorItems } from "@/services/operator/generate";
import { addItems } from "@/services/operator/store";
import { resolveServerRole, getSession } from "@/services/auth/server-role";
import { canEdit } from "@/services/auth/access";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { logAuditEvent } from "@/services/audit/audit-log";
import { createDecisionResult } from "@/services/explanation/generate";
import { createIntegrityPayload } from "@/services/integrity/hash";
import { createSignaturePayload } from "@/services/integrity/sign";
import { classifyProblem } from "@/services/problem/classifier";
import { calculateBaselineMetrics } from "@/services/baseline/calculator";
import { DecisionResult } from "@/domain/decision/types";

function addIntegrity(
  result: DecisionResult,
  inputsSnapshot?: Record<string, unknown>
): DecisionResult {
  const integrity = createIntegrityPayload(result);
  const signature = createSignaturePayload(integrity.decisionHash);

  return {
    ...result,
    workspaceId: result.workspaceId,
    ...integrity,
    ...signature,
    inputsSnapshot,
  };
}

export async function POST(request: NextRequest) {
  let decisionResult: DecisionResult | null = null;
  let workspace;
  let userId: string | null = null;

  try {
    // Get workspace context early (fail closed if missing)
    workspace = await requireWorkspaceContext();

    // Get session for user identity
    const session = await getSession();
    userId = session?.user.id ?? null;

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

    // Capture inputs snapshot for replay
    const inputsSnapshot = {
      revenue,
      cost,
      timestamp: new Date().toISOString(),
    };

    // Validate input types
    if (typeof revenue !== "number" || typeof cost !== "number") {
      const baseResult = createDecisionResult(
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
      decisionResult = addIntegrity(
        {
          ...baseResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
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
        const lowConfResult = createDecisionResult(
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
        decisionResult = addIntegrity(
          {
            ...lowConfResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      } else if (errorMsg === "NON_POSITIVE_IMPACT_BLOCKED") {
        const nonPosResult = createDecisionResult(
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
        decisionResult = addIntegrity(
          {
            ...nonPosResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      } else {
        const unknownErrResult = createDecisionResult(
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
        decisionResult = addIntegrity(
          {
            ...unknownErrResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      }
      return NextResponse.json(decisionResult, { status: 400 });
    }

    // 5. Classify problem type based on financial impact
    const problemType = classifyProblem({
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      expectedImpact: result.impact.impactExpected,
    });

    // 6. Calculate baseline impact metrics
    const baselineMetrics = calculateBaselineMetrics({
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      expectedImpact: result.impact.impactExpected,
    });

    // 8. Create approved decision result with explanation
    const approvedResult = createDecisionResult(
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
    decisionResult = addIntegrity(
      {
        ...approvedResult,
        workspaceId: workspace.workspaceId,
        ownerUserId: userId || undefined,
        createdBy: userId || undefined,
        problemType,
        baselineValue: baselineMetrics.baselineValue,
        projectedWithoutAction: baselineMetrics.projectedWithoutAction,
      },
      inputsSnapshot
    );

    if (!userId) {
      return NextResponse.json(
        { error: "User identity required" },
        { status: 403 }
      );
    }

    // 9. Generate operator items and store them
    const operatorItems = generateOperatorItems(
      result.decisions,
      result.impact,
      workspace.workspaceId,
      userId,
      userId,
      problemType,
      baselineMetrics
    );
    await addItems(operatorItems);

    // Get actor ID for audit
    const actorId = userId;

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
    const finalErrResult = createDecisionResult(
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
    const errorResult = addIntegrity(
      {
        ...finalErrResult,
        workspaceId: workspace?.workspaceId || "unknown",
        ownerUserId: userId || undefined,
        createdBy: userId || undefined,
      },
      {}
    );
    return NextResponse.json(errorResult, { status: 400 });
  }
}
