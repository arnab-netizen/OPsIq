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
  engagementId: string;
  clientName: string;
  summary: string;
  healthStatus: "blocked" | "at_risk" | "healthy" | "unknown";
  healthReason: string;
  keyBlockers: KeyBlocker[];
  criticalActions: CriticalAction[];
  recommendedNextSteps: string[];
  metadata: {
    findingsCount: number;
    actionsCount: number;
    generatedAt: string;
  };
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
    steps.push("🚨 IMMEDIATE: Address all critical blockers before proceeding");
    steps.push("📋 Schedule intervention meeting within 24 hours");
    steps.push("✅ Create resolution plan for each blocker with clear owners");
  } else if (healthStatus === "at_risk") {
    steps.push("⚠️ URGENT: Develop mitigation plan for high-risk issues");
    steps.push("👥 Assign clear ownership to unresolved actions");
    steps.push("📅 Establish escalation triggers and checkpoints");
  }

  const inProgress = actions.filter((a) => a.status === "in_progress");
  if (inProgress.length > 0) {
    steps.push(
      `📍 Progress ${inProgress.length} in-progress action(s) toward completion`
    );
  }

  const unresolvedFindings = actions.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "verified" &&
      a.status !== "cancelled"
  );
  if (unresolvedFindings.length > 3) {
    steps.push("🎯 Focus on completing at least 3 actions this week");
  }

  steps.push("📊 Schedule weekly review to track progress against milestones");
  steps.push("🔄 Re-assess health status after implementing critical changes");

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

  let healthReason = "";
  switch (finalHealthStatus) {
    case "blocked":
      healthReason = `${blockers.length} critical blocker(s) prevent progress. Immediate intervention required.`;
      break;
    case "at_risk":
      healthReason = `${blockers.length} high-priority issue(s) pose execution risk. Action required this week.`;
      break;
    case "healthy":
      healthReason = "All critical milestones on track. Continue monitoring.";
      break;
    default:
      healthReason =
        "Insufficient data to assess health. Gather more engagement details.";
  }

  const report: ReportOutput = {
    engagementId,
    clientName,
    summary,
    healthStatus: finalHealthStatus,
    healthReason,
    keyBlockers: blockers,
    criticalActions,
    recommendedNextSteps: nextSteps,
    metadata: {
      findingsCount: findings.length,
      actionsCount: actions.length,
      generatedAt: new Date().toISOString(),
    },
  };

  logger.info("Report generated successfully", {
    engagementId,
    healthStatus: finalHealthStatus,
    blockerCount: blockers.length,
  });

  return report;
}
