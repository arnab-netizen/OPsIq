/**
 * Phase 5 — Startup Session Service.
 * Full lifecycle management for OwnerStartupSession.
 * All mutations emit audit events. Workspace isolation enforced on all operations.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { validateStartup } from "@/domain/owner-strategy/startup-mode";
import type { StartupIntake, StartupIdea, IdeaEvaluation } from "@/domain/owner-strategy/startup-mode.types";
import { NotFoundError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assertValidTransition, type StartupSessionStatus } from "@/domain/owner-strategy/startup-lifecycle";
import { screenIdea, type BusinessFitProfile, type StartupIdeaInput } from "@/domain/owner-strategy/startup-screening";
import { generateHypotheses, prioritizeHypotheses, evaluateHypothesisResult } from "@/domain/owner-strategy/startup-hypothesis-engine";
import { buildEconomicModel, type EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import { assessReadiness, type ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
import { buildResearchPlan, minimizeOwnerTasks } from "@/domain/owner-strategy/startup-research-planner";
import { writeMemoryEntry } from "@/services/owner-mode/operating-memory.service";
import { Prisma } from "@/generated/prisma/client";

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
  changeRationale?: string
): Promise<{ versionId: string; versionNumber: number }> {
  const versionId = randomUUID();

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.ownerStartupSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, profileVersion: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

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

    await tx.ownerStartupSession.update({
      where: { id: sessionId },
      data: {
        profileVersion: newVersion,
        currentProfileVersionId: versionId,
        updatedAt: new Date(),
      },
    });

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
        sessionId,
        ideaId,
        problemEvidenceScore: result.scores.problemEvidence,
        customerEvidenceScore: result.scores.customerEvidence,
        wtpEvidenceScore: result.scores.wtpEvidence,
        solutionFeasibilityScore: result.scores.solutionFeasibility,
        deliveryFeasibilityScore: result.scores.deliveryFeasibility,
        economicViabilityScore: result.scores.economicViability,
        cashSurvivalScore: result.scores.cashSurvival,
        resourceReadinessScore: result.scores.resourceReadiness,
        regulatoryReadinessScore: result.scores.regulatoryReadiness,
        ownerCapacityScore: result.scores.ownerCapacity,
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
}

export async function recordOwnerDecision(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  input: OwnerDecisionInput
): Promise<string> {
  const decisionId = randomUUID();

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
