/**
 * Controlled Beta Cohort evidence service.
 *
 * Storage: NO schema. Operator-entered evidence is an append-only, hash-free, platform-level audit event
 * (workspaceId = null, visibility "internal") keyed by the BetaRequest id — the same established pattern the beta
 * invite lifecycle uses. Because those rows carry no workspace id they can never be returned by any tenant-scoped
 * audit read, so an owner can never see cohort evidence about themselves or anyone else.
 *
 * Automatic facts (signup, verification, first read, corrections, decisions, return visits) are DERIVED LIVE from the
 * existing sources and never copied into the ledger, so they cannot drift. Only allow-listed, non-financial columns
 * are selected: no amounts, no titles, no free text from the owner's business.
 */
import { createHash } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emitAuditEvent, getAuditEventReadOnlyClient } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import {
  buildOwnerView, emptyAutomaticFacts, evaluateExpansionGate, storedAssignmentSchema, storedEvidenceSchema,
  STORED_SCHEMA_VERSION, type AssignmentInput, type CohortAssignment, type CohortAutomaticFacts, type CohortOwnerView,
  type EvidenceInput, type ExpansionGate, type LedgerEntry,
} from "@/domain/beta-cohort/evidence";

const ENTITY_TYPE = "BetaCohortOwner";
/** Emails on these domains are the platform's own: they can be QA_MECHANICS but never a REAL_OWNER. */
const INTERNAL_EMAIL_DOMAINS = ["opsiq.solutions"];
const MAX_OWNERS_PER_VIEW = 50;
const FUTURE_SKEW_MS = 5 * 60_000;

const PRODUCT_MILESTONE_EVENTS = [
  AUDIT_EVENTS.PRODUCT_PASSWORD_SET,
  AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED,
  AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED,
  AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED,
  AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
  AUDIT_EVENTS.PRODUCT_FIRST_RESULT_CORRECTED,
  AUDIT_EVENTS.PRODUCT_RETURNING_OWNER,
] as const;

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isInternalAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return INTERNAL_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const [host = "", ...rest] = domain.split(".");
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${rest.length ? `.${rest.join(".")}` : ""}`;
}

type Tx = Prisma.TransactionClient;

// ─── Writes ─────────────────────────────────────────────────────────────────

export interface AssignResult { replayed: boolean; assignmentId: string; ownerCode: string; cohortId: string }

export async function assignCohortOwner(input: AssignmentInput, actorId: string): Promise<AssignResult> {
  const request = await db.betaRequest.findUnique({ where: { id: input.betaRequestId }, select: { id: true, email: true, status: true } });
  if (!request) throw new NotFoundError("BetaRequest", input.betaRequestId);
  if (request.status !== "INVITED") throw new ValidationError("Only an INVITED beta request can be assigned to a cohort");
  if (input.kind === "REAL_OWNER" && isInternalAddress(request.email)) {
    throw new ValidationError("An internal OpsIQ address cannot be a REAL_OWNER; assign it as QA_MECHANICS");
  }
  const fingerprint = sha256({ betaRequestId: input.betaRequestId, cohortId: input.cohortId, ownerCode: input.ownerCode, kind: input.kind });

  return db.$transaction(async (tx: Tx) => {
    // One global lock: assignment is a rare operator action, and the invariants (one assignment per request, one request per owner
    // code) span cohorts, so they must serialise across cohorts too.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"beta_cohort_assign"}))`;
    // Immutable: one assignment per request, one request per owner code.
    const forRequest = await tx.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, entityType: ENTITY_TYPE, entityId: input.betaRequestId },
      select: { id: true, payload: true },
    });
    if (forRequest) {
      const stored = storedAssignmentSchema.safeParse(forRequest.payload);
      if (stored.success && stored.data.cohortId === input.cohortId && stored.data.ownerCode === input.ownerCode && stored.data.kind === input.kind) {
        return { replayed: true, assignmentId: forRequest.id, ownerCode: input.ownerCode, cohortId: input.cohortId };
      }
      throw new ConflictError("This beta request is already assigned to a cohort owner; assignments are immutable");
    }
    const codeTaken = await tx.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, payload: { path: ["ownerCode"], equals: input.ownerCode } },
      select: { id: true },
    });
    if (codeTaken) throw new ConflictError(`Owner code ${input.ownerCode} is already assigned to a different beta request`);

    const assignmentId = await emitAuditEvent({
      eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED,
      actorId,
      entityType: ENTITY_TYPE,
      entityId: input.betaRequestId,
      payload: {
        schemaVersion: STORED_SCHEMA_VERSION, cohortId: input.cohortId, ownerCode: input.ownerCode, kind: input.kind,
        idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint,
      },
      visibility: "internal",
    }, tx);
    return { replayed: false, assignmentId, ownerCode: input.ownerCode, cohortId: input.cohortId };
  });
}

export interface RecordResult { replayed: boolean; entryId: string; entryType: string }

export async function recordCohortEvidence(input: EvidenceInput, actorId: string, now: Date = new Date()): Promise<RecordResult> {
  const assignment = await findAssignment(input.betaRequestId);
  if (!assignment) throw new ValidationError("This beta request is not assigned to a cohort owner");
  const entry = input.entry;

  if ("observedAt" in entry && entry.observedAt && new Date(entry.observedAt).getTime() > now.getTime() + FUTURE_SKEW_MS) {
    throw new ValidationError("observedAt cannot be in the future");
  }
  if (entry.entryType === "OBSERVATION" && entry.actionTakenOn && new Date(`${entry.actionTakenOn}T00:00:00.000Z`).getTime() > now.getTime() + FUTURE_SKEW_MS) {
    throw new ValidationError("actionTakenOn cannot be in the future");
  }
  const fingerprint = sha256(entry);

  return db.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`beta_cohort_evidence:${input.betaRequestId}`}))`;
    const prior = await tx.auditEvent.findFirst({
      where: {
        eventName: AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, workspaceId: null, entityType: ENTITY_TYPE, entityId: input.betaRequestId,
        payload: { path: ["idempotencyKey"], equals: input.idempotencyKey },
      },
      select: { id: true, payload: true },
    });
    if (prior) {
      const stored = storedEvidenceSchema.safeParse(prior.payload);
      if (stored.success && stored.data.requestFingerprint === fingerprint) {
        return { replayed: true, entryId: prior.id, entryType: entry.entryType };
      }
      throw new ConflictError("That idempotency key was already used for a different entry");
    }
    if (entry.entryType === "ISSUE_RESOLUTION") {
      const issue = await tx.auditEvent.findFirst({
        where: { id: entry.issueId, eventName: AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, workspaceId: null, entityType: ENTITY_TYPE, entityId: input.betaRequestId },
        select: { payload: true },
      });
      const parsed = issue ? storedEvidenceSchema.safeParse(issue.payload) : null;
      if (!parsed || !parsed.success || parsed.data.entry.entryType !== "ISSUE") {
        throw new ValidationError("issueId does not refer to an ISSUE entry for this owner");
      }
      const alreadyResolved = await tx.auditEvent.findFirst({
        where: {
          eventName: AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, workspaceId: null, entityType: ENTITY_TYPE, entityId: input.betaRequestId,
          payload: { path: ["entry", "issueId"], equals: entry.issueId },
        },
        select: { id: true },
      });
      if (alreadyResolved) throw new ConflictError("That issue is already resolved");
    }
    const entryId = await emitAuditEvent({
      eventName: AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED,
      actorId,
      entityType: ENTITY_TYPE,
      entityId: input.betaRequestId,
      payload: {
        schemaVersion: STORED_SCHEMA_VERSION, cohortId: assignment.cohortId, ownerCode: assignment.ownerCode,
        idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint, entry,
      },
      visibility: "internal",
    }, tx);
    return { replayed: false, entryId, entryType: entry.entryType };
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────────

async function findAssignment(betaRequestId: string): Promise<CohortAssignment | null> {
  const audit = getAuditEventReadOnlyClient();
  const row = await audit.findFirst({
    where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, entityType: ENTITY_TYPE, entityId: betaRequestId },
    orderBy: { occurredAt: "asc" },
    select: { payload: true, occurredAt: true },
  });
  const stored = row ? storedAssignmentSchema.safeParse(row.payload) : null;
  return row && stored?.success
    ? { betaRequestId, cohortId: stored.data.cohortId, ownerCode: stored.data.ownerCode, kind: stored.data.kind, assignedAt: row.occurredAt }
    : null;
}

async function loadAutomaticFacts(request: { id: string; email: string; invitedAt: Date | null }): Promise<CohortAutomaticFacts> {
  const facts = emptyAutomaticFacts(request.invitedAt);
  const user = await db.user.findFirst({
    where: { email: { equals: request.email, mode: "insensitive" } },
    select: { id: true, createdAt: true, emailVerifiedAt: true },
  });
  if (!user) return facts;
  facts.accountFound = true;
  facts.signupAt = user.createdAt;
  facts.emailVerifiedAt = user.emailVerifiedAt ?? null;

  const membership = await db.workspaceMembership.findFirst({
    where: { userId: user.id, isActive: true }, orderBy: { addedAt: "asc" }, select: { workspaceId: true },
  });
  if (!membership) return facts;
  const workspaceId = membership.workspaceId as string;

  const audit = getAuditEventReadOnlyClient();
  const events = await audit.findMany({
    where: { workspaceId, eventName: { in: [...PRODUCT_MILESTONE_EVENTS] } },
    orderBy: { occurredAt: "asc" }, select: { eventName: true, occurredAt: true }, take: 2000,
  });
  const first = (name: string): Date | null => events.find((e) => e.eventName === name)?.occurredAt ?? null;
  facts.passwordSetAt = first(AUDIT_EVENTS.PRODUCT_PASSWORD_SET);
  facts.firstRunStartedAt = first(AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED);
  facts.firstEvidenceSavedAt = first(AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED);
  facts.firstFindingAt = first(AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED);
  facts.firstResultViewedAt = first(AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED);
  facts.firstCorrectionAt = first(AUDIT_EVENTS.PRODUCT_FIRST_RESULT_CORRECTED);
  facts.firstReturnVisitAt = first(AUDIT_EVENTS.PRODUCT_RETURNING_OWNER);
  facts.evidenceCorrectionCount = events.filter((e) => e.eventName === AUDIT_EVENTS.PRODUCT_FIRST_RESULT_CORRECTED).length;
  facts.returnVisitCount = events.filter((e) => e.eventName === AUDIT_EVENTS.PRODUCT_RETURNING_OWNER).length;

  const business = await db.ownerBusiness.findFirst({
    where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true, isFixtureBusiness: true },
  });
  if (!business) return facts;
  facts.isFixtureBusiness = Boolean(business.isFixtureBusiness);
  const businessId = business.id as string;

  const cycles = await db.ownerFinanceCycle.findMany({
    where: { businessId, workspaceId }, orderBy: { sequenceNumber: "asc" }, select: { id: true, createdAt: true },
  });
  const topAction = async (cycleId: string) =>
    db.ownerFinanceAction.findFirst({
      where: { cycleId }, orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
      select: { recommendationCode: true, findingCode: true, confidence: true },
    });
  if (cycles.length > 0) {
    const firstCycle = cycles[0];
    const lastCycle = cycles[cycles.length - 1];
    if (!facts.firstFindingAt) facts.firstFindingAt = firstCycle.createdAt;
    const a1 = await topAction(firstCycle.id);
    const aN = lastCycle.id === firstCycle.id ? a1 : await topAction(lastCycle.id);
    facts.firstFindingCode = a1?.findingCode ?? null;
    facts.firstRecommendationCode = a1?.recommendationCode ?? null;
    facts.firstRecommendationConfidence = a1?.confidence ?? null;
    facts.latestRecommendationCode = aN?.recommendationCode ?? null;
    facts.recommendationChangedAfterCorrection =
      facts.evidenceCorrectionCount > 0 && a1 && aN ? a1.recommendationCode !== aN.recommendationCode : null;
  }

  const decision = await db.ownerDecisionRecord.findFirst({
    where: { workspaceId, businessId }, orderBy: { decidedAt: "desc" }, select: { decisionState: true, decidedAt: true },
  });
  if (decision) facts.productDecision = { state: decision.decisionState, decidedAt: decision.decidedAt };

  const feedback = await db.ownerFirstResultInteraction.findFirst({
    where: { workspaceId, businessId, kind: "FEEDBACK" }, orderBy: { createdAt: "desc" }, select: { rating: true, reason: true, createdAt: true },
  });
  if (feedback) facts.productFeedback = { rating: feedback.rating ?? null, reason: feedback.reason ?? null, at: feedback.createdAt };

  const outcome = await db.ownerActionOutcome.findFirst({
    where: { workspaceId, businessId }, orderBy: { createdAt: "desc" }, select: { outcomeStatus: true, createdAt: true },
  });
  if (outcome) facts.ownerReportedOutcome = { status: outcome.outcomeStatus, at: outcome.createdAt };
  return facts;
}

export interface CohortCandidate { betaRequestId: string; firstName: string | null; emailHint: string; invitedAt: Date | null; internalAddress: boolean }

export interface CohortView {
  cohortId: string;
  generatedAt: Date;
  owners: CohortOwnerView[];
  gate: ExpansionGate;
  /** INVITED beta requests not yet in any cohort (so an operator can assign without copying ids). Masked email only. */
  candidates: CohortCandidate[];
}

export async function getCohortView(cohortId: string, now: Date = new Date()): Promise<CohortView> {
  const audit = getAuditEventReadOnlyClient();
  const rows = await audit.findMany({
    where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, payload: { path: ["cohortId"], equals: cohortId } },
    orderBy: { occurredAt: "asc" }, select: { entityId: true, payload: true, occurredAt: true }, take: MAX_OWNERS_PER_VIEW,
  });
  const assignments: CohortAssignment[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const stored = storedAssignmentSchema.safeParse(r.payload);
    if (!r.entityId || !stored.success || seen.has(r.entityId)) continue;
    seen.add(r.entityId);
    assignments.push({ betaRequestId: r.entityId, cohortId: stored.data.cohortId, ownerCode: stored.data.ownerCode, kind: stored.data.kind, assignedAt: r.occurredAt });
  }

  const ids = assignments.map((a) => a.betaRequestId);
  const evidenceRows = ids.length
    ? await audit.findMany({
        where: { eventName: AUDIT_EVENTS.BETA_COHORT_EVIDENCE_RECORDED, workspaceId: null, entityType: ENTITY_TYPE, entityId: { in: ids } },
        orderBy: { occurredAt: "asc" }, select: { id: true, entityId: true, payload: true, occurredAt: true, actorId: true }, take: 5000,
      })
    : [];
  const byRequest = new Map<string, LedgerEntry[]>();
  for (const r of evidenceRows) {
    const stored = storedEvidenceSchema.safeParse(r.payload);
    if (!r.entityId || !stored.success) continue;
    const list = byRequest.get(r.entityId) ?? [];
    list.push({ id: r.id, recordedAt: r.occurredAt, actorId: r.actorId ?? null, entry: stored.data.entry });
    byRequest.set(r.entityId, list);
  }

  const requests = ids.length
    ? await db.betaRequest.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, invitedAt: true } })
    : [];
  const requestById = new Map<string, { id: string; email: string; invitedAt: Date | null }>(requests.map((r: { id: string; email: string; invitedAt: Date | null }) => [r.id, r]));

  const owners: CohortOwnerView[] = [];
  for (const a of assignments) {
    const req = requestById.get(a.betaRequestId);
    const automatic = req ? await loadAutomaticFacts(req) : emptyAutomaticFacts(null);
    owners.push(buildOwnerView({ assignment: a, automatic, entries: byRequest.get(a.betaRequestId) ?? [], now }));
  }

  const assignedAny = await audit.findMany({
    where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null }, select: { entityId: true }, take: 1000,
  });
  const taken = new Set(assignedAny.map((r) => r.entityId));
  const invited = await db.betaRequest.findMany({
    where: { status: "INVITED" }, orderBy: { invitedAt: "desc" }, take: 50, select: { id: true, firstName: true, email: true, invitedAt: true },
  });
  const candidates: CohortCandidate[] = invited
    .filter((r: { id: string }) => !taken.has(r.id))
    .map((r: { id: string; firstName: string | null; email: string; invitedAt: Date | null }) => ({
      betaRequestId: r.id, firstName: r.firstName ?? null, emailHint: maskEmail(r.email), invitedAt: r.invitedAt ?? null, internalAddress: isInternalAddress(r.email),
    }));

  return { cohortId, generatedAt: now, owners, gate: evaluateExpansionGate(owners), candidates };
}
