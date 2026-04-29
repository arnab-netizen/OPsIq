import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { calculateSystemicInsights } from "@/services/intelligence/insights-engine";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Calculate date range: last 30 days
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    // Fetch items from last 30 days
    const items = await db.operatorItem.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
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

    // Calculate systemic insights
    const insights = calculateSystemicInsights(operatorItems);

    return NextResponse.json({
      workspace: {
        workspaceId: workspace.workspaceId,
      },
      insights,
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
