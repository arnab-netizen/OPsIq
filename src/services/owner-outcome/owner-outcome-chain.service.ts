/**
 * Canonical owner outcome spine — assessment persistence and chain read model.
 *
 * Not a verification engine. Each snapshot is produced by: persisted source facts → the EXISTING adapters
 * (`domainActionToOutcomeInput` / `processOutcomeToOutcomeInput`) → `assessOwnerOutcome()` → one immutable row.
 * Callers pass only references (a candidate id or a process-task key); every conclusion is server-derived, so no
 * client can submit "IMPROVED" or "RESOLVED". Source rows are never changed.
 *
 * History: rows are append-only and versioned per chain (UNIQUE(workspace, chain, version), highest = current). A
 * racing writer loses on the unique key, re-reads, and either returns the identical snapshot or appends after it.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { assessOwnerOutcome, type OutcomeLearningGateResult, type OwnerOutcomeDomain, type OwnerOutcomeInput } from "@/domain/owner-spine/owner-outcome-policy";
import {
  parseOwnerCandidateId,
  type OwnerDecisionState,
  type ParsedCandidateId,
  type SystemADomain,
} from "@/domain/owner-spine/owner-decision-record";
import {
  OWNER_OUTCOME_POLICY_VERSION,
  assessmentFingerprint,
  chainKeyForCandidate,
  chainKeyForLegacyProcessTask,
  commitmentFidelityFor,
  directionOrUnknown,
  serializeOutcomeInput,
  type OutcomeLinks,
  type OutcomeSourceSystem,
} from "@/domain/owner-spine/owner-outcome-spine";
import { assertOwnerBusiness, getLatestOwnerDecision, resolveCandidate, type OutcomeDbClient, type OwnerDecisionRecordView } from "./owner-decision.service";
import { loadProcessTask, loadSystemAAction, loadSystemAInput, loadSystemBInput, type Row } from "./outcome-sources";

type Tx = Prisma.TransactionClient;
type AssessmentRow = Awaited<ReturnType<Tx["ownerOutcomeAssessment"]["findFirstOrThrow"]>>;
export type OwnerOutcomeAssessmentView = AssessmentRow;

const MAX_ATTEMPTS = 4;
const isUniqueViolation = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export type OutcomeChainRef = { candidateId: string } | { processTaskKey: string };

export interface AssessDeps {
  now?: () => Date;
  /** The Prisma client to run on (defaults to the shared `db`; tests inject independent connections to force real interleavings). */
  client?: OutcomeDbClient;
  /**
   * An ACTUAL result of the existing learning gate, supplied only by a server-side caller that really ran it with real
   * persisted facts. No API accepts it; Core itself never runs or fabricates the gate.
   */
  learningGate?: OutcomeLearningGateResult | null;
}

interface ChainTarget {
  chainKey: string;
  domain: string;
  canonicalActionId: string;
  parsed: ParsedCandidateId | null;
  decision: OwnerDecisionRecordView | null;
  /** The process task explicitly linked to this chain (by a prior snapshot), or the task being assessed as a legacy chain. */
  taskRow: Row | null;
  /** An explicit link being created by this call. */
  linkingTask: boolean;
}

const notFound = (what: string, id: string): NotFoundError => new NotFoundError(what, id);

async function latestAssessment(tx: Pick<Tx, "ownerOutcomeAssessment">, ws: string, chainKey: string): Promise<AssessmentRow | null> {
  return tx.ownerOutcomeAssessment.findFirst({ where: { workspaceId: ws, chainKey }, orderBy: { version: "desc" } });
}

/** Resolve a chain reference to its deterministic chain key, decision and (explicitly linked) process task. */
async function resolveTarget(ws: string, biz: string, ref: OutcomeChainRef, c: OutcomeDbClient): Promise<ChainTarget> {
  if ("candidateId" in ref) {
    const parsed = parseOwnerCandidateId(ref.candidateId);
    if (!parsed) {
      throw new ValidationError("candidateId is not a canonical persisted decision candidate.", { fieldErrors: [{ path: "candidateId", message: "Not a canonical persisted candidate id" }] });
    }
    const chainKey = chainKeyForCandidate(parsed.candidateId);
    const decision = await getLatestOwnerDecision(ws, biz, parsed.candidateId, c);
    let taskRow: Row | null = null;
    if (parsed.source === "compliance_item") {
      const prior = await latestAssessment(c as never, ws, chainKey);
      if (prior?.processTaskId) taskRow = await loadProcessTask(c as never, ws, biz, { taskId: prior.processTaskId });
    }
    return { chainKey, domain: parsed.domain, canonicalActionId: parsed.sourceId, parsed, decision, taskRow, linkingTask: false };
  }
  const task = await loadProcessTask(c as never, ws, biz, { taskKey: ref.processTaskKey });
  if (!task) throw notFound("ProcessExecutionTask", ref.processTaskKey);
  // A task already linked to a decision chain is assessed on THAT chain; otherwise it is its own (undecided) legacy chain.
  const linked = await c.ownerOutcomeAssessment.findFirst({
    where: { workspaceId: ws, businessId: biz, processTaskId: String(task.id), ownerDecisionId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (linked) {
    const parsed = parseOwnerCandidateId(linked.chainKey);
    const decision = await getLatestOwnerDecision(ws, biz, linked.chainKey, c);
    return { chainKey: linked.chainKey, domain: linked.domain, canonicalActionId: linked.canonicalActionId, parsed, decision, taskRow: task, linkingTask: false };
  }
  return { chainKey: chainKeyForLegacyProcessTask(String(task.id)), domain: "process_execution", canonicalActionId: String(task.taskKey), parsed: null, decision: null, taskRow: task, linkingTask: false };
}

/** Facts only a commitment can supply when no execution source is linked (everything else stays unknown/null). */
function commitmentOnlyInput(decision: OwnerDecisionRecordView | null, domain: OwnerOutcomeDomain, canonicalActionId: string, now: Date): OwnerOutcomeInput {
  return {
    domain, // the chain's real domain (e.g. "compliance"), identical to the row's domain and the candidate's
    actionId: canonicalActionId,
    executionStatus: "NOT_STARTED",
    completedAt: null,
    verificationMetric: decision?.verificationMetric ?? null,
    baselineValue: decision?.baselineValue ?? null,
    baselineProvenance: decision?.baselineValue != null && decision.baselineProvenance ? (decision.baselineProvenance as OwnerOutcomeInput["baselineProvenance"]) : "UNKNOWN",
    afterValue: null,
    afterProvenance: "NONE",
    afterMeasuredAt: null,
    direction: directionOrUnknown(decision?.targetDirection === "up" || decision?.targetDirection === "down" ? decision.targetDirection : null),
    targetValue: decision?.targetValue ?? null,
    windowDays: decision?.observationWindowDays ?? null,
    disputed: false,
    externalEvent: false,
    verifierKind: "NONE",
    verificationAttempted: false,
    verifiedAt: null,
    causalAssessment: null,
    newerDiagnosis: null,
    learningLoop: "NONE",
    learningGate: null,
    now,
  };
}

interface BuiltSnapshot {
  input: OwnerOutcomeInput;
  links: OutcomeLinks;
  system: OutcomeSourceSystem;
  sourceLinkState: "LINKED" | "NO_EXECUTION_SOURCE_LINKED";
}

async function buildSnapshot(ws: string, biz: string, t: ChainTarget, deps: AssessDeps, now: Date, c: OutcomeDbClient): Promise<BuiltSnapshot> {
  const base: OutcomeLinks = {
    ownerDecisionId: t.decision?.id ?? null, sourceSystem: "NONE", systemAActionId: null, systemAVerificationId: null,
    processTaskId: null, processTaskKey: null, ownerActionOutcomeId: null, reassessmentEventId: null, learningCandidateRef: null,
    newerDiagnosisDomain: null, newerDiagnosisCycleId: null, newerDiagnosisEvidenceAsOf: null,
  };
  let built: BuiltSnapshot;
  if (t.parsed?.source === "domain_action") {
    const action = await loadSystemAAction(c as never, ws, biz, t.parsed.domain as SystemADomain, t.parsed.sourceId);
    if (!action) throw notFound("OwnerDecisionCandidate", t.parsed.candidateId);
    const a = await loadSystemAInput(c as never, ws, biz, t.parsed.domain as SystemADomain, action, now);
    built = { input: a.input, links: { ...base, ...a.links, sourceSystem: "SYSTEM_A" }, system: "SYSTEM_A", sourceLinkState: "LINKED" };
  } else if (t.taskRow) {
    const b = await loadSystemBInput(c as never, ws, biz, t.taskRow, t.decision && (t.decision.decisionState === "ACCEPTED" || t.decision.decisionState === "MODIFIED") ? t.decision : null, t.domain as OwnerOutcomeDomain, now);
    built = { input: b.input, links: { ...base, ...b.links, sourceSystem: "SYSTEM_B" }, system: "SYSTEM_B", sourceLinkState: "LINKED" };
  } else {
    // A compliance commitment with no linked execution source: explicit "no source", never a guessed one.
    if (t.parsed?.source === "compliance_item") {
      const item = await c.ownerComplianceItem.findFirst({ where: { id: t.parsed.sourceId, workspaceId: ws, businessId: biz }, select: { id: true } });
      if (!item) throw notFound("OwnerDecisionCandidate", t.parsed.candidateId);
    }
    built = { input: commitmentOnlyInput(t.decision && (t.decision.decisionState === "ACCEPTED" || t.decision.decisionState === "MODIFIED") ? t.decision : null, t.domain as OwnerOutcomeDomain, t.canonicalActionId, now), links: base, system: "NONE", sourceLinkState: "NO_EXECUTION_SOURCE_LINKED" };
  }
  if (deps.learningGate) built.input.learningGate = deps.learningGate;
  return built;
}

export interface AssessResult {
  assessment: OwnerOutcomeAssessmentView;
  /** True when a new version was written; false when the identical snapshot already existed (retry / race). */
  created: boolean;
}

async function appendAssessment(
  ws: string, actorId: string | null, biz: string, t: ChainTarget, built: BuiltSnapshot, now: Date, c: OutcomeDbClient, opts: { lockTaskId?: string; auditLink?: boolean } = {}
): Promise<AssessResult> {
  const assessment = assessOwnerOutcome(built.input); // semantic authority: the only source of every conclusion below
  const fingerprint = assessmentFingerprint({ chainKey: t.chainKey, links: built.links, input: built.input, assessment });
  const state: OwnerDecisionState | null = (t.decision?.decisionState as OwnerDecisionState | undefined) ?? null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await c.$transaction(async (tx: Tx) => {
        if (opts.lockTaskId) {
          // Serialize competing links of the same task; one execution source belongs to exactly one commitment (the task's
          // own undecided legacy chain is history, not a competing commitment).
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${opts.lockTaskId}))`;
          const other = await tx.ownerOutcomeAssessment.findFirst({ where: { workspaceId: ws, processTaskId: opts.lockTaskId, ownerDecisionId: { not: null }, NOT: { chainKey: t.chainKey } } });
          if (other) throw new ConflictError("This process task is already linked to a different commitment.");
        }
        const latest = await latestAssessment(tx, ws, t.chainKey);
        if (opts.lockTaskId && latest?.processTaskId && latest.processTaskId !== opts.lockTaskId) {
          throw new ConflictError("This commitment already has a different process task linked; one execution source per commitment.");
        }
        if (latest && latest.assessmentFingerprint === fingerprint) return { assessment: latest, created: false };

        const row = await tx.ownerOutcomeAssessment.create({
          data: {
            id: randomUUID(), workspaceId: ws, businessId: biz, chainKey: t.chainKey,
            version: (latest?.version ?? 0) + 1, previousAssessmentId: latest?.id ?? null,
            ownerDecisionId: t.decision?.id ?? null, ownerDecisionState: state,
            commitmentFidelity: commitmentFidelityFor(state),
            decisionLinkState: t.decision ? "LINKED" : "UNLINKED_NO_DECISION",
            sourceSystem: built.system, sourceLinkState: built.sourceLinkState,
            domain: t.domain, canonicalActionId: t.canonicalActionId,
            systemAActionId: built.links.systemAActionId, systemAVerificationId: built.links.systemAVerificationId,
            processTaskId: built.links.processTaskId, processTaskKey: built.links.processTaskKey,
            ownerActionOutcomeId: built.links.ownerActionOutcomeId, reassessmentEventId: built.links.reassessmentEventId,
            learningCandidateRef: built.links.learningCandidateRef,
            newerDiagnosisDomain: built.links.newerDiagnosisDomain, newerDiagnosisCycleId: built.links.newerDiagnosisCycleId,
            newerDiagnosisEvidenceAsOf: built.links.newerDiagnosisEvidenceAsOf,
            policyVersion: OWNER_OUTCOME_POLICY_VERSION, assessedAt: now, assessedById: actorId,
            executionStatus: assessment.executionStatus, observationStatus: assessment.observationStatus,
            measurementResult: assessment.measurementResult, targetAttainment: assessment.targetAttainment,
            issueResolution: assessment.issueResolution, causalAttribution: assessment.causalAttribution,
            learningEligibility: assessment.learningEligibility, verificationStatus: assessment.verificationStatus,
            evidenceQuality: assessment.evidenceQuality, verifierKind: built.input.verifierKind,
            independentlyVerified: assessment.independentlyVerified, selfVerified: assessment.selfVerified,
            disputed: assessment.disputed, externalInterference: assessment.externalInterference,
            measuredAt: assessment.measuredAt, verifiedAt: assessment.verifiedAt,
            learningBlockers: assessment.learningBlockers, nextVerificationAction: assessment.nextVerificationAction,
            inputSnapshot: serializeOutcomeInput(built.input) as Prisma.InputJsonValue, assessmentFingerprint: fingerprint,
          },
        });
        // Audit carries ids, states and provenance only — never metric values.
        await emitAuditEvent(
          {
            eventName: AUDIT_EVENTS.OWNER_OUTCOME_ASSESSMENT_RECORDED, actorId: actorId ?? undefined, workspaceId: ws,
            entityType: "owner_outcome_assessment", entityId: row.id, visibility: "internal",
            payload: {
              businessId: biz, chainKey: t.chainKey, version: row.version, ownerDecisionId: row.ownerDecisionId, sourceSystem: row.sourceSystem,
              executionStatus: row.executionStatus, observationStatus: row.observationStatus, measurementResult: row.measurementResult,
              targetAttainment: row.targetAttainment, issueResolution: row.issueResolution, causalAttribution: row.causalAttribution,
              learningEligibility: row.learningEligibility, policyVersion: row.policyVersion,
            },
          },
          tx
        );
        if (opts.auditLink) {
          await emitAuditEvent(
            {
              eventName: AUDIT_EVENTS.OWNER_OUTCOME_SOURCE_LINKED, actorId: actorId ?? undefined, workspaceId: ws,
              entityType: "owner_outcome_assessment", entityId: row.id, visibility: "internal",
              payload: { businessId: biz, chainKey: t.chainKey, ownerDecisionId: row.ownerDecisionId, processTaskId: row.processTaskId, sourceSystem: row.sourceSystem },
            },
            tx
          );
        }
        return { assessment: row, created: true };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }
  throw new ConflictError("The assessment could not be recorded because of concurrent updates; please retry.");
}

/** Assess the chain from its persisted sources and append the snapshot (idempotent for identical facts and conclusions). */
export async function assessPersistedOwnerOutcome(
  workspaceId: string, actorId: string | null, businessId: string, ref: OutcomeChainRef, deps: AssessDeps = {}
): Promise<AssessResult> {
  const c = deps.client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, c);
  const now = (deps.now ?? (() => new Date()))();
  const target = await resolveTarget(workspaceId, businessId, ref, c);
  if (target.parsed?.source === "compliance_item" && !target.decision) {
    throw new ValidationError("No owner decision is recorded for this candidate, so there is no commitment to assess.", { fieldErrors: [{ path: "candidateId", message: "No decision recorded" }] });
  }
  const built = await buildSnapshot(workspaceId, businessId, target, deps, now, c);
  return appendAssessment(workspaceId, actorId, businessId, target, built, now, c);
}

/**
 * Explicitly link a persisted process task to a decision's chain. Allowed only for commitments whose execution is NOT
 * a System A action (those carry their own); both rows must be inside the caller's workspace and business. Never by
 * text, metric name or timestamp. Writes a new snapshot version carrying the link.
 */
export async function linkProcessTaskToDecision(
  workspaceId: string, actorId: string, businessId: string, input: { candidateId: string; processTaskKey: string }, deps: AssessDeps = {}
): Promise<AssessResult> {
  const c = deps.client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, c);
  const now = (deps.now ?? (() => new Date()))();
  const parsed = parseOwnerCandidateId(input.candidateId);
  if (!parsed) throw new ValidationError("candidateId is not a canonical persisted decision candidate.", { fieldErrors: [{ path: "candidateId", message: "Not a canonical persisted candidate id" }] });
  if (parsed.source === "domain_action") {
    throw new ValidationError("A domain action carries its own execution and verification; a process task cannot be linked to it.", { fieldErrors: [{ path: "candidateId", message: "System A candidates cannot link a process task" }] });
  }
  await resolveCandidate(workspaceId, businessId, parsed.candidateId, now, { enforceDecidable: false, client: c });
  const decision = await getLatestOwnerDecision(workspaceId, businessId, parsed.candidateId, c);
  if (!decision || (decision.decisionState !== "ACCEPTED" && decision.decisionState !== "MODIFIED")) {
    throw new ValidationError("A process task can only be linked to a candidate the owner has ACCEPTED or MODIFIED.", { fieldErrors: [{ path: "candidateId", message: "No ACCEPTED/MODIFIED decision" }] });
  }
  const task = await loadProcessTask(c as never, workspaceId, businessId, { taskKey: input.processTaskKey });
  if (!task) throw notFound("ProcessExecutionTask", input.processTaskKey);
  const target: ChainTarget = {
    chainKey: chainKeyForCandidate(parsed.candidateId), domain: parsed.domain, canonicalActionId: parsed.sourceId,
    parsed, decision, taskRow: task, linkingTask: true,
  };
  const built = await buildSnapshot(workspaceId, businessId, target, deps, now, c);
  return appendAssessment(workspaceId, actorId, businessId, target, built, now, c, { lockTaskId: String(task.id), auditLink: true });
}

export interface OwnerOutcomeChainView {
  chainKey: string;
  businessId: string;
  /** Every decision on the candidate, oldest first (empty for an undecided legacy chain). */
  decisions: OwnerDecisionRecordView[];
  currentDecision: OwnerDecisionRecordView | null;
  /** What OpsIQ recommended (immutable snapshot of the current decision) vs what the owner committed to, side by side. */
  commitment: {
    decisionState: string | null;
    recommendationSnapshot: unknown;
    ownerCommitmentDescription: string | null;
    followsRecommendedAction: boolean | null;
  } | null;
  /** Every assessment version, oldest first; none is ever overwritten. */
  assessments: OwnerOutcomeAssessmentView[];
  currentAssessment: OwnerOutcomeAssessmentView | null;
}

/** Read one chain (decisions + assessment history). Workspace + business scoped; a foreign or unknown chain is one uniform 404. */
export async function getOwnerOutcomeChain(workspaceId: string, businessId: string, ref: OutcomeChainRef, client?: OutcomeDbClient): Promise<OwnerOutcomeChainView> {
  const c = client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, c);
  let chainKey: string;
  if ("candidateId" in ref) {
    const parsed = parseOwnerCandidateId(ref.candidateId);
    if (!parsed) throw new ValidationError("candidateId is not a canonical persisted decision candidate.", { fieldErrors: [{ path: "candidateId", message: "Not a canonical persisted candidate id" }] });
    chainKey = chainKeyForCandidate(parsed.candidateId);
  } else {
    const task = await loadProcessTask(c as never, workspaceId, businessId, { taskKey: ref.processTaskKey });
    if (!task) throw notFound("ProcessExecutionTask", ref.processTaskKey);
    const linked = await c.ownerOutcomeAssessment.findFirst({
      where: { workspaceId, businessId, processTaskId: String(task.id), ownerDecisionId: { not: null } }, orderBy: { createdAt: "desc" },
    });
    chainKey = linked ? linked.chainKey : chainKeyForLegacyProcessTask(String(task.id));
  }
  const [decisions, assessments] = await Promise.all([
    c.ownerDecisionRecord.findMany({ where: { workspaceId, businessId, candidateId: chainKey }, orderBy: { sequence: "asc" } }),
    c.ownerOutcomeAssessment.findMany({ where: { workspaceId, businessId, chainKey }, orderBy: { version: "asc" } }),
  ]);
  if (decisions.length === 0 && assessments.length === 0) throw notFound("OwnerOutcomeChain", chainKey);
  const currentDecision = decisions.length > 0 ? decisions[decisions.length - 1] : null;
  return {
    chainKey, businessId, decisions, currentDecision,
    commitment: currentDecision
      ? {
          decisionState: currentDecision.decisionState,
          recommendationSnapshot: currentDecision.recommendationSnapshot,
          ownerCommitmentDescription: currentDecision.commitmentDescription,
          followsRecommendedAction: currentDecision.decisionState === "ACCEPTED" ? true : currentDecision.decisionState === "MODIFIED" ? false : null,
        }
      : null,
    assessments,
    currentAssessment: assessments.length > 0 ? assessments[assessments.length - 1] : null,
  };
}
