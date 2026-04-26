import { getEngagementById } from "./engagement.js";
import { listFindingsForEngagement } from "./findings.js";
import { getActionsForEngagement } from "./action.js";
import { NotFoundError } from "../infra/errors.js";
import { logger } from "../infra/logger.js";

export interface KeyBlocker {
  issue: string;
  why: string;
  impact: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface CriticalAction {
  title: string;
  priority: "high" | "medium" | "low";
  rationale: string;
  dueDate?: string;
  owner?: string;
}

export interface ReportOutput {
  title: string;
  client: string;
  problem: string;
  currentStatus: {
    health: string;
    riskLevel: string;
    summary: string;
  };
  criticalIssues: string[];
  blockers: Array<{
    title: string;
    description: string;
    impact: string;
  }>;
  actionPlan: Array<{
    sequence: number;
    state: string;
    action: string;
    owner?: string;
    dueDate?: string;
  }>;
  nextSteps: string[];
  generatedAt: string;
}

async function analyzeBlockers(
  engagementId: string,
  findings: any[],
  actions: any[]
): Promise<{ blockers: KeyBlocker[]; healthStatus: string }> {
  const blockers: KeyBlocker[] = [];
  let healthStatus = "healthy";

  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const highFindings = findings.filter((f) => f.severity === "high");

  if (criticalFindings.length > 0) {
    healthStatus = "blocked";
    criticalFindings.forEach((finding) => {
      blockers.push({
        issue: finding.title,
        why: finding.summary || `Critical issue: ${finding.title}`,
        impact: "Prevents engagement progress and delivery milestones",
        severity: "critical",
      });
    });
  } else if (highFindings.length > 0) {
    healthStatus = "at_risk";
    highFindings.slice(0, 2).forEach((finding) => {
      blockers.push({
        issue: finding.title,
        why: finding.summary || `High priority issue: ${finding.title}`,
        impact: "May impact timeline and quality of delivery",
        severity: "high",
      });
    });
  }

  const overdueActions = actions.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.dueDate &&
      new Date(a.dueDate) < new Date()
  );

  if (overdueActions.length > 0) {
    if (healthStatus === "healthy") {
      healthStatus = "at_risk";
    }
    overdueActions.slice(0, 1).forEach((action) => {
      blockers.push({
        issue: `Overdue action: ${action.title}`,
        why: `Task was due on ${new Date(action.dueDate).toLocaleDateString()} and remains unresolved`,
        impact: "Delays downstream activities and increases risk exposure",
        severity: "high",
      });
    });
  }

  const unassignedCritical = actions.filter(
    (a) =>
      a.priority === "high" &&
      !a.assignedTo &&
      a.status !== "completed" &&
      a.status !== "verified"
  );

  if (unassignedCritical.length > 0 && blockers.length === 0) {
    if (healthStatus === "healthy") {
      healthStatus = "at_risk";
    }
    blockers.push({
      issue: "Unassigned critical actions",
      why: `${unassignedCritical.length} high-priority action(s) lack clear ownership`,
      impact: "Accountability gaps lead to missed deadlines and execution failures",
      severity: "high",
    });
  }

  return { blockers, healthStatus };
}

function generateNextSteps(
  healthStatus: string,
  blockers: KeyBlocker[],
  actions: any[]
): string[] {
  const steps: string[] = [];

  if (healthStatus === "blocked") {
    steps.push("Hold emergency recovery meeting within 24 hours");
    steps.push(
      "Develop detailed resolution plan for each critical blocker with assigned owners"
    );
    steps.push("Establish daily check-ins until blockers are cleared");
    steps.push(
      "Communicate status updates to all stakeholders immediately"
    );
  } else if (healthStatus === "at_risk") {
    steps.push("Schedule recovery planning session this week");
    steps.push(
      "Assign clear ownership and accountability for all pending actions"
    );
    steps.push("Establish weekly review cadence to monitor progress");
    steps.push(
      "Identify and remove barriers preventing action completion"
    );
  } else {
    steps.push(
      "Maintain current execution pace on all planned initiatives"
    );
    steps.push(
      "Schedule monthly progress reviews to ensure sustained momentum"
    );
  }

  const inProgress = actions.filter((a) => a.status === "in_progress");
  if (inProgress.length > 0) {
    steps.push(
      `Accelerate completion of ${inProgress.length} active initiative(s) toward final delivery`
    );
  }

  const unresolvedCount = actions.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.status !== "cancelled"
  ).length;

  if (unresolvedCount > 3) {
    steps.push(`Complete at least 3 pending actions within the next 7 days`);
  }

  steps.push("Review and adjust resource allocation based on priorities");
  steps.push("Reassess status weekly and report to leadership");

  return steps;
}

export async function generateReport(
  engagementId: string,
  userId?: string
): Promise<ReportOutput> {
  logger.info("Generating engagement report", { engagementId });

  const engagement = await getEngagementById(engagementId, true);
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const findings = await listFindingsForEngagement(engagementId);

  const actions =
    userId && engagement.client
      ? await getActionsForEngagement(engagementId, userId).catch(() => [])
      : [];

  const clientName = engagement.client?.name || "Unknown Client";
  const title = engagement.title || "Unnamed Engagement";
  const status = engagement.status || "unknown";

  const summary =
    `${clientName} engagement (${title}) is currently in ${status} state with ${findings.length} findings ` +
    `and ${actions.length} actions. ` +
    (engagement.description
      ? `Focus areas: ${engagement.description}`
      : "Comprehensive assessment in progress.");

  const { blockers, healthStatus: computedHealthStatus } =
    await analyzeBlockers(engagementId, findings, actions);

  let finalHealthStatus: "blocked" | "at_risk" | "healthy" | "unknown" =
    "unknown";
  if (computedHealthStatus === "blocked") {
    finalHealthStatus = "blocked";
  } else if (computedHealthStatus === "at_risk") {
    finalHealthStatus = "at_risk";
  } else if (
    findings.length === 0 &&
    actions.every((a) => a.status === "completed" || a.status === "verified")
  ) {
    finalHealthStatus = "healthy";
  } else if (findings.length > 0 || actions.length > 0) {
    finalHealthStatus = "at_risk";
  }

  const criticalActions: CriticalAction[] = [];

  const highPriorityActions = actions.filter(
    (a) =>
      a.priority === "high" &&
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.status !== "cancelled"
  );

  highPriorityActions.slice(0, 3).forEach((action) => {
    criticalActions.push({
      title: action.title,
      priority: "high",
      rationale: `${action.description || "Critical action"}. Status: ${action.status}. ${
        action.assignedTo ? `Owner: ${action.assignedTo}` : "⚠️ Unassigned"
      }`,
      dueDate: action.dueDate
        ? new Date(action.dueDate).toLocaleDateString()
        : undefined,
      owner: action.assignedTo,
    });
  });

  if (criticalActions.length === 0) {
    const mediumActions = actions.filter(
      (a) =>
        a.priority === "medium" &&
        a.status !== "completed" &&
        a.status !== "verified"
    );

    mediumActions.slice(0, 2).forEach((action) => {
      criticalActions.push({
        title: action.title,
        priority: "medium",
        rationale: action.description || "Planned action",
        dueDate: action.dueDate
          ? new Date(action.dueDate).toLocaleDateString()
          : undefined,
        owner: action.assignedTo,
      });
    });
  }

  const nextSteps = generateNextSteps(finalHealthStatus, blockers, actions);

  // Format health status for clients
  const healthStatusLabel: { [key: string]: string } = {
    blocked: "Critical - Action Required",
    at_risk: "At Risk - Intervention Needed",
    healthy: "On Track",
    unknown: "Needs Assessment",
  };

  const riskLevelLabel: { [key: string]: string } = {
    blocked: "Severe",
    at_risk: "High",
    healthy: "Low",
    unknown: "Unclear",
  };

  let statusSummary = "";
  switch (finalHealthStatus) {
    case "blocked":
      statusSummary = `Business recovery is blocked by ${blockers.length} critical issue(s). Immediate intervention required to prevent further deterioration.`;
      break;
    case "at_risk":
      statusSummary = `Business recovery is at risk due to ${blockers.length} unresolved issue(s). Action required this week to maintain momentum.`;
      break;
    case "healthy":
      statusSummary = `Recovery plan is progressing on schedule. Continue executing on all action items.`;
      break;
    default:
      statusSummary = `Assessment is in progress. Insufficient data available to determine status.`;
  }

  // Extract critical issues from findings
  const criticalIssues = findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 5)
    .map((f) => f.title);

  // Format blockers for client
  const clientBlockers = blockers.map((b) => ({
    title: b.issue,
    description: b.why,
    impact: b.impact,
  }));

  // Format action plan for client
  const clientActionPlan = criticalActions
    .map((action, idx) => {
      const stateLabel = {
        high: "Priority",
        medium: "Standard",
        low: "Planned",
      }[action.priority] || "Planned";

      return {
        sequence: idx + 1,
        state: stateLabel,
        action: action.title,
        owner: action.owner ? action.owner : undefined,
        dueDate: action.dueDate,
      };
    });

  const report: ReportOutput = {
    title: "Business Recovery Report",
    client: clientName,
    problem: engagement.description || title,
    currentStatus: {
      health: healthStatusLabel[finalHealthStatus],
      riskLevel: riskLevelLabel[finalHealthStatus],
      summary: statusSummary,
    },
    criticalIssues,
    blockers: clientBlockers,
    actionPlan: clientActionPlan,
    nextSteps,
    generatedAt: new Date().toISOString(),
  };

  logger.info("Report generated successfully", {
    engagementId,
    healthStatus: finalHealthStatus,
    blockerCount: blockers.length,
  });

  return report;
}
