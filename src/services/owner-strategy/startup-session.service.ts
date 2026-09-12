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
import {
  classifyAllEvidence,
  detectEvidenceConflicts,
  hasStaleEvidence,
  type EvidenceForEvaluation,
  type FreshnessMeta,
  type EvidenceConflict,
} from "@/domain/owner-strategy/startup-evidence-evaluation";
import { buildValidationPlan as buildValidationPlanDomain } from "@/domain/owner-strategy/startup-validation-planner";

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

export async function createStartupSession(
  input: CreateStartupSessionInput,
  opts?: { isFixtureBusiness?: boolean }
): Promise<string> {
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
        isFixtureBusiness: opts?.isFixtureBusiness ?? false,
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
  }, { timeout: 30000 });

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
    // isFixtureBusiness: false mirrors listBusinesses() -- ordinary owners must never see
    // acceptance/QA-created startup sessions in their own planning history. See
    // docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
    where: { workspaceId, isFixtureBusiness: false },
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

/**
 * Startup session ids that must be treated as fixture-tainted for any workspace-wide,
 * business-agnostic read of blueprint output — specifically BusinessRiskEntry and
 * ConstraintResolutionRecord, neither of which has a businessId column (see
 * ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md), so a business-scoped read can never filter them by the
 * currently-selected business the way BusinessObjective/ProcessExecutionTask already can.
 *
 * A session counts as fixture-tainted when EITHER its own isFixtureBusiness flag is true, OR it
 * has been handed off to an OwnerBusiness that is itself isFixtureBusiness: true. The second case
 * is the one createBlueprint()'s write path failed to check for seven real historical acceptance
 * runs (2026-08-21 through 2026-08-27): their derived BusinessRiskEntry/ConstraintResolutionRecord
 * rows were persisted with isFixtureRecord: false despite the underlying business being correctly
 * reclassified as a fixture (the D3 acceptance-fixture reclassification). This is a read-time,
 * non-mutating correction — it never touches the stored isFixtureRecord/isFixtureBusiness columns,
 * only excludes rows at query time using an already-established, legitimate provenance signal
 * (OwnerBusiness.isFixtureBusiness) rather than a display-string/name/timestamp heuristic.
 */
export async function getFixtureTaintedStartupSessionIds(workspaceId: string): Promise<string[]> {
  type SessionFixtureRow = { id: string; isFixtureBusiness: boolean; businessId: string | null };
  const sessions: SessionFixtureRow[] = await db.ownerStartupSession.findMany({
    where: { workspaceId },
    select: { id: true, isFixtureBusiness: true, businessId: true },
  });
  if (sessions.length === 0) return [];

  const businessIds = Array.from(
    new Set(sessions.map((s: SessionFixtureRow) => s.businessId).filter((id: string | null): id is string => id !== null))
  );
  let fixtureBusinessIds = new Set<string>();
  if (businessIds.length > 0) {
    const fixtureBusinesses: Array<{ id: string }> = await db.ownerBusiness.findMany({
      where: { id: { in: businessIds }, workspaceId, isFixtureBusiness: true },
      select: { id: true },
    });
    fixtureBusinessIds = new Set(fixtureBusinesses.map((b: { id: string }) => b.id));
  }

  return sessions
    .filter((s: SessionFixtureRow) => s.isFixtureBusiness === true || (s.businessId !== null && fixtureBusinessIds.has(s.businessId)))
    .map((s: SessionFixtureRow) => s.id);
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
      select: { id: true, status: true, currentOwnerDecisionId: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

    assertValidTransition(session.status as StartupSessionStatus, newStatus);

    // G7/G9/G15: gate at EXECUTION_PLANNED — inside the transaction so the staleness
    // check and the status mutation share the same DB round-trip, closing the TOCTOU
    // window between canonical-state read and the protected UPDATE.
    if (newStatus === "EXECUTION_PLANNED") {
      // Derive the ideaId from the current GO decision so all 9 material fields are compared,
      // not just the 2 session-level fields (profileVersionId, systemRecId).
      let transitionIdeaId: string | null = null;
      if (session.currentOwnerDecisionId) {
        const dec = await tx.startupOwnerDecision.findFirst({
          where: { id: session.currentOwnerDecisionId, workspaceId },
          select: { ideaId: true },
        });
        transitionIdeaId = dec?.ideaId ?? null;
      }
      const currentState = await loadCanonicalCurrentApprovalState(workspaceId, sessionId, transitionIdeaId, tx);
      const staleness = await checkApprovalStaleness(workspaceId, sessionId, currentState, tx);
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
      // G2-3a: block EXECUTION_PLANNED transition when the GO decision's idea has been revised.
      // The staleness check alone does not catch this: if no material fields on the OLD idea
      // changed, the hash still matches even though the active idea is now a different record.
      if (transitionIdeaId) {
        const ideaRevisionRow = await tx.startupIdeaRecord.findFirst({
          where: { id: transitionIdeaId, workspaceId },
          select: { supersededById: true },
        });
        if (ideaRevisionRow?.supersededById) {
          throw new ConflictError(
            `EXECUTION_BLOCKED: idea has been revised — the GO decision was recorded for the superseded idea revision. Reapproval for the new idea revision is required before execution can be planned.`
          );
        }
      }

      // Pattern A optimistic concurrency (EXECUTION_PLANNED only): incorporate all material
      // pointer values verified by the staleness check into the UPDATE WHERE clause. Under
      // READ COMMITTED, each statement starts a new snapshot; if any pointer changed between
      // our canonical-state read and this UPDATE, count=0 → ConflictError.
      const sessionUpdateResult = await tx.ownerStartupSession.updateMany({
        where: {
          id: sessionId,
          workspaceId,
          status: session.status,
          currentOwnerDecisionId: session.currentOwnerDecisionId,
          currentProfileVersionId: currentState.profileVersionId,
          currentSystemRecId: currentState.systemRecId,
        },
        data: { status: newStatus },
      });
      if (sessionUpdateResult.count === 0) {
        throw new ConflictError(
          `CONCURRENCY_CONFLICT: session state changed between staleness check and status transition — the operation was denied to prevent a stale transition. Retry the request.`
        );
      }

      // Idea-level Pattern A concurrency guard: an UPDATE (not a SELECT) acquires an exclusive
      // row lock on the idea row. Under READ COMMITTED, the WHERE clause is re-evaluated at
      // lock-acquisition time — any material pointer change or concurrent revision that committed
      // after our canonical-state read will cause the WHERE to miss (count=0) → ConflictError.
      // A read-only findFirst cannot close this race: a concurrent commit between findFirst and
      // transaction commit would slip through. supersededById: null is included to catch
      // concurrent revisions that committed between the G2-3a check and this guard.
      if (transitionIdeaId) {
        const ideaGuard = await tx.startupIdeaRecord.updateMany({
          where: {
            id: transitionIdeaId,
            workspaceId,
            currentEconomicModelVersionId: currentState.economicModelId,
            currentReadinessId: currentState.readinessId,
            currentBusinessModelVersionId: currentState.businessModelId,
            supersededById: null,
          },
          data: { workspaceId }, // no-op: sets workspaceId to its current value to acquire exclusive row lock
        });
        if (ideaGuard.count === 0) {
          throw new ConflictError(
            `CONCURRENCY_CONFLICT: idea material state changed between staleness check and status transition — the operation was denied to prevent a stale transition. Retry the request.`
          );
        }
      }
    } else {
      await tx.ownerStartupSession.update({
        where: { id: sessionId },
        data: { status: newStatus },
      });
    }

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_SESSION_STATUS_CHANGED,
      payload: { sessionId, from: session.status, to: newStatus },
    }, tx);

    // Emit STARTUP_APPROVAL_BECAME_STALE exactly once: when the session transitions
    // into STALE_REAPPROVAL_REQUIRED. This is the single canonical write point for
    // this status, so the event fires at most once per stale transition.
    if (newStatus === "STALE_REAPPROVAL_REQUIRED" && session.currentOwnerDecisionId) {
      const decision = await tx.startupOwnerDecision.findFirst({
        where: { id: session.currentOwnerDecisionId, workspaceId },
        select: { packageHashSha256: true },
      });
      await emitAuditEvent({
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE,
        payload: {
          sessionId,
          ownerDecisionId: session.currentOwnerDecisionId,
          approvalPackageHash: decision?.packageHashSha256 ?? null,
          previousSessionStatus: session.status,
          resultingStatus: newStatus,
        },
      }, tx);
    }
  }, { timeout: 30000 });
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
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
      }, tx);

      await emitAuditEvent({
        workspaceId,
        actorId,
        eventName: AUDIT_EVENTS.STARTUP_OPERATING_MEMORY_WRITTEN,
        payload: { sessionId, ideaId, memoryType: "STARTUP_REJECTED_IDEA" },
      }, tx);
    }
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
    select: {
      id: true,
      hypothesisType: true,
      requiresOwnerApproval: true,
      confidenceBefore: true,
      sessionId: true,
    },
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
    }, tx);
  }, { timeout: 30000 });

  // Wire staleness propagation on failure outcomes (outside transaction — read-only + memory write)
  if (result === "DISCONFIRMED" || result === "INCONCLUSIVE") {
    await propagateHypothesisFailureToStaleness(workspaceId, hypothesis.sessionId, hypothesisId, actorId);
    // Trigger readiness reassessment so the new readiness record's ID invalidates
    // any existing GO approval hash via checkApprovalStaleness.
    await reassessReadinessAfterHypothesisChange(workspaceId, hypothesis.sessionId, hypothesisId, actorId);
  }
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export interface EvidenceInput {
  ideaId?: string | null;
  hypothesisId?: string | null;
  idempotencyKey?: string | null;
  sourceType: string;
  evidenceType: string;
  materialClaim?: string | null;
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
        materialClaim: input.materialClaim ?? null,
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
  }, { timeout: 30000 });

  // After persist: check conflicts among evidence for the same session (non-fatal — conflicts are surfaced, not blocking)
  const allEvidence = await db.startupEvidenceRecord.findMany({
    where: { workspaceId, sessionId },
    select: {
      id: true, sourceType: true, evidenceType: true, retrievedAt: true,
      expiresAt: true, currentVerificationRequired: true, reliabilityScore: true,
      confidence: true, observedResult: true, hypothesisId: true, materialClaim: true,
    },
  });
  const now = new Date();
  type EvidenceRow = (typeof allEvidence)[number];
  const evidenceForEval: EvidenceForEvaluation[] = allEvidence.map((e: EvidenceRow) => ({
    id: e.id,
    sourceType: e.sourceType,
    evidenceType: e.evidenceType,
    retrievedAt: e.retrievedAt,
    expiresAt: e.expiresAt ?? null,
    currentVerificationRequired: e.currentVerificationRequired ?? false,
    reliabilityScore: e.reliabilityScore ?? 50,
    confidence: e.confidence ?? 50,
    observedResult: e.observedResult,
    hypothesisId: e.hypothesisId ?? null,
    materialClaim: e.materialClaim ?? null,
  }));
  const freshnessList = classifyAllEvidence(evidenceForEval, now);
  const conflicts = detectEvidenceConflicts(evidenceForEval, freshnessList);
  const materialConflicts = conflicts.filter((c) => c.propagatesToReadiness);

  if (materialConflicts.length > 0) {
    // Deduplication: only emit the audit event for conflicts that were NOT already present
    // before this evidence item was recorded. We identify "new" conflicts as those that
    // reference the just-recorded evidenceId as one of the two conflicting evidence records.
    const newConflicts = materialConflicts.filter(
      (c) => c.evidenceA.id === evidenceId || c.evidenceB.id === evidenceId
    );

    // Persist the operating-memory entry for all material conflicts (non-audited, always safe to write)
    await writeMemoryEntry({
      workspaceId,
      actorId,
      memoryType: "STARTUP_EVIDENCE_CONFLICT",
      sourceModel: "StartupEvidenceRecord",
      sourceId: evidenceId,
      key: `startup_evidence_conflict:${sessionId}:${evidenceId}`,
      summary: `${materialConflicts.length} material evidence conflict(s) detected after recording evidence ${evidenceId}`,
      data: { sessionId, conflicts: materialConflicts },
    });

    // Emit the governed audit event only for conflicts first introduced by this evidence item
    if (newConflicts.length > 0) {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const conflict of newConflicts) {
          await emitAuditEvent({
            workspaceId,
            actorId,
            eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED,
            payload: {
              sessionId,
              materialClaim: conflict.materialClaim,
              conflictingEvidenceIds: [conflict.evidenceA.id, conflict.evidenceB.id],
              severity: conflict.severity,
              propagatesToReadiness: conflict.propagatesToReadiness,
              detectedAt: new Date().toISOString(),
            },
          }, tx);
        }
      }, { timeout: 30000 });
    }
  }

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
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
  // Wire domain engine: derive plan structure from active hypotheses when available
  const activeHypotheses = await db.startupHypothesis.findMany({
    where: { ideaId, workspaceId, result: null },
    select: { id: true, statement: true, hypothesisType: true, falsificationCriteria: true, confidenceBefore: true, expectedCostCents: true, expectedDurationDays: true, requiresOwnerApproval: true },
    orderBy: { createdAt: "asc" },
  });

  let derivedSpendingLimit: bigint | null = input.spendingLimitCents ?? null;
  let derivedStopConditions: string[] = input.stopConditions ?? [];
  let derivedSafetyLimits: Record<string, unknown> = input.safetyLimits ?? {};

  if (activeHypotheses.length > 0) {
    type HypRow = (typeof activeHypotheses)[number];
    const hypothesesForPlanning: import("@/domain/owner-strategy/startup-validation-planner").HypothesisForPlanning[] = activeHypotheses.map((h: HypRow) => ({
      id: h.id,
      statement: h.statement,
      hypothesisType: h.hypothesisType,
      confidenceBefore: h.confidenceBefore,
      falsificationCriteria: h.falsificationCriteria,
      requiresOwnerApproval: h.requiresOwnerApproval,
      expectedCostCents: h.expectedCostCents ?? null,
      expectedDurationDays: h.expectedDurationDays ?? null,
    }));
    const domainPlan = buildValidationPlanDomain(hypothesesForPlanning);
    // Owner-supplied criteria override domain defaults; domain provides spending and safety guardrails
    derivedSpendingLimit = input.spendingLimitCents ?? domainPlan.totalSpendingLimitCents;
    derivedStopConditions = input.stopConditions?.length ? input.stopConditions : domainPlan.stopConditions;
    derivedSafetyLimits = Object.keys(input.safetyLimits ?? {}).length > 0 ? (input.safetyLimits ?? {}) : domainPlan.safetyLimits;
  }

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
        spendingLimitCents: derivedSpendingLimit ?? null,
        stopConditions: (derivedStopConditions) as unknown as object,
        safetyLimits: (derivedSafetyLimits) as unknown as object,
        approvedByOwner: false,
      },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_VALIDATION_PLAN_CREATED,
      payload: { sessionId, ideaId, planId, derivedFromHypotheses: activeHypotheses.length },
    }, tx);
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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

/**
 * V1 hash — ID-only, no snapshot arrays, no policy terms.
 * Only used to verify stored decisions that were created with hashVersion=1.
 * Never used for new decisions (all new decisions use V2).
 */
export function verifyApprovalPackageV1(c: ApprovalPackageComponents): string {
  const canonical = {
    v: "1",
    hashVersion: 1,
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
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * V2 hash — full canonical form including snapshot arrays, policy terms, and algorithm version marker.
 * All new decisions are hashed with V2. V2 is the default and only format for production writes.
 */
export function verifyApprovalPackageV2(c: ApprovalPackageComponents): string {
  const canonical = {
    v: "2",
    hashVersion: 2,
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

/**
 * V3 normalized state — extends V2 with:
 * - Evidence freshness classification per record (R3)
 * - Conflict state per evidence pair (R4)
 * - Hypothesis result and falsification status per hypothesis (R5)
 * - Resource normalized values (amount, available, status, effective dates) (R6)
 * V3 is used for all new GO decisions. V1/V2 remain stable for legacy verification.
 */
export interface ApprovalPackageV3State {
  evidenceState?: Array<{ id: string; freshnessClassification: string; conflictStatus?: string; conflictSeverity?: string }>;
  hypothesisState?: Array<{ id: string; result: string | null; critical: boolean; confidenceAfter: number | null; falsificationStatus: string | null }>;
  resourceState?: Array<{ id: string; allocationAmount: number; status: string; allocatedAt: string; releasedAt: string | null }>;
}

export function verifyApprovalPackageV3(c: ApprovalPackageComponents, state?: ApprovalPackageV3State): string {
  const evidenceSorted = [...(state?.evidenceState ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const hypothesisSorted = [...(state?.hypothesisState ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const resourceSorted = [...(state?.resourceState ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const canonical = {
    v: "3",
    hashVersion: 3,
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
    // V3 normalized material state
    evidenceState: evidenceSorted,
    hypothesisState: hypothesisSorted,
    resourceState: resourceSorted,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Dispatcher: select hash algorithm by stored hashVersion.
 * New records always use V3. Legacy records with hashVersion=1 use V1, hashVersion=2 use V2.
 * Unknown or missing hashVersion defaults to V2 (current algorithm for new decisions).
 * V3 requires explicit hashVersion: 3.
 */
export function computeApprovalPackageHash(c: ApprovalPackageComponents, v3State?: ApprovalPackageV3State): string {
  const version = c.hashVersion ?? 2;
  if (version === 1) return verifyApprovalPackageV1(c);
  if (version === 2) return verifyApprovalPackageV2(c);
  return verifyApprovalPackageV3(c, v3State);
}

/**
 * Queries current snapshot IDs for a session — used by both decision recording and staleness checks.
 * R7: excludes records where originBlueprintId matches authorizedBlueprintId — blueprint-created
 * artifacts do not retroactively stale the approval that created them.
 */
async function queryCurrentSnapshotIds(
  workspaceId: string,
  sessionId: string,
  authorizedBlueprintId?: string | null,
  client: Prisma.TransactionClient | typeof db = db
) {
  const [evidence, risks, constraints, objectives] = await Promise.all([
    client.startupEvidenceRecord.findMany({
      where: { sessionId, workspaceId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    client.businessRiskEntry.findMany({
      where: {
        linkedStartupSessionId: sessionId,
        workspaceId,
        // Exclude records created BY the currently-authorized blueprint
        ...(authorizedBlueprintId ? { NOT: { originBlueprintId: authorizedBlueprintId } } : {}),
      },
      select: { id: true },
    }),
    client.constraintResolutionRecord.findMany({
      where: {
        linkedStartupSessionId: sessionId,
        workspaceId,
        ...(authorizedBlueprintId ? { NOT: { originBlueprintId: authorizedBlueprintId } } : {}),
      },
      select: { id: true },
    }),
    // G6: ResourceAllocation has no direct session FK — query via BusinessObjective IDs
    client.businessObjective.findMany({
      where: { linkedStartupSessionId: sessionId, workspaceId },
      select: { id: true },
    }),
  ]);
  const objectiveIds = objectives.map((o: { id: string }) => o.id);
  const resourceAllocations = objectiveIds.length > 0
    ? await client.resourceAllocation.findMany({
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
 * All 9 versioned artifact IDs compared in the staleness check.
 * Every field is required and nullable — no Partial<...> at the execution-safety boundary.
 * Callers must derive all values from the DB via loadCanonicalCurrentApprovalState
 * or declare null explicitly for fields that genuinely do not exist yet.
 */
export interface VersionedApprovalState {
  ideaId: string | null;
  ideaVersionId: string | null;
  profileVersionId: string | null;
  economicModelId: string | null;
  readinessId: string | null;
  systemRecId: string | null;
  businessModelId: string | null;
  marketSizingId: string | null;
  validationPlanId: string | null;
}

/**
 * Loads the canonical current versioned artifact IDs for a session from the DB.
 * Session-level: currentProfileVersionId, currentSystemRecId.
 * Idea-level (when ideaId supplied): currentEconomicModelVersionId, currentReadinessId,
 * currentBusinessModelVersionId, latest marketSizing and validationPlan IDs.
 *
 * ideaVersionId — compatibility field, always null. StartupIdeaRecord tracks revisions
 * via the supersededById pointer (a new record is created per revision, the old one is
 * marked superseded). There is no UUID version-ID column on the idea row. Both the GO
 * decision and the canonical state return null here, so the hash always matches on this
 * field — revision detection relies exclusively on supersededById, NOT on ideaVersionId.
 *
 * Fail-closed: throws NotFoundError when session not found OR when ideaId is supplied
 * but the idea is not found in the workspace. Returning all-null for a missing idea
 * would silently fail-open: if the GO decision also stored all-null idea-level fields,
 * the hash would match a non-existent idea's output and report NOT STALE.
 */
export async function loadCanonicalCurrentApprovalState(
  workspaceId: string,
  sessionId: string,
  ideaId?: string | null,
  client: Prisma.TransactionClient | typeof db = db
): Promise<VersionedApprovalState> {
  const session = await client.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: { currentProfileVersionId: true, currentSystemRecId: true },
  });

  if (!session) {
    // Throwing here rather than returning all-null avoids a silent fail-open:
    // if the GO decision also stored all-null versioned IDs, an all-null hash would
    // match the stored hash and report NOT STALE for a missing session.
    throw new NotFoundError("OwnerStartupSession", sessionId);
  }

  let economicModelId: string | null = null;
  let readinessId: string | null = null;
  let businessModelId: string | null = null;
  let marketSizingId: string | null = null;
  let validationPlanId: string | null = null;

  if (ideaId) {
    const [idea, latestMarketSizing, validationPlan] = await Promise.all([
      client.startupIdeaRecord.findFirst({
        where: { id: ideaId, workspaceId },
        select: {
          currentEconomicModelVersionId: true,
          currentReadinessId: true,
          currentBusinessModelVersionId: true,
        },
      }),
      client.startupMarketSizing.findFirst({
        where: { ideaId, workspaceId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      }),
      client.startupValidationPlan.findFirst({
        where: { ideaId, workspaceId },
        select: { id: true },
      }),
    ]);

    if (!idea) {
      // ideaId was supplied but the idea is missing or belongs to a different workspace.
      // Returning all-null here would fail-open: a GO decision stored with null idea-level
      // fields would hash-match and report NOT STALE for a non-existent/cross-workspace idea.
      throw new NotFoundError("StartupIdeaRecord", ideaId);
    }
    economicModelId = idea.currentEconomicModelVersionId ?? null;
    readinessId = idea.currentReadinessId ?? null;
    businessModelId = idea.currentBusinessModelVersionId ?? null;
    marketSizingId = latestMarketSizing?.id ?? null;
    validationPlanId = validationPlan?.id ?? null;
  }

  return {
    ideaId: ideaId ?? null,
    ideaVersionId: null,
    profileVersionId: session.currentProfileVersionId ?? null,
    economicModelId,
    readinessId,
    systemRecId: session.currentSystemRecId ?? null,
    businessModelId,
    marketSizingId,
    validationPlanId,
  };
}

/**
 * Compares the current session state against the stored GO decision approval package.
 * Self-contained: queries the DB for the current snapshot arrays.
 * The caller must supply all 9 versioned artifact IDs via VersionedApprovalState —
 * use loadCanonicalCurrentApprovalState to derive them from the DB.
 * Returns stale if: any artifact ID differs, any snapshot array differs, or the decision has expired.
 */
export async function checkApprovalStaleness(
  workspaceId: string,
  sessionId: string,
  currentVersionedIds: VersionedApprovalState,
  client: Prisma.TransactionClient | typeof db = db
): Promise<StalenessCheckResult> {
  const session = await client.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: { currentOwnerDecisionId: true },
  });

  if (!session?.currentOwnerDecisionId) {
    const noHash = computeApprovalPackageHash({ sessionId, ...currentVersionedIds });
    return { isStale: false, changedInputs: [], originalHash: null, currentHash: noHash };
  }

  const decision = await client.startupOwnerDecision.findFirst({
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
      hashVersion: true,
      policyVersion: true,
    },
  });

  if (!decision || !decision.packageHashSha256) {
    const noDecHash = computeApprovalPackageHash({ sessionId, ...currentVersionedIds });
    return { isStale: false, changedInputs: [], originalHash: null, currentHash: noDecHash };
  }

  // R7: find the blueprint created under this decision so blueprint-created artifacts are excluded
  const blueprintForDecision = await client.startupExecutionBlueprint.findFirst({
    where: { ownerDecisionId: session.currentOwnerDecisionId, workspaceId },
    select: { id: true },
  });
  // Query current snapshot arrays from the DB — excluding blueprint-created artifacts (R7)
  const currentSnapshots = await queryCurrentSnapshotIds(workspaceId, sessionId, blueprintForDecision?.id ?? null, client);

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
    // G10: use the stored hashVersion to dispatch the correct algorithm
    hashVersion: decision.hashVersion ?? 2,
    policyVersion: decision.policyVersion ?? "1",
  };

  const currentHash = computeApprovalPackageHash(currentComponents);

  if (decision.packageHashSha256 === currentHash) {
    return { isStale: false, changedInputs: [], originalHash: decision.packageHashSha256, currentHash };
  }

  // Build diff: identify which of 17 material inputs changed
  const changedInputs: string[] = [];

  const sortedJoin = (arr: unknown) => [...((arr as string[]) ?? [])].sort().join(",");

  // ideaVersionId is intentionally excluded from changedInputs: StartupIdeaRecord has no UUID
  // version field — loadCanonicalCurrentApprovalState always returns ideaVersionId: null. Any
  // GO decision that stored a non-null linkedIdeaVersionId would already be detected as stale
  // by the hash mismatch above. Revision detection is exclusively via supersededById at all
  // three execution gates (transitionSession, createBlueprint, assertStartupExecutionAuthorization).
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

  // Auto-fill versioned artifact pointer IDs from canonical DB state when the caller omits them.
  // Mirrors the snapshot-array auto-fill above: callers should not be required to enumerate
  // analysis artifact IDs — the service captures the current canonical state at decision time.
  // Only applies when an ideaId is provided (idea-level fields) or at session level.
  if (input.ideaId && (
    input.linkedEconomicModelId === undefined || input.linkedEconomicModelId === null ||
    input.linkedReadinessId === undefined || input.linkedReadinessId === null ||
    input.linkedSystemRecId === undefined || input.linkedSystemRecId === null ||
    input.linkedProfileVersionId === undefined || input.linkedProfileVersionId === null
  )) {
    const canonicalState = await loadCanonicalCurrentApprovalState(workspaceId, sessionId, input.ideaId);
    input.linkedEconomicModelId  = input.linkedEconomicModelId  ?? canonicalState.economicModelId  ?? null;
    input.linkedReadinessId      = input.linkedReadinessId      ?? canonicalState.readinessId      ?? null;
    input.linkedSystemRecId      = input.linkedSystemRecId      ?? canonicalState.systemRecId      ?? null;
    input.linkedProfileVersionId = input.linkedProfileVersionId ?? canonicalState.profileVersionId ?? null;
    input.linkedBusinessModelId  = input.linkedBusinessModelId  ?? canonicalState.businessModelId  ?? null;
    input.linkedMarketSizingId   = input.linkedMarketSizingId   ?? canonicalState.marketSizingId   ?? null;
    input.linkedValidationPlanId = input.linkedValidationPlanId ?? canonicalState.validationPlanId ?? null;
  }

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
    }, tx);
  }, { timeout: 30000 });

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
  }, { timeout: 30000 });

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
    }, { timeout: 30000 });
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
  }, { timeout: 30000 });

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

export type IdeaGenerationResultWithBatch = IdeaGenerationResult & { batchId: string };

export async function generateIdeasForNeedOptionsPath(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  profile: GenerationProfile
): Promise<IdeaGenerationResultWithBatch> {
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

  // G6: Persist generated candidates as a governed batch — prevents ephemeral candidates
  const batchId = randomUUID();
  await db.startupIdeaGenerationBatch.create({
    data: {
      id: batchId,
      workspaceId,
      sessionId,
      generationMethod: result.generationMethod,
      providerStatus: result.available
        ? "NEED_OPTIONS_PROVIDER_AVAILABLE"
        : "NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE",
      profileSnapshot: profile as unknown as object,
      evidenceCount: evidenceInputs.length,
      concepts: result.concepts as unknown as object,
      conceptCount: result.concepts.length,
      available: result.available,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_IDEAS_GENERATED,
    payload: {
      sessionId,
      batchId,
      available: result.available,
      conceptCount: result.concepts.length,
      generationMethod: result.generationMethod,
    },
  });

  return { ...result, batchId };
}

// ─── G6b: Candidate Accept / Reject ──────────────────────────────────────────

export interface CandidateDecisionInput {
  decision: "ACCEPTED" | "REJECTED";
  rejectionRationale?: string | null;
}

export async function recordCandidateDecision(
  workspaceId: string,
  sessionId: string,
  batchId: string,
  conceptIndex: number,
  actorId: string,
  input: CandidateDecisionInput
): Promise<{ candidateId: string; ideaId: string | null }> {
  // Verify batch belongs to session
  const batch = await db.startupIdeaGenerationBatch.findFirst({
    where: { id: batchId, workspaceId, sessionId },
    select: { id: true, concepts: true },
  });
  if (!batch) throw new NotFoundError("StartupIdeaGenerationBatch", batchId);

  const concepts = batch.concepts as Array<{ name?: string; industry?: string; summary?: string }>;
  if (conceptIndex < 0 || conceptIndex >= concepts.length) {
    throw new Error(`conceptIndex ${conceptIndex} out of bounds for batch (length ${concepts.length})`);
  }

  const concept = concepts[conceptIndex];

  // Idempotency: if a decision already exists for this concept in this batch, return it
  const existing = await db.startupIdeaCandidate.findUnique({
    where: { batchId_conceptIndex: { batchId, conceptIndex } },
    select: { id: true, decision: true, acceptedIdeaId: true },
  });
  if (existing) {
    // If same decision, idempotent — return existing record
    if (existing.decision === input.decision) {
      return { candidateId: existing.id, ideaId: existing.acceptedIdeaId ?? null };
    }
    throw new ConflictError(
      `Candidate already decided as ${existing.decision} — cannot change to ${input.decision}`
    );
  }

  const candidateId = randomUUID();
  let createdIdeaId: string | null = null;

  if (input.decision === "ACCEPTED") {
    // Create a governed StartupIdeaRecord from the accepted concept
    const ideaId = randomUUID();
    createdIdeaId = ideaId;
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.startupIdeaRecord.create({
        data: {
          id: ideaId,
          workspaceId,
          sessionId,
          name: concept.name ?? "Accepted idea",
          industry: concept.industry ?? "GENERAL",
          version: 1,
          screeningStatus: "PENDING",
          originData: { source: "GENERATION_BATCH", batchId, conceptIndex, concept } as unknown as object,
        },
      });

      await tx.startupIdeaCandidate.create({
        data: {
          id: candidateId,
          workspaceId,
          sessionId,
          batchId,
          conceptIndex,
          conceptSnapshot: concept as unknown as object,
          decision: "ACCEPTED",
          acceptedIdeaId: ideaId,
          decidedBy: actorId,
        },
      });

      await emitAuditEvent({ workspaceId, actorId, eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED, payload: { sessionId, ideaId, source: "GENERATION_BATCH", batchId, conceptIndex } }, tx);
    }, { timeout: 30000 });
  } else {
    // REJECTED — persist with rationale to prevent rediscovery without new evidence
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.startupIdeaCandidate.create({
        data: {
          id: candidateId,
          workspaceId,
          sessionId,
          batchId,
          conceptIndex,
          conceptSnapshot: concept as unknown as object,
          decision: "REJECTED",
          rejectionRationale: input.rejectionRationale ?? null,
          decidedBy: actorId,
        },
      });

      await writeMemoryEntry({
        workspaceId,
        actorId,
        memoryType: "STARTUP_REJECTED_IDEA",
        sourceModel: "StartupIdeaCandidate",
        sourceId: candidateId,
        key: `startup_rejected_candidate:${batchId}:${conceptIndex}`,
        summary: `Candidate rejected: ${concept.name ?? "unnamed"} — ${input.rejectionRationale ?? "no rationale"}`,
        data: { batchId, conceptIndex, conceptName: concept.name, rejectionRationale: input.rejectionRationale },
      }, tx);
    }, { timeout: 30000 });
  }

  return { candidateId, ideaId: createdIdeaId };
}

// ─── Evidence Freshness Export ────────────────────────────────────────────────

export interface SessionFreshnessReport {
  freshnessList: FreshnessMeta[];
  conflicts: EvidenceConflict[];
  hasStale: boolean;
  materialConflictCount: number;
}

export async function getEvidenceFreshnessForSession(
  workspaceId: string,
  sessionId: string
): Promise<SessionFreshnessReport> {
  const records = await db.startupEvidenceRecord.findMany({
    where: { workspaceId, sessionId },
    select: {
      id: true, sourceType: true, evidenceType: true, retrievedAt: true,
      expiresAt: true, currentVerificationRequired: true, reliabilityScore: true,
      confidence: true, observedResult: true, hypothesisId: true, materialClaim: true,
    },
  });
  const now = new Date();
  type EvidenceRecordRow = (typeof records)[number];
  const evidenceForEval: EvidenceForEvaluation[] = records.map((e: EvidenceRecordRow) => ({
    id: e.id,
    sourceType: e.sourceType,
    evidenceType: e.evidenceType,
    retrievedAt: e.retrievedAt,
    expiresAt: e.expiresAt ?? null,
    currentVerificationRequired: e.currentVerificationRequired ?? false,
    reliabilityScore: e.reliabilityScore ?? 50,
    confidence: e.confidence ?? 50,
    observedResult: e.observedResult,
    hypothesisId: e.hypothesisId ?? null,
    materialClaim: e.materialClaim ?? null,
  }));
  const freshnessList = classifyAllEvidence(evidenceForEval, now);
  const conflicts = detectEvidenceConflicts(evidenceForEval, freshnessList);
  return {
    freshnessList,
    conflicts,
    hasStale: hasStaleEvidence(freshnessList),
    materialConflictCount: conflicts.filter((c) => c.propagatesToReadiness).length,
  };
}

// ─── Idea Versioning / Revision ───────────────────────────────────────────────

export interface IdeaRevisionInput {
  name?: string;
  industry?: string;
  originData?: Record<string, unknown>;
}

/**
 * Atomically creates a new idea version and supersedes the previous one.
 * Uses SELECT FOR UPDATE to prevent concurrent revisions from branching the version chain.
 */
export async function reviseIdea(
  workspaceId: string,
  sessionId: string,
  ideaId: string,
  actorId: string,
  revisions: IdeaRevisionInput
): Promise<string> {
  const newIdeaId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Lock the existing idea row to prevent concurrent revisions
    const existing = await tx.$queryRaw<{ id: string; version: number; name: string; industry: string; origin_data: unknown; origin_type: string; superseded_by_id: string | null }[]>`
      SELECT id, version, name, industry, origin_data, origin_type, superseded_by_id
      FROM startup_idea_record
      WHERE id = ${ideaId} AND workspace_id = ${workspaceId}
      FOR UPDATE
    `;
    if (existing.length === 0) throw new NotFoundError("StartupIdeaRecord", ideaId);
    const current = existing[0];
    if (current.superseded_by_id != null) {
      throw new ConflictError(`Idea ${ideaId} has already been superseded by ${current.superseded_by_id}`);
    }

    // Create new version
    await tx.startupIdeaRecord.create({
      data: {
        id: newIdeaId,
        workspaceId,
        sessionId,
        name: revisions.name ?? current.name,
        industry: revisions.industry ?? current.industry,
        version: current.version + 1,
        originType: current.origin_type,
        originData: (revisions.originData ?? (current.origin_data as Record<string, unknown> | null)) as object | undefined,
      },
    });

    // Supersede previous version
    await tx.startupIdeaRecord.update({
      where: { id: ideaId },
      data: { supersededById: newIdeaId },
    });

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED,
      payload: { sessionId, ideaId: newIdeaId, previousIdeaId: ideaId, version: current.version + 1 },
    }, tx);

    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.STARTUP_IDEA_REVISED,
      payload: {
        sessionId,
        oldIdeaId: ideaId,
        newIdeaId,
        oldVersion: current.version,
        newVersion: current.version + 1,
      },
    }, tx);
  }, { timeout: 30000 });

  return newIdeaId;
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

/**
 * After a hypothesis is DISCONFIRMED or INCONCLUSIVE, re-derive readiness from current DB state
 * so the new assessment ID invalidates any stored GO approval hash.
 * All inputs are queried from current DB records — no inputs passed by caller.
 */
async function reassessReadinessAfterHypothesisChange(
  workspaceId: string,
  sessionId: string,
  _hypothesisId: string,
  actorId: string
): Promise<void> {
  // Find the primary idea for this session (non-superseded, most recently updated)
  const idea = await db.startupIdeaRecord.findFirst({
    where: { workspaceId, sessionId, supersededById: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, currentReadinessId: true, currentEconomicModelVersionId: true,
    },
  });
  if (!idea) return;

  // Count hypothesis results for this idea
  const hypotheses = await db.startupHypothesis.findMany({
    where: { workspaceId, sessionId, ideaId: idea.id },
    select: { result: true, requiresOwnerApproval: true, hypothesisType: true },
  });
  type HypRow = (typeof hypotheses)[number];
  const critFailed = hypotheses.filter(
    (h: HypRow) => h.result === "DISCONFIRMED" && (h.requiresOwnerApproval || h.hypothesisType === "DEMAND" || h.hypothesisType === "PRICING")
  ).length;
  const critPassed = hypotheses.filter(
    (h: HypRow) => h.result === "CONFIRMED" && (h.requiresOwnerApproval || h.hypothesisType === "DEMAND" || h.hypothesisType === "PRICING")
  ).length;

  // Get economic model if any
  let economicClassification: "VIABLE" | "MARGINAL" | "UNVIABLE" | "INSUFFICIENT_DATA" | null = null;
  let cashRunwayMonths: number | null = null;
  let breakEvenMonths: number | null = null;
  if (idea.currentEconomicModelVersionId) {
    const econModel = await db.startupEconomicModel.findFirst({
      where: { id: idea.currentEconomicModelVersionId, workspaceId },
      select: { economicClassification: true, cashRunwayMonths: true, breakEvenMonths: true },
    });
    if (econModel) {
      economicClassification = econModel.economicClassification as typeof economicClassification;
      cashRunwayMonths = econModel.cashRunwayMonths;
      breakEvenMonths = econModel.breakEvenMonths;
    }
  }

  // Count evidence by type
  const evidence = await db.startupEvidenceRecord.findMany({
    where: { workspaceId, sessionId, ideaId: idea.id },
    select: { evidenceType: true },
  });
  type EvRow = (typeof evidence)[number];
  const problemCount = evidence.filter((e: EvRow) => e.evidenceType === "PROBLEM_EVIDENCE").length;
  const customerCount = evidence.filter((e: EvRow) => e.evidenceType === "CUSTOMER_DEMAND").length;
  const wtpCount = evidence.filter((e: EvRow) => e.evidenceType === "WILLINGNESS_TO_PAY").length;

  // Evaluate freshness + conflicts for gate 7 and 8
  const { hasStale, materialConflictCount } = await getEvidenceFreshnessForSession(workspaceId, sessionId);

  const inputs: ReadinessInputs = {
    problemEvidenceCount: problemCount,
    customerEvidenceCount: customerCount,
    wtpEvidenceCount: wtpCount,
    deliveryTrialCompleted: false,
    acquisitionChannelTested: false,
    economicClassification,
    cashRunwayMonths,
    breakEvenMonths,
    supplierQuoteObtained: false,
    regulatoryCheckCompleted: false,
    licenceRequired: null,
    licenceObtained: null,
    ownerHoursAvailable: null,
    capitalAvailableCents: null,
    startupCostCents: null,
    criticalHypothesesPassed: critPassed,
    criticalHypothesesFailed: critFailed,
    hasStaleMaterialEvidence: hasStale,
    materialConflictCount,
  };

  await assessAndPersistReadiness(workspaceId, sessionId, idea.id, actorId, inputs);
}

// ─── G2: Canonical Execution Authorization Gate ───────────────────────────────

export interface ExecutionAuthorizationInput {
  sessionId: string;
  blueprintId: string;
  planId: string;
  ownerDecisionId: string;
  ideaId: string;
  /** The specific action being authorized — checked against permittedActions/prohibitedActions */
  actionType: string;
  /** Spending amount in cents for this action (if applicable) */
  spendingCents?: bigint | null;
}

export interface ExecutionAuthorizationResult {
  authorized: boolean;
  violations: string[];
  approvalPackageHash: string | null;
  checkedAt: Date;
}

/**
 * Canonical execution gate called before every task start, resource allocation,
 * spending action, external action initiation, and outcome recording.
 * Fails closed: any unknown or missing record → NOT authorized.
 * All 20 checks are independent — all violations accumulated, not short-circuit.
 *
 * `client` — pass a Prisma.TransactionClient to run all reads inside the caller's
 * mutation transaction, eliminating the TOCTOU gap between the authorization check
 * and the protected DB write. Defaults to the shared db singleton for standalone calls.
 */
export async function assertStartupExecutionAuthorization(
  workspaceId: string,
  input: ExecutionAuthorizationInput,
  client: Prisma.TransactionClient | typeof db = db
): Promise<ExecutionAuthorizationResult> {
  const violations: string[] = [];
  const now = new Date();

  // Load all required records in parallel
  const [session, blueprint, plan, decision, ideaRecord] = await Promise.all([
    client.ownerStartupSession.findFirst({
      where: { id: input.sessionId, workspaceId },
      select: { id: true, status: true, currentOwnerDecisionId: true, currentBlueprintId: true },
    }),
    client.startupExecutionBlueprint.findFirst({
      where: { id: input.blueprintId, workspaceId },
      select: { id: true, blueprintStatus: true, ownerDecisionId: true, sessionId: true, ideaId: true },
    }),
    client.startupExecutionPlan.findFirst({
      where: { id: input.planId, workspaceId },
      select: {
        id: true, status: true, spendingLimitCents: true, startDate: true, targetDate: true,
        stopConditions: true, approvalPackageHash: true, blueprintId: true,
      },
    }),
    client.startupOwnerDecision.findFirst({
      where: { id: input.ownerDecisionId, workspaceId },
      select: {
        id: true, decisionType: true, validUntil: true, reviewDate: true,
        spendingLimitCents: true, permittedActions: true, prohibitedActions: true,
        packageHashSha256: true, supersededById: true, hashVersion: true, policyVersion: true,
        linkedIdeaVersionId: true,
      },
    }),
    client.startupIdeaRecord.findFirst({
      where: { id: input.ideaId, workspaceId },
      select: { supersededById: true },
    }),
  ]);

  // G2-1: Session must exist and be in workspace
  if (!session) {
    return {
      authorized: false,
      violations: ["Session not found or cross-workspace access denied"],
      approvalPackageHash: null,
      checkedAt: now,
    };
  }

  // G2-2: Session must be in EXECUTION_PLANNED status
  if (session.status !== "EXECUTION_PLANNED") {
    violations.push(`Session status is ${session.status} — must be EXECUTION_PLANNED to authorize execution`);
  }

  // G2-3: Blueprint must exist and belong to this session/idea
  if (!blueprint) {
    violations.push("Execution blueprint not found");
  } else {
    if (blueprint.sessionId !== input.sessionId) violations.push("Blueprint belongs to a different session");
    if (blueprint.ideaId !== input.ideaId) violations.push("Blueprint belongs to a different idea");
    // G2-4: Blueprint must not be superseded
    if (blueprint.blueprintStatus === "SUPERSEDED") violations.push("Blueprint has been superseded — reapproval required before execution");
    if (blueprint.blueprintStatus !== "ACTIVE") violations.push(`Blueprint status is ${blueprint.blueprintStatus} — must be ACTIVE`);
  }

  // G2-3a: Idea must not have been superseded by a revision
  // reviseIdea() creates a new StartupIdeaRecord with a new ID and marks the old one
  // supersededById. If the approved idea was later revised, the blueprint/decision were
  // created for the OLD idea — execution must not proceed until the owner re-approves for
  // the new idea version.
  if (!ideaRecord) {
    violations.push(`Idea ${input.ideaId} not found in this workspace`);
  } else if (ideaRecord.supersededById) {
    violations.push(
      `Idea has been revised — this blueprint and decision were created for the superseded idea version. Reapproval for the new idea revision is required before execution.`
    );
  }

  // G2-5: Plan must exist and be active
  if (!plan) {
    violations.push("Execution plan not found");
  } else {
    if (plan.status !== "ACTIVE") violations.push(`Execution plan status is ${plan.status} — must be ACTIVE`);
    // G2-6: Plan must reference the same blueprint
    if (plan.blueprintId !== input.blueprintId) violations.push("Execution plan references a different blueprint");
    // G2-7: Plan start date must not be in the future
    if (plan.startDate && plan.startDate > now) {
      violations.push(`Execution plan start date is in the future (${plan.startDate.toISOString()}) — execution not yet permitted`);
    }
    // G2-8: Plan target date must not have elapsed without plan completion
    if (plan.targetDate && plan.targetDate < now && plan.status === "ACTIVE") {
      violations.push(`Execution plan target date has elapsed (${plan.targetDate.toISOString()}) — plan requires review`);
    }
  }

  // G2-9: Owner decision must exist and be a GO decision
  if (!decision) {
    violations.push("Owner decision not found");
  } else {
    if (decision.decisionType !== "GO") {
      violations.push(`Owner decision type is ${decision.decisionType} — must be GO to authorize execution`);
    }
    // G2-10: Decision must not be superseded
    if (decision.supersededById) {
      violations.push("Owner decision has been superseded — new reapproval required");
    }
    // G2-11: Session's current decision must match the provided ownerDecisionId
    if (session.currentOwnerDecisionId !== input.ownerDecisionId) {
      violations.push("Provided ownerDecisionId is not the session's current GO decision");
    }
    // G2-12: Blueprint's decision must match
    if (blueprint && blueprint.ownerDecisionId !== input.ownerDecisionId) {
      violations.push("Blueprint was created under a different owner decision than currently provided");
    }
    // G2-13: Decision validity period
    if (decision.validUntil && decision.validUntil < now) {
      violations.push(`Owner decision expired at ${decision.validUntil.toISOString()} — reapproval required`);
    }
    // G2-14: Review date reminder (warning, not blocking — but emitted as violation for visibility)
    if (decision.reviewDate && decision.reviewDate < now) {
      violations.push(`Owner decision review date has elapsed (${decision.reviewDate.toISOString()}) — decision should be reviewed`);
    }
  }

  // G2-15: Approval package hash must match current state (staleness check)
  if (decision && session && violations.filter((v) => v.includes("superseded") || v.includes("not found")).length === 0) {
    const currentState = await loadCanonicalCurrentApprovalState(workspaceId, input.sessionId, input.ideaId, client);
    const staleness = await checkApprovalStaleness(workspaceId, input.sessionId, currentState, client);
    if (staleness.isStale) {
      violations.push(
        `Approval package is stale — changed inputs: ${staleness.changedInputs.join(", ")}. Reapproval required.`
      );
    }
    // G2-16: Plan's stored approval hash must also match the decision hash (guards plan tampering)
    if (plan?.approvalPackageHash && decision.packageHashSha256 && plan.approvalPackageHash !== decision.packageHashSha256) {
      violations.push("Execution plan approval hash does not match current owner decision hash — plan must be re-issued");
    }
  }

  // G2-17: Action must be in permitted list (if permittedActions is non-empty)
  if (decision) {
    const permitted = (decision.permittedActions as string[]) ?? [];
    const prohibited = (decision.prohibitedActions as string[]) ?? [];
    if (permitted.length > 0 && !permitted.includes(input.actionType) && !permitted.includes("*")) {
      violations.push(`Action "${input.actionType}" is not in the permitted actions list for this GO decision`);
    }
    // G2-18: Action must not be in prohibited list
    if (prohibited.includes(input.actionType)) {
      violations.push(`Action "${input.actionType}" is explicitly prohibited by this GO decision`);
    }
  }

  // G2-19: Spending limit check
  if (input.spendingCents != null) {
    if (decision?.spendingLimitCents && input.spendingCents > decision.spendingLimitCents) {
      violations.push(
        `Spending $${(Number(input.spendingCents) / 100).toFixed(2)} exceeds GO decision spending limit $${(Number(decision.spendingLimitCents) / 100).toFixed(2)}`
      );
    }
    if (plan?.spendingLimitCents && input.spendingCents > plan.spendingLimitCents) {
      violations.push(
        `Spending $${(Number(input.spendingCents) / 100).toFixed(2)} exceeds execution plan spending limit $${(Number(plan.spendingLimitCents) / 100).toFixed(2)}`
      );
    }
  }

  // G2-20: Session's current blueprint must be the one we're authorizing against
  if (session.currentBlueprintId && session.currentBlueprintId !== input.blueprintId) {
    violations.push("Session's current blueprint differs from the provided blueprintId — use the current blueprint");
  }

  return {
    authorized: violations.length === 0,
    violations,
    approvalPackageHash: decision?.packageHashSha256 ?? null,
    checkedAt: now,
  };
}

/** Emits STARTUP_EXECUTION_AUTHORIZATION_DENIED audit event. Safe to call after the gate fails. */
export async function emitStartupAuthorizationDenied(
  workspaceId: string,
  sessionId: string,
  actorId: string | null,
  actionType: string,
  violations: string[]
): Promise<void> {
  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.STARTUP_EXECUTION_AUTHORIZATION_DENIED,
    actorId: actorId ?? undefined,
    payload: { sessionId, actionType, violations },
  });
}
