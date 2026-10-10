/**
 * Owner first-run service — binds the pure first-run domain (src/domain/owner-first-run) to persisted,
 * workspace-scoped rows. It owns NO diagnosis, scoring or decision logic: it reads the canonical finance
 * diagnosis, records decisions through the canonical decision service, and amends evidence through the
 * canonical snapshot versioning.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { emitAuditEvent, getAuditEventReadOnlyClient } from "@/infra/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { businessCreateSchema } from "@/domain/founder-recovery/validation";
import { BUSINESS_TYPES } from "@/domain/founder-recovery/types";
import {
  landingAfterLogin,
  resolveFirstRunState,
  firstRunHref,
  type FirstRunFacts,
  type FirstRunState,
} from "@/domain/owner-first-run/first-run-router";
import {
  firstTrustedInteraction,
  timeToFirstValueSeconds,
  type TrustedInteractionFact,
} from "@/domain/owner-first-run/activation";
import { buildFirstMoneyRead, selectFirstReadActions, type FirstMoneyRead } from "@/domain/owner-first-run/first-money-read";
import { MAX_PROGRESSIVE_QUESTIONS, selectNextQuestion, type NextQuestionResult } from "@/domain/owner-first-run/next-question";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import { withFirstRunReturn } from "@/domain/owner-first-run/first-run-return";
import { inputTargetForCategory } from "@/domain/owner-mode/owner-data-hub";
import { computeMissingInputsWithPriority } from "@/domain/owner-finance/data-confidence";
import { isEvidenceQuality, type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { formatDomainActionCandidateId } from "@/domain/owner-spine/owner-decision-record";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import { loadFirstReadSufficiency } from "@/services/owner-mode/owner-onboarding.service";
import { getOwnerInputGuidance } from "@/services/owner-mode/owner-input-guidance.service";
import { evidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";
import { firstRunEvidence } from "@/services/owner-first-run/first-run-evidence.reader";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { getFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { listOwnerDecisions } from "@/services/owner-outcome/owner-decision.service";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { NEW_GOAL_TARGET_TYPES } from "@/services/owner-strategy/goal.service";
import { recordProductEvent } from "@/services/analytics/product-events.service";
import { sanitiseProductEventProps, type ProductEventName } from "@/domain/analytics/product-events";
import type { AuditEventName } from "@/domain/constants/audit-events";

type Json = Record<string, unknown>;

/** A business younger than this still resumes first-run on sign-in; an older one never does. */
const FIRST_RUN_RECENT_DAYS = 14;

/** Server-side log text for a swallowed analytics failure (governed classifier; never shown to an owner). */
export function describeFailure(error: unknown): string {
  return classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).technicalDetails;
}

export interface FirstRunBusiness {
  id: string;
  name: string;
  businessType: string;
  currency: string;
}

export interface FirstRunContext {
  state: FirstRunState;
  /** Where the first-run surface itself should take the owner (the Cockpit once established). */
  href: string;
  /** Where a plain sign-in should land (never forces a viewed/established owner back through setup). */
  loginHref: string;
  facts: FirstRunFacts;
  /** The name typed once at signup — prefilled, never re-asked. */
  suggestedBusinessName: string | null;
  business: FirstRunBusiness | null;
  currentSnapshotId: string | null;
  latestCycleId: string | null;
  /** The evidence changed after the last diagnosis: the read on screen is out of date. */
  diagnosisStale: boolean;
  firstTrustedInteractionAt: string | null;
  businessTypes: readonly string[];
  /** The goal families the product supports today (never invented in the UI). */
  goalFamilies: readonly string[];
}

async function firstRealBusiness(workspaceId: string): Promise<(FirstRunBusiness & { createdAt: Date }) | null> {
  const row = await db.ownerBusiness.findFirst({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, businessType: true, currency: true, createdAt: true },
  });
  return row ?? null;
}

/**
 * When this business's evidence was first corrected. Every snapshot amendment emits OWNER_FINANCE_SNAPSHOT_AMENDED
 * carrying its businessId (the governed record of the mutation), so the audit trail answers it without a second
 * reader of the snapshot table.
 */
async function firstSnapshotAmendmentAt(workspaceId: string, businessId: string): Promise<Date | null> {
  const row = await getAuditEventReadOnlyClient().findFirst({
    where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_AMENDED, payload: { path: ["businessId"], equals: businessId } },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });
  return row?.occurredAt ?? null;
}

async function trustedInteractionFacts(workspaceId: string, businessId: string): Promise<TrustedInteractionFact[]> {
  const [decision, amendment, improvement] = await Promise.all([
    db.ownerDecisionRecord.findFirst({
      where: { workspaceId, businessId, decisionState: { in: ["ACCEPTED", "MODIFIED"] } },
      orderBy: { decidedAt: "asc" },
      select: { decidedAt: true },
    }),
    firstSnapshotAmendmentAt(workspaceId, businessId),
    db.ownerFirstResultInteraction.findFirst({
      where: { workspaceId, businessId, kind: "IMPROVEMENT_REQUESTED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  const facts: TrustedInteractionFact[] = [];
  if (decision) facts.push({ kind: "ACTION_ACCEPTED", at: decision.decidedAt.toISOString() });
  if (amendment) facts.push({ kind: "EVIDENCE_CORRECTED", at: amendment.toISOString() });
  if (improvement) facts.push({ kind: "IMPROVEMENT_REQUESTED", at: improvement.createdAt.toISOString() });
  return facts;
}

export async function getFirstRunContext(workspaceId: string): Promise<FirstRunContext> {
  const [workspace, business] = await Promise.all([
    db.workspace.findFirst({ where: { id: workspaceId }, select: { name: true } }),
    firstRealBusiness(workspaceId),
  ]);

  let firstReadSufficient = false;
  let evidence: Awaited<ReturnType<typeof firstRunEvidence>> = { headSnapshotId: null, runOnHead: null, hasAnyRun: false };
  let interactions: TrustedInteractionFact[] = [];

  if (business) {
    const deps = { db: db as unknown as PrismaClient, workspaceId, businessId: business.id, now: new Date() };
    const rows = await prefetchOwnerDomainRows(deps);
    firstReadSufficient = (await loadFirstReadSufficiency(deps, rows)).sufficient;
    const [ev, facts] = await Promise.all([firstRunEvidence(workspaceId, business.id, deps.now), trustedInteractionFacts(workspaceId, business.id)]);
    evidence = ev;
    interactions = facts;
  }

  const hasDiagnosis = evidence.hasAnyRun;
  const first = firstTrustedInteraction(hasDiagnosis, interactions);
  const facts: FirstRunFacts = {
    hasBusiness: business !== null,
    firstReadSufficient,
    hasDiagnosis,
    hasTrustedInteraction: first !== null,
    businessIsRecent: business ? Date.now() - business.createdAt.getTime() < FIRST_RUN_RECENT_DAYS * 86_400_000 : true,
  };
  const state = resolveFirstRunState(facts);
  return {
    state,
    href: firstRunHref(state),
    loginHref: landingAfterLogin(facts),
    facts,
    suggestedBusinessName: workspace?.name ?? null,
    business: business ? { id: business.id, name: business.name, businessType: business.businessType, currency: business.currency } : null,
    currentSnapshotId: evidence.headSnapshotId,
    latestCycleId: evidence.runOnHead?.id ?? null,
    // The figures were amended after the last diagnosis and not yet re-diagnosed: there is no read on them yet.
    diagnosisStale: evidence.hasAnyRun && evidence.runOnHead === null,
    firstTrustedInteractionAt: first?.at ?? null,
    businessTypes: BUSINESS_TYPES,
    goalFamilies: NEW_GOAL_TARGET_TYPES,
  };
}

// ── Business creation ──────────────────────────────────────────────────────────────────────────────────────────

export interface CreateFirstBusinessInput {
  /** Omitted ⇒ the name typed once at signup (the Workspace name). */
  name?: string;
  businessType: string;
  currency: string;
}

/** A transaction-scoped advisory lock keyed by workspace serialises concurrent first-business submissions. */
function firstBusinessLockKey(workspaceId: string): string {
  return `owner_first_business:${workspaceId}`;
}

/**
 * Create the workspace's first real business through the canonical governed service. Idempotent: a repeat or
 * concurrent identical submit returns the business that already exists (replayed=true) instead of creating a
 * duplicate; a DIFFERENT submission when a business already exists is a conflict, never a silent second one.
 */
export async function createFirstBusiness(
  workspaceId: string,
  actorId: string,
  input: CreateFirstBusinessInput,
): Promise<{ business: FirstRunBusiness; replayed: boolean }> {
  const workspace = await db.workspace.findFirst({ where: { id: workspaceId }, select: { name: true } });
  if (!workspace) throw new NotFoundError("Workspace", workspaceId);
  if (!/^[A-Za-z]{3,8}$/.test(input.currency.trim())) {
    throw new ValidationError("Please choose your currency.", { fieldErrors: [{ path: "currency", message: "Not a valid currency code" }] });
  }
  const parsed = businessCreateSchema.safeParse({
    name: (input.name ?? workspace.name).trim(),
    businessType: input.businessType,
    currency: input.currency.trim().toUpperCase(),
  });
  if (!parsed.success) {
    throw new ValidationError("Please check your business details.", {
      fieldErrors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const data = parsed.data;

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${firstBusinessLockKey(workspaceId)}))`;
    const existing = await tx.ownerBusiness.findFirst({
      where: { workspaceId, isActive: true, isFixtureBusiness: false },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, businessType: true, currency: true },
    });
    if (existing) {
      const same =
        existing.name === data.name && existing.businessType === data.businessType && existing.currency === data.currency;
      if (!same) {
        throw new ConflictError("Your business is already set up. Continue from where you left off.");
      }
      return { business: existing as FirstRunBusiness, replayed: true };
    }
    const created = await createBusiness({ ...data, b2cSupported: true, b2bSupported: false }, actorId, workspaceId, { client: tx });
    return {
      business: { id: created.id, name: created.name, businessType: created.businessType, currency: created.currency },
      replayed: false,
    };
  });
}

// ── First Money read ───────────────────────────────────────────────────────────────────────────────────────────

export interface FirstMoneyReadView {
  read: FirstMoneyRead;
  businessId: string;
  currency: string;
  cycleId: string;
  snapshotId: string;
  /** The server-resolved decision candidate for the primary action (never client-chosen). */
  candidateId: string | null;
  /** The presented action's own verification facts (used to build the outcome contract on accept). */
  presentedAction: { title: string; verificationMetric: string; expectedTimeframeDays: number } | null;
  decisionState: string | null;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function getFirstMoneyRead(workspaceId: string, businessId: string): Promise<FirstMoneyReadView> {
  const business = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true, currency: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  const evidence = await firstRunEvidence(workspaceId, businessId);
  if (!evidence.hasAnyRun) throw new NotFoundError("Diagnosis", businessId);
  if (!evidence.runOnHead) throw new ConflictError("Your numbers changed after your last read. Update your read first.");
  const latest = evidence.runOnHead;

  const cycle = await getFinanceDiagnosis(latest.id, workspaceId);
  const snapshot = cycle.snapshot as Json & { id: string; supersededById: string | null };
  // The canonical planner's ranked actions, partitioned (never re-ranked): the first real finding leads the read;
  // the first "supply this information" action is what would sharpen it.
  const { primary, dataRequest } = selectFirstReadActions(cycle.actions as Array<(typeof cycle.actions)[number] & { findingCode: string }>);
  const action = primary ?? dataRequest;
  const finding =
    primary ? ((primary.findingId ? cycle.findings.find((f: { id: string }) => f.id === primary.findingId) : null) ?? cycle.findings.find((f: { code: string }) => f.code === primary.findingCode) ?? null) : null;

  const missing = computeMissingInputsWithPriority(snapshot).sort((a, b) =>
    a.priority === b.priority ? 0 : a.priority === "CRITICAL" ? -1 : 1,
  );
  const quality = isEvidenceQuality(snapshot.evidenceQuality) ? (snapshot.evidenceQuality as EvidenceQuality) : null;
  const asRead = (a: (typeof cycle.actions)[number]) => ({
    title: a.title,
    description: a.description,
    ownerRole: a.ownerRole,
    expectedTimeframeDays: a.expectedTimeframeDays,
    verificationMetric: a.verificationMetric,
  });

  const read = buildFirstMoneyRead({
    finding: finding
      ? {
          title: finding.title,
          summary: finding.summary,
          sourceMetric: finding.sourceMetric,
          sourceValue: finding.sourceValue,
          evidence: jsonStringArray(finding.evidence),
          missingData: jsonStringArray(finding.missingData),
        }
      : null,
    action: primary && finding ? asRead(primary) : null,
    dataRequest: dataRequest ? asRead(dataRequest) : null,
    // The score the diagnosis ACTUALLY used (it re-enriches with liquidity/intake and ages the period), not the one frozen at save.
    confidenceScore: Number((cycle as { dataConfidenceScore?: number }).dataConfidenceScore ?? snapshot.dataConfidenceScore ?? 0),
    dataRequestCode: dataRequest ? String((dataRequest as { findingCode?: string }).findingCode ?? "") : null,
    criticalInputsMissing: jsonStringArray(snapshot.missingCriticalData).length > 0,
    evidenceQuality: quality,
    currency: business.currency,
    evidenceDomains: ["finance"],
    period: {
      start: toIso(snapshot.periodStart),
      end: toIso(snapshot.periodEnd),
      // Canonical period semantics (current-diagnosis-cycle.ts): an unended period is PROVISIONAL, never "completed".
      // A date-only period end is stored as midnight UTC at the START of its last day, so the period is only complete once
      // that whole day is over: from 00:00 UTC on the 31st, "1–31 October" is still missing a day of trading.
      state:
        evidencePeriodState({ periodStart: snapshot.periodStart as Date, periodEnd: new Date((snapshot.periodEnd as Date).getTime() + 86_400_000) }, new Date()) === "completed"
          ? "completed"
          : "provisional",
    },
    missingEvidence: missing.slice(0, 5).map((m) => m.field),
  });

  // The candidate is the action the read actually presents (server-resolved; the client never names one).
  const presented = read.status === "NO_ATTENTION_FOUND" ? null : action;
  const candidateId = presented ? formatDomainActionCandidateId("finance", presented.id) : null;
  let decisionState: string | null = null;
  if (candidateId) {
    const decisions = await listOwnerDecisions(workspaceId, businessId, { candidateId });
    const latestDecision = [...decisions].sort((a, b) => b.sequence - a.sequence)[0];
    decisionState = latestDecision?.decisionState ?? null;
  }
  return {
    read,
    businessId,
    currency: business.currency,
    cycleId: cycle.id,
    snapshotId: snapshot.id,
    candidateId,
    presentedAction: presented ? { title: presented.title, verificationMetric: presented.verificationMetric, expectedTimeframeDays: presented.expectedTimeframeDays } : null,
    decisionState,
  };
}

// ── Progressive OBQ ────────────────────────────────────────────────────────────────────────────────────────────

export interface NextQuestionView {
  result: NextQuestionResult;
  inputHref: string | null;
  inputActionLabel: string | null;
}

/**
 * Progressive-question progress is PERSISTED (OwnerFirstResultInteraction), never held by the browser: a category the
 * owner chose to supply (IMPROVEMENT_REQUESTED) or skipped (QUESTION_SKIPPED) is "handled" and is never asked again,
 * and the number of handled categories is what the question limit counts. A reload, a second tab or a new device
 * therefore sees the same progress, and the limit is reachable.
 */
export async function getQuestionProgress(workspaceId: string, businessId: string): Promise<{ handled: string[]; skipped: string[] }> {
  const rows = await db.ownerFirstResultInteraction.findMany({
    where: { workspaceId, businessId, kind: { in: ["IMPROVEMENT_REQUESTED", "QUESTION_SKIPPED"] }, questionCategory: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { kind: true, questionCategory: true },
  });
  const handled = new Set<string>();
  const skipped = new Set<string>();
  for (const r of rows) {
    if (!r.questionCategory) continue;
    handled.add(r.questionCategory);
    if (r.kind === "QUESTION_SKIPPED") skipped.add(r.questionCategory);
  }
  return { handled: [...handled], skipped: [...skipped] };
}

export interface NextQuestionView {
  result: NextQuestionResult;
  inputHref: string | null;
  inputActionLabel: string | null;
  /** How many questions have been handled so far, and the hard ceiling (it can be reached). */
  progress: { handled: number; max: number };
}

export async function getNextQuestionView(workspaceId: string, businessId: string): Promise<NextQuestionView> {
  await assertBusiness(workspaceId, businessId);
  const { handled } = await getQuestionProgress(workspaceId, businessId);
  const guidance = await getOwnerInputGuidance({ db: db as unknown as PrismaClient, workspaceId, businessId, now: new Date() });
  if (!guidance.found) throw new NotFoundError("OwnerBusiness", businessId);
  const result = selectNextQuestion({ guidance, skipped: handled, answeredCount: handled.length });
  const progress = { handled: handled.length, max: MAX_PROGRESSIVE_QUESTIONS };
  if (result.done) return { result, inputHref: null, inputActionLabel: null, progress };
  const target = inputTargetForCategory(result.question.category);
  return { result, inputHref: withFirstRunReturn(target.href), inputActionLabel: target.actionLabel, progress };
}

// ── Interactions: viewed, improvement requested, feedback ──────────────────────────────────────────────────────

export const FEEDBACK_RATINGS = ["USEFUL", "PARTLY_USEFUL", "NOT_USEFUL"] as const;
export const FEEDBACK_REASONS = [
  "WRONG_PRIORITY",
  "MISSING_INFORMATION",
  "RECOMMENDATION_IMPRACTICAL",
  "EXPLANATION_UNCLEAR",
  "OTHER",
] as const;

/**
 * Append one first-result interaction exactly once per (workspace, idempotency key), with its audit event in the
 * SAME transaction (a recorded interaction always has its audit event, and neither exists without the other).
 * A repeat or a concurrent identical submit is the replay: nothing new is written.
 */
async function insertInteractionOnce(args: {
  workspaceId: string;
  businessId: string;
  actorId: string;
  snapshotId: string | null;
  kind: "IMPROVEMENT_REQUESTED" | "FEEDBACK" | "RESULT_VIEWED" | "QUESTION_SKIPPED";
  questionCategory?: string;
  rating?: string;
  reason?: string;
  idempotencyKey: string;
  audit: { eventName: AuditEventName; props?: Record<string, unknown> };
}): Promise<{ created: boolean }> {
  const existing = await db.ownerFirstResultInteraction.findFirst({
    where: { workspaceId: args.workspaceId, idempotencyKey: args.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { created: false };
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.ownerFirstResultInteraction.create({
        data: {
          id: randomUUID(),
          workspaceId: args.workspaceId,
          businessId: args.businessId,
          snapshotId: args.snapshotId,
          kind: args.kind,
          questionCategory: args.questionCategory ?? null,
          rating: args.rating ?? null,
          reason: args.reason ?? null,
          idempotencyKey: args.idempotencyKey,
          createdBy: args.actorId,
        },
      });
      await emitAuditEvent(
        {
          eventName: args.audit.eventName,
          workspaceId: args.workspaceId,
          actorId: args.actorId,
          entityType: "OwnerBusiness",
          entityId: args.businessId,
          payload: sanitiseProductEventProps(args.audit.props),
          visibility: "internal",
        },
        tx,
      );
    });
    return { created: true };
  } catch (error) {
    // A concurrent identical submit won the unique (workspace, idempotency key): that IS the replay.
    if (isUniqueViolation(error)) return { created: false };
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "P2002" || e?.cause?.code === "23505";
}

/**
 * Record an event once per (workspace, event[, business]) — used for single-shot funnel milestones.
 * Never throws: it runs after a committed mutation and analytics must not turn that into a failure.
 */
export async function recordProductEventOnce(args: {
  name: ProductEventName;
  eventName: string;
  workspaceId: string;
  actorId?: string;
  businessId?: string;
  props?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const seen = await getAuditEventReadOnlyClient().findFirst({
      where: { workspaceId: args.workspaceId, eventName: args.eventName, ...(args.businessId ? { entityId: args.businessId } : {}) },
      select: { id: true },
    });
    if (seen) return false;
    await recordProductEvent({ name: args.name, workspaceId: args.workspaceId, actorId: args.actorId, businessId: args.businessId, props: args.props });
    return true;
  } catch (error) {
    logger.warn("product milestone not recorded", undefined, { event: args.name, error: describeFailure(error) });
    return false;
  }
}

/**
 * Emit first_trusted_decision_interaction (with TIME_TO_FIRST_VALUE) once, derived from PERSISTED facts —
 * never from what a client claims happened. Safe to call after any mutation that might be the first one.
 */
export async function recordActivationIfFirst(workspaceId: string, actorId: string, businessId: string): Promise<boolean> {
  try {
    return await recordActivationIfFirstUnsafe(workspaceId, actorId, businessId);
  } catch (error) {
    logger.warn("activation not recorded", undefined, { error: describeFailure(error) });
    return false;
  }
}

async function recordActivationIfFirstUnsafe(workspaceId: string, actorId: string, businessId: string): Promise<boolean> {
  const hasDiagnosis = (await firstRunEvidence(workspaceId, businessId)).hasAnyRun;
  const first = firstTrustedInteraction(hasDiagnosis, await trustedInteractionFacts(workspaceId, businessId));
  if (!first) return false;
  const user = await db.user.findFirst({ where: { id: actorId }, select: { emailVerifiedAt: true } });
  const seconds = user?.emailVerifiedAt ? timeToFirstValueSeconds(user.emailVerifiedAt.toISOString(), first.at) : null;
  return recordProductEventOnce({
    name: "first_trusted_decision_interaction",
    eventName: AUDIT_EVENTS.PRODUCT_FIRST_TRUSTED_DECISION_INTERACTION,
    workspaceId,
    actorId,
    businessId,
    props: { interactionKind: first.kind, ...(seconds !== null ? { timeToFirstValueSeconds: seconds } : {}) },
  });
}

async function assertBusiness(workspaceId: string, businessId: string): Promise<void> {
  const b = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!b) throw new NotFoundError("OwnerBusiness", businessId);
}

/**
 * Server-side half of the evidence-provenance contract. Until a business has been diagnosed once (the first-run
 * journey), new evidence MUST state how reliable it is: a client-side "required" control is not an integrity
 * guarantee. Once the business is established, or for callers that never state it (imports, legacy integrations),
 * an omitted quality stays NULL = LEGACY_UNKNOWN: conservative (never authoritative), never fabricated.
 */
export async function assertEvidenceQualityStatedForFirstEvidence(
  workspaceId: string, businessId: string, quality: EvidenceQuality | undefined,
): Promise<void> {
  if (quality) return;
  await assertBusiness(workspaceId, businessId);
  if ((await firstRunEvidence(workspaceId, businessId)).hasAnyRun) return;
  throw new ValidationError("Tell OpsIQ how reliable these numbers are: from your records, a good estimate, or a rough guess.", {
    fieldErrors: [{ path: "evidenceQuality", message: "Choose how reliable these numbers are" }],
  });
}

export async function recordFirstResultViewed(workspaceId: string, actorId: string, businessId: string): Promise<void> {
  const view = await getFirstMoneyRead(workspaceId, businessId);
  await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: view.snapshotId, kind: "RESULT_VIEWED", idempotencyKey: `viewed:${view.cycleId}`,
    audit: {
      eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
      props: { evidenceQuality: view.read.evidenceQuality ?? undefined, confidenceTier: view.read.confidenceTier },
    },
  });
}

function assertQuestionCategory(category: string): void {
  if (!(OWNER_INPUT_CATEGORIES as readonly string[]).includes(category)) {
    throw new ValidationError("That isn't a question OpsIQ asks.", { fieldErrors: [{ path: "category", message: "Unknown category" }] });
  }
}

/**
 * The owner chose to supply a specific piece of evidence. Recorded once per (business, category) — the key is derived
 * from the category, so a repeat tap or a retry can never count twice — and it is the improvement-request activation fact.
 */
export async function requestImprovement(
  workspaceId: string, actorId: string, businessId: string, category: string,
): Promise<{ replayed: boolean }> {
  assertQuestionCategory(category);
  await assertBusiness(workspaceId, businessId);
  const evidence = await firstRunEvidence(workspaceId, businessId);
  if (!evidence.hasAnyRun) throw new ValidationError("There is no first read to improve yet.", { fieldErrors: [] });
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: evidence.headSnapshotId, kind: "IMPROVEMENT_REQUESTED", questionCategory: category,
    idempotencyKey: `improve:${businessId}:${category}`,
    audit: { eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_IMPROVEMENT_REQUESTED },
  });
  if (created) await recordActivationIfFirst(workspaceId, actorId, businessId);
  return { replayed: !created };
}

/** The owner does not have this evidence: persisted so the question is not asked again and counts toward the limit. */
export async function skipQuestion(
  workspaceId: string, actorId: string, businessId: string, category: string,
): Promise<{ replayed: boolean }> {
  assertQuestionCategory(category);
  await assertBusiness(workspaceId, businessId);
  const evidence = await firstRunEvidence(workspaceId, businessId);
  if (!evidence.hasAnyRun) throw new ValidationError("There is no first read to improve yet.", { fieldErrors: [] });
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: evidence.headSnapshotId, kind: "QUESTION_SKIPPED", questionCategory: category,
    idempotencyKey: `skip:${businessId}:${category}`,
    audit: { eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_QUESTION_SKIPPED },
  });
  return { replayed: !created };
}

export async function submitFirstValueFeedback(
  workspaceId: string, actorId: string, businessId: string,
  input: { rating: (typeof FEEDBACK_RATINGS)[number]; reason?: (typeof FEEDBACK_REASONS)[number]; idempotencyKey: string },
): Promise<{ replayed: boolean }> {
  await assertBusiness(workspaceId, businessId);
  if (input.rating === "USEFUL" && input.reason) {
    throw new ValidationError("A reason is only asked when the read was not fully useful.", {
      fieldErrors: [{ path: "reason", message: "Not applicable to a useful rating" }],
    });
  }
  const evidence = await firstRunEvidence(workspaceId, businessId);
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: evidence.headSnapshotId, kind: "FEEDBACK",
    rating: input.rating, reason: input.reason, idempotencyKey: `feedback:${businessId}:${input.idempotencyKey}`,
    audit: { eventName: AUDIT_EVENTS.PRODUCT_FIRST_VALUE_FEEDBACK, props: { rating: input.rating, ...(input.reason ? { reason: input.reason } : {}) } },
  });
  return { replayed: !created };
}

/**
 * Where a signed-in self-serve owner should land: an interrupted first run resumes, everyone else goes to
 * the Cockpit. Resolves the workspace exactly as the policy context does (first active membership,
 * deterministic order) and fails closed to the Cockpit — a lookup problem must never trap a sign-in.
 */
export async function resolveOwnerLoginHref(userId: string): Promise<string> {
  try {
    const membership = await db.workspaceMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
      select: { workspaceId: true },
    });
    if (!membership) return "/owner/cockpit";
    return (await getFirstRunContext(membership.workspaceId)).loginHref;
  } catch {
    return "/owner/cockpit";
  }
}
