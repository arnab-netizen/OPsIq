/**
 * Phase 5 — Startup Session Service.
 * Full lifecycle management for OwnerStartupSession.
 * All mutations emit audit events. Workspace isolation enforced on all operations.
 */
import { randomUUID, createHash } from "crypto";
import { db } from "@/lib/db";
import { validateStartup } from "@/domain/owner-strategy/startup-mode";
import type { StartupIntake, StartupIdea, IdeaEvaluation } from "@/domain/owner-strategy/startup-mode.types";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assertValidTransition, type StartupSessionStatus } from "@/domain/owner-strategy/startup-lifecycle";
import { screenIdea, type BusinessFitProfile, type StartupIdeaInput } from "@/domain/owner-strategy/startup-screening";
import { generateHypotheses, prioritizeHypotheses, evaluateHypothesisResult } from "@/domain/owner-strategy/startup-hypothesis-engine";
import { buildEconomicModel, type EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import { assessReadiness, type ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
import { buildResearchPlan, minimizeOwnerTasks, type EvidenceDomain } from "@/domain/owner-strategy/startup-research-planner";
import { getResearchProvider, type AcquisitionStatus } from "@/infra/research-provider";
import { writeMemoryEntry } from "@/services/owner-mode/operating-memory.service";
import { Prisma } from "@/generated/prisma/client";
import { estimateMarketSize, type MarketSizingInputs as DomainMarketSizingInputs } from "@/domain/owner-strategy/market-sizing";
import { arbitrateStartupIdeas, type StartupIdeaForArbitration, type StartupArbitrationResult } from "@/domain/owner-strategy/startup-arbitration";
import { buildStartupExplanation, type StartupExplanationInputs, type StartupExplanation } from "@/domain/owner-strategy/startup-explainability";
import { generateIdeasFromProfile, type GenerationProfile, type IdeaGenerationResult } from "@/domain/owner-strategy/startup-idea-generation";
import { persistExplainabilityRecord } from "@/services/owner-mode/explainability.service";
import type { DecisionExplainabilityType } from "@/domain/owner-mode/explainability";

// ─── Legacy interface (backward compatible) ───────────────────────────────────

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

export async function createStartupSession(input: CreateStartupSessionInput): Promise<string> {
  const result = validateStartup(input.intake, input.ideas);
  const sessionId = randomUUID();
  const allIdeas = [...result.shortlist, ...result.rejected];

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.ownerStartupSession.create({
      data: {
        id: sessionId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        sessionLabel: input.sessionLabel ?? null,
        sessionPurpose: input.sessionPurpose ?? null,
        entryPath: input.entryPath ?? "HAVE_IDEA",
        intake: input.intake as unknown as object,
        status: "DRAFT",
        validationResult: result as unknown as object,
        recommendedName: result.recommended?.name ?? null,
        updatedAt: new Date(),
      },
    });

    if (allIdeas.length > 0) {
      await tx.startupIdeaRecord.createMany({
        data: allIdeas.map((e) => ideaToRecord(e, sessionId, input.workspaceId)),
      });
    }

    await emitAuditEvent({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      eventName: AUDIT_EVENTS.STARTUP_SESSION_CREATED,
      payload: { sessionId, status: "DRAFT", ideaCount: allIdeas.length },
    }, tx);
  });

  return sessionId;
}

export async function getStartupSession(workspaceId: string, sessionId: string) {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: {
      ideas: { orderBy: { accepted: "desc" } },
      profileVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
      systemRecommendations: { orderBy: { createdAt: "desc" }, take: 1 },
      ownerDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
      researchPlan: true,
    },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);
  return session;
}

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

// ─── Phase 5 Lifecycle ────────────────────────────────────────────────────────

export async function transitionSession(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  newStatus: StartupSessionStatus
): Promise<void> {
  // G7/G9/G15: gate at EXECUTION_PLANNED — approval must exist and not be stale/expired
  if (newStatus === "EXECUTION_PLANNED") {
    const staleness = await checkApprovalStaleness(workspaceId, sessionId, {});
    if (staleness.originalHash === null) {
      throw new ConflictError(
        "EXECUTION_BLOCKED: no GO owner decision found — owner must approve before execution can be planned"
      );
    }
    if (staleness.isStale) {
      throw new ConflictError(
        `STALE_APPROVAL_BLOCKS_EXECUTION: approval package changed since GO decision. Changed: ${staleness.changedInputs.join(", ")}. Owner must re-approve.`
      );
    }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, status: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    assertValidTransition(session.status as StartupSessionStatus, newStatus);

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: { status: newStatus, updatedAt: new Date() },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_SESSION_STATUS_CHANGED,
      payload: { sessionId, from: session.status, to: newStatus },
    }, tx);
  });
}

// ─── Profile Versioning ───────────────────────────────────────────────────────

export async function updateContextProfile(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  profileData: Record<string, unknown>,
  changeRationale?: string,
  expectedVersion?: number
): Promise<{ versionId: string; versionNumber: number }> {
  const versionId = randomUUID();

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, profileVersion: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    // Optimistic locking: if caller supplied expectedVersion, confirm it matches current
    if (expectedVersion !== undefined && session.profileVersion !== expectedVersion) {
      throw new ConflictError(
        `CONCURRENCY_CONFLICT: profile version mismatch — expected ${expectedVersion}, found ${session.profileVersion}`
      );
    }

    const newVersion = session.profileVersion + 1;

    await tx.startupContextProfileVersion.create({
      data: {
        id: versionId,
        workspaceId,
        sessionId,
        actorId,
        versionNumber: newVersion,
        profileData: profileData as object,
        changeRationale: changeRationale ?? null,
      },
    });

    // Optimistic update — only modifies the row if profileVersion still matches
    const updated = await tx.ownerStartupSession.updateMany({
      where: { id: sessionId, profileVersion: session.profileVersion },
      data: {
        profileVersion: newVersion,
        currentProfileVersionId: versionId,
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictError("CONCURRENCY_CONFLICT: profile was modified by a concurrent request");
    }

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_PROFILE_UPDATED,
      payload: { sessionId, versionId, versionNumber: newVersion },
    }, tx);

    return { versionId, versionNumber: newVersion };
  });

  return result;
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

export async function addIdea(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  concept: { name: string; industry: string; originType?: string; originData?: Record<string, unknown> }
): Promise<string> {
  const ideaId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, currentProfileVersionId: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    await tx.startupIdeaRecord.create({
      data: {
        id: ideaId,
        sessionId,
        workspaceId,
        name: concept.name.trim(),
        industry: concept.industry.trim(),
        originType: concept.originType ?? "OWNER_ENTERED",
        originData: (concept.originData as object) ?? null,
        profileVersionId: session.currentProfileVersionId ?? null,
        reasons: [],
        warnings: [],
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED,
      payload: { sessionId, ideaId, name: concept.name },
    }, tx);
  });

  return ideaId;
}

// ─── Screening ────────────────────────────────────────────────────────────────

export async function screenIdeaRecord(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  profile: BusinessFitProfile
): Promise<ReturnType<typeof screenIdea>> {
  const idea = await db.startupIdeaRecord.findFirst({
    where: { id: ideaId, sessionId, workspaceId },
  });
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  const ideaInput: StartupIdeaInput = {
    name: idea.name,
    industry: idea.industry,
    estimatedStartupCostCents: idea.capitalGap != null ? Math.round(idea.capitalGap * 100) : null,
    estimatedMonthlyProfitCents: idea.monthlyProfit != null ? Math.round(idea.monthlyProfit * 100) : null,
    estimatedMonthlyRevenueCents: null,
  };

  const result = screenIdea(ideaInput, profile);

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.startupIdeaRecord.update({
      where: { id: ideaId },
      data: {
        screeningStatus: result.status,
        screeningData: result as unknown as object,
        accepted: result.status === "PASSED" || result.status === "CONDITIONALLY_PASSED",
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_IDEA_SCREENED,
      payload: { sessionId, ideaId, status: result.status, bindingConstraints: result.bindingConstraints },
    }, tx);

    if (result.status === "REJECTED") {
      await writeMemoryEntry({
        workspaceId,
        actorId,
        memoryType: "STARTUP_REJECTED_IDEA",
        sourceModel: "StartupIdeaRecord",
        sourceId: ideaId,
        key: `startup_rejected_idea:${ideaId}`,
        summary: `Idea "${idea.name}" rejected at screening: ${result.bindingConstraints.join("; ")}`,
        data: { screeningResult: result },
      });

      await emitAuditEvent({
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_OPERATING_MEMORY_WRITTEN,
        payload: { sessionId, ideaId, memoryType: "STARTUP_REJECTED_IDEA" },
      }, tx);
    }
  });

  return result;
}

// ─── Hypotheses ───────────────────────────────────────────────────────────────

export async function generateAndPersistHypotheses(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string
): Promise<string[]> {
  const idea = await db.startupIdeaRecord.findFirst({
    where: { id: ideaId, sessionId, workspaceId },
  });
  if (!idea) throw new NotFoundError("StartupIdeaRecord", ideaId);

  const rawHypotheses = generateHypotheses(idea.name, idea.industry);
  const prioritized = prioritizeHypotheses(rawHypotheses);
  const hypothesisIds: string[] = [];

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const h of prioritized) {
      const id = randomUUID();
      hypothesisIds.push(id);
      await tx.startupHypothesis.create({
        data: {
          id,
          workspaceId,
          sessionId,
          ideaId,
          statement: h.statement,
          hypothesisType: h.type,
          confidenceBefore: h.confidenceBefore,
          falsificationCriteria: h.falsificationCriteria,
          validationMethod: h.validationMethod,
          expectedCostCents: BigInt(h.expectedCostCents),
          expectedDurationDays: h.expectedDurationDays,
          requiresOwnerApproval: h.requiresOwnerApproval,
          priorityScore: h.priorityScore,
        },
      });
    }

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_HYPOTHESIS_GENERATED,
      payload: { sessionId, ideaId, count: prioritized.length },
    }, tx);
  });

  return hypothesisIds;
}

export async function recordHypothesisResult(
  workspaceId: string,
  hypothesisId: string,
  actorId: string,
  result: "CONFIRMED" | "DISCONFIRMED" | "PARTIALLY_CONFIRMED" | "INCONCLUSIVE",
  resultSummary: string
): Promise<void> {
  const hypothesis = await db.startupHypothesis.findFirst({
    where: { id: hypothesisId, workspaceId },
  });
  if (!hypothesis) throw new NotFoundError("StartupHypothesis", hypothesisId);

  const evaluation = evaluateHypothesisResult(
    hypothesisId,
    hypothesis.hypothesisType as Parameters<typeof evaluateHypothesisResult>[1],
    hypothesis.requiresOwnerApproval,
    result,
    hypothesis.confidenceBefore
  );

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.startupHypothesis.update({
      where: { id: hypothesisId },
      data: {
        result,
        resultSummary,
        confidenceAfter: evaluation.confidenceAfter,
        effectOnScore: evaluation.effectOnScore,
        followUpAction: evaluation.followUpAction,
        validatedAt: new Date(),
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_HYPOTHESIS_RESULT_RECORDED,
      payload: { hypothesisId, result, confidenceAfter: evaluation.confidenceAfter },
    }, tx);

    await writeMemoryEntry({
      workspaceId,
      actorId,
      memoryType: evaluation.memoryType,
      sourceModel: "StartupHypothesis",
      sourceId: hypothesisId,
      key: evaluation.memoryKey,
      summary: `Hypothesis ${result}: ${resultSummary}`,
      data: { evaluation },
    });
  });
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export interface EvidenceInput {
  ideaId?: string | null;
  hypothesisId?: string | null;
  idempotencyKey?: string | null;
  sourceType: string;
  evidenceType: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  geography?: string | null;
  customerSegment?: string | null;
  method?: string | null;
  observedResult: string;
  limitations?: string | null;
  reliabilityScore?: number;
  confidence?: number;
  ownerVerified?: boolean;
}

export async function recordEvidenceItem(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: EvidenceInput
): Promise<string> {
  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await db.startupEvidenceRecord.findFirst({
      where: { sessionId, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const evidenceId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.startupEvidenceRecord.create({
      data: {
        id: evidenceId,
        workspaceId,
        sessionId,
        ideaId: input.ideaId ?? null,
        hypothesisId: input.hypothesisId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        sourceType: input.sourceType,
        evidenceType: input.evidenceType,
        sourceName: input.sourceName ?? null,
        sourceUrl: input.sourceUrl ?? null,
        geography: input.geography ?? null,
        customerSegment: input.customerSegment ?? null,
        method: input.method ?? null,
        observedResult: input.observedResult,
        limitations: input.limitations ?? null,
        reliabilityScore: input.reliabilityScore ?? 50,
        confidence: input.confidence ?? 50,
        ownerVerified: input.ownerVerified ?? false,
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_RECORDED,
      payload: { sessionId, evidenceId, evidenceType: input.evidenceType },
    }, tx);
  });

  return evidenceId;
}

// ─── Economic Model ───────────────────────────────────────────────────────────

export async function buildAndPersistEconomicModel(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  inputs: EconomicInputs
): Promise<string> {
  const modelId = randomUUID();
  const result = buildEconomicModel(inputs);

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.startupEconomicModel.findFirst({
      where: { ideaId, workspaceId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, id: true },
    });

    const newVersion = (existing?.versionNumber ?? 0) + 1;

    if (existing) {
      await tx.startupEconomicModel.update({
        where: { id: existing.id },
        data: { supersededById: modelId },
      });
    }

    await tx.startupEconomicModel.create({
      data: {
        id: modelId,
        workspaceId,
        sessionId,
        ideaId,
        versionNumber: newVersion,
        startupCostCents: inputs.startupCostCents,
        fixedMonthlyCostCents: inputs.fixedMonthlyCostCents,
        variableUnitCostCents: inputs.variableUnitCostCents,
        pricePerUnitCents: inputs.pricePerUnitCents,
        grossMarginBps: result.grossMarginBps,
        cacCents: inputs.cacCents,
        workingCapitalCents: inputs.workingCapitalCents,
        paymentDelayDays: inputs.paymentDelayDays,
        breakEvenVolume: result.breakEvenVolume,
        breakEvenMonths: result.breakEvenMonths,
        cashRunwayMonths: result.cashRunwayMonths,
        ownerLabourHoursPerWeek: inputs.ownerLabourHoursPerWeek,
        sensitivityScenarios: result.sensitivityScenarios as unknown as object,
        economicClassification: result.classification,
        bindingCondition: result.bindingCondition,
        unknownInputs: result.unknownInputs as unknown as object,
        createdBy: actorId,
      },
    });

    await tx.startupIdeaRecord.update({
      where: { id: ideaId },
      data: { currentEconomicModelVersionId: modelId },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_ECONOMIC_MODEL_BUILT,
      payload: { sessionId, ideaId, modelId, classification: result.classification, versionNumber: newVersion },
    }, tx);
  });

  return modelId;
}

// ─── Readiness Assessment ─────────────────────────────────────────────────────

export async function assessAndPersistReadiness(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  inputs: ReadinessInputs
): Promise<ReturnType<typeof assessReadiness>> {
  const assessmentId = randomUUID();
  const result = assessReadiness(inputs);

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.startupReadinessAssessment.create({
      data: {
        id: assessmentId,
        workspaceId,
        session: { connect: { id: sessionId } },
        idea: { connect: { id: ideaId } },
        problemEvidenceScore: Math.round(result.scores.problemEvidence || 0),
        customerEvidenceScore: Math.round(result.scores.customerEvidence || 0),
        wtpEvidenceScore: Math.round(result.scores.wtpEvidence || 0),
        solutionFeasibilityScore: Math.round(result.scores.solutionFeasibility || 0),
        deliveryFeasibilityScore: Math.round(result.scores.deliveryFeasibility || 0),
        economicViabilityScore: Math.round(result.scores.economicViability || 0),
        cashSurvivalScore: Math.round(result.scores.cashSurvival || 0),
        resourceReadinessScore: Math.round(result.scores.resourceReadiness || 0),
        regulatoryReadinessScore: Math.round(result.scores.regulatoryReadiness || 0),
        ownerCapacityScore: Math.round(result.scores.ownerCapacity || 0),
        hardGateFailures: result.hardGateFailures as unknown as object,
        passedGates: result.passedGates as unknown as object,
        failedGates: result.failedGates as unknown as object,
        evidenceGaps: result.evidenceGaps as unknown as object,
        bindingConstraints: result.bindingConstraints as unknown as object,
        safeNextStep: result.safeNextStep,
        readinessStatus: result.status,
        assessedBy: actorId,
      },
    });

    await tx.startupIdeaRecord.update({
      where: { id: ideaId },
      data: { currentReadinessId: assessmentId },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_READINESS_ASSESSED,
      payload: { sessionId, ideaId, assessmentId, status: result.status },
    }, tx);
  });

  return result;
}

// ─── System Recommendation ────────────────────────────────────────────────────

export interface SystemRecommendationInput {
  ideaId?: string | null;
  recommendation: "GO" | "MODIFY" | "HOLD" | "REJECT" | "MORE_VALIDATION_REQUIRED";
  rationale: string;
  confidence: number;
  inputSnapshot: Record<string, unknown>;
  alternativeIdeas?: string[];
}

export async function createSystemRecommendation(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: SystemRecommendationInput
): Promise<string> {
  const recId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.startupSystemRecommendation.create({
      data: {
        id: recId,
        workspaceId,
        sessionId,
        ideaId: input.ideaId ?? null,
        recommendation: input.recommendation,
        rationale: input.rationale,
        inputSnapshot: input.inputSnapshot as object,
        confidence: input.confidence,
        alternativeIdeas: (input.alternativeIdeas ?? []) as unknown as object,
      },
    });

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: { currentSystemRecId: recId, updatedAt: new Date() },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_SYSTEM_RECOMMENDATION_CREATED,
      payload: { sessionId, recId, recommendation: input.recommendation },
    }, tx);
  });

  return recId;
}

// ─── Business Model Version ───────────────────────────────────────────────────

export interface BusinessModelInput {
  customerSegment: string;
  customerProblem: string;
  valueProposition: string;
  deliveryMethod: string;
  revenueModel: string;
  pricingHypothesis: string;
  costStructure?: Record<string, unknown>;
  acquisitionChannels?: string[];
  keyMetrics?: string[];
  regulatoryRequirements?: string[];
  failureModes?: string[];
}

export async function buildAndPersistBusinessModel(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  input: BusinessModelInput
): Promise<string> {
  const modelId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.startupBusinessModelVersion.findFirst({
      where: { ideaId, workspaceId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, id: true },
    });
    const newVersion = (existing?.versionNumber ?? 0) + 1;

    if (existing) {
      await tx.startupBusinessModelVersion.update({
        where: { id: existing.id },
        data: { supersededById: modelId },
      });
    }

    await tx.startupBusinessModelVersion.create({
      data: {
        id: modelId,
        workspaceId,
        sessionId,
        ideaId,
        versionNumber: newVersion,
        customerSegment: input.customerSegment,
        customerProblem: input.customerProblem,
        valueProposition: input.valueProposition,
        deliveryMethod: input.deliveryMethod,
        revenueModel: input.revenueModel,
        pricingHypothesis: input.pricingHypothesis,
        costStructure: (input.costStructure ?? {}) as unknown as object,
        acquisitionChannels: (input.acquisitionChannels ?? []) as unknown as object,
        keyMetrics: (input.keyMetrics ?? []) as unknown as object,
        regulatoryRequirements: (input.regulatoryRequirements ?? []) as unknown as object,
        failureModes: (input.failureModes ?? []) as unknown as object,
        createdBy: actorId,
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_BUSINESS_MODEL_BUILT,
      payload: { sessionId, ideaId, modelId, versionNumber: newVersion },
    }, tx);
  });

  return modelId;
}

// ─── Validation Plan ─────────────────────────────────────────────────────────

export interface ValidationPlanInput {
  passCriteria: string;
  failCriteria: string;
  spendingLimitCents?: bigint | null;
  stopConditions?: string[];
  safetyLimits?: Record<string, unknown>;
}

export async function buildAndPersistValidationPlan(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  input: ValidationPlanInput
): Promise<string> {
  const planId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Validation plan is one-per-idea (unique on ideaId) — supersede if existing
    const existing = await tx.startupValidationPlan.findFirst({
      where: { ideaId, workspaceId },
      select: { id: true },
    });

    if (existing) {
      await tx.startupValidationPlan.delete({ where: { id: existing.id } });
    }

    await tx.startupValidationPlan.create({
      data: {
        id: planId,
        workspaceId,
        sessionId,
        ideaId,
        passCriteria: input.passCriteria,
        failCriteria: input.failCriteria,
        spendingLimitCents: input.spendingLimitCents ?? null,
        stopConditions: (input.stopConditions ?? []) as unknown as object,
        safetyLimits: (input.safetyLimits ?? {}) as unknown as object,
        approvedByOwner: false,
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_VALIDATION_PLAN_CREATED,
      payload: { sessionId, ideaId, planId },
    }, tx);
  });

  return planId;
}

// ─── Market Sizing ────────────────────────────────────────────────────────────

export interface MarketSizingInput {
  reachableMarketUnits?: bigint | null;
  reachableMarketRevenueCents?: bigint | null;
  serviceableUnits?: bigint | null;
  serviceableRevenueCents?: bigint | null;
  initialCustomerPool?: number | null;
  capacityLimitedRevenueCents?: bigint | null;
  sizingStatus?: "ESTIMATED" | "INSUFFICIENT_EVIDENCE";
  confidence?: number;
  assumptions?: string[];
  evidence?: string[];
  sizingRange?: { low: number; mid: number; high: number };
}

export async function buildAndPersistMarketSizing(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  input: MarketSizingInput
): Promise<string> {
  const sizingId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.startupMarketSizing.findFirst({
      where: { ideaId, workspaceId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const newVersion = (existing?.versionNumber ?? 0) + 1;

    await tx.startupMarketSizing.create({
      data: {
        id: sizingId,
        workspaceId,
        sessionId,
        ideaId,
        versionNumber: newVersion,
        reachableMarketUnits: input.reachableMarketUnits ?? null,
        reachableMarketRevenueCents: input.reachableMarketRevenueCents ?? null,
        serviceableUnits: input.serviceableUnits ?? null,
        serviceableRevenueCents: input.serviceableRevenueCents ?? null,
        initialCustomerPool: input.initialCustomerPool ?? null,
        capacityLimitedRevenueCents: input.capacityLimitedRevenueCents ?? null,
        sizingStatus: input.sizingStatus ?? "ESTIMATED",
        confidence: input.confidence ?? 50,
        assumptions: (input.assumptions ?? []) as unknown as object,
        evidence: (input.evidence ?? []) as unknown as object,
        sizingRange: (input.sizingRange ?? {}) as unknown as object,
        createdBy: actorId,
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_MARKET_SIZING_BUILT,
      payload: { sessionId, ideaId, sizingId, versionNumber: newVersion, sizingStatus: input.sizingStatus ?? "ESTIMATED" },
    }, tx);
  });

  return sizingId;
}

// G18: Domain-engine-driven market sizing — runs estimateMarketSize() then persists result
export async function buildMarketSizingFromDomainEngine(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  domainInputs: DomainMarketSizingInputs
): Promise<string> {
  const result = estimateMarketSize(domainInputs);
  const input: MarketSizingInput = {
    reachableMarketUnits: result.reachableMarketUnits != null ? BigInt(Math.round(result.reachableMarketUnits)) : null,
    reachableMarketRevenueCents: result.reachableMarketRevenueCents?.mid ?? null,
    serviceableUnits: result.serviceableUnits != null ? BigInt(Math.round(result.serviceableUnits)) : null,
    serviceableRevenueCents: result.serviceableRevenueCents?.mid ?? null,
    initialCustomerPool: null,
    capacityLimitedRevenueCents: result.capacityLimitedRevenueCents?.mid ?? null,
    sizingStatus: result.status === "INSUFFICIENT_EVIDENCE_TO_ESTIMATE" ? "INSUFFICIENT_EVIDENCE" : "ESTIMATED",
    confidence: result.confidence,
    assumptions: result.assumptions,
    evidence: domainInputs.evidenceIds ?? [],
    sizingRange: result.reachableMarketRevenueCents ? {
      low: Number(result.reachableMarketRevenueCents.low),
      mid: Number(result.reachableMarketRevenueCents.mid),
      high: Number(result.reachableMarketRevenueCents.high),
    } : undefined,
  };
  return buildAndPersistMarketSizing(workspaceId, sessionId, ideaId, actorId, input);
}

// ─── Approval Package Hash ────────────────────────────────────────────────────

/**
 * All 21 fields that constitute a complete approval package.
 * Any change to any field after a GO decision makes the approval stale.
 * Never accept packageHashSha256 from the client — always compute server-side.
 */
export interface ApprovalPackageComponents {
  sessionId: string;
  ideaId?: string | null;
  ideaVersionId?: string | null;
  profileVersionId?: string | null;
  economicModelId?: string | null;
  readinessId?: string | null;
  systemRecId?: string | null;
  businessModelId?: string | null;
  marketSizingId?: string | null;
  validationPlanId?: string | null;
  // Snapshot arrays — order-independent (sorted before hashing)
  evidenceSnapshotIds?: string[];
  riskSnapshotIds?: string[];
  constraintSnapshotIds?: string[];
  resourceSnapshotIds?: string[];
  // Policy terms — if any term changes, reapproval required
  spendingLimitCents?: bigint | string | null;
  permittedActions?: string[];
  prohibitedActions?: string[];
  materialAssumptions?: string[];
  validUntil?: Date | string | null;
  reviewDate?: Date | string | null;
  // G10: algorithm version fields — included in canonical hash so changes to hash algorithm
  // or policy rules invalidate existing approvals without content changes.
  hashVersion?: number | null;
  policyVersion?: string | null;
}

/** Canonical JSON SHA-256 over all 23 approval-package fields (algorithm version "v2"). */
export function computeApprovalPackageHash(c: ApprovalPackageComponents): string {
  const canonical = {
    v: "2",
    hashVersion: c.hashVersion ?? 2,
    policyVersion: c.policyVersion ?? "1",
    sessionId: c.sessionId,
    ideaId: c.ideaId ?? null,
    ideaVersionId: c.ideaVersionId ?? null,
    profileVersionId: c.profileVersionId ?? null,
    economicModelId: c.economicModelId ?? null,
    readinessId: c.readinessId ?? null,
    systemRecId: c.systemRecId ?? null,
    businessModelId: c.businessModelId ?? null,
    marketSizingId: c.marketSizingId ?? null,
    validationPlanId: c.validationPlanId ?? null,
    evidenceSnapshotIds: [...(c.evidenceSnapshotIds ?? [])].sort(),
    riskSnapshotIds: [...(c.riskSnapshotIds ?? [])].sort(),
    constraintSnapshotIds: [...(c.constraintSnapshotIds ?? [])].sort(),
    resourceSnapshotIds: [...(c.resourceSnapshotIds ?? [])].sort(),
    spendingLimitCents: c.spendingLimitCents != null ? String(c.spendingLimitCents) : null,
    permittedActions: [...(c.permittedActions ?? [])].sort(),
    prohibitedActions: [...(c.prohibitedActions ?? [])].sort(),
    materialAssumptions: [...(c.materialAssumptions ?? [])].sort(),
    validUntil: c.validUntil != null
      ? (c.validUntil instanceof Date ? c.validUntil.toISOString() : String(c.validUntil))
      : null,
    reviewDate: c.reviewDate != null
      ? (c.reviewDate instanceof Date ? c.reviewDate.toISOString() : String(c.reviewDate))
      : null,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Queries current snapshot IDs for a session — used by both decision recording and staleness checks. */
async function queryCurrentSnapshotIds(workspaceId: string, sessionId: string) {
  const [evidence, risks, constraints, objectives] = await Promise.all([
    db.startupEvidenceRecord.findMany({
      where: { sessionId, workspaceId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    db.businessRiskEntry.findMany({
      where: { linkedStartupSessionId: sessionId, workspaceId },
      select: { id: true },
    }),
    db.constraintResolutionRecord.findMany({
      where: { linkedStartupSessionId: sessionId, workspaceId },
      select: { id: true },
    }),
    // G6: ResourceAllocation has no direct session FK — query via BusinessObjective IDs
    db.businessObjective.findMany({
      where: { linkedStartupSessionId: sessionId, workspaceId },
      select: { id: true },
    }),
  ]);
  const objectiveIds = objectives.map((o: { id: string }) => o.id);
  const resourceAllocations = objectiveIds.length > 0
    ? await db.resourceAllocation.findMany({
        where: { objectiveId: { in: objectiveIds }, workspaceId },
        select: { id: true },
      })
    : [];
  const resourceSnapshotIds = resourceAllocations.map((r: { id: string }) => r.id);
  return {
    evidenceSnapshotIds: evidence.map((r: { id: string }) => r.id),
    riskSnapshotIds: risks.map((r: { id: string }) => r.id),
    constraintSnapshotIds: constraints.map((r: { id: string }) => r.id),
    resourceSnapshotIds,
  };
}

// ─── Stale-Reapproval Enforcement ────────────────────────────────────────────

export interface StalenessCheckResult {
  isStale: boolean;
  changedInputs: string[];
  originalHash: string | null;
  currentHash: string;
}

/**
 * Compares the current session state against the stored GO decision approval package.
 * Self-contained: queries the DB for the current snapshot arrays.
 * The caller supplies current versioned artifact IDs (what the session looks like now).
 * Returns stale if: any artifact ID differs, any snapshot array differs, or the decision has expired.
 */
export async function checkApprovalStaleness(
  workspaceId: string,
  sessionId: string,
  currentVersionedIds: {
    ideaId?: string | null;
    ideaVersionId?: string | null;
    profileVersionId?: string | null;
    economicModelId?: string | null;
    readinessId?: string | null;
    systemRecId?: string | null;
    businessModelId?: string | null;
    marketSizingId?: string | null;
    validationPlanId?: string | null;
  }
): Promise<StalenessCheckResult> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: { currentOwnerDecisionId: true },
  });

  if (!session?.currentOwnerDecisionId) {
    const noHash = computeApprovalPackageHash({ sessionId, ...currentVersionedIds });
    return { isStale: false, changedInputs: [], originalHash: null, currentHash: noHash };
  }

  const decision = await db.startupOwnerDecision.findFirst({
    where: { id: session.currentOwnerDecisionId, decisionType: "GO" },
    select: {
      packageHashSha256: true,
      ideaId: true,
      linkedIdeaVersionId: true,
      linkedProfileVersionId: true,
      linkedEconomicModelId: true,
      linkedReadinessId: true,
      linkedSystemRecId: true,
      linkedBusinessModelId: true,
      linkedMarketSizingId: true,
      linkedValidationPlanId: true,
      evidenceSnapshotIds: true,
      riskSnapshotIds: true,
      constraintSnapshotIds: true,
      resourceSnapshotIds: true,
      spendingLimitCents: true,
      permittedActions: true,
      prohibitedActions: true,
      materialAssumptions: true,
      validUntil: true,
      reviewDate: true,
    },
  });

  if (!decision || !decision.packageHashSha256) {
    const noDecHash = computeApprovalPackageHash({ sessionId, ...currentVersionedIds });
    return { isStale: false, changedInputs: [], originalHash: null, currentHash: noDecHash };
  }

  // Query current snapshot arrays from the DB
  const currentSnapshots = await queryCurrentSnapshotIds(workspaceId, sessionId);

  // Destructure ideaId out of currentVersionedIds — it's an execution parameter and must
  // not override the decision's own ideaId in the recomputed hash.
  const { ideaId: _executionIdeaId, ...versionedIdsWithoutIdea } = currentVersionedIds;
  const currentComponents: ApprovalPackageComponents = {
    sessionId,
    // Use the decision's own ideaId for hash recomputation so the hash stays
    // stable regardless of which ideaId the caller passes.
    ideaId: decision.ideaId,
    ...versionedIdsWithoutIdea,
    ...currentSnapshots,
    spendingLimitCents: decision.spendingLimitCents,
    permittedActions: (decision.permittedActions as string[]) ?? [],
    prohibitedActions: (decision.prohibitedActions as string[]) ?? [],
    materialAssumptions: (decision.materialAssumptions as string[]) ?? [],
    validUntil: decision.validUntil,
    reviewDate: decision.reviewDate,
  };

  const currentHash = computeApprovalPackageHash(currentComponents);

  if (decision.packageHashSha256 === currentHash) {
    return { isStale: false, changedInputs: [], originalHash: decision.packageHashSha256, currentHash };
  }

  // Build diff: identify which of 17 material inputs changed
  const changedInputs: string[] = [];

  const sortedJoin = (arr: unknown) => [...((arr as string[]) ?? [])].sort().join(",");

  if ((decision.linkedIdeaVersionId ?? null) !== (currentVersionedIds.ideaVersionId ?? null)) changedInputs.push("ideaVersion");
  if ((decision.linkedProfileVersionId ?? null) !== (currentVersionedIds.profileVersionId ?? null)) changedInputs.push("profile");
  if ((decision.linkedEconomicModelId ?? null) !== (currentVersionedIds.economicModelId ?? null)) changedInputs.push("economicModel");
  if ((decision.linkedReadinessId ?? null) !== (currentVersionedIds.readinessId ?? null)) changedInputs.push("readiness");
  if ((decision.linkedSystemRecId ?? null) !== (currentVersionedIds.systemRecId ?? null)) changedInputs.push("systemRecommendation");
  if ((decision.linkedBusinessModelId ?? null) !== (currentVersionedIds.businessModelId ?? null)) changedInputs.push("businessModel");
  if ((decision.linkedMarketSizingId ?? null) !== (currentVersionedIds.marketSizingId ?? null)) changedInputs.push("marketSizing");
  if ((decision.linkedValidationPlanId ?? null) !== (currentVersionedIds.validationPlanId ?? null)) changedInputs.push("validationPlan");
  if (sortedJoin(decision.evidenceSnapshotIds) !== sortedJoin(currentSnapshots.evidenceSnapshotIds)) changedInputs.push("evidence");
  if (sortedJoin(decision.riskSnapshotIds) !== sortedJoin(currentSnapshots.riskSnapshotIds)) changedInputs.push("risks");
  if (sortedJoin(decision.constraintSnapshotIds) !== sortedJoin(currentSnapshots.constraintSnapshotIds)) changedInputs.push("constraints");
  if (sortedJoin(decision.resourceSnapshotIds) !== sortedJoin(currentSnapshots.resourceSnapshotIds)) changedInputs.push("resources");
  if (String(decision.spendingLimitCents ?? "") !== String(currentComponents.spendingLimitCents ?? "")) changedInputs.push("spendingLimit");
  if (sortedJoin(decision.permittedActions) !== sortedJoin(currentComponents.permittedActions)) changedInputs.push("permittedActions");
  if (sortedJoin(decision.prohibitedActions) !== sortedJoin(currentComponents.prohibitedActions)) changedInputs.push("prohibitedActions");
  if (sortedJoin(decision.materialAssumptions) !== sortedJoin(currentComponents.materialAssumptions)) changedInputs.push("materialAssumptions");
  // Check expiry: if validUntil is in the past, approval is stale regardless of content
  if (decision.validUntil != null && decision.validUntil < new Date()) changedInputs.push("decisionExpired");

  return {
    isStale: true,
    changedInputs,
    originalHash: decision.packageHashSha256,
    currentHash,
  };
}

// ─── Owner Decision ───────────────────────────────────────────────────────────

export interface OwnerDecisionInput {
  ideaId?: string | null;
  decisionType: "GO" | "MODIFY" | "HOLD" | "REJECT" | "REQUEST_MORE_EVIDENCE";
  rationale?: string | null;
  spendingLimitCents?: bigint | null;
  permittedActions?: string[];
  prohibitedActions?: string[];
  validUntil?: Date | null;
  reviewDate?: Date | null;
  materialAssumptions?: string[];
  linkedSystemRecId?: string | null;
  linkedProfileVersionId?: string | null;
  linkedEconomicModelId?: string | null;
  linkedReadinessId?: string | null;
  // Versioned artifact completeness
  linkedIdeaVersionId?: string | null;
  linkedBusinessModelId?: string | null;
  linkedMarketSizingId?: string | null;
  linkedValidationPlanId?: string | null;
  // packageHashSha256 is always computed server-side — never accepted from the client
  // Snapshot arrays are auto-captured from DB at decision time — not from client
}

export async function recordOwnerDecision(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: OwnerDecisionInput
): Promise<string> {
  const decisionId = randomUUID();

  // Capture current snapshot arrays outside the transaction (read-only queries)
  const snapshots = await queryCurrentSnapshotIds(workspaceId, sessionId);

  const packageHash = computeApprovalPackageHash({
    sessionId,
    ideaId: input.ideaId,
    ideaVersionId: input.linkedIdeaVersionId,
    profileVersionId: input.linkedProfileVersionId,
    economicModelId: input.linkedEconomicModelId,
    readinessId: input.linkedReadinessId,
    systemRecId: input.linkedSystemRecId,
    businessModelId: input.linkedBusinessModelId,
    marketSizingId: input.linkedMarketSizingId,
    validationPlanId: input.linkedValidationPlanId,
    evidenceSnapshotIds: snapshots.evidenceSnapshotIds,
    riskSnapshotIds: snapshots.riskSnapshotIds,
    constraintSnapshotIds: snapshots.constraintSnapshotIds,
    resourceSnapshotIds: snapshots.resourceSnapshotIds,
    spendingLimitCents: input.spendingLimitCents,
    permittedActions: input.permittedActions,
    prohibitedActions: input.prohibitedActions,
    materialAssumptions: input.materialAssumptions,
    validUntil: input.validUntil,
    reviewDate: input.reviewDate,
  });

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Supersede existing current decision
    const current = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, currentOwnerDecisionId: true },
    });
    if (!current) throw new NotFoundError("OwnerStartupSession", sessionId);

    if (current.currentOwnerDecisionId) {
      await tx.startupOwnerDecision.update({
        where: { id: current.currentOwnerDecisionId },
        data: { supersededById: decisionId },
      });
    }

    await tx.startupOwnerDecision.create({
      data: {
        id: decisionId,
        workspaceId,
        sessionId,
        ideaId: input.ideaId ?? null,
        decisionType: input.decisionType,
        rationale: input.rationale ?? null,
        actorId,
        spendingLimitCents: input.spendingLimitCents ?? null,
        permittedActions: (input.permittedActions ?? []) as unknown as object,
        prohibitedActions: (input.prohibitedActions ?? []) as unknown as object,
        validUntil: input.validUntil ?? null,
        reviewDate: input.reviewDate ?? null,
        materialAssumptions: (input.materialAssumptions ?? []) as unknown as object,
        linkedSystemRecId: input.linkedSystemRecId ?? null,
        linkedProfileVersionId: input.linkedProfileVersionId ?? null,
        linkedEconomicModelId: input.linkedEconomicModelId ?? null,
        linkedReadinessId: input.linkedReadinessId ?? null,
        linkedIdeaVersionId: input.linkedIdeaVersionId ?? null,
        linkedBusinessModelId: input.linkedBusinessModelId ?? null,
        linkedMarketSizingId: input.linkedMarketSizingId ?? null,
        linkedValidationPlanId: input.linkedValidationPlanId ?? null,
        evidenceSnapshotIds: snapshots.evidenceSnapshotIds as unknown as object,
        riskSnapshotIds: snapshots.riskSnapshotIds as unknown as object,
        constraintSnapshotIds: snapshots.constraintSnapshotIds as unknown as object,
        resourceSnapshotIds: snapshots.resourceSnapshotIds as unknown as object,
        hashVersion: 2,
        policyVersion: "1",
        packageHashSha256: packageHash,
      },
    });

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: { currentOwnerDecisionId: decisionId, updatedAt: new Date() },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_OWNER_DECISION_RECORDED,
      payload: { sessionId, decisionId, decisionType: input.decisionType },
    }, tx);

    await writeMemoryEntry({
      workspaceId,
      actorId,
      memoryType: "STARTUP_OWNER_DECISION",
      sourceModel: "StartupOwnerDecision",
      sourceId: decisionId,
      key: `startup_owner_decision:${sessionId}`,
      summary: `Owner decision: ${input.decisionType} for session ${sessionId}`,
      data: { decisionId, decisionType: input.decisionType, rationale: input.rationale },
    });
  });

  return decisionId;
}

// ─── Research Plan ────────────────────────────────────────────────────────────

export async function buildAndPersistResearchPlan(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  ideaName: string,
  industry: string
): Promise<string> {
  const plan = buildResearchPlan(ideaName, industry);
  const planId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Upsert — one plan per session
    const existing = await tx.startupResearchPlan.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (existing) {
      await tx.startupResearchPlan.update({
        where: { id: existing.id },
        data: {
          evidenceDomains: plan.evidenceDomains as unknown as object,
          materialGaps: plan.humanOnly.map((d) => d.domain) as unknown as object,
          updatedAt: new Date(),
        },
      });
      // Return existing id
      return existing.id;
    }

    await tx.startupResearchPlan.create({
      data: {
        id: planId,
        workspaceId,
        sessionId,
        evidenceDomains: plan.evidenceDomains as unknown as object,
        materialGaps: plan.humanOnly.map((d) => d.domain) as unknown as object,
        acquiredDomains: [],
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_RESEARCH_PLAN_BUILT,
      payload: { sessionId, planId, domainCount: plan.evidenceDomains.length },
    }, tx);

    return planId;
  });

  return planId;
}

export interface AutoResearchResult {
  domain: string;
  acquisitionId: string;
  status: AcquisitionStatus;
  confidence: number;
}

export async function executeAutoResearch(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<AutoResearchResult[]> {
  const plan = await db.startupResearchPlan.findUnique({
    where: { sessionId },
    select: { id: true, evidenceDomains: true },
  });
  if (!plan) return [];

  const provider = getResearchProvider();
  const domains = plan.evidenceDomains as unknown as EvidenceDomain[];
  const autoDomains = domains.filter((d) => d.canAutoAcquire && provider.canHandle(d.domain));

  const results: AutoResearchResult[] = [];
  for (const domain of autoDomains) {
    const result = await provider.acquire({ domain: domain.domain, query: domain.requiredEvidence });
    const acqId = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const acq = await tx.startupResearchAcquisition.create({
        data: {
          workspaceId,
          researchPlanId: plan.id,
          domain: domain.domain,
          sourceType: result.sourceType,
          queryMethod: "AUTO_PROVIDER",
          rawResult: result.rawResult ?? null,
          extractedFacts: result.extractedFacts as unknown as object,
          retrievedAt: result.retrievedAt ?? null,
          reliabilityClassification: result.reliabilityClassification,
          confidence: result.confidence,
          limitations: result.limitations ?? null,
          status: result.status,
        },
        select: { id: true },
      });
      await emitAuditEvent({
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_RESEARCH_ACQUIRED,
        payload: { sessionId, domain: domain.domain, status: result.status, acquisitionId: acq.id },
      }, tx);
      return acq.id;
    });
    results.push({ domain: domain.domain, acquisitionId: acqId, status: result.status, confidence: result.confidence });
  }
  return results;
}

export async function getOwnerResearchTasks(
  workspaceId: string,
  sessionId: string
): Promise<ReturnType<typeof minimizeOwnerTasks>> {
  const plan = await db.startupResearchPlan.findUnique({
    where: { sessionId },
    include: { acquisitions: { where: { status: "ACQUIRED" }, select: { domain: true } } },
  });
  if (!plan) return [];

  const acquiredDomains = plan.acquisitions.map((a: { domain: string }) => a.domain);
  const domains = plan.evidenceDomains as unknown as Parameters<typeof minimizeOwnerTasks>[0];
  return minimizeOwnerTasks(domains, acquiredDomains);
}

// ─── G2: Idea Arbitration ─────────────────────────────────────────────────────

export async function runIdeaArbitration(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<StartupArbitrationResult & { arbitrationRecordId: string }> {
  const ideas = await db.startupIdeaRecord.findMany({
    where: { sessionId, workspaceId, supersededById: null },
    include: {
      hypotheses: { select: { result: true } },
      economicModels: { orderBy: { createdAt: "desc" }, select: { economicClassification: true, cashRunwayMonths: true, breakEvenMonths: true, grossMarginBps: true, supersededById: true }, take: 1 },
      readinessAssessments: { orderBy: { assessedAt: "desc" }, select: { readinessStatus: true, hardGateFailures: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  const ideasForArbitration: StartupIdeaForArbitration[] = ideas.map((idea: {
    id: string; name: string; accepted: boolean; screeningStatus: string;
    hypotheses: { result: string | null }[];
    economicModels: { economicClassification: string | null; cashRunwayMonths: number | null; breakEvenMonths: number | null; grossMarginBps: number | null; supersededById: string | null }[];
    readinessAssessments: { readinessStatus: string; hardGateFailures: unknown }[];
  }) => {
    const econ = idea.economicModels[0] ?? null;
    const readiness = idea.readinessAssessments[0] ?? null;
    const totalHyp = idea.hypotheses.length;
    const failedHyp = idea.hypotheses.filter((h) => h.result === "FAILED").length;
    const hardGates = (readiness?.hardGateFailures as string[]) ?? [];
    const regulatoryBlocked = hardGates.some((g: string) => g.startsWith("REGULATORY"));
    const grossMarginBps = econ?.grossMarginBps ?? null;
    const riskAdjustedScore = readiness ? (readiness.readinessStatus === "READY" ? 90 : readiness.readinessStatus === "CONDITIONALLY_READY" ? 60 : readiness.readinessStatus === "NOT_READY" ? 30 : 0) : null;
    return {
      id: idea.id,
      name: idea.name,
      accepted: idea.accepted,
      screeningStatus: idea.screeningStatus,
      riskAdjustedScore,
      capitalSufficient: econ != null ? (grossMarginBps != null && grossMarginBps > 0) : null,
      monthlyProfit: null,
      economicClassification: econ?.economicClassification ?? null,
      cashRunwayMonths: econ?.cashRunwayMonths ?? null,
      breakEvenMonths: econ?.breakEvenMonths ?? null,
      readinessStatus: readiness?.readinessStatus ?? null,
      hypothesesFailed: failedHyp,
      hypothesesTotal: totalHyp,
      regulatoryBlocked,
    };
  });

  const result = arbitrateStartupIdeas(ideasForArbitration);

  const recordId = randomUUID();
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.goalArbitrationRecord.create({
      data: {
        id: recordId,
        workspaceId,
        actorId,
        candidateIds: ideasForArbitration.map((i) => i.id) as unknown as object,
        winnerObjectiveId: null,
        arbitrationResult: result as unknown as object,
        dominantConstraint: result.bindingConstraints[0] ?? null,
      },
    });
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_ARBITRATION_RUN,
      payload: { sessionId, arbitrationRecordId: recordId, recommendedIdeaId: result.recommendedIdeaId, ideaCount: ideasForArbitration.length },
    }, tx);
  });

  return { ...result, arbitrationRecordId: recordId };
}

// ─── G3: Startup Explainability ───────────────────────────────────────────────

export async function buildAndPersistStartupExplanation(
  workspaceId: string,
  sessionId: string,
  ideaId: string | null,
  actorId: string,
  inputs: Omit<StartupExplanationInputs, "sessionId" | "ideaId">
): Promise<{ explanationId: string; explanation: StartupExplanation }> {
  const fullInputs: StartupExplanationInputs = { sessionId, ideaId, ...inputs };
  const explanation = buildStartupExplanation(fullInputs);

  // Adapt startup explanation to Phase 4 ExplainabilityRecord interface
  const p4Factors = explanation.factorsUsed.map((f) => ({
    name: f.factor,
    weight: f.weight,
    direction: f.direction as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
    value: f.value,
    description: f.value,
  }));
  const p4DataPoints = explanation.dataPoints.map((d) => ({
    label: d.metric,
    observed: d.value,
    expected: null,
    freshness: "CURRENT" as const,
    source: d.source,
  }));

  const persisted = await persistExplainabilityRecord(workspaceId, actorId, {
    decisionRef: explanation.decisionRef,
    decisionType: "STARTUP_SYSTEM_RECOMMENDATION" as unknown as DecisionExplainabilityType,
    explanationText: explanation.rationale,
    factorsUsed: p4Factors,
    dataPoints: p4DataPoints,
    confidence: explanation.confidence / 100, // Phase 4 uses 0..1, startup uses 0..100
    confidenceLevel: (
      explanation.confidenceLevel === "HIGH" ? "high"
      : explanation.confidenceLevel === "MEDIUM" ? "moderate"
      : explanation.confidenceLevel === "LOW" ? "low"
      : "very_low"
    ) as "very_high" | "high" | "moderate" | "low" | "very_low",
  });

  const explanationId = persisted.id;

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_EXPLANATION_BUILT,
    payload: { sessionId, ideaId, explanationId },
  });

  return { explanationId, explanation };
}

// ─── G1: NEED_OPTIONS Idea Generation ────────────────────────────────────────

export async function generateIdeasForNeedOptionsPath(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  profile: GenerationProfile
): Promise<IdeaGenerationResult> {
  const providerEnv = process.env["IDEA_GENERATION_PROVIDER"];
  const providerConfigured = !!providerEnv && providerEnv.trim().length > 0;

  // Fetch evidence linked to session — opportunity signals are workspace-scoped without session FK
  const evidenceRecords = await db.startupEvidenceRecord.findMany({
    where: { workspaceId, sessionId },
    select: { id: true, evidenceType: true, observedResult: true },
    take: 50,
  });

  const signalInputs: import("@/domain/owner-strategy/startup-idea-generation").OpportunitySignalForGeneration[] = [];
  const evidenceInputs = evidenceRecords.map((e: { id: string; evidenceType: string; observedResult: string }) => ({
    id: e.id,
    evidenceType: e.evidenceType,
    customerSegment: null,
    observedResult: e.observedResult,
    geography: null,
  }));

  const profileVersionId = randomUUID();
  const result = generateIdeasFromProfile(profile, signalInputs, evidenceInputs, providerConfigured, profileVersionId);

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_IDEAS_GENERATED,
    payload: { sessionId, available: result.available, conceptCount: result.concepts.length, generationMethod: result.generationMethod },
  });

  return result;
}

// ─── G15: Hypothesis failure → approval staleness propagation ─────────────────
// Called from recordHypothesisResult when a hypothesis result is FAILED or INVALIDATED.
// Writes operating memory noting that reapproval is required if a GO decision exists.
export async function propagateHypothesisFailureToStaleness(
  workspaceId: string,
  sessionId: string,
  hypothesisId: string,
  actorId: string
): Promise<void> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: { currentOwnerDecisionId: true },
  });
  if (!session?.currentOwnerDecisionId) return;

  await writeMemoryEntry({
    workspaceId,
    actorId,
    memoryType: "STARTUP_FAILED_HYPOTHESIS",
    sourceModel: "StartupHypothesis",
    sourceId: hypothesisId,
    key: `startup_hypothesis_failed:${hypothesisId}`,
    summary: `Critical hypothesis failed — existing GO approval may be stale for session ${sessionId}`,
    data: { sessionId, hypothesisId, currentOwnerDecisionId: session.currentOwnerDecisionId, requiresReapproval: true },
  });
}
