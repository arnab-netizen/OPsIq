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
import { checkApprovalStaleness, type VersionedApprovalState } from "@/services/owner-strategy/startup-session.service";
import { deriveVerificationWindows, type DeriveWindowsInput } from "@/domain/owner-strategy/startup-verification-windows";
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
  // G4/G5: inputs for derived verification windows and plan governance
  executionPlanStartDate?: Date | null;
  executionPlanTargetDate?: Date | null;
  executionPlanSpendingLimitCents?: bigint | null;
  stopConditions?: string[];
  rollbackConditions?: string[];
  windowDerivationInputs?: Partial<DeriveWindowsInput>;
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
  initiativeId: string;
  verificationWindowIds: string[];
  executionPlanId: string;
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
  const decisionVersionedState: VersionedApprovalState = {
    ideaId: input.ideaId,
    ideaVersionId: ownerDecision.linkedIdeaVersionId,
    profileVersionId: ownerDecision.linkedProfileVersionId,
    economicModelId: ownerDecision.linkedEconomicModelId,
    readinessId: ownerDecision.linkedReadinessId,
    systemRecId: ownerDecision.linkedSystemRecId,
    businessModelId: ownerDecision.linkedBusinessModelId,
    marketSizingId: ownerDecision.linkedMarketSizingId,
    validationPlanId: ownerDecision.linkedValidationPlanId,
  };
  const staleness = await checkApprovalStaleness(workspaceId, input.sessionId, decisionVersionedState);

  if (staleness.isStale) {
    throw new ConflictError(
      `STALE_REAPPROVAL_REQUIRED: approval package has changed since GO decision. Changed inputs: ${staleness.changedInputs.join(", ")}. Owner must re-approve before blueprint creation.`
    );
  }

  // G16: Blueprint supersession policy — if a DRAFT or ACTIVE blueprint exists after reapproval,
  // supersede it rather than blocking. If the existing blueprint is ACTIVE and has NOT gone
  // through reapproval (staleness check did not pass), block as before.
  const existing = await db.startupExecutionBlueprint.findFirst({
    where: {
      sessionId: input.sessionId,
      ideaId: input.ideaId,
      blueprintStatus: { not: "SUPERSEDED" },
    },
    select: { id: true, blueprintStatus: true, ownerDecisionId: true },
  });
  if (existing) {
    // Allow supersession only if the existing blueprint's decision differs from the current one
    // (i.e. the owner re-approved, generating a new ownerDecisionId).
    if (existing.ownerDecisionId === input.ownerDecisionId) {
      throw new ConflictError(`Blueprint already exists for this idea (blueprintId: ${existing.id})`);
    }
    // Different decision = reapproval happened — mark old blueprint SUPERSEDED before creating new one.
    // R8/R9: atomically supersede all plans and cancel all tasks linked to the old blueprint.
    await db.$transaction(async (txSupersede: typeof db) => {
      await txSupersede.startupExecutionBlueprint.update({
        where: { id: existing.id },
        data: { blueprintStatus: "SUPERSEDED" },
      });
      // R8: mark the old execution plan as SUPERSEDED so it cannot authorize further actions
      await txSupersede.startupExecutionPlan.updateMany({
        where: { blueprintId: existing.id, workspaceId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } },
        data: { status: "SUPERSEDED" },
      });
      // R9: cancel all non-terminal tasks linked to the old blueprint
      await txSupersede.processExecutionTask.updateMany({
        where: {
          workspaceId,
          linkedStartupBlueprintId: existing.id,
          status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] },
        },
        data: { status: "CANCELLED", notes: "Cancelled: blueprint superseded by reapproval" },
      });
    });
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_BLUEPRINT_SUPERSEDED,
      payload: { supersededBlueprintId: existing.id, newOwnerDecisionId: input.ownerDecisionId, sessionId: input.sessionId, ideaId: input.ideaId },
    });
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_EXECUTION_PLAN_SUPERSEDED,
      payload: { supersededBlueprintId: existing.id, sessionId: input.sessionId, ideaId: input.ideaId },
    });
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
  let capturedInitiativeId = "";
  const capturedVerificationWindowIds: string[] = [];
  // G3: Generate plan ID upfront so tasks can be linked at creation time
  const executionPlanId = randomUUID();
  let capturedExecutionPlanId = "";

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
          // G3: Startup link fields — allow assertStartupExecutionAuthorization to gate START actions
          linkedStartupSessionId: input.sessionId,
          linkedStartupBlueprintId: blueprintId,
          linkedStartupPlanId: executionPlanId,
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
          originBlueprintId: blueprintId,
          originType: "BLUEPRINT_ARTIFACT",
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
        linkedStartupSessionId: input.sessionId,
        originBlueprintId: blueprintId,
        originType: "BLUEPRINT_ARTIFACT",
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

    // G12: Create governed Initiative record
    const initiativeId = randomUUID();
    await tx.startupInitiative.create({
      data: {
        id: initiativeId,
        workspaceId,
        sessionId: input.sessionId,
        ideaId: input.ideaId,
        objectiveId,
        label: `${idea.name} startup launch`,
        scope: input.objectiveDescription ?? `Launch and validate ${idea.name} as a new business`,
        accountableOwnerId: actorId,
        status: "ACTIVE",
        budgetCents: null,
        approvalDecisionId: input.ownerDecisionId,
        createdBy: actorId,
      },
    });

    // G5: Derive verification windows from actual evidence inputs — no hardcoded 30-day placeholder
    capturedInitiativeId = initiativeId;
    const windowStart = new Date();
    const derivationInputs: DeriveWindowsInput = {
      ideaName: idea.name,
      hypotheses: input.windowDerivationInputs?.hypotheses ?? [],
      economics: input.windowDerivationInputs?.economics ?? null,
      kpis: (input.kpiNames ?? []).map((k) => ({ metricName: k.metricName, reviewCadence: k.reviewCadence })),
      validationPlan: input.windowDerivationInputs?.validationPlan ?? null,
      taskCount: taskTitles.length,
      ownerDecisionSpendingLimitCents: ownerDecision.spendingLimitCents ?? null,
    };
    const derivedWindows = deriveVerificationWindows(derivationInputs);

    for (const w of derivedWindows) {
      const windowId = randomUUID();
      capturedVerificationWindowIds.push(windowId);
      const windowEnd = new Date(windowStart.getTime() + w.durationDays * 24 * 60 * 60 * 1000);
      await tx.startupVerificationWindow.create({
        data: {
          id: windowId,
          workspaceId,
          initiativeId,
          sessionId: input.sessionId,
          ideaId: input.ideaId,
          windowLabel: w.windowLabel,
          startsAt: windowStart,
          endsAt: windowEnd,
          successCriteria: w.successCriteria as unknown as object,
          failureCriteria: w.failureCriteria as unknown as object,
          metricsToMeasure: w.metricsToMeasure as unknown as object,
          derivationRationale: w.derivationRationale,
          provisional: w.provisional,
          evidenceRequired: w.evidenceRequired as unknown as object,
          reassessmentTrigger: w.reassessmentTrigger,
          confidence: w.confidence,
          outcome: "PENDING",
          createdBy: actorId,
        },
      });
    }

    // Fallback: if no windows were derived (e.g., zero hypotheses, no economics), create a minimal window
    if (derivedWindows.length === 0) {
      const windowId = randomUUID();
      capturedVerificationWindowIds.push(windowId);
      const windowEnd = new Date(windowStart.getTime() + 14 * 24 * 60 * 60 * 1000);
      await tx.startupVerificationWindow.create({
        data: {
          id: windowId,
          workspaceId,
          initiativeId,
          sessionId: input.sessionId,
          ideaId: input.ideaId,
          windowLabel: `${idea.name} — Initial Review`,
          startsAt: windowStart,
          endsAt: windowEnd,
          successCriteria: taskTitles.slice(0, 2).map((t) => `Complete: ${t}`) as unknown as object,
          failureCriteria: ["No progress on first execution task within window"] as unknown as object,
          metricsToMeasure: ["task_completion_count"] as unknown as object,
          outcome: "PENDING",
          createdBy: actorId,
        },
      });
    }

    // G-ExecutionPlan: Create StartupExecutionPlan linked to this initiative
    capturedExecutionPlanId = executionPlanId;
    const taskSummaries = taskIds.map((tId, idx) => ({
      taskId: tId,
      label: taskTitles[idx] ?? `Task ${idx + 1}`,
      sequenceOrder: idx + 1,
      dependsOn: idx > 0 ? [taskIds[idx - 1]] : [],
      status: "PENDING",
    }));
    await tx.startupExecutionPlan.create({
      data: {
        id: executionPlanId,
        workspaceId,
        sessionId: input.sessionId,
        ideaId: input.ideaId,
        initiativeId,
        blueprintId,
        ownerDecisionId: input.ownerDecisionId,
        status: "ACTIVE",
        planVersion: 1,
        tasks: taskSummaries as unknown as object,
        milestones: capturedVerificationWindowIds.length > 0
          ? capturedVerificationWindowIds.map((wId, i) => ({ label: `Verification window ${i + 1}`, windowId: wId }))
          : [{ label: "Initial review" }],
        // G4: Governance fields derived from approval decision and caller inputs
        startDate: input.executionPlanStartDate ?? null,
        targetDate: input.executionPlanTargetDate ?? input.deadline ?? null,
        spendingLimitCents: input.executionPlanSpendingLimitCents ?? ownerDecision.spendingLimitCents ?? null,
        stopConditions: (input.stopConditions ?? []) as unknown as object,
        rollbackConditions: (input.rollbackConditions ?? []) as unknown as object,
        approvalPackageHash: staleness.currentHash,
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
        initiativeId,
        verificationWindowIds: capturedVerificationWindowIds as unknown as object,
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

    await emitAuditEvent(
      {
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_EXECUTION_PLAN_CREATED,
        payload: { executionPlanId, blueprintId, initiativeId, sessionId: input.sessionId, ideaId: input.ideaId, taskCount: taskIds.length },
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

  return { blueprintId, objectiveId: capturedObjectiveId, taskIds, kpiIds, riskIds, resourceAllocationIds, constraintIds, outcomeIds, initiativeId: capturedInitiativeId, verificationWindowIds: capturedVerificationWindowIds, executionPlanId: capturedExecutionPlanId };
}
