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
import { createEventLogger } from "@/lib/observability/log";
import { emitWebhookAsync } from "@/lib/integrations/webhook";
import { normalizeDecisionInput, validateNormalizedMetrics } from "@/lib/decision/run";
import { evaluateDecisionGate, gateResultToPayload } from "@/services/control/decision-gate";
import { evaluateGuardrails, formatGuardrailViolations } from "@/services/control/guardrails";

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
  let logger: ReturnType<typeof createEventLogger> | null = null;

  try {
    // Get workspace context early (fail closed if missing)
    workspace = await requireWorkspaceContext();

    // Initialize logger once workspace is available
    logger = createEventLogger("api_run", workspace.workspaceId);

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
    const { revenue, cost, currency } = body;

    // Capture inputs snapshot for replay
    const inputsSnapshot = {
      revenue,
      cost,
      currency: currency || "INR",
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

    // 2. Normalize financial inputs before any calculations
    // Default FX rates for common currencies (can be extended or loaded from business profile)
    const defaultFxRates: Record<string, number> = {
      INR: 1.0,
      USD: 83.0, // 1 USD = 83 INR (approximate)
      EUR: 90.0, // 1 EUR = 90 INR (approximate)
      GBP: 105.0, // 1 GBP = 105 INR (approximate)
    };

    let normalizedMetrics;
    try {
      normalizedMetrics = normalizeDecisionInput(
        {
          revenue,
          cost,
          currency: currency || "INR",
          baseCurrency: "INR",
          confidence: 0.75,
          risk: 5,
        },
        defaultFxRates
      );

      // Validate normalized metrics
      validateNormalizedMetrics(normalizedMetrics);
    } catch (normalizationError) {
      const errorMsg =
        normalizationError instanceof Error
          ? normalizationError.message
          : "Normalization failed";

      const normErrResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        errorMsg as "INVALID_INPUT" | "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT"
      );
      decisionResult = addIntegrity(
        {
          ...normErrResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );
      return NextResponse.json(decisionResult, { status: 400 });
    }

    // 3. Create baseline using normalized values (all in INR/base currency)
    const baseline = createBaseline(
      normalizedMetrics.baselineRevenue,
      normalizedMetrics.baselineCost
    );

    // 4. Build inputMetrics using normalized values (baseAmount)
    const inputMetrics: Record<string, number> = {
      baselineRevenue: normalizedMetrics.baselineRevenue,
      baselineCost: normalizedMetrics.baselineCost,
      revenueChange: normalizedMetrics.revenueChange,
      costChange: normalizedMetrics.costChange,
      confidence: normalizedMetrics.confidence,
      risk: normalizedMetrics.risk || 5,
    };

    // 5. CONTROL LAYER: Decision Gate - Block unsafe decisions before execution
    const gateResult = evaluateDecisionGate({
      variables: inputMetrics,
      confidence: normalizedMetrics.confidence,
    });

    if (!gateResult.allowed) {
      // Return 422 Unprocessable Entity - decision blocked by gate
      const gateBlockResult = createDecisionResult(
        {
          baselineRevenue: normalizedMetrics.baselineRevenue,
          baselineCost: normalizedMetrics.baselineCost,
          deltaRevenue: normalizedMetrics.revenueChange,
          deltaCost: normalizedMetrics.costChange,
          confidence: normalizedMetrics.confidence,
          expectedImpact: normalizedMetrics.revenueChange - normalizedMetrics.costChange,
        },
        false,
        "INVALID_INPUT"
      );

      decisionResult = addIntegrity(
        {
          ...gateBlockResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log gate rejection
      if (logger) {
        logger.success({
          gateStatus: "blocked",
          reason: gateResult.reason,
          missingVariables: gateResult.missingVariables,
          lowConfidenceVariables: gateResult.lowConfidenceVariables,
        });
      }

      // Return gate result in response body with 422 status
      return NextResponse.json(
        {
          ...gateResultToPayload(gateResult),
          decision: decisionResult,
        },
        { status: 422 }
      );
    }

    // 6. Call runSystem with error handling for decision validation
    // runSystem enforces scenario-first execution (fail-closed if scenarios fail)
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
      } else if (errorMsg.startsWith("SCENARIO_GENERATION_FAILED")) {
        const scenarioErrResult = createDecisionResult(
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
            ...scenarioErrResult,
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

    // 7. Classify problem type based on financial impact
    const problemType = classifyProblem({
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      expectedImpact: result.impact.impactExpected,
    });

    // 8. Calculate baseline impact metrics
    const baselineMetrics = calculateBaselineMetrics({
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      expectedImpact: result.impact.impactExpected,
    });

    // 9. Create approved decision result with explanation
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

    // 9a. CONTROL LAYER: Evaluate Guardrails - Check visible policy constraints
    const guardrailsResult = evaluateGuardrails({
      expectedImpact: result.impact.impactExpected,
      confidence: 0.75,
      approvalFlag: body.approvalFlag || false,
    });

    if (guardrailsResult.blocked) {
      // Decision blocked by guardrails - return with explanation
      decisionResult = addIntegrity(
        {
          ...createDecisionResult(
            {
              baselineRevenue: revenue,
              baselineCost: cost,
              deltaRevenue: revenue * 0.1,
              deltaCost: cost * 0.05,
              confidence: 0.75,
              expectedImpact: result.impact.impactExpected,
            },
            false,
            "INVALID_INPUT"
          ),
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      if (logger) {
        logger.success({
          guardrailStatus: "blocked",
          violations: guardrailsResult.violations.length,
          warnings: guardrailsResult.warnings.length,
        });
      }

      return NextResponse.json(
        {
          decision: decisionResult,
          guardrails: {
            blocked: guardrailsResult.blocked,
            violations: guardrailsResult.violations,
            warnings: guardrailsResult.warnings,
          },
        },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User identity required" },
        { status: 403 }
      );
    }

    // 10. Generate operator items and store them
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

    // 11. Log audit event for run execution
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

    // 12. Emit webhook for decision creation (non-blocking)
    emitWebhookAsync(`${process.env.WEBHOOK_URL || ""}`, {
      event: "decision_created",
      timestamp: new Date().toISOString(),
      workspaceId: workspace.workspaceId,
      data: {
        decision: decisionResult.decision,
        expectedImpact: decisionResult.expectedImpact,
        confidence: decisionResult.confidence,
        problemType: decisionResult.problemType,
      },
    }).catch(() => {
      // Intentionally swallow errors - webhook failures should not block the request
    });

    // 13. Return decision result with explanation (including guardrails status)
    if (logger) {
      logger.success({
        decision: decisionResult?.decision,
        problemType: decisionResult?.problemType,
        guardrailWarnings: guardrailsResult.warnings.length,
      });
    }

    const responsePayload: Record<string, unknown> = {
      decision: decisionResult,
      scenarios: {
        baseline: result.scenarios.baseline,
        recommended: result.scenarios.recommended,
        alternatives: result.scenarios.alternatives,
      },
    };

    // Include guardrails warnings if any
    if (guardrailsResult.warnings.length > 0) {
      responsePayload.guardrails = {
        blocked: false,
        violations: guardrailsResult.violations.filter((v) => v.severity === "warn"),
        warnings: guardrailsResult.warnings,
      };
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (logger) {
      logger.error(errorMessage);
    }
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
