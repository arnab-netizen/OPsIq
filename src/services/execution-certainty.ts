export interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  resolved: boolean;
  verified: boolean;
}

export interface Recommendation {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "blocked" | "in_progress" | "completed";
}

export interface Action {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "blocked" | "pending" | "in_progress" | "completed" | "verified";
}

export interface Evidence {
  id: string;
  type: string;
  verified: boolean;
  strength: "strong" | "moderate" | "weak";
}

export interface EngagementHealth {
  overallStatus: "critical" | "at_risk" | "stable" | "healthy";
  kpiTrend: "deteriorating" | "flat" | "improving";
}

export interface ExecutionCertaintyResult {
  engagementId: string;
  generatedAt: string;
  score: number;
  level: "blocked" | "low" | "medium" | "high" | "certain";
  blockers: string[];
  risks: string[];
  reasons: string[];
}

export function calculateExecutionCertainty(
  engagementId: string,
  findings: Finding[] = [],
  recommendations: Recommendation[] = [],
  actions: Action[] = [],
  evidence: Evidence[] = [],
  health: EngagementHealth = { overallStatus: "stable", kpiTrend: "flat" }
): ExecutionCertaintyResult {
  let score = 100;
  const blockers: string[] = [];
  const risks: string[] = [];
  const reasons: string[] = [];

  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const unresolvedCritical = criticalFindings.filter((f) => !f.resolved);
  const blockedActions = actions.filter((a) => a.status === "blocked");
  const verifiedEvidence = evidence.filter((e) => e.verified);
  const completedActions = actions.filter((a) => a.status === "completed" || a.status === "verified");

  // Critical unresolved findings reduce score significantly
  if (unresolvedCritical.length > 0) {
    score -= unresolvedCritical.length * 15;
    reasons.push(`${unresolvedCritical.length} unresolved critical finding(s)`);
  }

  // Blocked critical actions create blockers
  const blockedCriticalActions = blockedActions.filter((a) => a.priority === "critical");
  if (blockedCriticalActions.length > 0) {
    blockedCriticalActions.forEach((a) => blockers.push(`Critical action blocked: ${a.id}`));
    score -= blockedCriticalActions.length * 20;
  }

  // Any blocked actions are risks
  if (blockedActions.length > 0) {
    risks.push(`${blockedActions.length} action(s) blocked`);
    score -= blockedActions.length * 5;
  }

  // Missing evidence reduces score
  const totalEvidence = evidence.length;
  const verifiedPercentage = totalEvidence > 0 ? (verifiedEvidence.length / totalEvidence) * 100 : 0;
  if (verifiedPercentage < 100) {
    const missingPercent = Math.round(100 - verifiedPercentage);
    score -= Math.ceil(missingPercent * 0.3);
    reasons.push(`${missingPercent}% of evidence not verified`);
  }

  // Completed verified actions increase score
  if (completedActions.length > 0) {
    score += completedActions.length * 8;
    reasons.push(`${completedActions.length} completed action(s)`);
  }

  // Health status impact
  if (health.overallStatus === "critical") {
    score -= 25;
    risks.push("Engagement in critical health state");
  } else if (health.overallStatus === "at_risk") {
    score -= 15;
    risks.push("Engagement at risk");
  } else if (health.overallStatus === "healthy") {
    score += 10;
    reasons.push("Engagement health is stable/positive");
  }

  // KPI trend impact
  if (health.kpiTrend === "deteriorating") {
    score -= 10;
    risks.push("KPI trend deteriorating");
  } else if (health.kpiTrend === "improving") {
    score += 5;
    reasons.push("KPI trend improving");
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: "blocked" | "low" | "medium" | "high" | "certain";
  if (blockers.length > 0) {
    level = "blocked";
  } else if (score >= 85) {
    level = "certain";
  } else if (score >= 70) {
    level = "high";
  } else if (score >= 50) {
    level = "medium";
  } else if (score >= 25) {
    level = "low";
  } else {
    level = "blocked";
  }

  return {
    engagementId,
    generatedAt: new Date().toISOString(),
    score,
    level,
    blockers,
    risks,
    reasons,
  };
}


export async function generateExecutionCertainty(
  engagementId: string,
  authContext: CanonicalAuthContext
) {
  return {
    engagementId,
    generatedAt: new Date().toISOString(),
    currentHealth: null,
    costOfInaction: null,
    scenarioComparison: [],
    recommendedPath: null,
    confidence: null,
    constraints: [],
    immediateActions: [],
    decisionMemo: null
  }
}
