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
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";
import {
  buildAccountActivationRow, buildAccountOverview, buildOwnerView, emptyAccountActivationMilestones, emptyAutomaticFacts,
  evaluateExpansionGate, groupAccountActivationMilestones, storedAssignmentSchema, storedEvidenceSchema,
  STORED_SCHEMA_VERSION, type AccountActivationPage, type AccountOverviewRow, type AssignmentInput, type CohortAccountOverview,
  type CohortAssignment, type CohortAutomaticFacts, type CohortOwnerView, type EvidenceInput, type ExpansionGate, type LedgerEntry,
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

async function loadAutomaticFacts(request: { id: string; email: string; invitedAt: Date | null }, now: Date): Promise<CohortAutomaticFacts> {
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

  const topAction = async (cycleId: string) =>
    db.ownerFinanceAction.findFirst({
      where: { cycleId }, orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
      select: { recommendationCode: true, findingCode: true, confidence: true },
    });
  // The owner's FIRST diagnosis is a history read (oldest run) — it is "what OpsIQ first told them", never "the current".
  const firstCycle = await db.ownerFinanceCycle.findFirst({
    where: { businessId, workspaceId }, orderBy: { sequenceNumber: "asc" }, select: { id: true, createdAt: true },
  });
  // The CURRENT diagnosis is the repo's one shared definition: latest completed evidence period (never "the latest run").
  const currentCycle = await db.ownerFinanceCycle.findFirst({
    where: { businessId, workspaceId, ...currentEvidenceWhere(now) }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { id: true },
  });
  if (firstCycle) {
    if (!facts.firstFindingAt) facts.firstFindingAt = firstCycle.createdAt;
    const a1 = await topAction(firstCycle.id);
    const aN = !currentCycle ? null : currentCycle.id === firstCycle.id ? a1 : await topAction(currentCycle.id);
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
    const automatic = req ? await loadAutomaticFacts(req, now) : emptyAutomaticFacts(null);
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

// ─── Account classification overview (read-only, aggregate-only, no cohort write) ──────────

const ACCOUNT_OVERVIEW_MILESTONE_EVENTS = [
  AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED,
  AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED,
  AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED,
  AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
] as const;
const MAX_OVERVIEW_ACCOUNTS = 500;
/**
 * PRODUCT_FIRST_DIAGNOSIS_COMPLETED and PRODUCT_FIRST_EVIDENCE_SAVED are deduped per (workspace, business) --
 * see recordProductEventOnce's call sites in diagnoses/route.ts and snapshots/route.ts, which both pass
 * businessId -- and PRODUCT_FIRST_RESULT_VIEWED is deduped per diagnosis cycle (insertInteractionOnce's
 * idempotencyKey is `viewed:${cycleId}`), not per workspace. A single multi-business, long-lived workspace can
 * therefore contribute many rows for the SAME milestone, so this bound is a real, not merely theoretical,
 * completeness risk -- see MILESTONE_EVIDENCE_NOTE in the domain module for how it's surfaced.
 */
const MAX_MILESTONE_EVIDENCE_ROWS = 20_000;

/**
 * Read-only aggregate: of every admitted account (the same signupSource-tagged set
 * countExternalBetaWorkspaces() counts), how many are already classified into a beta cohort (any cohort, by
 * BetaRequest email match) vs not, and what milestones each bucket has reached -- counts only, see
 * buildAccountOverview's doc comment for why no identity ever crosses that boundary.
 *
 * Does NOT write anything, does NOT classify anything, and does NOT change evaluateExpansionGate's criteria,
 * capacity, or any account's permissions.
 *
 * `maxAccounts`/`maxMilestoneRows` are test seams for the two row bounds below (defaults are the real production
 * bounds); production callers never need to pass them.
 */
export async function getAccountClassificationOverview(
  now: Date = new Date(),
  maxAccounts: number = MAX_OVERVIEW_ACCOUNTS,
  maxMilestoneRows: number = MAX_MILESTONE_EVIDENCE_ROWS,
): Promise<CohortAccountOverview> {
  const workspaces = await db.workspace.findMany({
    where: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } },
    select: { id: true, createdBy: true, signupSource: true },
    take: maxAccounts + 1,
  });
  const accountListTruncated = workspaces.length > maxAccounts;
  const scoped = accountListTruncated ? workspaces.slice(0, maxAccounts) : workspaces;

  const createdByValues: Array<string | null> = scoped.map((w: { createdBy: string | null }) => w.createdBy);
  const creatorIds = [...new Set(createdByValues.filter((id): id is string => Boolean(id)))];
  const creators: Array<{ id: string; email: string; emailVerifiedAt: Date | null }> = creatorIds.length
    ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, email: true, emailVerifiedAt: true } })
    : [];
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  const workspaceIds = scoped.map((w: { id: string }) => w.id);
  const audit = getAuditEventReadOnlyClient();
  const milestoneRows: Array<{ workspaceId: string | null; eventName: string }> = workspaceIds.length
    ? await audit.findMany({
        where: { workspaceId: { in: workspaceIds }, eventName: { in: [...ACCOUNT_OVERVIEW_MILESTONE_EVENTS] } },
        select: { workspaceId: true, eventName: true },
        take: maxMilestoneRows,
      })
    : [];
  const milestoneEvidenceTruncated = milestoneRows.length >= maxMilestoneRows;
  const reached = new Set(milestoneRows.map((r) => `${r.workspaceId}:${r.eventName}`));
  const has = (workspaceId: string, name: string) => reached.has(`${workspaceId}:${name}`);

  // Classified = this account's email has a BetaRequest with a BETA_COHORT_OWNER_ASSIGNED entry, in ANY cohort
  // (not just the one default cohort getCohortView happens to be called with) -- email, not id, is the only link
  // between "an account" and "a BetaRequest", exactly as the rest of this file already relies on (loadAutomaticFacts).
  // Emails here are already canonical (lowercased at signup/request time, same assumption isBetaRequestInvited makes).
  const emails = [...new Set(creators.map((c) => c.email.toLowerCase()))];
  const requestsByEmail: Array<{ id: string; email: string }> = emails.length
    ? await db.betaRequest.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } })
    : [];
  const requestIdByEmail = new Map(requestsByEmail.map((r) => [r.email.toLowerCase(), r.id]));
  const requestIds = requestsByEmail.map((r) => r.id);
  const assignedRows: Array<{ entityId: string | null }> = requestIds.length
    ? await audit.findMany({ where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, entityId: { in: requestIds } }, select: { entityId: true } })
    : [];
  const assignedRequestIds = new Set(assignedRows.map((r) => r.entityId));

  const rows: AccountOverviewRow[] = [];
  let unresolvedCreatorAccounts = 0;
  for (const w of scoped) {
    const creator = w.createdBy ? creatorById.get(w.createdBy) : undefined;
    // No resolvable creator user: cannot be verified, classified or milestone-checked without guessing -- excluded
    // from `rows` (never reported as a false "unverified/unclassified" fact) but still counted explicitly via
    // unresolvedCreatorAccounts, so it is never silently dropped from totalAccounts. Should not occur for a real
    // signup (the account graph is created atomically), but this is reported rather than assumed away.
    if (!creator) {
      unresolvedCreatorAccounts += 1;
      continue;
    }
    const email = creator.email.toLowerCase();
    const requestId = requestIdByEmail.get(email);
    rows.push({
      signupSource: w.signupSource === PUBLIC_BETA_SIGNUP_SOURCE ? "PUBLIC_BETA" : "CONTROLLED_BETA_INVITE",
      verified: creator.emailVerifiedAt !== null,
      internalAddress: isInternalAddress(email),
      classified: requestId !== undefined && assignedRequestIds.has(requestId),
      firstRunStarted: has(w.id, AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED),
      firstEvidenceSaved: has(w.id, AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED),
      firstDiagnosisCompleted: has(w.id, AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED),
      firstResultViewed: has(w.id, AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED),
    });
  }

  return buildAccountOverview(rows, now, { unresolvedCreatorAccounts, accountListTruncated, milestoneEvidenceTruncated });
}

// ─── Account activation (read-only, PER-ACCOUNT, paginated, no cohort write) ──────────

const ACCOUNT_ACTIVATION_DEFAULT_LIMIT = 50;
const ACCOUNT_ACTIVATION_MAX_LIMIT = 100;
const ACCOUNT_ACTIVATION_MIN_LIMIT = 1;
/** Generous per-page milestone-row bound (page size is capped at ACCOUNT_ACTIVATION_MAX_LIMIT accounts); see
 * ACCOUNT_OVERVIEW_MILESTONE_EVENTS' doc comment above for why a single workspace can still produce many rows. */
const DEFAULT_MAX_ACTIVATION_MILESTONE_ROWS = 5000;

function clampActivationLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return ACCOUNT_ACTIVATION_DEFAULT_LIMIT;
  return Math.max(ACCOUNT_ACTIVATION_MIN_LIMIT, Math.min(ACCOUNT_ACTIVATION_MAX_LIMIT, Math.floor(limit)));
}
/** Opaque, id-based pagination cursor -- same shape as admin-operability.service.ts's listWorkspacesForAdmin. */
function encodeActivationCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), "utf-8").toString("base64");
}
function decodeActivationCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    return typeof decoded?.id === "string" ? decoded.id : null;
  } catch {
    return null;
  }
}

/**
 * Read-only, paginated, PER-ACCOUNT view: for each admitted account on this page (same signupSource-tagged set
 * getAccountClassificationOverview counts), whether it's classified and which of the 4 product milestones it
 * personally reached -- keyed only by workspaceId. This is the thing the aggregate overview above cannot answer:
 * "which specific account". Does NOT write anything, classify anything, or change any cohort/expansion-gate state.
 *
 * `maxMilestoneRows` is a test seam for the one row bound below (default is the real production bound); production
 * callers never need to pass it.
 */
export async function listAccountActivationForAdmin(
  opts: { limit?: number; cursor?: string | null } = {},
  maxMilestoneRows: number = DEFAULT_MAX_ACTIVATION_MILESTONE_ROWS,
): Promise<AccountActivationPage> {
  const limit = clampActivationLimit(opts.limit);
  const cursorId = decodeActivationCursor(opts.cursor);

  const workspaces: Array<{ id: string; createdAt: Date; createdBy: string | null; signupSource: string | null }> = await db.workspace.findMany({
    where: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: { id: true, createdAt: true, createdBy: true, signupSource: true },
  });
  const hasMore = workspaces.length > limit;
  const page = hasMore ? workspaces.slice(0, limit) : workspaces;

  const creatorIds = [...new Set(page.map((w) => w.createdBy).filter((id): id is string => Boolean(id)))];
  const creators: Array<{ id: string; email: string; emailVerifiedAt: Date | null }> = creatorIds.length
    ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, email: true, emailVerifiedAt: true } })
    : [];
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  const workspaceIds = page.map((w) => w.id);
  const audit = getAuditEventReadOnlyClient();
  const milestoneRows: Array<{ workspaceId: string | null; eventName: string; occurredAt: Date }> = workspaceIds.length
    ? await audit.findMany({
        where: { workspaceId: { in: workspaceIds }, eventName: { in: [...ACCOUNT_OVERVIEW_MILESTONE_EVENTS] } },
        select: { workspaceId: true, eventName: true, occurredAt: true },
        take: maxMilestoneRows,
      })
    : [];
  const milestoneEvidenceTruncated = milestoneRows.length >= maxMilestoneRows;
  const milestonesByWorkspace = groupAccountActivationMilestones(milestoneRows, {
    firstRunStarted: AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED,
    firstEvidenceSaved: AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED,
    firstDiagnosisCompleted: AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED,
    firstResultViewed: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
  });

  // Same email-keyed classification lookup getAccountClassificationOverview uses, scoped to just this page's emails.
  const emails = [...new Set(creators.map((c) => c.email.toLowerCase()))];
  const requestsByEmail: Array<{ id: string; email: string }> = emails.length
    ? await db.betaRequest.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } })
    : [];
  const requestIdByEmail = new Map(requestsByEmail.map((r) => [r.email.toLowerCase(), r.id]));
  const requestIds = requestsByEmail.map((r) => r.id);
  const assignedRows: Array<{ entityId: string | null }> = requestIds.length
    ? await audit.findMany({ where: { eventName: AUDIT_EVENTS.BETA_COHORT_OWNER_ASSIGNED, workspaceId: null, entityId: { in: requestIds } }, select: { entityId: true } })
    : [];
  const assignedRequestIds = new Set(assignedRows.map((r) => r.entityId));

  const accounts = [];
  let unresolvedCreatorAccounts = 0;
  for (const w of page) {
    const creator = w.createdBy ? creatorById.get(w.createdBy) : undefined;
    // Same policy as getAccountClassificationOverview: never guess a fact for an unresolvable creator.
    if (!creator) {
      unresolvedCreatorAccounts += 1;
      continue;
    }
    const email = creator.email.toLowerCase();
    const requestId = requestIdByEmail.get(email);
    accounts.push(buildAccountActivationRow({
      workspaceId: w.id,
      createdAt: w.createdAt,
      signupSource: w.signupSource === PUBLIC_BETA_SIGNUP_SOURCE ? "PUBLIC_BETA" : "CONTROLLED_BETA_INVITE",
      verified: creator.emailVerifiedAt !== null,
      internalAddress: isInternalAddress(email),
      classified: requestId !== undefined && assignedRequestIds.has(requestId),
      milestones: milestonesByWorkspace.get(w.id) ?? emptyAccountActivationMilestones(),
    }));
  }

  const nextCursor = hasMore && page.length > 0 ? encodeActivationCursor(page[page.length - 1].id) : null;

  return {
    accounts,
    pagination: { limit, cursor: opts.cursor ?? null, nextCursor, hasMore },
    unresolvedCreatorAccounts,
    milestoneEvidenceTruncated,
  };
}
