import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { detectPatterns } from "@/services/intelligence/pattern-engine";
import { generateRecommendation } from "@/services/intelligence/recommendation";
import { calculateSystemicInsights } from "@/services/intelligence/insights-engine";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Extract query parameters
    const decisionId = request.nextUrl.searchParams.get("decisionId");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam), 50) : 50;

    // Fetch last 100 items from workspace for analysis
    const items = await db.operatorItem.findMany({
      where: {
        workspaceId: workspace.workspaceId,
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
        where: { id: decisionId },
      });

      if (
        decision &&
        decision.workspaceId === workspace.workspaceId
      ) {
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

        recommendation = generateRecommendation(
          decisionResult,
          allPatterns,
          operatorItems
        );
        if (recommendation) {
          recommendationCount = 1;
        }
      }
    }

    // Ensure payload stays under limit
    const itemCount =
      patterns.length + recommendationCount + 1; // +1 for insights summary

    return NextResponse.json({
      workspace: {
        workspaceId: workspace.workspaceId,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
