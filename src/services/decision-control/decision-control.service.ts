import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { detectExecutionDrift } from "../execution-drift/execution-drift.service";
import { calculateImpactDelta } from "../business-impact/impact-delta.service";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { captureDecisionSnapshot, type DecisionInput } from "../decision-determinism.service";

export interface PrimaryDecision {
  decisionId: string;
  type: "immediate" | "urgent" | "recommended";
  actionId: string | null;
  title: string;
  instruction: string;
  consequence: string;
  confidenceScore: number;
  rationale: string[];
}

export async function getPrimaryDecision(engagementId: string): Promise<PrimaryDecision> {
  // Fetch engagement and required data in parallel
  const [engagement, actions, findings, recommendations] = await Promise.all([
    db.engagement.findUnique({
      where: { id: engagementId },
    }),
    db.action.findMany({
      where: { engagementId },
    }),
    db.finding.findMany({
      where: { engagementId },
    }),
    db.recommendation.findMany({
      where: { engagementId },
    }),
  ]);

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch decision context in parallel
  const [drift, decisionConfidence] = await Promise.all([
    detectExecutionDrift(engagementId),
    computeDecisionConfidence({ engagementId }),
  ]);

  // Identify critical findings
  const criticalFindings = findings.filter((f: typeof findings[0]) => f.severity === "critical" && f.status !== "resolved");

  // Identify overdue critical actions
  const now = new Date();
  const overdueCriticalActions = actions.filter(
    (a: typeof actions[0]) =>
      a.priority === "critical" &&
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.dueDate &&
      a.dueDate < now
  );

  // Identify blocked critical actions
  const blockedCriticalActions = actions.filter((a: typeof actions[0]) => a.priority === "critical" && a.status === "blocked");

  const rationale: string[] = [];
  let decisionType: "immediate" | "urgent" | "recommended" = "recommended";
  let primaryActionId: string | null = null;
  let title = "";
  let instruction = "";
  let consequence = "";
  let confidenceScore = decisionConfidence.score;

  // Priority 1: Critical drift detection
  if (drift.driftDetected && drift.severity === "critical") {
    decisionType = "immediate";
    rationale.push("Critical execution drift detected - immediate intervention required");
    instruction = "Address execution deviation immediately to prevent engagement failure";
    consequence = "Failure to act will lead to irreversible loss of engagement control";

    // Try to find the most recently updated action as primary
    const recentActions = actions
      .filter((a: typeof actions[0]) => a.status !== "completed" && a.status !== "cancelled")
      .sort((a: typeof actions[0], b: typeof actions[0]) => {
        const aTime = a.updatedAt?.getTime() || 0;
        const bTime = b.updatedAt?.getTime() || 0;
        return bTime - aTime;
      });

    if (recentActions.length > 0) {
      primaryActionId = recentActions[0].id;
      title = `Address critical drift: ${recentActions[0].title}`;
    } else {
      title = "Address critical execution drift";
    }
  }

  // Priority 2: Overdue critical actions
  if (decisionType === "recommended" && overdueCriticalActions.length > 0) {
    decisionType = "immediate";
    rationale.push(`${overdueCriticalActions.length} critical action(s) overdue`);
    primaryActionId = overdueCriticalActions[0].id;
    title = `Unblock overdue critical action: ${overdueCriticalActions[0].title}`;
    instruction = "Complete or renegotiate this overdue critical action immediately";
    consequence = "Continued delay will jeopardize engagement timeline and business outcomes";
    confidenceScore = Math.max(0, confidenceScore - 15);
  }

  // Priority 3: Blocked critical actions with critical findings
  if (decisionType === "recommended" && blockedCriticalActions.length > 0 && criticalFindings.length > 0) {
    decisionType = "urgent";
    rationale.push(`${blockedCriticalActions.length} blocked critical action(s)`);
    rationale.push(`${criticalFindings.length} critical finding(s) unresolved`);
    primaryActionId = blockedCriticalActions[0].id;
    title = `Unblock critical action: ${blockedCriticalActions[0].title}`;
    instruction = "Resolve blockers preventing critical action progress";
    consequence = "Unresolved blockers compound critical findings and delay remediation";
    confidenceScore = Math.max(0, confidenceScore - 10);
  }

  // Priority 4: Low decision confidence with critical findings
  if (decisionType === "recommended" && decisionConfidence.level === "low" && criticalFindings.length > 0) {
    decisionType = "urgent";
    rationale.push("Decision confidence critically low");
    rationale.push(`${criticalFindings.length} critical finding(s) require resolution`);

    // Find critical finding that most affects confidence
    const unresolvedCritical = criticalFindings[0];
    title = `Resolve critical finding to improve confidence: ${unresolvedCritical.title}`;
    instruction = "Address this critical finding to restore decision confidence and reduce risk";
    consequence = "Low confidence signals high execution risk; unresolved findings compound the risk";
    confidenceScore = decisionConfidence.score;
  }

  // Priority 5: Unresolved critical findings
  if (decisionType === "recommended" && criticalFindings.length > 0) {
    decisionType = "recommended";
    rationale.push(`${criticalFindings.length} critical finding(s) require resolution`);

    if (!title) {
      const firstCritical = criticalFindings[0];
      title = `Resolve critical finding: ${firstCritical.title}`;
      instruction = "Address this critical finding to reduce engagement risk";
      consequence = "Unresolved critical findings continue to pose business risk";
    }
  }

  // Fallback: High-priority recommendation if no critical issues
  if (!title) {
    const openRecs = recommendations.filter((r: typeof recommendations[0]) => r.status !== "completed" && r.status !== "cancelled");
    if (openRecs.length > 0) {
      const highPriorityRecs = openRecs.filter((r: typeof recommendations[0]) => r.priority === "high" || r.priority === "critical");
      const targetRec = highPriorityRecs.length > 0 ? highPriorityRecs[0] : openRecs[0];
      title = `Review recommendation: ${targetRec.title}`;
      instruction = "Evaluate and approve this high-priority recommendation";
      consequence = "Pending recommendations delay implementation of improvements";
      rationale.push("High-priority recommendation awaiting decision");
    } else {
      title = "Engagement tracking normally";
      instruction = "Continue executing planned actions";
      consequence = "No immediate action required at this time";
      rationale.push("All critical items addressed; engagement on track");
    }
  }

  return {
    decisionId: `dec-${engagementId}-${Date.now()}`,
    type: decisionType,
    actionId: primaryActionId,
    title,
    instruction,
    consequence,
    confidenceScore: Math.round(confidenceScore),
    rationale,
  };
}

export async function getPrimaryDecisionWithSnapshot(engagementId: string): Promise<{
  decision: PrimaryDecision;
  snapshotId: string;
}> {
  // Fetch all inputs needed for decision
  const [engagement, actions, findings, recommendations, drift, decisionConfidence] = await Promise.all([
    db.engagement.findUnique({
      where: { id: engagementId },
    }),
    db.action.findMany({
      where: { engagementId },
    }),
    db.finding.findMany({
      where: { engagementId },
    }),
    db.recommendation.findMany({
      where: { engagementId },
    }),
    detectExecutionDrift(engagementId),
    computeDecisionConfidence({ engagementId }),
  ]);

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Create snapshot input
  const snapshotInput: DecisionInput = {
    actions: actions.map((a) => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      status: a.status,
      dueDate: a.dueDate,
    })),
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity || "unknown",
      status: f.status,
    })),
    recommendations: recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
    })),
    drift: {
      driftDetected: drift.driftDetected,
      severity: drift.severity,
    },
    confidence: {
      score: decisionConfidence.score,
      level: decisionConfidence.level,
    },
    timestamp: new Date().toISOString(),
  };

  // Get decision using original logic
  const decision = await getPrimaryDecision(engagementId);

  // Capture snapshot for replay validation
  const snapshotId = await captureDecisionSnapshot(engagementId, snapshotInput, decision);

  return {
    decision,
    snapshotId,
  };
}
