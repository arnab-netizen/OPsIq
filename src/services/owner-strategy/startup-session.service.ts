/**
 * Startup Session Service (Phase 5).
 *
 * Full lifecycle management for startup sessions.
 * Workspace isolation enforced on all operations.
 * All mutations emit atomic audit events.
 * Extends the Phase 3 stub (createStartupSession / getStartupSession / listStartupSessions).
 */
import { randomUUID, createHash } from "crypto";
import { db } from "@/lib/db";
import { validateStartup } from "@/domain/owner-strategy/startup-mode";
import type { StartupIntake, StartupIdea, IdeaEvaluation } from "@/domain/owner-strategy/startup-mode.types";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { assertValidTransition, isTerminalStatus } from "@/domain/owner-strategy/startup-lifecycle";
import { screenIdea } from "@/domain/owner-strategy/startup-screening";
import { generateHypotheses, prioritizeHypotheses, evaluateHypothesisResult } from "@/domain/owner-strategy/startup-hypothesis-engine";
import { buildEconomicModel } from "@/domain/owner-strategy/startup-economics";
import { assessReadiness } from "@/domain/owner-strategy/startup-readiness";
import { arbitrateStartupIdeas } from "@/domain/owner-strategy/startup-arbitration";
import { buildResearchPlan } from "@/domain/owner-strategy/startup-research-planner";
import { writeMemoryEntry } from "@/services/owner-mode/operating-memory.service";
import { createObjective } from "@/services/owner-mode/business-objective.service";
import type { StartupHypothesisResult } from "@/domain/owner-strategy/startup-lifecycle";
import { Prisma } from "@/generated/prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateStartupSessionInput {
  workspaceId: string;
  actorId: string;
  sessionLabel?: string | null;
  sessionPurpose?: string | null;
  entryPath?: "HAVE_IDEA" | "NEED_OPTIONS";
  intake: StartupIntake;
  ideas: StartupIdea[];
}

export interface StartupSessionSummary {
  sessionId: string;
  workspaceId: string;
  sessionLabel: string | null;
  status: string;
  recommendedName: string | null;
  ideaCount: number;
  acceptedCount: number;
  createdAt: Date;
}

export interface ContextProfile {
  geography: string | null;
  industry: string | null;
  targetCustomer: string | null;
  ownerHoursPerWeek: number | null;
  capitalAvailableCents: number | null;
  riskTolerance: "low" | "medium" | "high" | null;
  requiresLicence: boolean;
  hasConnectors: boolean;
  ownerExclusions: string[];
  [key: string]: unknown;
}

export interface AddIdeaInput {
  name: string;
  industry: string;
  description?: string | null;
  targetCustomer?: string | null;
  valuePropSummary?: string | null;
  revenueModel?: string | null;
}

export interface RecordEvidenceInput {
  ideaId?: string | null;
  hypothesisId?: string | null;
  sourceType: string;
  evidenceType: string;
  geography?: string | null;
  customerSegment?: string | null;
  observedResult: string;
  limitations?: string | null;
  reliabilityScore: number;
  confidence: number;
  expiresAt?: Date | null;
  ownerVerified?: boolean;
}

export interface OwnerDecisionInput {
  ideaId?: string | null;
  decisionType: "GO" | "MODIFY" | "HOLD" | "REJECT" | "REQUEST_MORE_EVIDENCE";
  rationale?: string | null;
  approvedScope?: string | null;
  spendingLimitCents?: number | null;
  permittedActions?: string[];
  prohibitedActions?: string[];
  validUntil?: Date | null;
  reviewDate?: Date | null;
  materialAssumptions?: Record<string, unknown>;
}

// ─── Legacy helpers (backward-compatible) ─────────────────────────────────────

function ideaToRecord(eval_: IdeaEvaluation, sessionId: string, workspaceId: string) {
  return {
    id: randomUUID(),
    sessionId,
    workspaceId,
    name: eval_.name,
    industry: eval_.industry,
    accepted: eval_.accepted,
    capitalSufficient: eval_.capitalSufficient ?? null,
    capitalGap: eval_.capitalGap ?? null,
    monthlyProfit: eval_.monthlyProfit ?? null,
    riskAdjustedScore: eval_.riskAdjustedScore,
    reasons: eval_.reasons as unknown as object,
    warnings: eval_.warnings as unknown as object,
  };
}

/** Phase 3 stub — validate ideas against intake and persist the result. Returns the session ID. */
export async function createStartupSession(input: CreateStartupSessionInput): Promise<string> {
  const result = validateStartup(input.intake, input.ideas);
  const sessionId = randomUUID();
  const allIdeas = [...result.shortlist, ...result.rejected];

  await db.ownerStartupSession.create({
    data: {
      id: sessionId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      sessionLabel: input.sessionLabel ?? null,
      sessionPurpose: input.sessionPurpose ?? null,
      entryPath: input.entryPath ?? "NEED_OPTIONS",
      intake: input.intake as unknown as object,
      status: "DRAFT",
      validationResult: result as unknown as object,
      recommendedName: result.recommended?.name ?? null,
      updatedAt: new Date(),
    },
  });

  if (allIdeas.length > 0) {
    await db.startupIdeaRecord.createMany({
      data: allIdeas.map((e) => ideaToRecord(e, sessionId, input.workspaceId)),
    });
  }

  await emitAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED,
    entityType: "OwnerStartupSession",
    entityId: sessionId,
    payload: { entryPath: input.entryPath ?? "NEED_OPTIONS", ideaCount: allIdeas.length },
  });

  return sessionId;
}

/** Retrieve a specific session with its ideas. Enforces workspace isolation. */
export async function getStartupSession(workspaceId: string, sessionId: string) {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: { ideas: { orderBy: { accepted: "desc" } } },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  return session;
}

/** List sessions for a workspace, newest first. */
export async function listStartupSessions(workspaceId: string): Promise<StartupSessionSummary[]> {
  const sessions = await db.ownerStartupSession.findMany({
    where: { workspaceId },
    include: { ideas: { select: { id: true, accepted: true } } },
    orderBy: { createdAt: "desc" },
  });

  type SessionRow = {
    id: string;
    workspaceId: string;
    sessionLabel: string | null;
    status: string;
    recommendedName: string | null;
    createdAt: Date;
    ideas: { id: string; accepted: boolean }[];
  };
  return (sessions as SessionRow[]).map((s) => ({
    sessionId: s.id,
    workspaceId: s.workspaceId,
    sessionLabel: s.sessionLabel,
    status: s.status,
    recommendedName: s.recommendedName,
    ideaCount: s.ideas.length,
    acceptedCount: s.ideas.filter((i) => i.accepted).length,
    createdAt: s.createdAt,
  }));
}

// ─── Phase 5 lifecycle methods ────────────────────────────────────────────────

/**
 * Transition a session to a new lifecycle status.
 * Validates the transition against the state machine, persists, emits audit event.
 */
export async function transitionSession(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  newStatus: string
): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    const currentStatus = session.status as string;
    if (isTerminalStatus(currentStatus as Parameters<typeof isTerminalStatus>[0])) {
      throw new ValidationError(`Session ${sessionId} is in terminal status ${currentStatus} and cannot be transitioned`);
    }

    assertValidTransition(
      currentStatus as Parameters<typeof assertValidTransition>[0],
      newStatus as Parameters<typeof assertValidTransition>[1]
    );

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: { status: newStatus, updatedAt: new Date() },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_SESSION_STATUS_CHANGED,
      entityType: "OwnerStartupSession",
      entityId: sessionId,
      payload: { from: currentStatus, to: newStatus },
    });
  });
}

/**
 * Update the context/business-fit profile for a session (versioned).
 * Uses optimistic concurrency: rejects if expectedVersion doesn't match.
 */
export async function updateContextProfile(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  profile: ContextProfile,
  expectedVersion: number
): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    const currentVersion = (session as unknown as { profileVersion: number }).profileVersion ?? 1;
    if (currentVersion !== expectedVersion) {
      throw new ConflictError(
        `Profile version conflict: expected ${expectedVersion}, got ${currentVersion}`
      );
    }

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: {
        profileData: profile as unknown as object,
        profileVersion: currentVersion + 1,
        updatedAt: new Date(),
      },
    });

    await writeMemoryEntry({
      workspaceId,
      actorId,
      memoryType: "STARTUP_PROFILE_VERSION",
      sourceModel: "OwnerStartupSession",
      sourceId: sessionId,
      key: `profile_v${currentVersion}`,
      summary: `Context profile updated to version ${currentVersion + 1}`,
      data: { previousVersion: currentVersion, profile },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_PROFILE_UPDATED,
      entityType: "OwnerStartupSession",
      entityId: sessionId,
      payload: { version: currentVersion + 1 },
    });
  });
}

/**
 * Add a new startup idea to a session. Returns the ideaId.
 */
export async function addIdea(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  concept: AddIdeaInput
): Promise<string> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  const ideaId = randomUUID();
  await db.startupIdeaRecord.create({
    data: {
      id: ideaId,
      sessionId,
      workspaceId,
      name: concept.name,
      industry: concept.industry,
      description: concept.description ?? null,
      targetCustomer: concept.targetCustomer ?? null,
      valuePropSummary: concept.valuePropSummary ?? null,
      revenueModel: concept.revenueModel ?? null,
      accepted: false,
      riskAdjustedScore: 0,
      reasons: {} as object,
      warnings: {} as object,
      screeningStatus: "PENDING",
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED,
    entityType: "StartupIdeaRecord",
    entityId: ideaId,
    payload: { sessionId, name: concept.name, industry: concept.industry },
  });

  return ideaId;
}

/**
 * Screen an idea against the owner profile.
 * Persists screening result to StartupIdeaRecord and writes operating memory for rejections.
 */
export async function screenStartupIdea(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string
): Promise<{ status: string; reasons: string[]; bindingConstraintCount: number }> {
  const [session, idea] = await Promise.all([
    db.ownerStartupSession.findFirst({ where: { id: sessionId, workspaceId } }),
    db.startupIdeaRecord.findFirst({ where: { id: ideaId, sessionId, workspaceId } }),
  ]);
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  const profile = (session as unknown as { profileData: ContextProfile | null }).profileData;

  const screeningIdea = {
    name: idea.name,
    industry: idea.industry,
    estimatedStartupCostCents: null as bigint | null,
    estimatedMonthlyRevenueCents: null as bigint | null,
    estimatedMonthlyCostCents: null as bigint | null,
    timeToFirstRevenueDays: null as number | null,
    requiresDailyPresence: null as boolean | null,
    requiresSalesAbility: null as boolean | null,
    regulatoryBurden: null as "low" | "medium" | "high" | null,
    requiredLicences: [] as string[],
    missingLicences: [] as string[],
    customerAccessibilityScore: null as number | null,
    marketEvidenceScore: null as number | null,
    grossMarginBps: null as number | null,
    cashCycleRiskScore: null as number | null,
    operationalComplexityScore: null as number | null,
    reversibilityScore: null as number | null,
    competitiveDefensibilityScore: null as number | null,
    evidenceQualityScore: null as number | null,
    downsideExposureCents: null as bigint | null,
    requiredCapabilities: [] as string[],
    unavailableCapabilities: [] as string[],
  };

  const screeningProfile = {
    capitalAvailableCents: profile?.capitalAvailableCents
      ? BigInt(profile.capitalAvailableCents as number)
      : null,
    monthlySurvivalNeedCents: null as bigint | null,
    hoursPerWeekAvailable: profile?.ownerHoursPerWeek ?? null,
    riskTolerance: profile?.riskTolerance ?? null,
    canSell: null as boolean | null,
    canOperateDaily: null as boolean | null,
    location: profile?.geography ?? null,
    skills: [] as string[],
    existingAssets: [] as string[],
    ownerExclusions: profile?.ownerExclusions ?? [],
    ethicalConstraints: [] as string[],
    debtTolerance: null as "low" | "medium" | "high" | null,
    regulatoryTolerance: null as "low" | "medium" | "high" | null,
    preferOnline: null as boolean | null,
    targetTimeToRevenueDays: null as number | null,
  };

  const result = screenIdea(screeningIdea, screeningProfile);

  await db.startupIdeaRecord.update({
    where: { id: ideaId },
    data: {
      screeningStatus: result.status,
      screeningReasons: result.reasons as unknown as object,
      screeningConstraints: result.bindingConstraints as unknown as object,
      evidenceRequired: result.evidenceRequired as unknown as object,
      modificationSuggestion: result.alternativeConsidered ?? null,
      whatCouldChange: result.whatCouldChange ?? null,
      updatedAt: new Date(),
    },
  });

  if (result.status === "REJECT") {
    await writeMemoryEntry({
      workspaceId,
      actorId,
      memoryType: "STARTUP_REJECTED_IDEA",
      sourceModel: "StartupIdeaRecord",
      sourceId: ideaId,
      key: `rejected_${ideaId}`,
      summary: `Idea "${idea.name}" rejected at screening: ${result.reasons[0] ?? "unknown"}`,
      data: { sessionId, ideaId, name: idea.name, reasons: result.reasons, bindingConstraints: result.bindingConstraints },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_OPERATING_MEMORY_WRITTEN,
      entityType: "StartupIdeaRecord",
      entityId: ideaId,
      payload: { memoryType: "STARTUP_REJECTED_IDEA" },
    });
  }

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_IDEA_SCREENED,
    entityType: "StartupIdeaRecord",
    entityId: ideaId,
    payload: { status: result.status, bindingConstraints: result.bindingConstraints },
  });

  return {
    status: result.status,
    reasons: result.reasons,
    bindingConstraintCount: result.bindingConstraints.length,
  };
}

/**
 * Generate and persist hypotheses for an idea.
 * Returns the list of persisted hypothesis IDs.
 */
export async function generateAndPersistHypotheses(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string
): Promise<string[]> {
  const [session, idea] = await Promise.all([
    db.ownerStartupSession.findFirst({ where: { id: sessionId, workspaceId } }),
    db.startupIdeaRecord.findFirst({ where: { id: ideaId, sessionId, workspaceId } }),
  ]);
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  const profile = (session as unknown as { profileData: ContextProfile | null }).profileData;

  const input = {
    ideaName: idea.name,
    industry: idea.industry,
    targetCustomer: (idea as unknown as { targetCustomer: string | null }).targetCustomer,
    valuePropSummary: (idea as unknown as { valuePropSummary: string | null }).valuePropSummary,
    revenueModel: (idea as unknown as { revenueModel: string | null }).revenueModel,
    requiresLicence: profile?.requiresLicence ?? false,
    estimatedCacCents: null,
    evidenceAvailable: [],
  };

  const drafts = prioritizeHypotheses(generateHypotheses(input, profile?.requiresLicence ?? false));
  const now = new Date();

  const hypothesisIds = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const ids: string[] = [];
    for (const draft of drafts) {
      const hId = randomUUID();
      await tx.startupHypothesis.create({
        data: {
          id: hId,
          workspaceId,
          sessionId,
          ideaId,
          statement: draft.statement,
          hypothesisType: draft.hypothesisType,
          evidenceCurrently: draft.evidenceCurrently,
          confidenceBefore: draft.confidenceBefore,
          falsificationCriteria: draft.falsificationCriteria,
          validationMethod: draft.validationMethod,
          sampleThreshold: draft.sampleThreshold,
          expectedCostCents: draft.expectedCostCents,
          expectedDurationDays: draft.expectedDurationDays,
          requiresOwnerApproval: draft.requiresOwnerApproval,
          result: "PENDING",
          createdAt: now,
          updatedAt: now,
        },
      });
      ids.push(hId);
    }
    return ids;
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_HYPOTHESIS_GENERATED,
    entityType: "StartupIdeaRecord",
    entityId: ideaId,
    payload: { sessionId, count: hypothesisIds.length },
  });

  return hypothesisIds;
}

/**
 * Record an evidence item. Idempotent by content hash (prevents duplicates).
 * Returns the evidence record ID.
 */
export async function recordEvidenceItem(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: RecordEvidenceInput
): Promise<string> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  // Idempotency: hash of content to detect duplicates
  const hashInput = `${sessionId}:${input.ideaId ?? ""}:${input.evidenceType}:${input.observedResult}`;
  const contentHash = createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

  const existing = await db.startupEvidenceRecord.findFirst({
    where: { workspaceId, sessionId, contentHash },
  });
  if (existing) return existing.id;

  const evidenceId = randomUUID();
  const now = new Date();

  await db.startupEvidenceRecord.create({
    data: {
      id: evidenceId,
      workspaceId,
      sessionId,
      ideaId: input.ideaId ?? null,
      hypothesisId: input.hypothesisId ?? null,
      contentHash,
      sourceType: input.sourceType,
      evidenceType: input.evidenceType,
      geography: input.geography ?? null,
      customerSegment: input.customerSegment ?? null,
      observedResult: input.observedResult,
      limitations: input.limitations ?? null,
      reliabilityScore: input.reliabilityScore,
      confidence: input.confidence,
      expiresAt: input.expiresAt ?? null,
      ownerVerified: input.ownerVerified ?? false,
      retrievedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_RECORDED,
    entityType: "StartupEvidenceRecord",
    entityId: evidenceId,
    payload: { sessionId, ideaId: input.ideaId, sourceType: input.sourceType },
  });

  return evidenceId;
}

/**
 * Build and persist the economic model for an idea.
 * Returns the economic model record ID.
 */
export async function buildAndPersistEconomicModel(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  inputs: {
    startupCostCents: bigint | null;
    fixedMonthlyCostCents: bigint | null;
    variableUnitCostCents: bigint | null;
    pricePerUnitCents: bigint | null;
    cacCents: bigint | null;
    deliveryCostCents: bigint | null;
    workingCapitalCents: bigint | null;
    capitalAvailableCents: bigint | null;
    ownerLabourHoursPerWeek: number | null;
    minViableCapacity: number | null;
    maxCurrentCapacity: number | null;
  }
): Promise<string> {
  const [session, idea] = await Promise.all([
    db.ownerStartupSession.findFirst({ where: { id: sessionId, workspaceId } }),
    db.startupIdeaRecord.findFirst({ where: { id: ideaId, sessionId, workspaceId } }),
  ]);
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  const model = buildEconomicModel({
    startupCostCents: inputs.startupCostCents,
    fixedMonthlyCostCents: inputs.fixedMonthlyCostCents,
    variableUnitCostCents: inputs.variableUnitCostCents,
    pricePerUnitCents: inputs.pricePerUnitCents,
    cacCents: inputs.cacCents,
    deliveryCostCents: inputs.deliveryCostCents,
    refundAllowanceCents: null,
    workingCapitalCents: inputs.workingCapitalCents,
    paymentDelayDays: null,
    capitalAvailableCents: inputs.capitalAvailableCents,
    monthlySurvivalNeedCents: null,
    ownerLabourHoursPerWeek: inputs.ownerLabourHoursPerWeek,
    hiredLabourCostCents: null,
    minViableCapacity: inputs.minViableCapacity,
    maxCurrentCapacity: inputs.maxCurrentCapacity,
  });

  const modelId = randomUUID();
  const now = new Date();

  await db.startupEconomicModel.create({
    data: {
      id: modelId,
      workspaceId,
      sessionId,
      ideaId,
      startupCostCents: inputs.startupCostCents,
      fixedMonthlyCostCents: inputs.fixedMonthlyCostCents,
      variableUnitCostCents: inputs.variableUnitCostCents,
      pricePerUnitCents: inputs.pricePerUnitCents,
      grossContributionCents: model.grossContributionCents,
      grossMarginBps: model.grossMarginBps,
      cacCents: inputs.cacCents,
      deliveryCostCents: inputs.deliveryCostCents,
      workingCapitalCents: inputs.workingCapitalCents,
      breakEvenVolume: model.breakEvenVolume ?? null,
      breakEvenMonths: model.breakEvenMonths ?? null,
      cashRunwayMonths: model.cashRunwayMonths ?? null,
      minViableCapacity: inputs.minViableCapacity,
      maxCurrentCapacity: inputs.maxCurrentCapacity,
      ownerLabourHoursPerWeek: inputs.ownerLabourHoursPerWeek,
      sensitivityScenarios: model.sensitivityScenarios as unknown as object,
      economicClassification: model.economicClassification,
      bindingCondition: model.bindingCondition ?? null,
      unknownInputs: model.unknownInputs as unknown as object,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_ECONOMIC_MODEL_BUILT,
    entityType: "StartupEconomicModel",
    entityId: modelId,
    payload: {
      sessionId,
      ideaId,
      economicClassification: model.economicClassification,
      breakEvenMonths: model.breakEvenMonths ?? null,
    },
  });

  return modelId;
}

/**
 * Assess and persist the readiness assessment for an idea.
 * Pulls latest economic model and hypothesis results from DB.
 */
export async function assessAndPersistReadiness(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  overrides: {
    regulatoryEvidenceConfirmed: boolean;
    missingLicences: string[];
    unresolvedCriticalRisks: number;
    executionPlanExists: boolean;
    measurementPlanExists: boolean;
    stopConditionsDefined: boolean;
    riskRegisterConfidence: number | null;
  }
): Promise<{ readinessStatus: string; hardGateFailures: string[]; safeNextStep: string }> {
  const [idea, latestEconModel, hypotheses] = await Promise.all([
    db.startupIdeaRecord.findFirst({ where: { id: ideaId, sessionId, workspaceId } }),
    db.startupEconomicModel.findFirst({
      where: { ideaId, workspaceId },
      orderBy: { createdAt: "desc" },
    }),
    db.startupHypothesis.findMany({ where: { ideaId, workspaceId } }),
  ]);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  type HypRow = { result: string; requiresOwnerApproval: boolean };
  const hyps = hypotheses as unknown as HypRow[];
  const confirmedHypotheses = hyps.filter((h) => h.result === "CONFIRMED").length;
  const rejectedHypotheses = hyps.filter((h) => h.result === "REJECTED").length;
  const totalHypotheses = hyps.length;
  const pendingCriticalHypotheses = hyps.filter(
    (h) => h.result === "PENDING" && h.requiresOwnerApproval
  ).length;

  const econ = latestEconModel as unknown as {
    cashRunwayMonths: number | null;
    breakEvenMonths: number | null;
    maxCurrentCapacity: number | null;
    minViableCapacity: number | null;
    ownerLabourHoursPerWeek: number | null;
    economicClassification: string | null;
  } | null;

  const result = assessReadiness({
    problemEvidenceScore: null,
    customerEvidenceScore: null,
    wtpEvidenceScore: null,
    solutionFeasibilityScore: null,
    deliveryFeasibilityScore: null,
    acquisitionFeasibilityScore: null,
    economicClassification: (econ?.economicClassification ?? null) as Parameters<typeof assessReadiness>[0]["economicClassification"],
    cashRunwayMonths: econ?.cashRunwayMonths ?? null,
    breakEvenMonths: econ?.breakEvenMonths ?? null,
    capitalAvailableCents: null,
    requiredStartupCostCents: null,
    ownerHoursPerWeek: econ?.ownerLabourHoursPerWeek ?? null,
    requiredHoursPerWeek: null,
    maxCurrentCapacity: econ?.maxCurrentCapacity ?? null,
    minViableCapacity: econ?.minViableCapacity ?? null,
    missingLicences: overrides.missingLicences,
    regulatoryEvidenceConfirmed: overrides.regulatoryEvidenceConfirmed,
    unresolvedCriticalRisks: overrides.unresolvedCriticalRisks,
    riskRegisterConfidence: overrides.riskRegisterConfidence,
    executionPlanExists: overrides.executionPlanExists,
    measurementPlanExists: overrides.measurementPlanExists,
    stopConditionsDefined: overrides.stopConditionsDefined,
    confirmedHypotheses,
    rejectedHypotheses,
    totalHypotheses,
    pendingCriticalHypotheses,
  });

  const assessmentId = randomUUID();
  const now = new Date();

  await db.startupReadinessAssessment.create({
    data: {
      id: assessmentId,
      workspaceId,
      sessionId,
      ideaId,
      problemEvidenceScore: result.problemEvidenceScore,
      customerEvidenceScore: result.customerEvidenceScore,
      wtpEvidenceScore: result.wtpEvidenceScore,
      solutionFeasibilityScore: result.solutionFeasibilityScore,
      deliveryFeasibilityScore: result.deliveryFeasibilityScore,
      acquisitionFeasibilityScore: result.acquisitionFeasibilityScore,
      economicViabilityScore: result.economicViabilityScore,
      cashSurvivalScore: result.cashSurvivalScore,
      resourceReadinessScore: result.resourceReadinessScore,
      regulatoryReadinessScore: result.regulatoryReadinessScore,
      riskReadinessScore: result.riskReadinessScore,
      ownerCapacityScore: result.ownerCapacityScore,
      executionPlanScore: result.executionPlanScore,
      measurementPlanScore: result.measurementPlanScore,
      stopConditionsScore: result.stopConditionsScore,
      hardGateFailures: result.hardGateFailures as unknown as object,
      passedGates: result.passedGates as unknown as object,
      failedGates: result.failedGates as unknown as object,
      unknownGates: result.unknownGates as unknown as object,
      bindingConstraints: result.bindingConstraints as unknown as object,
      evidenceGaps: result.evidenceGaps as unknown as object,
      safeNextStep: result.safeNextStep,
      readinessStatus: result.readinessStatus,
      assessedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_READINESS_ASSESSED,
    entityType: "StartupReadinessAssessment",
    entityId: assessmentId,
    payload: {
      sessionId,
      ideaId,
      readinessStatus: result.readinessStatus,
      hardGateFailureCount: result.hardGateFailures.length,
    },
  });

  return {
    readinessStatus: result.readinessStatus,
    hardGateFailures: result.hardGateFailures.map((g) => g.note),
    safeNextStep: result.safeNextStep,
  };
}

/**
 * Run multi-idea arbitration for a session and persist the system recommendation snapshot.
 * System recommendation is stored separately from any owner decision.
 */
export async function runIdeaArbitration(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  profile: {
    capitalAvailableCents: bigint | null;
    ownerHoursPerWeek: number | null;
    riskTolerance: "low" | "medium" | "high" | null;
  }
): Promise<{
  recommendedIdeaId: string | null;
  recommendedIdeaName: string | null;
  closestAlternativeId: string | null;
  confidence: number;
}> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  const [ideas, econModels, readinessAssessments] = await Promise.all([
    db.startupIdeaRecord.findMany({ where: { sessionId, workspaceId } }),
    db.startupEconomicModel.findMany({ where: { sessionId, workspaceId }, orderBy: { createdAt: "desc" } }),
    db.startupReadinessAssessment.findMany({ where: { sessionId, workspaceId }, orderBy: { assessedAt: "desc" } }),
  ]);

  const latestEconByIdea = new Map<string, (typeof econModels)[0]>();
  for (const e of econModels) {
    if (!latestEconByIdea.has(e.ideaId)) latestEconByIdea.set(e.ideaId, e);
  }
  const latestReadinessByIdea = new Map<string, (typeof readinessAssessments)[0]>();
  for (const r of readinessAssessments) {
    if (!latestReadinessByIdea.has(r.ideaId)) latestReadinessByIdea.set(r.ideaId, r);
  }

  type IdeaRow = typeof ideas[0] & {
    targetCustomer: string | null;
    screeningStatus: string;
  };

  const candidates = (ideas as IdeaRow[]).map((idea) => {
    const econ = latestEconByIdea.get(idea.id) as unknown as {
      economicClassification: string | null;
      breakEvenMonths: number | null;
      cashRunwayMonths: number | null;
      grossMarginBps: number | null;
      startupCostCents: bigint | null;
    } | undefined;

    const readiness = latestReadinessByIdea.get(idea.id) as unknown as {
      readinessStatus: string | null;
      problemEvidenceScore: number;
      customerEvidenceScore: number;
      wtpEvidenceScore: number;
    } | undefined;

    return {
      ideaId: idea.id,
      name: idea.name,
      industry: idea.industry,
      problemEvidenceScore: readiness?.problemEvidenceScore ?? null,
      customerEvidenceScore: readiness?.customerEvidenceScore ?? null,
      wtpEvidenceScore: readiness?.wtpEvidenceScore ?? null,
      readinessStatus: (readiness?.readinessStatus ?? null) as Parameters<typeof arbitrateStartupIdeas>[0][0]["readinessStatus"],
      economicClassification: (econ?.economicClassification ?? null) as Parameters<typeof arbitrateStartupIdeas>[0][0]["economicClassification"],
      breakEvenMonths: econ?.breakEvenMonths ?? null,
      cashRunwayMonths: econ?.cashRunwayMonths ?? null,
      startupCostCents: econ?.startupCostCents ?? null,
      grossMarginBps: econ?.grossMarginBps ?? null,
      ownerFitScore: null,
      resourceFitScore: null,
      strategicFitScore: null,
      riskScore: null,
      reversibilityScore: null,
      scalabilityScore: null,
      defensibilityScore: null,
      evidenceConfidence: null,
      linkedOpportunityId: null,
    };
  });

  const arbitrationResult = arbitrateStartupIdeas(candidates, profile);

  // Persist system recommendation snapshot (never overwritten)
  await db.ownerStartupSession.update({
    where: { id: sessionId },
    data: {
      systemRecommendationSnapshot: arbitrationResult as unknown as object,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_ARBITRATION_RUN,
    entityType: "OwnerStartupSession",
    entityId: sessionId,
    payload: {
      recommendedIdeaId: arbitrationResult.recommendedIdeaId,
      confidence: arbitrationResult.confidence,
      candidateCount: candidates.length,
    },
  });

  return {
    recommendedIdeaId: arbitrationResult.recommendedIdeaId,
    recommendedIdeaName: arbitrationResult.recommendedIdeaName,
    closestAlternativeId: arbitrationResult.closestAlternativeId,
    confidence: arbitrationResult.confidence,
  };
}

/**
 * Record an owner decision (versioned, never overwrites prior decisions).
 * System recommendation is preserved separately.
 * Returns the decision record ID.
 */
export async function recordOwnerDecision(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  decision: OwnerDecisionInput
): Promise<string> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  const decisionId = randomUUID();
  const now = new Date();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Supersede the previous active decision for this session+idea combo
    const previousDecision = await tx.startupOwnerDecision.findFirst({
      where: {
        sessionId,
        workspaceId,
        ideaId: decision.ideaId ?? null,
        supersededById: null,
      },
      orderBy: { createdAt: "desc" },
    });

    await tx.startupOwnerDecision.create({
      data: {
        id: decisionId,
        workspaceId,
        sessionId,
        ideaId: decision.ideaId ?? null,
        decisionType: decision.decisionType,
        rationale: decision.rationale ?? null,
        actorId,
        approvedScope: decision.approvedScope ?? null,
        spendingLimitCents: decision.spendingLimitCents ? BigInt(decision.spendingLimitCents) : null,
        permittedActions: (decision.permittedActions ?? []) as unknown as object,
        prohibitedActions: (decision.prohibitedActions ?? []) as unknown as object,
        validUntil: decision.validUntil ?? null,
        reviewDate: decision.reviewDate ?? null,
        materialAssumptions: (decision.materialAssumptions ?? {}) as unknown as object,
        systemRecommendationSnapshot: ((session as unknown as { systemRecommendationSnapshot: object | null }).systemRecommendationSnapshot ?? Prisma.JsonNull),
        createdAt: now,
      },
    });

    if (previousDecision) {
      await tx.startupOwnerDecision.update({
        where: { id: previousDecision.id },
        data: { supersededById: decisionId },
      });
    }
  });

  await writeMemoryEntry({
    workspaceId,
    actorId,
    memoryType: "STARTUP_OWNER_DECISION",
    sourceModel: "StartupOwnerDecision",
    sourceId: decisionId,
    key: `decision_${sessionId}_${decision.ideaId ?? "session"}`,
    summary: `Owner decision: ${decision.decisionType} for ${decision.ideaId ? `idea ${decision.ideaId}` : "session"}`,
    data: { decisionType: decision.decisionType, rationale: decision.rationale },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_OWNER_DECISION_RECORDED,
    entityType: "StartupOwnerDecision",
    entityId: decisionId,
    payload: { sessionId, ideaId: decision.ideaId, decisionType: decision.decisionType },
  });

  return decisionId;
}

/**
 * Record the result of a hypothesis validation experiment.
 * Triggers readiness reassessment and updates operating memory.
 */
export async function updateHypothesisResult(
  workspaceId: string,
  hypothesisId: string,
  actorId: string,
  result: StartupHypothesisResult,
  resultSummary: string
): Promise<void> {
  const hypothesis = await db.startupHypothesis.findFirst({
    where: { id: hypothesisId, workspaceId },
  });
  if (!hypothesis) throw new NotFoundError("StartupHypothesis", hypothesisId);

  const evaluation = evaluateHypothesisResult(
    hypothesis.hypothesisType as Parameters<typeof evaluateHypothesisResult>[0],
    result,
    hypothesis.confidenceBefore
  );

  const now = new Date();
  await db.startupHypothesis.update({
    where: { id: hypothesisId },
    data: {
      result,
      interpretation: evaluation.interpretation,
      confidenceAfter: evaluation.confidenceAfter,
      effectOnScore: evaluation.effectOnScore,
      followUpAction: evaluation.followUpAction,
      validatedAt: now,
      updatedAt: now,
    },
  });

  const memoryType =
    result === "CONFIRMED"
      ? "STARTUP_VALIDATED_HYPOTHESIS"
      : result === "REJECTED"
      ? "STARTUP_FAILED_HYPOTHESIS"
      : "STARTUP_HYPOTHESIS_RESULT";

  await writeMemoryEntry({
    workspaceId,
    actorId,
    memoryType,
    sourceModel: "StartupHypothesis",
    sourceId: hypothesisId,
    key: `hypothesis_${hypothesisId}`,
    summary: `Hypothesis ${result}: ${evaluation.interpretation}`,
    data: {
      hypothesisType: hypothesis.hypothesisType,
      result,
      confidenceAfter: evaluation.confidenceAfter,
      followUpAction: evaluation.followUpAction,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_HYPOTHESIS_RESULT_RECORDED,
    entityType: "StartupHypothesis",
    entityId: hypothesisId,
    payload: {
      result,
      hypothesisType: hypothesis.hypothesisType,
      confidenceAfter: evaluation.confidenceAfter,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_OPERATING_MEMORY_WRITTEN,
    entityType: "StartupHypothesis",
    entityId: hypothesisId,
    payload: { memoryType },
  });
}

/**
 * Generate the execution blueprint for an approved idea.
 * Creates a BusinessObjective linked to the startup session + idea.
 * Idempotent: blocks duplicate blueprints for the same session+idea.
 */
export async function generateExecutionBlueprint(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  ownerDecisionId: string,
  actorId: string
): Promise<{ objectiveId: string }> {
  // Block duplicate blueprints
  const existingObjective = await db.businessObjective.findFirst({
    where: { workspaceId, linkedStartupSessionId: sessionId, linkedStartupIdeaId: ideaId },
  });
  if (existingObjective) {
    throw new ConflictError(
      `Execution blueprint already exists for session ${sessionId} idea ${ideaId} — objectiveId: ${existingObjective.id}`
    );
  }

  const [session, idea, decision] = await Promise.all([
    db.ownerStartupSession.findFirst({ where: { id: sessionId, workspaceId } }),
    db.startupIdeaRecord.findFirst({ where: { id: ideaId, sessionId, workspaceId } }),
    db.startupOwnerDecision.findFirst({ where: { id: ownerDecisionId, sessionId, workspaceId } }),
  ]);
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);
  if (!decision) throw new NotFoundError("StartupOwnerDecision", ownerDecisionId);

  if ((decision as unknown as { decisionType: string }).decisionType !== "GO") {
    throw new ValidationError(`Cannot generate blueprint: owner decision is not GO (found: ${(decision as unknown as { decisionType: string }).decisionType})`);
  }

  const objectiveId = await createObjective({
    workspaceId,
    actorId,
    title: `Launch: ${idea.name}`,
    description: `Startup execution plan for "${idea.name}" — approved via startup session ${sessionId}`,
    objectiveType: "GROWTH",
    linkedGoalId: null,
  });

  // Link objective back to the startup session
  await db.businessObjective.update({
    where: { id: objectiveId },
    data: {
      linkedStartupSessionId: sessionId,
      linkedStartupIdeaId: ideaId,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_EXECUTION_BLUEPRINT_CREATED,
    entityType: "BusinessObjective",
    entityId: objectiveId,
    payload: { sessionId, ideaId, ownerDecisionId },
  });

  return { objectiveId };
}

/**
 * Build and persist the research plan for a session.
 * Returns the research plan record ID.
 */
export async function buildAndPersistResearchPlan(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<string> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  const profile = (session as unknown as { profileData: ContextProfile | null }).profileData;

  const plan = buildResearchPlan({
    geography: profile?.geography ?? null,
    industry: profile?.industry ?? null,
    targetCustomer: profile?.targetCustomer ?? null,
    ideaNames: [],
    requiresLicence: profile?.requiresLicence ?? false,
    hasConnectors: profile?.hasConnectors ?? false,
  });

  const now = new Date();
  const planId = randomUUID();

  await db.startupResearchPlan.create({
    data: {
      id: planId,
      workspaceId,
      sessionId,
      evidenceDomains: plan.evidenceDomains as unknown as object,
      completenessReport: null,
      acquiredDomains: [] as unknown as object,
      materialGaps: [] as unknown as object,
      approvedByOwner: false,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Link plan to session
  await db.ownerStartupSession.update({
    where: { id: sessionId },
    data: { researchPlanId: planId, updatedAt: now },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_RESEARCH_PLAN_BUILT,
    entityType: "StartupResearchPlan",
    entityId: planId,
    payload: {
      sessionId,
      autoAcquireableCount: plan.autoAcquireable.length,
      ownerTaskCount: plan.minimizedOwnerTasks.length,
    },
  });

  return planId;
}

/**
 * Get the full assembled session view including all linked models.
 */
export async function getFullSession(workspaceId: string, sessionId: string) {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: {
      ideas: {
        include: {
          hypotheses: { orderBy: { createdAt: "asc" } },
          evidenceRecords: { orderBy: { retrievedAt: "desc" } },
          businessModels: { orderBy: { createdAt: "desc" }, take: 1 },
          economicModels: { orderBy: { createdAt: "desc" }, take: 1 },
          marketSizings: { orderBy: { createdAt: "desc" }, take: 1 },
          readinessAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
          validationPlans: { take: 1 },
        },
      },
      ownerDecisions: { orderBy: { createdAt: "desc" } },
      researchPlan: true,
    },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  return session;
}
