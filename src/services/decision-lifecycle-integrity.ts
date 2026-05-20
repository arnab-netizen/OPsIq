/**
 * Decision Lifecycle Integrity Check Service
 *
 * Validates decision records for consistency with canonical lifecycle model.
 * Detects missing fields, state inconsistencies, and orphaned records.
 */

import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { requireServiceContext } from "@/lib/service-auth";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import {
  DecisionState,
  isTerminalState,
} from "@/domain/decision-lifecycle";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

/**
 * Severity levels for integrity issues
 */
export type IssueSeverity = "critical" | "high" | "medium" | "low";

/**
 * Structured finding from integrity check
 */
export interface IntegrityFinding {
  severity: IssueSeverity;
  decisionId: string;
  workspaceId: string;
  currentState: DecisionState | string;
  currentStatus: string;
  issue: string;
  requiredFix: string;
  metadata?: Record<string, any>;
}

/**
 * Results from integrity check
 */
export interface IntegrityCheckResult {
  timestamp: Date;
  workspaceId: string;
  totalDecisionsChecked: number;
  findingsCount: number;
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: IntegrityFinding[];
}

/**
 * Helper to map status string to DecisionState
 */
function mapStatusToState(status: string): DecisionState | string {
  const stateMap: Record<string, DecisionState> = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    approved: "APPROVED",
    in_progress: "EXECUTED",
    outcome_recorded: "OUTCOME_RECORDED",
    done: "OUTCOME_RECORDED",
    closed: "CLOSED",
    rejected: "REJECTED",
    blocked: "REJECTED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };

  return stateMap[status?.toLowerCase()] || status;
}

/**
 * Run comprehensive decision lifecycle integrity check
 *
 * Validates:
 * - Missing required fields (workspaceId, owner, etc.)
 * - State consistency (execution records, outcomes)
 * - Timeline consistency (expected windows)
 * - Orphaned records (impact/ROI without executed decision)
 * - Audit trail gaps
 *
 * @param authContext - Authenticated user context with workspaceId
 * @returns Structured integrity findings
 */
export async function runDecisionLifecycleIntegrityCheck(
  authContext: CanonicalAuthContext
): Promise<IntegrityCheckResult> {
  // Verify auth context
  requireServiceContext(authContext, authContext.verifiedWorkspaceId);

  const workspaceId = authContext.verifiedWorkspaceId;
  const findings: IntegrityFinding[] = [];
  const startTime = Date.now();

  try {
    logger.info("Starting decision lifecycle integrity check", {
      workspaceId,
      userId: authContext.verifiedActorId,
    });

    // Fetch all decisions in workspace
    const decisions = await db.operatorItem.findMany({
      where: { workspaceId },
      include: {
        auditEvents: true,
      },
    });

    logger.info("Fetched decisions for integrity check", {
      workspaceId,
      count: decisions.length,
    });

    // Check 1: Missing workspace ID
    const missingWorkspace = decisions.filter((d: any) => !d.workspaceId);
    for (const decision of missingWorkspace) {
      findings.push({
        severity: "critical",
        decisionId: decision.id,
        workspaceId: workspaceId || "unknown",
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: "Decision missing workspaceId",
        requiredFix: `Update decision ${decision.id} to set workspaceId=${workspaceId}`,
      });
    }

    // Check 2: Missing owner
    const missingOwner = decisions.filter(
      (d: any) => !d.ownerUserId && !d.createdBy
    );
    for (const decision of missingOwner) {
      findings.push({
        severity: "high",
        decisionId: decision.id,
        workspaceId: decision.workspaceId,
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: "Decision missing owner (ownerUserId or createdBy)",
        requiredFix: `Assign owner to decision ${decision.id}`,
      });
    }

    // Check 3: Executed decisions without execution record
    const executedDecisions = decisions.filter(
      (d: any) => d.status === "in_progress" || mapStatusToState(d.status) === "EXECUTED"
    );
    const executedWithoutRecord = executedDecisions.filter(
      (d: any) => !d.startedAt && !d.executionStatus
    );
    for (const decision of executedWithoutRecord) {
      findings.push({
        severity: "high",
        decisionId: decision.id,
        workspaceId: decision.workspaceId,
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: "Executed decision missing execution record (startedAt or executionStatus)",
        requiredFix: `Set startedAt and executionStatus for decision ${decision.id}`,
        metadata: {
          currentExecutionStatus: decision.executionStatus,
          currentStartedAt: decision.startedAt,
        },
      });
    }

    // Check 4: Executed decisions without outcome after expected window
    const executionWindowDays = 7; // Expected outcome recording window
    const expectedOutcomeDeadline = new Date(
      Date.now() - executionWindowDays * 24 * 60 * 60 * 1000
    );

    const executedWithoutTimelyClosure = executedDecisions.filter((d: any) => {
      const hasOutcome = d.actualOutcomeValue !== null && d.actualOutcomeValue !== undefined;
      const startedLongAgo = d.startedAt && d.startedAt < expectedOutcomeDeadline;
      return startedLongAgo && !hasOutcome;
    });

    for (const decision of executedWithoutTimelyClosure) {
      const daysSinceExecution = decision.startedAt
        ? Math.floor((Date.now() - decision.startedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      findings.push({
        severity: "medium",
        decisionId: decision.id,
        workspaceId: decision.workspaceId,
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: `Executed decision missing outcome after ${executionWindowDays} days`,
        requiredFix: `Record outcome for decision ${decision.id} or mark as failed`,
        metadata: {
          startedAt: decision.startedAt,
          daysSinceExecution,
          expectedDeadline: expectedOutcomeDeadline.toISOString(),
        },
      });
    }

    // Check 5: Closed decisions without outcome
    const closedDecisions = decisions.filter(
      (d: any) => d.status === "done" || d.status === "closed" || mapStatusToState(d.status) === "CLOSED"
    );
    const closedWithoutOutcome = closedDecisions.filter(
      (d: any) => !d.actualOutcomeValue && !d.actualOutcome
    );
    for (const decision of closedWithoutOutcome) {
      findings.push({
        severity: "critical",
        decisionId: decision.id,
        workspaceId: decision.workspaceId,
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: "Closed decision missing outcome data (actualOutcome or actualOutcomeValue)",
        requiredFix: `Backfill outcome data for decision ${decision.id} before closure is valid`,
        metadata: {
          closedAt: decision.completedAt,
          actualOutcome: decision.actualOutcome,
          actualOutcomeValue: decision.actualOutcomeValue,
        },
      });
    }

    // Check 6: Impact/ROI records linked to non-executed decisions
    const impactRecords = await db.operatorItem.findMany({
      where: {
        workspaceId,
        AND: [
          {
            OR: [
              { impactActual: { not: null } },
              { impactLow: { not: null } },
              { impactHigh: { not: null } },
            ],
          },
        ],
      },
    });

    const impactOnNonExecuted = impactRecords.filter((d: any) => {
      const state = mapStatusToState(d.status);
      const isExecutedOrBeyond = [
        "EXECUTED",
        "OUTCOME_RECORDED",
        "CLOSED",
      ].includes(state as any);
      return !isExecutedOrBeyond;
    });

    for (const decision of impactOnNonExecuted) {
      findings.push({
        severity: "high",
        decisionId: decision.id,
        workspaceId: decision.workspaceId,
        currentState: mapStatusToState(decision.status),
        currentStatus: decision.status,
        issue: "Impact/ROI recorded for non-executed decision",
        requiredFix: `Clear impact records for decision ${decision.id} or execute the decision`,
        metadata: {
          impactActual: decision.impactActual,
          impactLow: decision.impactLow,
          impactHigh: decision.impactHigh,
          currentState: mapStatusToState(decision.status),
        },
      });
    }

    // Check 7: Audit gaps for lifecycle transitions
    const decisionsWithAuditGaps = [];

    for (const decision of decisions) {
      const auditEvents = decision.auditEvents || [];
      const state = mapStatusToState(decision.status);

      // Expected audit events based on state
      const expectedEvents: Record<string, string[]> = {
        SUBMITTED: ["DECISION_SUBMITTED"],
        APPROVED: ["DECISION_APPROVED"],
        EXECUTED: ["DECISION_EXECUTED"],
        OUTCOME_RECORDED: ["OUTCOME_RECORDED"],
        CLOSED: ["DECISION_CLOSED"],
        REJECTED: ["DECISION_REJECTED"],
        CANCELLED: ["DECISION_CANCELLED"],
        FAILED: ["DECISION_FAILED"],
      };

      const expected = expectedEvents[state as string] || [];
      const eventNames = auditEvents.map((e: any) => e.eventName || "");

      // For terminal states, must have at least one matching audit event
      if (isTerminalState(state as DecisionState)) {
        const hasExpectedEvent = expected.some((exp) => eventNames.includes(exp));
        if (!hasExpectedEvent && expected.length > 0) {
          findings.push({
            severity: "medium",
            decisionId: decision.id,
            workspaceId: decision.workspaceId,
            currentState: state,
            currentStatus: decision.status,
            issue: `Terminal decision missing audit event (expected: ${expected.join(", ")})`,
            requiredFix: `Verify and backfill audit trail for decision ${decision.id}`,
            metadata: {
              expectedEvents: expected,
              actualEvents: eventNames,
            },
          });
          decisionsWithAuditGaps.push(decision.id);
        }
      }
    }

    // Sort findings by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    findings.sort(
      (a, b) =>
        severityOrder[a.severity as keyof typeof severityOrder] -
        severityOrder[b.severity as keyof typeof severityOrder]
    );

    // Count by severity
    const findingsBySeverity = {
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
    };

    const result: IntegrityCheckResult = {
      timestamp: new Date(),
      workspaceId,
      totalDecisionsChecked: decisions.length,
      findingsCount: findings.length,
      findingsBySeverity,
      findings,
    };

    logger.info("Decision lifecycle integrity check completed", {
      workspaceId,
      totalDecisionsChecked: decisions.length,
      findingsCount: findings.length,
      findingsBySeverity,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logger.error("Decision lifecycle integrity check failed", {
      workspaceId,
      error: getSafeErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Check if decision has all required fields for its state
 */
export function validateDecisionFieldsForState(
  decision: any,
  state: DecisionState
): string[] {
  const errors: string[] = [];

  // Required for all states
  if (!decision.id) errors.push("Missing decisionId");
  if (!decision.workspaceId) errors.push("Missing workspaceId");
  if (!decision.status) errors.push("Missing status field");

  // Required by state
  switch (state) {
    case "DRAFT":
      if (!decision.createdBy) errors.push("Draft must have createdBy");
      break;

    case "SUBMITTED":
      if (!decision.createdBy) errors.push("Submitted must have createdBy");
      break;

    case "APPROVED":
      if (!decision.approvedAt) errors.push("Approved must have approvedAt timestamp");
      break;

    case "EXECUTED":
      if (!decision.startedAt) errors.push("Executed must have startedAt timestamp");
      if (!decision.executionStatus) errors.push("Executed must have executionStatus");
      break;

    case "OUTCOME_RECORDED":
      if (!decision.actualOutcomeValue && !decision.actualOutcome) {
        errors.push("Outcome recorded must have actualOutcome or actualOutcomeValue");
      }
      break;

    case "CLOSED":
      if (!decision.completedAt) errors.push("Closed must have completedAt timestamp");
      if (!decision.actualOutcomeValue && !decision.actualOutcome) {
        errors.push("Closed must have recorded outcome");
      }
      break;

    case "REJECTED":
    case "CANCELLED":
    case "FAILED":
      if (!decision.blockReason) errors.push(`${state} must have blockReason`);
      break;
  }

  return errors;
}

/**
 * Get a human-readable integrity check report
 */
export function formatIntegrityCheckResult(
  result: IntegrityCheckResult
): string {
  const lines: string[] = [
    `Decision Lifecycle Integrity Check Report`,
    `=====================================`,
    `Timestamp: ${result.timestamp.toISOString()}`,
    `Workspace: ${result.workspaceId}`,
    `Total Decisions Checked: ${result.totalDecisionsChecked}`,
    `Total Findings: ${result.findingsCount}`,
    ``,
    `Findings by Severity:`,
    `  Critical: ${result.findingsBySeverity.critical}`,
    `  High:     ${result.findingsBySeverity.high}`,
    `  Medium:   ${result.findingsBySeverity.medium}`,
    `  Low:      ${result.findingsBySeverity.low}`,
    ``,
  ];

  if (result.findings.length === 0) {
    lines.push("✅ No integrity issues found!");
  } else {
    lines.push("Issues Found:");
    lines.push("");

    const findingsByDecision = result.findings.reduce(
      (acc, finding) => {
        if (!acc[finding.decisionId]) {
          acc[finding.decisionId] = [];
        }
        acc[finding.decisionId].push(finding);
        return acc;
      },
      {} as Record<string, IntegrityFinding[]>
    );

    for (const [decisionId, decisionFindings] of Object.entries(
      findingsByDecision
    )) {
      lines.push(`Decision ${decisionId}:`);
      lines.push(`  State: ${decisionFindings[0].currentState}`);
      lines.push(`  Status: ${decisionFindings[0].currentStatus}`);
      for (const finding of decisionFindings) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.issue}`);
        lines.push(`  Fix: ${finding.requiredFix}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
