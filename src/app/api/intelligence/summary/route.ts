import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { detectPatterns } from "@/services/intelligence/pattern-engine";
import { generateRecommendation } from "@/services/intelligence/recommendation";
import { calculateSystemicInsights } from "@/services/intelligence/insights-engine";
import { validateDependencies } from "@/services/control/variable-registry";
import { evaluateDecisionGate } from "@/services/control/decision-gate";
import { evaluateGuardrails } from "@/services/control/guardrails";
import { enforceControlLayer } from "@/services/control/enforcement";
import { createEventLogger } from "@/lib/observability/log";
import { db } from "@/lib/db";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    // Initialize logger
    const logger = createEventLogger("api_intelligence_summary", workspaceId);

    // Extract query parameters
    const decisionId = ctx.request?.nextUrl.searchParams.get("decisionId");
    const limitParam = ctx.request?.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam), 50) : 50;

    // Fetch last 100 items from workspace for analysis
    const items = await db.operatorItem.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    // Map to OperatorItem type
    const operatorItems = items.map((r: any) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      ownerUserId: r.ownerUserId,
      createdBy: r.createdBy,
      lastUpdatedBy: r.lastUpdatedBy,
      problem: r.problem,
      action: r.action,
      impactExpected: Number(r.impactExpected),
      impactLow: Number(r.impactLow),
      impactHigh: Number(r.impactHigh),
      confidence: Number(r.confidence),
      priorityScore: Number(r.priorityScore),
      status: r.status as "pending" | "in_progress" | "done" | "failed",
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      decisionType: r.decisionType || "general",
      problemType: r.problemType || undefined,
      baselineValue: r.baselineValue ? Number(r.baselineValue) : undefined,
      projectedWithoutAction: r.projectedWithoutAction ? Number(r.projectedWithoutAction) : undefined,
      expectedOutcome: r.expectedOutcome,
      actualOutcome: r.actualOutcome,
      actualOutcomeValue: r.actualOutcomeValue ? Number(r.actualOutcomeValue) : undefined,
      outcomeDelta: r.outcomeDelta ? Number(r.outcomeDelta) : undefined,
      decisionAccuracy: r.decisionAccuracy ? Number(r.decisionAccuracy) : undefined,
      decisionError: r.decisionError ? Number(r.decisionError) : undefined,
      outcomeNotes: r.outcomeNotes || undefined,
      startedAt: r.startedAt ? r.startedAt.toISOString() : undefined,
      completedAt: r.completedAt ? r.completedAt.toISOString() : undefined,
      executionStatus: r.executionStatus || undefined,
      firstCompletedAt: r.firstCompletedAt ? r.firstCompletedAt.toISOString() : undefined,
      firstPositiveOutcomeAt: r.firstPositiveOutcomeAt ? r.firstPositiveOutcomeAt.toISOString() : undefined,
      firstWinAchieved: r.firstWinAchieved || undefined,
      explanation: r.explanation ? JSON.parse(String(r.explanation)) : undefined,
      inputsSnapshot: r.inputsSnapshot
        ? JSON.parse(String(r.inputsSnapshot))
        : undefined,
      decisionHash: r.decisionHash || undefined,
      signedHash: r.signedHash || undefined,
      signature: r.signature || undefined,
      signatureAlgo: r.signatureAlgo || undefined,
      publicKeyId: r.publicKeyId || undefined,
      engineVersion: r.engineVersion || "v1.0.0",
      createdAt: r.createdAt.toISOString(),
      blockingDependencies: Array.isArray(r.blockingDependencies)
        ? (r.blockingDependencies as string[])
        : [],
    }));

    // Detect patterns from recent items
    const allPatterns = detectPatterns(operatorItems);
    const patterns = allPatterns.slice(0, Math.min(10, limit - 20)); // Reserve space for recommendations

    // Get systemic insights (30-day analysis)
    const insights = calculateSystemicInsights(operatorItems);

    // Get recommendation if decisionId provided
    let recommendation = null;
    let recommendationCount = 0;

    if (decisionId) {
      const decision = await db.operatorItem.findUnique({
        where: { id: decisionId, workspaceId },
      });

      if (decision) {
        const decisionResult = {
          decision: "APPROVED" as const,
          workspaceId: decision.workspaceId,
          ownerUserId: decision.ownerUserId,
          createdBy: decision.createdBy,
          lastUpdatedBy: decision.lastUpdatedBy,
          expectedImpact: Number(decision.impactExpected),
          confidence: Number(decision.confidence),
          explanation: decision.explanation
            ? JSON.parse(String(decision.explanation))
            : {
                summary: "",
                drivers: [],
                assumptions: [],
                risks: [],
                missingData: [],
                calculationTrace: {
                  baselineRevenue: 0,
                  baselineCost: 0,
                  revenueChange: 0,
                  costChange: 0,
                  netImpact: 0,
                  formula: "",
                },
              },
          problemType: decision.problemType || undefined,
          baselineValue: decision.baselineValue
            ? Number(decision.baselineValue)
            : undefined,
          projectedWithoutAction: decision.projectedWithoutAction
            ? Number(decision.projectedWithoutAction)
            : undefined,
          engineVersion: decision.engineVersion || "v1.0.0",
        };

        // Extract input variables from inputsSnapshot
        const inputVariables = decision.inputsSnapshot
          ? JSON.parse(String(decision.inputsSnapshot))
          : undefined;

        // Track executed validations for enforcement
        const executedValidations: string[] = ["variable_registry"];

        // CONTROL LAYER: Step 1 - Validate dependencies
        const depValidation = validateDependencies(inputVariables || {});
        if (!depValidation.valid) {
          executedValidations.push("dependency_validation");
          throw new Error(`Dependency validation failed: ${depValidation.error}`);
        }
        executedValidations.push("dependency_validation");

        // CONTROL LAYER: Step 2 - Evaluate decision gate
        const gateResult = evaluateDecisionGate({
          variables: inputVariables || {},
          confidence: Number(decision.confidence),
        });
        if (!gateResult.allowed) {
          executedValidations.push("decision_gate");
          throw new Error(`Decision gate rejected: ${gateResult.reason}`);
        }
        executedValidations.push("decision_gate");

        recommendation = generateRecommendation(
          decisionResult,
          allPatterns,
          operatorItems,
          inputVariables
        );

        // CONTROL LAYER: Step 3 - Evaluate guardrails
        if (recommendation) {
          const guardrailsResult = evaluateGuardrails({
            expectedImpact: recommendation.scenarioContext?.recommendedImpact || Number(decision.impactExpected) || 0,
            confidence: Number(decision.confidence),
            approvalFlag: false,
          });
          if (guardrailsResult.blocked) {
            executedValidations.push("guardrails");
            throw new Error("Guardrails violation");
          }
          executedValidations.push("guardrails");
          recommendationCount = 1;
        } else {
          executedValidations.push("guardrails");
        }

        // CONTROL LAYER: Verify complete enforcement
        enforceControlLayer("/api/intelligence/summary", executedValidations);
      }
    }

    // Ensure payload stays under limit
    const itemCount =
      patterns.length + recommendationCount + 1; // +1 for insights summary

    const response = {
      workspace: {
        workspaceId,
      },
      patterns: patterns.slice(0, limit - recommendationCount - 1),
      recommendation,
      insights: {
        worstPerformingType: insights.worstPerformingType,
        bestPerformingType: insights.bestPerformingType,
        avgAccuracyByType: insights.avgAccuracyByType,
        overall: insights.insights,
      },
      summary: {
        patternsDetected: allPatterns.length,
        patternsReturned: patterns.length,
        itemsAnalyzed: operatorItems.length,
        payloadSize: itemCount,
        payloadLimit: limit,
      },
    };

    logger.success({
      patternsDetected: allPatterns.length,
      itemsAnalyzed: operatorItems.length,
      payloadSize: itemCount,
    });

    return Response.json(response);
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);
