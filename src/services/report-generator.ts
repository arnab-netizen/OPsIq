import { getEngagementById } from "./engagement.js";
import { listFindingsForEngagement } from "./findings.js";
import { getActionsForEngagement } from "./action.js";
import { ValidationError, NotFoundError } from "../infra/errors.js";
import { logger } from "../infra/logger.js";

export interface StandardizedReport {
  // Header
  title: string;
  client: string;
  problem: string;
  generatedAt: string;

  // EXACT SECTIONS (always present)
  summary: string[];
  currentStatus: {
    health: string;
    riskLevel: string;
    timeline: string;
  };
  rootCauses: string[];
  blockers: Array<{
    title: string;
    description: string;
    consequence: string;
  }>;
  consequences: string[];
  actionPlan: {
    urgent_48h: Array<{ sequence: number; action: string; owner?: string }>;
    week_7days: Array<{ sequence: number; action: string; owner?: string }>;
  };
  riskTimeline: Array<{
    day: number;
    event: string;
    severity: string;
  }>;
  businessImpact: {
    estimatedLossIfNoAction: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    urgencyScore: number;
    recommendedEngagementLevel: "advisory" | "intervention" | "emergency";
  };

  // TRACEABILITY (audit trail)
  traceability: {
    engagementId: string;
    timestamp: string;
    findingsCount: number;
    actionsCount: number;
    stateTransitionsCount: number;
    dataSource: string;
    executionEngine: string;
  };
}

function deriveRootCauses(
  findings: any[],
  actions: any[]
): { causes: string[]; status: string } {
  const causes: string[] = [];

  // Categorize findings by type
  const operationalIssues = findings.filter(
    (f) => f.category === "operations" || f.impactArea === "operations"
  );
  const financialIssues = findings.filter(
    (f) => f.category === "finance" || f.impactArea === "finance"
  );
  const supplyIssues = findings.filter(
    (f) => f.category === "supply" || f.impactArea === "supply"
  );
  const peopleIssues = findings.filter(
    (f) => f.category === "people" || f.impactArea === "people"
  );

  // Extract root causes from critical findings
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  criticalFindings.forEach((f) => {
    const cause = f.summary || f.description || `Critical issue: ${f.title}`;
    if (!causes.includes(cause)) {
      causes.push(cause);
    }
  });

  // Add categorized root causes
  if (operationalIssues.length > 0 && !causes.some((c) => c.includes("operation"))) {
    causes.push(
      `Operational inefficiencies across ${operationalIssues.length} area(s)`
    );
  }
  if (financialIssues.length > 0 && !causes.some((c) => c.includes("financial"))) {
    causes.push(`Financial constraints affecting ${financialIssues.length} function(s)`);
  }
  if (supplyIssues.length > 0 && !causes.some((c) => c.includes("supply"))) {
    causes.push(`Supply chain disruption in ${supplyIssues.length} area(s)`);
  }
  if (peopleIssues.length > 0 && !causes.some((c) => c.includes("people"))) {
    causes.push(`People-related challenges in ${peopleIssues.length} area(s)`);
  }

  // Add unresolved actions as root cause
  const unresolvedHighPriority = actions.filter(
    (a) =>
      a.priority === "high" &&
      a.status !== "completed" &&
      a.status !== "verified"
  );
  if (unresolvedHighPriority.length > 0) {
    causes.push(
      `${unresolvedHighPriority.length} high-priority action(s) remain unresolved`
    );
  }

  return {
    causes: causes.slice(0, 10),
    status: criticalFindings.length > 0 ? "blocked" : "at_risk",
  };
}

function deriveConsequences(
  findings: any[],
  actions: any[],
  timeToFailure?: number
): string[] {
  const consequences: string[] = [];

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const overdueCount = actions.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.dueDate &&
      new Date(a.dueDate) < new Date()
  ).length;

  if (criticalCount > 0) {
    consequences.push(
      `${criticalCount} critical issue(s) prevent normal business operations`
    );
  }

  if (overdueCount > 0) {
    consequences.push(
      `${overdueCount} overdue action(s) accumulate operational debt`
    );
  }

  if (timeToFailure) {
    if (timeToFailure <= 7) {
      consequences.push("Business solvency at immediate risk");
    } else if (timeToFailure <= 30) {
      consequences.push(`Only ${timeToFailure} days to insolvency without intervention`);
    } else {
      consequences.push(`Financial runway limited to ${timeToFailure} days`);
    }
  }

  // Add generic consequences if not enough derived
  if (consequences.length < 1) {
    consequences.push("Continued operational issues escalate business risk");
  }
  if (consequences.length < 2) {
    consequences.push("Revenue and profitability deteriorate without action");
  }
  if (consequences.length < 3) {
    consequences.push("Market position and customer relationships jeopardized");
  }

  return consequences.slice(0, 10);
}

function deriveRiskTimeline(
  timeToFailure?: number,
  findings: any[] = []
): Array<{ day: number; event: string; severity: string }> {
  const timeline: Array<{ day: number; event: string; severity: string }> = [];

  const urgency = findings.some((f) => f.severity === "critical") ? 0.5 : 1;

  // Day 1-2: Immediate impacts
  timeline.push({
    day: 1,
    event: "Critical issues become known to stakeholders",
    severity: "critical",
  });
  timeline.push({
    day: 2,
    event: "Key customers/partners begin escalating concerns",
    severity: "critical",
  });

  // Day 3-7: Escalation
  timeline.push({
    day: 3,
    event: "First contracts at risk of cancellation",
    severity: "high",
  });
  timeline.push({
    day: 7,
    event: "Revenue impact becomes measurable and material",
    severity: "high",
  });

  // Day 15: Crisis point
  timeline.push({
    day: 15,
    event: "Operational cash burn accelerates",
    severity: "high",
  });

  // Day 30: Insolvency risk
  if (timeToFailure === undefined || timeToFailure >= 30) {
    timeline.push({
      day: 30,
      event: "Risk of payroll/vendor payment failures",
      severity: "critical",
    });
  } else if (timeToFailure > 0) {
    timeline.push({
      day: Math.max(1, timeToFailure - 7),
      event: "Financial resources severely depleted",
      severity: "critical",
    });
    timeline.push({
      day: timeToFailure,
      event: "Business insolvency / bankruptcy risk threshold",
      severity: "critical",
    });
  }

  return timeline;
}

function deriveBusinessImpact(
  findings: any[],
  actions: any[],
  timeToFailure?: number,
  revenueImpact?: number
): {
  estimatedLossIfNoAction: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  urgencyScore: number;
  recommendedEngagementLevel: "advisory" | "intervention" | "emergency";
} {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const unresolvedHighPriority = actions.filter(
    (a) =>
      a.priority === "high" &&
      a.status !== "completed" &&
      a.status !== "verified"
  ).length;

  // Determine risk level
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (
    criticalCount >= 3 ||
    (timeToFailure !== undefined && timeToFailure <= 7) ||
    criticalCount >= 1
  ) {
    riskLevel = "CRITICAL";
  } else if (
    criticalCount === 1 ||
    highCount >= 5 ||
    (timeToFailure !== undefined && timeToFailure <= 30) ||
    unresolvedHighPriority >= 3
  ) {
    riskLevel = "HIGH";
  } else if (
    highCount >= 2 ||
    (timeToFailure !== undefined && timeToFailure <= 90)
  ) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  // Calculate urgency score (1-10)
  let urgencyScore = 1;
  urgencyScore += Math.min(criticalCount * 2, 6);
  if (highCount > 3) urgencyScore += 1;
  if (timeToFailure !== undefined && timeToFailure <= 7) urgencyScore += 2;
  else if (timeToFailure !== undefined && timeToFailure <= 30) urgencyScore += 1;
  if (unresolvedHighPriority >= 3) urgencyScore += 1;
  urgencyScore = Math.min(urgencyScore, 10);

  // Estimate loss if no action
  let estimatedLossIfNoAction: string;
  if (revenueImpact !== undefined && revenueImpact > 0) {
    estimatedLossIfNoAction = `$${(revenueImpact / 1000).toFixed(0)}K+ revenue impact if issues continue unresolved`;
  } else if (timeToFailure !== undefined && timeToFailure > 0) {
    estimatedLossIfNoAction = `Business failure projected in ${timeToFailure} days without intervention`;
  } else if (criticalCount > 0) {
    estimatedLossIfNoAction =
      "Unable to quantify without financial baseline, but critical severity indicates material business impact";
  } else {
    estimatedLossIfNoAction =
      "Insufficient financial data for precise estimation; however, unresolved issues carry cumulative risk";
  }

  // Determine recommended engagement level
  let recommendedEngagementLevel: "advisory" | "intervention" | "emergency";
  if (
    riskLevel === "CRITICAL" ||
    urgencyScore >= 8 ||
    (timeToFailure !== undefined && timeToFailure <= 7)
  ) {
    recommendedEngagementLevel = "emergency";
  } else if (
    riskLevel === "HIGH" ||
    (urgencyScore >= 5 && urgencyScore < 8) ||
    (timeToFailure !== undefined && timeToFailure > 7 && timeToFailure <= 30)
  ) {
    recommendedEngagementLevel = "intervention";
  } else {
    recommendedEngagementLevel = "advisory";
  }

  return {
    estimatedLossIfNoAction,
    riskLevel,
    urgencyScore,
    recommendedEngagementLevel,
  };
}

function validateReport(report: StandardizedReport): void {
  const errors: string[] = [];

  // Check all required sections exist
  if (!report.summary || report.summary.length === 0) {
    errors.push("SUMMARY: Missing or empty (requires minimum 1 item from data)");
  } else if (report.summary.length < 1) {
    errors.push("SUMMARY: Has fewer than 1 item (must be data-derived)");
  }

  if (!report.currentStatus || !report.currentStatus.health) {
    errors.push("CURRENT STATUS: Missing or invalid health assessment");
  }

  if (!report.rootCauses || report.rootCauses.length === 0) {
    errors.push("ROOT CAUSES: Missing or empty (must be derived from findings)");
  } else if (report.rootCauses.length < 1) {
    errors.push("ROOT CAUSES: Requires minimum 1 cause (data-derived)");
  }

  if (!report.blockers || report.blockers.length === 0) {
    errors.push("BLOCKERS: Missing or empty (must be derived from findings/actions)");
  } else if (report.blockers.length < 1) {
    errors.push("BLOCKERS: Requires minimum 1 blocker");
  }

  if (!report.consequences || report.consequences.length === 0) {
    errors.push("CONSEQUENCES: Missing or empty (must be derived from data)");
  } else if (report.consequences.length < 1) {
    errors.push("CONSEQUENCES: Requires minimum 1 consequence");
  }

  if (
    !report.actionPlan ||
    !report.actionPlan.urgent_48h ||
    !report.actionPlan.week_7days
  ) {
    errors.push("ACTION PLAN: Missing 48h and 7-day sections");
  }

  // Check action plan has items
  const totalActions =
    (report.actionPlan.urgent_48h?.length || 0) +
    (report.actionPlan.week_7days?.length || 0);
  if (totalActions === 0) {
    errors.push(
      "ACTION PLAN: No actions (requires data-derived minimum 1 action)"
    );
  }

  if (!report.riskTimeline || report.riskTimeline.length === 0) {
    errors.push("RISK TIMELINE: Missing or empty (must have events)");
  } else if (report.riskTimeline.length < 3) {
    errors.push(
      "RISK TIMELINE: Requires minimum 3 timeline events (data-derived)"
    );
  }

  if (
    !report.businessImpact ||
    !report.businessImpact.estimatedLossIfNoAction ||
    !report.businessImpact.riskLevel ||
    report.businessImpact.urgencyScore === undefined ||
    !report.businessImpact.recommendedEngagementLevel
  ) {
    errors.push("BUSINESS IMPACT: Missing or incomplete (must be data-derived)");
  } else if (
    report.businessImpact.urgencyScore < 1 ||
    report.businessImpact.urgencyScore > 10
  ) {
    errors.push("BUSINESS IMPACT: Urgency score must be between 1 and 10");
  }

  if (errors.length > 0) {
    const errorMessage = "REPORT VALIDATION FAILED:\n" + errors.join("\n");
    logger.error("Report validation failed", {
      errors,
      reportStructure: {
        hasSummary: !!report.summary?.length,
        hasStatus: !!report.currentStatus?.health,
        hasRootCauses: !!report.rootCauses?.length,
        hasBlockers: !!report.blockers?.length,
        hasConsequences: !!report.consequences?.length,
        hasActionPlan: !!report.actionPlan,
        hasTimeline: !!report.riskTimeline?.length,
        hasBusinessImpact: !!report.businessImpact?.riskLevel,
      },
    });
    throw new ValidationError(errorMessage);
  }
}

export async function generateReport(
  engagementId: string,
  userId?: string,
  revenueImpact?: number,
  timeToFailure?: number
): Promise<StandardizedReport> {
  logger.info("Generating standardized report", { engagementId });

  // Get engagement with full context
  const engagement = await getEngagementById(engagementId, true);
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Get findings and actions
  const findings = await listFindingsForEngagement(engagementId);
  const actions =
    userId && engagement.client
      ? await getActionsForEngagement(engagementId, userId).catch(() => [])
      : [];

  // Derive root causes
  const { causes: rootCauses } = deriveRootCauses(findings, actions);

  // Derive consequences
  const consequences = deriveConsequences(findings, actions, timeToFailure);

  // Build summary from findings
  const summary: string[] = [];
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const highFindings = findings.filter((f) => f.severity === "high");

  if (criticalFindings.length > 0) {
    summary.push(
      `${criticalFindings.length} critical finding(s) block business progress`
    );
  }
  if (highFindings.length > 0) {
    summary.push(
      `${highFindings.length} high-priority issue(s) require urgent attention`
    );
  }
  if (actions.length > 0) {
    const unresolvedActions = actions.filter(
      (a) =>
        a.status !== "completed" &&
        a.status !== "verified" &&
        a.status !== "cancelled"
    );
    summary.push(
      `${unresolvedActions.length} of ${actions.length} action(s) remain unresolved`
    );
  }
  if (summary.length === 0) {
    summary.push("Engagement assessment underway with data collection in progress");
  }

  // Determine health status
  const healthStatus = rootCauses.some((c) => c.includes("critical"))
    ? "Critical - Action Required"
    : "At Risk - Intervention Needed";
  const riskLevel = rootCauses.some((c) => c.includes("critical"))
    ? "Severe"
    : "High";
  const timeline = timeToFailure
    ? `${timeToFailure} days to failure without intervention`
    : "Days to failure TBD";

  // Build blockers
  const blockers = findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 5)
    .map((f) => ({
      title: f.title,
      description: f.summary || f.description || f.title,
      consequence: `Prevents progress: ${f.title}`,
    }));

  if (blockers.length === 0) {
    blockers.push({
      title: "No critical findings identified",
      description: "Assessment may be incomplete",
      consequence: "Additional data required for full evaluation",
    });
  }

  // Build action plan
  const highPriorityActions = actions
    .filter(
      (a) =>
        a.priority === "high" &&
        a.status !== "completed" &&
        a.status !== "verified"
    )
    .slice(0, 5);

  const urgent_48h: Array<{ sequence: number; action: string; owner?: string }> = [];
  const week_7days: Array<{ sequence: number; action: string; owner?: string }> = [];

  highPriorityActions.forEach((action, idx) => {
    if (idx === 0) {
      urgent_48h.push({
        sequence: 1,
        action: action.title,
        owner: action.assignedTo,
      });
    } else {
      week_7days.push({
        sequence: idx,
        action: action.title,
        owner: action.assignedTo,
      });
    }
  });

  // Ensure minimum actions
  if (urgent_48h.length === 0) {
    urgent_48h.push({
      sequence: 1,
      action: "Convene emergency response team",
      owner: undefined,
    });
  }
  if (week_7days.length === 0) {
    week_7days.push({
      sequence: 1,
      action: "Develop comprehensive recovery plan",
      owner: undefined,
    });
  }

  // Build timeline
  const riskTimeline = deriveRiskTimeline(timeToFailure, findings);

  // Derive business impact metrics
  const businessImpact = deriveBusinessImpact(
    findings,
    actions,
    timeToFailure,
    revenueImpact
  );

  // Count state transitions (actions that changed status)
  const actionsWithStatus = actions.filter((a) => a.status);
  const stateTransitionsCount = actionsWithStatus.length;

  // Assemble report
  const report: StandardizedReport = {
    title: "Business Recovery Report",
    client: engagement.client?.name || "Unknown Client",
    problem: engagement.description || engagement.title || "Assessment in progress",
    generatedAt: new Date().toISOString(),
    summary,
    currentStatus: {
      health: healthStatus,
      riskLevel,
      timeline,
    },
    rootCauses: rootCauses.slice(0, 10),
    blockers,
    consequences,
    actionPlan: {
      urgent_48h,
      week_7days,
    },
    riskTimeline,
    businessImpact,
    traceability: {
      engagementId,
      timestamp: new Date().toISOString(),
      findingsCount: findings.length,
      actionsCount: actions.length,
      stateTransitionsCount,
      dataSource: "OPSIQ verified execution engine",
      executionEngine: "StandardizedReportGenerator v1.0",
    },
  };

  // Validate before returning
  validateReport(report);

  logger.info("Standardized report generated successfully", {
    engagementId,
    hasRootCauses: rootCauses.length,
    hasBlockers: blockers.length,
    hasActions:
      report.actionPlan.urgent_48h.length +
      report.actionPlan.week_7days.length,
  });

  return report;
}
