/**
 * Owner decision / commitment persistence.
 *
 * Records the owner's response (ACCEPTED / REJECTED / DEFERRED / MODIFIED) to a canonical, persisted decision
 * candidate. The server — never the client — resolves the candidate from the database inside the caller's workspace
 * AND business and builds the immutable recommendation snapshot from that row. Rows are append-only (DB trigger): a
 * later decision on the same candidate is a new sequence number that supersedes, never rewrites.
 *
 * Idempotency is enforced by the database, not by check-then-insert:
 *   - UNIQUE(workspace, business, candidate, sequence): two racing first decisions cannot both be sequence 1;
 *   - the loser re-reads and, when the latest decision is the same event (same actor, candidate and content), returns it;
 *   - an optional client idempotency key (UNIQUE per workspace) makes an explicit retry return the original row.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS, type AuditEventName } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import {
  OWNER_DECISION_RECORD_CONTRACT_VERSION,
  decisionRequestFingerprint,
  normalizeDecisionBody,
  parseOwnerCandidateId,
  type NormalizedDecisionBody,
  type OwnerDecisionState,
  type ParsedCandidateId,
  type RecordOutcomeContractInput,
  type RecordOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision-record";
import { loadSystemAAction, SYSTEM_A_SPECS } from "./outcome-sources";
import type { SystemADomain } from "@/domain/owner-spine/owner-decision-record";

type Tx = Prisma.TransactionClient;
/** The Prisma client the services run on. Defaults to the shared `db`; tests inject independent connections to force real interleavings. */
export type OutcomeDbClient = typeof db;
type DecisionRow = Awaited<ReturnType<Tx["ownerDecisionRecord"]["findFirstOrThrow"]>>;
export type OwnerDecisionRecordView = DecisionRow;

/**
 * Candidate-level serialization key. EVERY writer of a candidate's decision history (a new decision, an amended outcome
 * contract) takes this transaction-scoped advisory lock first (same `pg_advisory_xact_lock` convention as the beta cap),
 * re-reads the latest decision under it, applies its own precondition, and only then appends. The lock is released on
 * commit or rollback. Uniqueness of `sequence` alone would stop duplicate numbers but not an invalid state transition.
 */
export function ownerCandidateLockKey(workspaceId: string, businessId: string, candidateId: string): string {
  return `owner_decision:${workspaceId}:${businessId}:${candidateId}`;
}
export async function lockOwnerCandidate(tx: Pick<Tx, "$executeRaw">, workspaceId: string, businessId: string, candidateId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerCandidateLockKey(workspaceId, businessId, candidateId)}, 0))`;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled"]);
const MAX_ATTEMPTS = 4;

export interface DecisionDeps {
  now?: () => Date;
  client?: OutcomeDbClient;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Uniform "not found" for any candidate that is missing OR outside the caller's workspace/business. */
function candidateNotFound(candidateId: string): NotFoundError {
  return new NotFoundError("OwnerDecisionCandidate", candidateId);
}

export async function assertOwnerBusiness(workspaceId: string, businessId: string, client: OutcomeDbClient = db): Promise<void> {
  const business = await client.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
}

export interface ResolvedCandidate {
  parsed: ParsedCandidateId;
  findingCode: string | null;
  recommendationCode: string | null;
  snapshot: Record<string, unknown>;
}

/** Resolve a canonical candidate id to its persisted source (workspace + business scoped) and build the immutable snapshot. */
export async function resolveCandidate(
  workspaceId: string, businessId: string, candidateId: string, capturedAt: Date, opts: { enforceDecidable?: boolean; client?: OutcomeDbClient } = {}
): Promise<ResolvedCandidate> {
  const client = opts.client ?? db;
  const parsed = parseOwnerCandidateId(candidateId);
  if (!parsed) {
    throw new ValidationError("candidateId is not a canonical persisted decision candidate (domain_action:<domain>:<id> or compliance_item:<id>).", {
      fieldErrors: [{ path: "candidateId", message: "Not a canonical persisted candidate id" }],
    });
  }
  if (parsed.source === "domain_action") {
    const action = await loadSystemAAction(client as never, workspaceId, businessId, parsed.domain as SystemADomain, parsed.sourceId);
    if (!action) throw candidateNotFound(candidateId);
    if (opts.enforceDecidable !== false) assertDecidable(String(action.status));
    const spec = SYSTEM_A_SPECS[parsed.domain as SystemADomain];
    const snapshot = {
      candidateId, source: parsed.source, domain: parsed.domain, sourceId: parsed.sourceId, capturedAt: capturedAt.toISOString(),
      title: action.title ?? null, description: action.description ?? null,
      findingCode: action.findingCode ?? null, recommendationCode: action.recommendationCode ?? null, findingId: action.findingId ?? null,
      cycleId: action.cycleId ?? null, status: action.status,
      verificationMetric: (spec.recovery ? action.metricToMove : action.verificationMetric) ?? null,
      expectedTimeframeDays: action.expectedTimeframeDays ?? action.verificationWindowDays ?? null,
      sourceUpdatedAt: action.updatedAt instanceof Date ? action.updatedAt.toISOString() : null,
    };
    return { parsed, findingCode: strOrNull(action.findingCode), recommendationCode: strOrNull(action.recommendationCode), snapshot };
  }
  const item = await client.ownerComplianceItem.findFirst({ where: { id: parsed.sourceId, workspaceId, businessId } });
  if (!item) throw candidateNotFound(candidateId);
  const snapshot = {
    candidateId, source: parsed.source, domain: parsed.domain, sourceId: parsed.sourceId, capturedAt: capturedAt.toISOString(),
    kind: item.kind, name: item.name, status: item.status, expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    sourceUpdatedAt: item.updatedAt.toISOString(),
  };
  return { parsed, findingCode: null, recommendationCode: null, snapshot };
}

function assertDecidable(status: string): void {
  if (TERMINAL_STATUSES.has(status)) {
    throw new ValidationError(`This action is already ${status}; a decision can no longer be recorded against it.`, {
      fieldErrors: [{ path: "candidateId", message: `Action is ${status}` }],
    });
  }
}
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

export interface RecordDecisionResult {
  decision: OwnerDecisionRecordView;
  /** True when this request was recognised as a retry of an already-recorded decision event (nothing new was written). */
  replayed: boolean;
}

/**
 * Append the next decision for a candidate, serialized per candidate. `plan` runs UNDER the lock against the latest
 * decision as it is at the serialization point (never a state read earlier), and may throw to refuse the operation.
 */
async function appendDecision(
  workspaceId: string, actorId: string, businessId: string, resolved: ResolvedCandidate,
  plan: (latest: DecisionRow | null) => NormalizedDecisionBody, idempotencyKey: string | null, now: Date, auditEvent: AuditEventName,
  client: OutcomeDbClient
): Promise<RecordDecisionResult> {
  const candidateId = resolved.parsed.candidateId;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(async (tx: Tx) => {
        await lockOwnerCandidate(tx, workspaceId, businessId, candidateId);
        const latest = await tx.ownerDecisionRecord.findFirst({
          where: { workspaceId, businessId, candidateId },
          orderBy: { sequence: "desc" },
        });
        const body = plan(latest); // operation-specific precondition, evaluated against the latest decision under the lock
        const fingerprint = decisionRequestFingerprint({ candidateId, actorId, body });

        if (idempotencyKey) {
          const keyed = await tx.ownerDecisionRecord.findFirst({ where: { workspaceId, idempotencyKey } });
          if (keyed) {
            if (keyed.businessId === businessId && keyed.candidateId === candidateId && keyed.requestFingerprint === fingerprint) {
              return { decision: keyed, replayed: true };
            }
            throw new ConflictError("This idempotency key was already used for a different decision.");
          }
        }
        if (latest && latest.requestFingerprint === fingerprint) return { decision: latest, replayed: true };

        const created = await tx.ownerDecisionRecord.create({
          data: {
            id: randomUUID(), workspaceId, businessId, candidateId,
            candidateSource: resolved.parsed.source, domain: resolved.parsed.domain, sourceId: resolved.parsed.sourceId,
            findingCode: resolved.findingCode, recommendationCode: resolved.recommendationCode,
            decisionState: body.state, sequence: (latest?.sequence ?? 0) + 1, supersedesId: latest?.id ?? null,
            decidedById: actorId, decidedAt: now, ownerReason: body.ownerReason, revisitAt: body.revisitAt,
            recommendationSnapshot: resolved.snapshot as Prisma.InputJsonValue,
            decisionContractVersion: OWNER_DECISION_RECORD_CONTRACT_VERSION,
            commitmentDescription: body.contract?.commitmentDescription ?? null,
            verificationMetric: body.contract?.verificationMetric ?? null,
            baselineValue: body.contract?.baselineValue ?? null,
            baselineProvenance: body.contract?.baselineProvenance ?? null,
            targetDirection: body.contract?.targetDirection ?? null,
            targetValue: body.contract?.targetValue ?? null,
            observationWindowDays: body.contract?.observationWindowDays ?? null,
            intendedCompletionAt: body.contract?.intendedCompletionAt ?? null,
            expectedMeasurementSource: body.contract?.expectedMeasurementSource ?? null,
            requestFingerprint: fingerprint, idempotencyKey,
          },
        });
        // IDs / state / provenance only: no metric values in the audit payload.
        await emitAuditEvent(
          {
            eventName: auditEvent, actorId, workspaceId, entityType: "owner_decision_record", entityId: created.id, visibility: "internal",
            payload: {
              businessId, candidateId, decisionState: body.state, sequence: created.sequence, supersedesId: created.supersedesId,
              candidateSource: resolved.parsed.source, domain: resolved.parsed.domain, hasOutcomeContract: body.contract !== null,
              targetDirection: body.contract?.targetDirection ?? null, contractVersion: OWNER_DECISION_RECORD_CONTRACT_VERSION,
            },
          },
          tx
        );
        return { decision: created, replayed: false };
      });
    } catch (e) {
      // Only a cross-candidate idempotency-key race can still collide (the candidate itself is serialized by the lock).
      if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS - 1) continue;
      throw e;
    }
  }
  throw new ConflictError("The decision could not be recorded because of concurrent updates; please retry.");
}

/** Record the owner's decision on a canonical candidate. */
export async function recordOwnerDecision(
  workspaceId: string, actorId: string, businessId: string, input: RecordOwnerDecisionInput, deps: DecisionDeps = {}
): Promise<RecordDecisionResult> {
  const client = deps.client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, client);
  const now = (deps.now ?? (() => new Date()))();
  const resolved = await resolveCandidate(workspaceId, businessId, input.candidateId, now, { client });
  const body = normalizeDecisionBody(input);
  return appendDecision(workspaceId, actorId, businessId, resolved, () => body, input.idempotencyKey ?? null, now, AUDIT_EVENTS.OWNER_DECISION_RECORDED, client);
}

/**
 * Amend the outcome contract of an ALREADY ACCEPTED/MODIFIED decision. History is not edited: the amended contract is
 * appended as the next decision (same state, supersedes the previous one), so what was committed at each point stays readable.
 */
export async function recordOwnerOutcomeContract(
  workspaceId: string, actorId: string, businessId: string, input: RecordOutcomeContractInput, deps: DecisionDeps = {}
): Promise<RecordDecisionResult> {
  const client = deps.client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, client);
  const now = (deps.now ?? (() => new Date()))();
  const resolved = await resolveCandidate(workspaceId, businessId, input.candidateId, now, { client });
  // The precondition is evaluated INSIDE the serialized transaction against the latest decision at that point: a concurrent
  // REJECTED / DEFERRED that committed first makes this amendment fail instead of resurrecting an ACCEPTED/MODIFIED commitment.
  const plan = (latest: DecisionRow | null): NormalizedDecisionBody => {
    if (!latest || (latest.decisionState !== "ACCEPTED" && latest.decisionState !== "MODIFIED")) {
      throw new ValidationError("An outcome contract can only be recorded for a candidate whose current decision is ACCEPTED or MODIFIED.", {
        fieldErrors: [{ path: "candidateId", message: latest ? `Current decision is ${latest.decisionState}` : "No decision recorded" }],
      });
    }
    return normalizeDecisionBody({ state: latest.decisionState as OwnerDecisionState, ownerReason: input.ownerReason ?? null, revisitAt: null, contract: input.contract });
  };
  return appendDecision(workspaceId, actorId, businessId, resolved, plan, input.idempotencyKey ?? null, now, AUDIT_EVENTS.OWNER_OUTCOME_CONTRACT_RECORDED, client);
}

export async function getLatestOwnerDecision(workspaceId: string, businessId: string, candidateId: string, client: OutcomeDbClient = db): Promise<OwnerDecisionRecordView | null> {
  return client.ownerDecisionRecord.findFirst({ where: { workspaceId, businessId, candidateId }, orderBy: { sequence: "desc" } });
}

/** All decisions for the business (or one candidate), oldest first; workspace + business scoped. */
export async function listOwnerDecisions(workspaceId: string, businessId: string, opts: { candidateId?: string; client?: OutcomeDbClient } = {}): Promise<OwnerDecisionRecordView[]> {
  const client = opts.client ?? db;
  await assertOwnerBusiness(workspaceId, businessId, client);
  return client.ownerDecisionRecord.findMany({
    where: { workspaceId, businessId, ...(opts.candidateId ? { candidateId: opts.candidateId } : {}) },
    orderBy: [{ candidateId: "asc" }, { sequence: "asc" }],
  });
}
