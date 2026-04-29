import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { generateRecommendation, generateMultipleRecommendations } from "@/services/intelligence/recommendation";
import { detectPatterns } from "@/services/intelligence/pattern-engine";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Extract decisionId from query
    const decisionId = request.nextUrl.searchParams.get("decisionId");
    if (!decisionId) {
      return NextResponse.json(
        { error: "Missing required parameter: decisionId" },
        { status: 400 }
      );
    }

    // Fetch the decision
    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    // Verify workspace isolation
    if (decision.workspaceId !== workspace.workspaceId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Fetch last 100 items from workspace for pattern detection
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
      blockingDependencies: Array.isArray(r.blockingDependencies) ? (r.blockingDependencies as string[]) : [],
    }));

    // Detect patterns from recent items
    const patterns = detectPatterns(operatorItems);

    // Convert decision to DecisionResult format for recommendation
    const decisionResult = {
      decision: "APPROVED" as const,
      workspaceId: decision.workspaceId,
      ownerUserId: decision.ownerUserId,
      createdBy: decision.createdBy,
      lastUpdatedBy: decision.lastUpdatedBy,
      expectedImpact: Number(decision.impactExpected),
      confidence: Number(decision.confidence),
      explanation: decision.explanation ? JSON.parse(String(decision.explanation)) : {
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
      baselineValue: decision.baselineValue ? Number(decision.baselineValue) : undefined,
      projectedWithoutAction: decision.projectedWithoutAction ? Number(decision.projectedWithoutAction) : undefined,
      engineVersion: decision.engineVersion || "v1.0.0",
    };

    // Generate primary recommendation
    const recommendation = generateRecommendation(decisionResult, patterns, operatorItems);

    // Also generate alternative recommendations
    const alternatives = generateMultipleRecommendations(decisionResult, patterns, operatorItems)
      .filter((alt) => !recommendation || alt.basedOnPatternId !== recommendation.basedOnPatternId)
      .slice(0, 2);

    return NextResponse.json({
      decision: {
        id: decision.id,
        problemType: decision.problemType,
        problem: decision.problem,
      },
      recommendation,
      alternatives,
      summary: {
        patternsAnalyzed: patterns.length,
        itemsAnalyzed: operatorItems.length,
        hasRecommendation: !!recommendation,
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
