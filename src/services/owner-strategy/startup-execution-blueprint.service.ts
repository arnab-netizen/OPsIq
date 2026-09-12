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
import { checkApprovalStaleness, loadCanonicalCurrentApprovalState } from "@/services/owner-strategy/startup-session.service";
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
  input: BlueprintInput,
  opts?: { isFixtureRecord?: boolean }
): Promise<BlueprintResult> {
  // isFixtureRecord is NEVER read from the ordinary blueprint-create request body — it is only
  // ever passed by the route layer after an explicit SYSTEM_ADMIN capability check (see POST
  // /api/owner/startup/sessions/[sessionId]/blueprint). A self-serve owner running real Startup
  // Mode has no path to set this. Propagated onto every owner-visible record this blueprint
  // creates (BusinessObjective, ProcessExecutionTask, KPIOwnershipRecord, BusinessRiskEntry) so
  // an acceptance/QA blueprint run can never surface as a real owner's goal, task, KPI, or risk.
  // See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
  //
  // ROOT-CAUSE FIX (final beta blocker — fixture leakage on Home/Risk/Priorities): the caller-
  // supplied opt-in above is NOT the only signal. Seven real historical acceptance runs
  // (2026-08-21 through 2026-08-27) created blueprints against "OPSIQ Production Acceptance"
  // businesses without ever passing opts.isFixtureRecord (or without the acceptance actor holding
  // SYSTEM_ADMIN in that environment), leaving isFixtureRecord: false on every derived
  // BusinessRiskEntry/ConstraintResolutionRecord row despite the underlying OwnerBusiness already
  // being correctly flagged isFixtureBusiness: true. isFixtureRecord must ALSO be true whenever
  // the session's own isFixtureBusiness flag is true, or the session has been handed off to a
  // business that is itself isFixtureBusiness: true — both are already-established, legitimate
  // provenance signals (never a name/timestamp/ID heuristic), computed below once the session is
  // loaded.
  const explicitFixtureOptIn = opts?.isFixtureRecord === true;
  // G16: Blueprint supersession policy — if a DRAFT or ACTIVE blueprint exists after reapproval,
  // supersede it rather than blocking. If the existing blueprint is ACTIVE and has NOT gone
  // through reapproval (staleness check did not pass), block as before.
  // NOTE: The staleness check itself has moved inside the main $transaction (below) to close
  // the TOCTOU window between canonical-state read and blueprint persistence.
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
    await db.$transaction(async (txSupersede: Prisma.TransactionClient) => {
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
      // Audit inside transaction: a failed audit rolls back the supersede writes (CAT 2 fix).
      await emitAuditEvent(
        {
          workspaceId,
          actorId,
          eventName: AUDIT_EVENTS.STARTUP_BLUEPRINT_SUPERSEDED,
          payload: { supersededBlueprintId: existing.id, newOwnerDecisionId: input.ownerDecisionId, sessionId: input.sessionId, ideaId: input.ideaId },
        },
        txSupersede
      );
      await emitAuditEvent(
        {
          workspaceId,
          actorId,
          eventName: AUDIT_EVENTS.STARTUP_EXECUTION_PLAN_SUPERSEDED,
          payload: { supersededBlueprintId: existing.id, sessionId: input.sessionId, ideaId: input.ideaId },
        },
        txSupersede
      );
    });
  }

  const session = await db.ownerStartupSession.findFirst({
    where: { id: input.sessionId, workspaceId },
    // businessId: the OwnerBusiness this session is (or will be) handed off to — see
    // OwnerStartupSession.businessId doc comment. Read here so every ProcessExecutionTask this
    // blueprint creates carries the same businessId, closing the cross-business leak where
    // STARTUP_MODE tasks were persisted with businessId=null regardless of the session's own
    // business (D1 launch blocker — a business-scoped cockpit read must never surface a task that
    // actually belongs to a different business in the same workspace).
    //
    // isFixtureBusiness: the session's own fixture flag (see model doc comment) — read here
    // alongside businessId so isFixtureRecord below can be derived from real provenance instead
    // of only the caller's opt-in.
    select: { id: true, businessId: true, isFixtureBusiness: true },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", input.sessionId);

  // The session may already be handed off to a business that was independently reclassified as a
  // fixture (e.g. by the D3 acceptance-fixture reclassification) after this session/blueprint's
  // own flags were set — or never set at all. Checking the CURRENT state of that linked business
  // closes the gap the caller-only opt-in leaves open.
  let linkedBusinessIsFixture = false;
  if (session.businessId) {
    const linkedBusiness = await db.ownerBusiness.findFirst({
      where: { id: session.businessId, workspaceId },
      select: { isFixtureBusiness: true },
    });
    linkedBusinessIsFixture = linkedBusiness?.isFixtureBusiness === true;
  }
  const isFixtureRecord = explicitFixtureOptIn || session.isFixtureBusiness === true || linkedBusinessIsFixture;

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
    // Stale-reapproval guard: runs inside the transaction so the staleness read and blueprint
    // persistence share the same DB transaction, closing the TOCTOU window.
    // The decision's own linked IDs are NOT used here — the canonical builder queries current
    // DB state to detect post-GO mutations to profile, economic model, readiness, etc.
    const ownerDecision = await tx.startupOwnerDecision.findFirst({
      where: { id: input.ownerDecisionId },
      select: { decisionType: true, spendingLimitCents: true },
    });
    if (!ownerDecision) throw new NotFoundError("StartupOwnerDecision", input.ownerDecisionId);

    const currentState = await loadCanonicalCurrentApprovalState(workspaceId, input.sessionId, input.ideaId, tx);
    const staleness = await checkApprovalStaleness(workspaceId, input.sessionId, currentState, tx);
    if (staleness.isStale) {
      throw new ConflictError(
        `STALE_REAPPROVAL_REQUIRED: approval package has changed since GO decision. Changed inputs: ${staleness.changedInputs.join(", ")}. Owner must re-approve before blueprint creation.`
      );
    }

    // G2-3a: block blueprint creation when the target idea has been superseded by a revision.
    // The staleness check alone does not catch this when no material fields on the old idea changed.
    const ideaRevisionRow = await tx.startupIdeaRecord.findFirst({
      where: { id: input.ideaId, workspaceId },
      select: { supersededById: true },
    });
    if (ideaRevisionRow?.supersededById) {
      throw new ConflictError(
        `EXECUTION_BLOCKED: idea has been revised — blueprint creation requires a new GO approval for the revised idea.`
      );
    }

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
        isFixtureRecord,
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
          // businessId: stamped from the owning session (see the select above) so this task is
          // never visible from a different business's cockpit read in the same workspace.
          businessId: session.businessId,
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
          isFixtureRecord,
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
          isFixtureRecord,
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
          isFixtureRecord,
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
          isFixtureRecord,
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
        isFixtureRecord,
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

    // Pattern A optimistic concurrency: the session update incorporates the material pointer
    // values read during the staleness check into the WHERE clause. If any pointer changed
    // concurrently between the canonical-state read and this UPDATE (READ COMMITTED window),
    // the UPDATE matches 0 rows and we throw ConflictError.
    // currentState.profileVersionId and currentState.systemRecId were read from the session
    // row inside this transaction; input.ownerDecisionId equals session.currentOwnerDecisionId
    // (verified by checkApprovalStaleness above).
    const sessionBpUpdateResult = await tx.ownerStartupSession.updateMany({
      where: {
        id: input.sessionId,
        workspaceId,
        currentOwnerDecisionId: input.ownerDecisionId,       // guard: decision unchanged
        currentProfileVersionId: currentState.profileVersionId, // guard: profile unchanged
        currentSystemRecId: currentState.systemRecId,           // guard: system rec unchanged
      },
      data: { currentBlueprintId: blueprintId, updatedAt: new Date() },
    });
    if (sessionBpUpdateResult.count === 0) {
      throw new ConflictError(
        `CONCURRENCY_CONFLICT: session state changed between staleness check and blueprint creation — the operation was denied to prevent a stale blueprint. Retry the request.`
      );
    }

    // Idea-level Pattern A concurrency guard: UPDATE acquires exclusive row lock on the idea
    // row. Under READ COMMITTED the WHERE clause is re-evaluated at lock-acquisition time —
    // any material pointer change or concurrent revision after our canonical-state read causes
    // count=0 → ConflictError, preventing a stale blueprint from being committed. supersededById:
    // null is included to catch concurrent revisions that committed between the G2-3a check
    // (earlier in this tx) and this lock-acquiring UPDATE.
    const ideaBpGuard = await tx.startupIdeaRecord.updateMany({
      where: {
        id: input.ideaId,
        workspaceId,
        currentEconomicModelVersionId: currentState.economicModelId,
        currentReadinessId: currentState.readinessId,
        currentBusinessModelVersionId: currentState.businessModelId,
        supersededById: null,
      },
      data: { workspaceId }, // no-op: acquires exclusive row lock without changing any field
    });
    if (ideaBpGuard.count === 0) {
      throw new ConflictError(
        `CONCURRENCY_CONFLICT: idea material state changed between staleness check and blueprint creation — the operation was denied to prevent a stale blueprint. Retry the request.`
      );
    }

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
          isFixtureRecord,
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
