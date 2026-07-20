/**
 * Phase 5 — Startup Execution Blueprint Service.
 * Creates the full execution chain from an approved startup idea:
 * BusinessObjective → ProcessExecutionTasks → KPIOwnershipRecords → BusinessRiskEntries
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { createObjectiveInTx } from "@/services/owner-mode/business-objective.service";
import { checkApprovalStaleness } from "@/services/owner-strategy/startup-session.service";
import { Prisma } from "@/generated/prisma/client";

export interface BlueprintInput {
  sessionId: string;
  ideaId: string;
  ownerDecisionId: string;
  objectiveTitle: string;
  objectiveDescription?: string;
  targetMetricName?: string;
  targetValue?: number;
  deadline?: Date;
  initialTaskTitles?: string[];
  kpiNames?: Array<{ metricName: string; metricLabel: string; reviewCadence: string }>;
  riskCodes?: Array<{ riskCode: string; title: string; category: string; likelihood: number; impact: number }>;
}

export interface BlueprintResult {
  blueprintId: string;
  objectiveId: string;
  taskIds: string[];
  kpiIds: string[];
  riskIds: string[];
  resourceAllocationIds: string[];
  constraintIds: string[];
  outcomeIds: string[];
}

export async function createBlueprint(
  workspaceId: string,
  actorId: string,
  input: BlueprintInput
): Promise<BlueprintResult> {
  // Stale-reapproval guard: block blueprint if material inputs changed since GO
  const ownerDecision = await db.startupOwnerDecision.findFirst({
    where: { id: input.ownerDecisionId },
    select: {
      linkedIdeaVersionId: true,
      linkedProfileVersionId: true,
      linkedEconomicModelId: true,
      linkedReadinessId: true,
      linkedSystemRecId: true,
      linkedBusinessModelId: true,
      linkedMarketSizingId: true,
      linkedValidationPlanId: true,
      decisionType: true,
    },
  });
  if (!ownerDecision) throw new NotFoundError("StartupOwnerDecision", input.ownerDecisionId);

  // Pass versioned artifact IDs from the decision — checkApprovalStaleness queries current snapshots internally
  const staleness = await checkApprovalStaleness(workspaceId, input.sessionId, {
    ideaId: input.ideaId,
    ideaVersionId: ownerDecision.linkedIdeaVersionId,
    profileVersionId: ownerDecision.linkedProfileVersionId,
    economicModelId: ownerDecision.linkedEconomicModelId,
    readinessId: ownerDecision.linkedReadinessId,
    systemRecId: ownerDecision.linkedSystemRecId,
    businessModelId: ownerDecision.linkedBusinessModelId,
    marketSizingId: ownerDecision.linkedMarketSizingId,
    validationPlanId: ownerDecision.linkedValidationPlanId,
  });

  if (staleness.isStale) {
    throw new ConflictError(
      `STALE_REAPPROVAL_REQUIRED: approval package has changed since GO decision. Changed inputs: ${staleness.changedInputs.join(", ")}. Owner must re-approve before blueprint creation.`
    );
  }

  // Idempotency: check if blueprint already exists (non-superseded)
  const existing = await db.startupExecutionBlueprint.findFirst({
    where: {
      sessionId: input.sessionId,
      ideaId: input.ideaId,
      blueprintStatus: { not: "SUPERSEDED" },
    },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(`Blueprint already exists for this idea (blueprintId: ${existing.id})`);
  }

  const session = await db.ownerStartupSession.findFirst({
    where: { id: input.sessionId, workspaceId },
    select: { id: true },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", input.sessionId);

  const idea = await db.startupIdeaRecord.findFirst({
    where: { id: input.ideaId, sessionId: input.sessionId, workspaceId },
    select: { id: true, name: true },
  });
  if (!idea) throw new NotFoundError("StartupIdeaRecord", input.ideaId);

  const blueprintId = randomUUID();
  const taskIds: string[] = [];
  const kpiIds: string[] = [];
  const riskIds: string[] = [];
  const resourceAllocationIds: string[] = [];
  const constraintIds: string[] = [];
  const outcomeIds: string[] = [];

  let capturedObjectiveId = "";

  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Create objective atomically inside the main transaction
    const objective = await createObjectiveInTx(tx, {
      workspaceId,
      actorId,
      title: input.objectiveTitle,
      description: input.objectiveDescription,
      objectiveType: "GROWTH",
      targetMetricName: input.targetMetricName,
      targetValue: input.targetValue,
      deadline: input.deadline,
    });
    const objectiveId = objective.id;
    capturedObjectiveId = objectiveId;

    // Link objective to startup session + idea
    await tx.businessObjective.update({
      where: { id: objectiveId },
      data: {
        linkedStartupSessionId: input.sessionId,
        linkedStartupIdeaId: input.ideaId,
      },
    });

    // Create ProcessExecutionTasks using actual schema fields
    const taskTitles = input.initialTaskTitles ?? [
      `Validate first customer for ${idea.name}`,
      `Complete regulatory requirements for ${idea.name}`,
      `Secure supplier agreements for ${idea.name}`,
      `Launch minimum viable offering for ${idea.name}`,
    ];

    for (let i = 0; i < taskTitles.length; i++) {
      const taskTitle = taskTitles[i];
      const taskId = randomUUID();
      taskIds.push(taskId);
      await tx.processExecutionTask.create({
        data: {
          id: taskId,
          workspaceId,
          taskKey: `startup_${input.ideaId.slice(0, 8)}_task_${i + 1}`,
          sourceFamily: "STARTUP_MODE",
          sourceFindingKey: `startup_${input.sessionId.slice(0, 8)}_${i + 1}`,
          executionRoute: "OWNER_LED",
          actionOwner: actorId,
          approvalLevel: "OWNER",
          status: "PROPOSED",
          completionCriteria: taskTitle,
          reassessmentTrigger: "WEEKLY_REVIEW",
          riskIfIgnored: "Startup execution delayed or blocked",
          ownerVisibleSummary: taskTitle,
          severity: "MEDIUM",
          priorityRank: i + 1,
          updatedAt: new Date(),
        },
      });
    }

    // Create KPI ownership records
    const kpiDefs = input.kpiNames ?? [
      {
        metricName: `startup_${input.ideaId.slice(0, 8)}_revenue`,
        metricLabel: `${idea.name} Revenue`,
        reviewCadence: "WEEKLY",
      },
      {
        metricName: `startup_${input.ideaId.slice(0, 8)}_customers`,
        metricLabel: `${idea.name} Customer Count`,
        reviewCadence: "WEEKLY",
      },
    ];

    for (const kpi of kpiDefs) {
      const kpiId = randomUUID();
      kpiIds.push(kpiId);
      await tx.kPIOwnershipRecord.create({
        data: {
          id: kpiId,
          workspaceId,
          metricName: kpi.metricName,
          metricLabel: kpi.metricLabel,
          ownerUserId: actorId,
          reviewCadence: kpi.reviewCadence,
          linkedObjectiveId: objectiveId,
          updatedAt: new Date(),
        },
      });
    }

    // Create BusinessRiskEntries
    const riskDefs = input.riskCodes ?? [
      {
        riskCode: `startup_${input.ideaId.slice(0, 8)}_demand`,
        title: `${idea.name}: Demand risk — customers may not pay`,
        category: "MARKET",
        likelihood: 50,
        impact: 70,
      },
      {
        riskCode: `startup_${input.ideaId.slice(0, 8)}_capital`,
        title: `${idea.name}: Capital exhaustion before break-even`,
        category: "FINANCIAL",
        likelihood: 40,
        impact: 80,
      },
    ];

    for (const risk of riskDefs) {
      const riskId = randomUUID();
      riskIds.push(riskId);
      await tx.businessRiskEntry.create({
        data: {
          id: riskId,
          workspaceId,
          riskCode: risk.riskCode,
          title: risk.title,
          category: risk.category,
          likelihood: risk.likelihood,
          impact: risk.impact,
          severity: Math.round((risk.likelihood * risk.impact) / 100),
          linkedObjectiveId: objectiveId,
          linkedStartupSessionId: input.sessionId,
          identifiedBy: actorId,
          updatedAt: new Date(),
        },
      });
    }

    // Link resource allocations to the startup objective
    const resourcePool = await tx.resourcePool.findFirst({
      where: { workspaceId, isActive: true },
      select: { id: true },
    });
    if (resourcePool) {
      const raId = randomUUID();
      resourceAllocationIds.push(raId);
      await tx.resourceAllocation.create({
        data: {
          id: raId,
          workspaceId,
          poolId: resourcePool.id,
          objectiveId,
          allocationAmount: 1,
          priority: 70,
          status: "ALLOCATED",
          allocatedBy: actorId,
          idempotencyKey: `blueprint_${blueprintId}_pool_${resourcePool.id}`,
        },
      });
    }

    // Record startup-specific constraints identified during validation
    const constraintId = randomUUID();
    constraintIds.push(constraintId);
    await tx.constraintResolutionRecord.create({
      data: {
        id: constraintId,
        workspaceId,
        constraintType: "CAPITAL",
        constraintSource: "INTERNAL",
        title: `${idea.name}: startup capital constraint`,
        bindingScore: 70,
        remediationAction: "Validate capital sufficiency before first spend",
        status: "ACTIVE",
        linkedObjectiveId: objectiveId,
        updatedAt: new Date(),
      },
    });

    // Record funded initiative expected outcome
    const outcomeId = randomUUID();
    outcomeIds.push(outcomeId);
    await tx.fundedInitiativeOutcome.create({
      data: {
        id: outcomeId,
        workspaceId,
        businessId: workspaceId,
        initiativeLabel: `${idea.name} startup launch`,
        outcome: "PENDING",
        nextStep: taskTitles[0] ?? "Validate first customer",
        safeForLearning: true,
        expectedImpact: input.targetValue ?? null,
        createdBy: actorId,
      },
    });

    // Create blueprint record
    await tx.startupExecutionBlueprint.create({
      data: {
        id: blueprintId,
        workspaceId,
        sessionId: input.sessionId,
        ideaId: input.ideaId,
        ownerDecisionId: input.ownerDecisionId,
        objectiveId,
        taskIds: taskIds as unknown as object,
        kpiIds: kpiIds as unknown as object,
        riskIds: riskIds as unknown as object,
        resourceAllocationIds: resourceAllocationIds as unknown as object,
        constraintIds: constraintIds as unknown as object,
        outcomeIds: outcomeIds as unknown as object,
        blueprintStatus: "ACTIVE",
        createdBy: actorId,
      },
    });

    // Update session current blueprint pointer
    await tx.ownerStartupSession.update({
      where: { id: input.sessionId },
      data: { currentBlueprintId: blueprintId, updatedAt: new Date() },
    });

    await emitAuditEvent(
      {
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_EXECUTION_BLUEPRINT_CREATED,
        payload: {
          blueprintId,
          sessionId: input.sessionId,
          ideaId: input.ideaId,
          objectiveId,
          taskCount: taskIds.length,
          kpiCount: kpiIds.length,
          riskCount: riskIds.length,
        },
      },
      tx
    );
  });
  } catch (err: unknown) {
    // P2002: unique constraint on (sessionId, ideaId, blueprintStatus) — concurrent blueprint race
    if (
      err instanceof Error &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError(
        `Blueprint already exists for this idea — concurrent creation detected (blueprintId race on sessionId=${input.sessionId} ideaId=${input.ideaId})`
      );
    }
    throw err;
  }

  return { blueprintId, objectiveId: capturedObjectiveId, taskIds, kpiIds, riskIds, resourceAllocationIds, constraintIds, outcomeIds };
}
