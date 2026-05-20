import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { detectPatterns } from "@/services/intelligence/pattern-engine";
import { createEventLogger } from "@/lib/observability/log";
import { db } from "@/lib/db";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    // Initialize logger
    const logger = createEventLogger("api_intelligence_patterns", workspaceId);

    // Fetch last 100 completed items from workspace
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
    blockingDependencies: Array.isArray(r.blockingDependencies) ? (r.blockingDependencies as string[]) : [],
  }));

    // Detect patterns
    const patterns = detectPatterns(operatorItems);

    const response = {
      workspace: {
        workspaceId,
      },
      patterns,
      summary: {
        totalPatterns: patterns.length,
        totalItemsAnalyzed: operatorItems.length,
        minPatternFrequency: 3,
        maxPatterns: 20,
      },
    };

    logger.success({
      patternsDetected: patterns.length,
      itemsAnalyzed: operatorItems.length,
    });

    return Response.json(response);
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);
