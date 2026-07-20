/**
 * Startup Execution Blueprint Service (Phase 5).
 *
 * Converts an approved startup idea into a BusinessObjective + ProcessExecutionTask records
 * using the existing Phase 4 execution framework (persistProcessExecutionRoutes).
 * Idempotent: duplicate blueprint for same session+idea is blocked.
 * Workspace isolation enforced on all operations.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { createObjective } from "@/services/owner-mode/business-objective.service";
import { writeMemoryEntry } from "@/services/owner-mode/operating-memory.service";
import {
  persistProcessExecutionRoutes,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessExecutionBridgeAnalysis, BridgedExecutionRoute } from "@/domain/owner-mode/process-execution-bridge";

export interface BlueprintResult {
  objectiveId: string;
  taskCount: number;
}

/** Build the execution route set for a startup idea. */
function buildStartupExecutionRoutes(
  ideaName: string,
  sessionId: string,
  objectiveId: string,
  workspaceId: string
): BridgedExecutionRoute[] {
  const phases: Array<{
    key: string;
    summary: string;
    owner: BridgedExecutionRoute["actionOwner"];
    approval: BridgedExecutionRoute["approvalLevel"];
    severity: BridgedExecutionRoute["severity"];
    rank: number;
    criteria: string;
    trigger: string;
    risk: string;
  }> = [
    {
      key: `startup_${sessionId}_entity_registration`,
      summary: `Register business entity for ${ideaName}`,
      owner: "OWNER",
      approval: "NEVER_AUTO",
      severity: "HIGH",
      rank: 1,
      criteria: "Business entity registered, ABN/ACN or equivalent obtained",
      trigger: "If entity registration is delayed, block all other launch tasks",
      risk: "Cannot legally operate or sign supplier contracts without registration",
    },
    {
      key: `startup_${sessionId}_regulatory_licences`,
      summary: `Obtain all required licences for ${ideaName}`,
      owner: "OWNER",
      approval: "NEVER_AUTO",
      severity: "CRITICAL",
      rank: 2,
      criteria: "All regulatory licences confirmed in writing from relevant authority",
      trigger: "Missing licence is a hard gate — blocks launch",
      risk: "Operating without required licence creates regulatory and financial exposure",
    },
    {
      key: `startup_${sessionId}_capital_setup`,
      summary: `Secure startup capital and open business bank account for ${ideaName}`,
      owner: "OWNER",
      approval: "NEVER_AUTO",
      severity: "HIGH",
      rank: 3,
      criteria: "Capital confirmed available and transferred to business account",
      trigger: "If capital falls below break-even buffer, pause launch",
      risk: "Insufficient capital leads to cash-flow failure before break-even",
    },
    {
      key: `startup_${sessionId}_supplier_setup`,
      summary: `Confirm supplier agreements for ${ideaName}`,
      owner: "OWNER",
      approval: "OWNER_APPROVAL_REQUIRED",
      severity: "HIGH",
      rank: 4,
      criteria: "At least 2 suppliers confirmed with written pricing",
      trigger: "Supplier pricing increase >10% requires economic model re-assessment",
      risk: "No confirmed suppliers blocks delivery and invalidates unit economics",
    },
    {
      key: `startup_${sessionId}_delivery_setup`,
      summary: `Establish delivery and fulfilment operations for ${ideaName}`,
      owner: "MANAGER",
      approval: "OWNER_APPROVAL_REQUIRED",
      severity: "MEDIUM",
      rank: 5,
      criteria: "End-to-end delivery tested for at least 1 unit",
      trigger: "Error rate >10% requires operational review before scaling",
      risk: "Delivery failure damages customer trust and increases refund cost",
    },
    {
      key: `startup_${sessionId}_acquisition_launch`,
      summary: `Launch initial customer acquisition for ${ideaName}`,
      owner: "OWNER",
      approval: "OWNER_APPROVAL_REQUIRED",
      severity: "HIGH",
      rank: 6,
      criteria: "At least 3 paying customers acquired via confirmed channel",
      trigger: "If CAC exceeds model by >20%, pause and re-assess acquisition strategy",
      risk: "CAC overshoot destroys unit economics before break-even",
    },
    {
      key: `startup_${sessionId}_first_delivery`,
      summary: `Deliver to first paying customers and record unit economics for ${ideaName}`,
      owner: "OWNER",
      approval: "AUTO_ALLOWED",
      severity: "MEDIUM",
      rank: 7,
      criteria: "5+ units delivered, actual unit cost tracked vs model",
      trigger: "If actual margin <15%, pause scale-up and reassess pricing",
      risk: "Undetected margin erosion depletes capital before break-even",
    },
    {
      key: `startup_${sessionId}_break_even_review`,
      summary: `Break-even gate review for ${ideaName}`,
      owner: "OWNER",
      approval: "NEVER_AUTO",
      severity: "HIGH",
      rank: 8,
      criteria: "Owner reviews actual vs model economics and makes GO/MODIFY/HOLD decision",
      trigger: "Triggered at 60% of forecast break-even timeline",
      risk: "Continued burn beyond break-even without review leads to insolvency risk",
    },
  ];

  return phases.map((p) => ({
    workspaceId,
    taskKey: p.key,
    sourceFamily: "PROCESS_CORRECTION" as const, // closest valid enum for startup launch tasks
    sourceFindingKey: `${objectiveId}:${p.key}`,
    executionRoute: "CREATE_CORRECTION_TASK" as const,
    actionOwner: p.owner,
    approvalLevel: p.approval,
    requiredEvidence: [],
    evidenceRefs: [],
    completionCriteria: p.criteria,
    reassessmentTrigger: p.trigger,
    riskIfIgnored: p.risk,
    ownerVisibleSummary: p.summary,
    notActionableReason: null,
    severity: p.severity,
    priorityRank: p.rank,
    status: "PROPOSED",
    canStart: true,
  }));
}

/**
 * Create the execution blueprint for an approved startup idea.
 * Idempotent: throws ConflictError if blueprint already exists for this session+idea.
 */
export async function createBlueprint(
  workspaceId: string,
  sessionId: string,
  approvedIdeaId: string,
  ownerDecisionId: string,
  actorId: string
): Promise<BlueprintResult> {
  // Block duplicate blueprints
  const existingObjective = await db.businessObjective.findFirst({
    where: { workspaceId, linkedStartupSessionId: sessionId, linkedStartupIdeaId: approvedIdeaId },
  });
  if (existingObjective) {
    throw new ConflictError(`Execution blueprint already exists — objectiveId: ${existingObjective.id}`);
  }

  const [session, idea, decision] = await Promise.all([
    db.ownerStartupSession.findFirst({ where: { id: sessionId, workspaceId } }),
    db.startupIdeaRecord.findFirst({ where: { id: approvedIdeaId, sessionId, workspaceId } }),
    db.startupOwnerDecision.findFirst({ where: { id: ownerDecisionId, sessionId, workspaceId } }),
  ]);
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", approvedIdeaId);
  if (!decision) throw new NotFoundError("StartupOwnerDecision", ownerDecisionId);
  if ((decision as unknown as { decisionType: string }).decisionType !== "GO") {
    throw new ValidationError(
      `Cannot create blueprint: owner decision is ${(decision as unknown as { decisionType: string }).decisionType}, must be GO`
    );
  }

  // Create the Phase 4 BusinessObjective
  const objectiveId = await createObjective({
    workspaceId,
    actorId,
    title: `Launch: ${idea.name}`,
    description:
      `Startup execution plan for "${idea.name}" — approved via session ${sessionId}. ` +
      `Owner decision: ${ownerDecisionId}.`,
    objectiveType: "GROWTH",
    linkedGoalId: null,
  });

  // Link the objective back to the startup session
  await db.businessObjective.update({
    where: { id: objectiveId },
    data: {
      linkedStartupSessionId: sessionId,
      linkedStartupIdeaId: approvedIdeaId,
    },
  });

  // Build execution routes and persist via Phase 4 bridge
  const routes = buildStartupExecutionRoutes(idea.name, sessionId, objectiveId, workspaceId);
  const analysis: ProcessExecutionBridgeAnalysis = {
    workspaceId,
    routes,
    topRoute: routes[0] ?? null,
    summary: {
      total: routes.length,
      ownerApproval: routes.filter((r) => r.approvalLevel === "OWNER_APPROVAL_REQUIRED" || r.approvalLevel === "NEVER_AUTO").length,
      managerStaff: routes.filter((r) => r.actionOwner === "MANAGER" || r.actionOwner === "STAFF").length,
      dataTasks: 0,
      monitorOnly: 0,
    },
    evaluatedAt: new Date().toISOString(),
  };

  const { created } = await persistProcessExecutionRoutes(workspaceId, analysis, actorId);

  await writeMemoryEntry({
    workspaceId,
    actorId,
    memoryType: "STARTUP_EXECUTION_BLUEPRINT",
    sourceModel: "BusinessObjective",
    sourceId: objectiveId,
    key: `blueprint_${sessionId}_${approvedIdeaId}`,
    summary: `Execution blueprint created for "${idea.name}" — ${created} tasks, objective ${objectiveId}`,
    data: { sessionId, ideaId: approvedIdeaId, objectiveId, taskCount: created },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_EXECUTION_BLUEPRINT_CREATED,
    entityType: "BusinessObjective",
    entityId: objectiveId,
    payload: { sessionId, ideaId: approvedIdeaId, ownerDecisionId, taskCount: created },
  });

  return { objectiveId, taskCount: created };
}

/**
 * Get the blueprint for a session+idea combination.
 */
export async function getBlueprint(
  workspaceId: string,
  sessionId: string,
  ideaId: string
): Promise<{ objectiveId: string; taskCount: number } | null> {
  const objective = await db.businessObjective.findFirst({
    where: { workspaceId, linkedStartupSessionId: sessionId, linkedStartupIdeaId: ideaId },
  });
  if (!objective) return null;

  const taskCount = await db.processExecutionTask.count({
    where: {
      workspaceId,
      taskKey: { startsWith: `startup_${sessionId}_` },
    },
  });

  return { objectiveId: objective.id, taskCount };
}
