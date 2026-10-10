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
import { buildFirstMoneyRead, type FirstMoneyRead } from "@/domain/owner-first-run/first-money-read";
import { selectNextQuestion, type NextQuestionResult } from "@/domain/owner-first-run/next-question";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import { inputTargetForCategory } from "@/domain/owner-mode/owner-data-hub";
import { computeMissingInputsWithPriority } from "@/domain/owner-finance/data-confidence";
import { isEvidenceQuality, type EvidenceQuality } from "@/domain/owner-finance/evidence-quality";
import { formatDomainActionCandidateId } from "@/domain/owner-spine/owner-decision-record";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import { loadFirstReadSufficiency } from "@/services/owner-mode/owner-onboarding.service";
import { getOwnerInputGuidance } from "@/services/owner-mode/owner-input-guidance.service";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { getFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { listOwnerDecisions } from "@/services/owner-outcome/owner-decision.service";
import { logger } from "@/infra/logger";
import { recordProductEvent } from "@/services/analytics/product-events.service";
import type { ProductEventName } from "@/domain/analytics/product-events";

type Json = Record<string, unknown>;

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
}

async function firstRealBusiness(workspaceId: string): Promise<FirstRunBusiness | null> {
  const row = await db.ownerBusiness.findFirst({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, businessType: true, currency: true },
  });
  return row ?? null;
}

async function trustedInteractionFacts(workspaceId: string, businessId: string): Promise<TrustedInteractionFact[]> {
  const [decision, amendment, improvement] = await Promise.all([
    db.ownerDecisionRecord.findFirst({
      where: { workspaceId, businessId, decisionState: { in: ["ACCEPTED", "MODIFIED"] } },
      orderBy: { decidedAt: "asc" },
      select: { decidedAt: true },
    }),
    db.ownerFinancialSnapshot.findFirst({
      where: { workspaceId, businessId, version: { gt: 1 } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.ownerFirstResultInteraction.findFirst({
      where: { workspaceId, businessId, kind: "IMPROVEMENT_REQUESTED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  const facts: TrustedInteractionFact[] = [];
  if (decision) facts.push({ kind: "ACTION_ACCEPTED", at: decision.decidedAt.toISOString() });
  if (amendment) facts.push({ kind: "EVIDENCE_CORRECTED", at: amendment.createdAt.toISOString() });
  if (improvement) facts.push({ kind: "IMPROVEMENT_REQUESTED", at: improvement.createdAt.toISOString() });
  return facts;
}

export async function getFirstRunContext(workspaceId: string): Promise<FirstRunContext> {
  const [workspace, business] = await Promise.all([
    db.workspace.findFirst({ where: { id: workspaceId }, select: { name: true } }),
    firstRealBusiness(workspaceId),
  ]);

  let firstReadSufficient = false;
  let latestCycle: { id: string; snapshotId: string } | null = null;
  let currentSnapshotId: string | null = null;
  let interactions: TrustedInteractionFact[] = [];

  if (business) {
    const deps = { db: db as unknown as PrismaClient, workspaceId, businessId: business.id, now: new Date() };
    const rows = await prefetchOwnerDomainRows(deps);
    firstReadSufficient = (await loadFirstReadSufficiency(deps, rows)).sufficient;
    const [cycle, current, facts] = await Promise.all([
      db.ownerFinanceCycle.findFirst({
        where: { workspaceId, businessId: business.id },
        orderBy: { sequenceNumber: "desc" },
        select: { id: true, snapshotId: true },
      }),
      db.ownerFinancialSnapshot.findFirst({
        where: { workspaceId, businessId: business.id, supersededById: null },
        orderBy: [{ periodEnd: "desc" }, { version: "desc" }],
        select: { id: true },
      }),
      trustedInteractionFacts(workspaceId, business.id),
    ]);
    latestCycle = cycle ?? null;
    currentSnapshotId = current?.id ?? null;
    interactions = facts;
  }

  const hasDiagnosis = latestCycle !== null;
  const first = firstTrustedInteraction(hasDiagnosis, interactions);
  const facts: FirstRunFacts = {
    hasBusiness: business !== null,
    firstReadSufficient,
    hasDiagnosis,
    hasTrustedInteraction: first !== null,
  };
  const state = resolveFirstRunState(facts);
  return {
    state,
    href: firstRunHref(state),
    loginHref: landingAfterLogin(facts),
    facts,
    suggestedBusinessName: workspace?.name ?? null,
    business,
    currentSnapshotId,
    latestCycleId: latestCycle?.id ?? null,
    diagnosisStale: Boolean(latestCycle && currentSnapshotId && latestCycle.snapshotId !== currentSnapshotId),
    firstTrustedInteractionAt: first?.at ?? null,
    businessTypes: BUSINESS_TYPES,
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
  decisionState: string | null;
  /** The evidence was corrected after this read; it must be re-run before it is trusted. */
  stale: boolean;
  previousSnapshotId: string | null;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function getFirstMoneyRead(workspaceId: string, businessId: string): Promise<FirstMoneyReadView> {
  const business = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true, currency: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  const latest = await db.ownerFinanceCycle.findFirst({
    where: { workspaceId, businessId },
    orderBy: { sequenceNumber: "desc" },
    select: { id: true },
  });
  if (!latest) throw new NotFoundError("OwnerFinanceCycle", businessId);

  const cycle = await getFinanceDiagnosis(latest.id, workspaceId);
  const snapshot = cycle.snapshot as Json & { id: string; supersededById: string | null };
  const action = cycle.actions[0] ?? null;
  const finding = (action?.findingId ? cycle.findings.find((f: { id: string }) => f.id === action.findingId) : null) ?? cycle.findings[0] ?? null;

  const missing = computeMissingInputsWithPriority(snapshot).sort((a, b) =>
    a.priority === b.priority ? 0 : a.priority === "CRITICAL" ? -1 : 1,
  );
  const quality = isEvidenceQuality(snapshot.evidenceQuality) ? (snapshot.evidenceQuality as EvidenceQuality) : null;

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
    action: action
      ? {
          title: action.title,
          description: action.description,
          ownerRole: action.ownerRole,
          expectedTimeframeDays: action.expectedTimeframeDays,
          verificationMetric: action.verificationMetric,
        }
      : null,
    confidenceScore: Number(snapshot.dataConfidenceScore ?? 0),
    evidenceQuality: quality,
    missingEvidence: missing.slice(0, 5).map((m) => m.field),
  });

  const candidateId = action ? formatDomainActionCandidateId("finance", action.id) : null;
  let decisionState: string | null = null;
  if (candidateId) {
    const decisions = await listOwnerDecisions(workspaceId, businessId, { candidateId });
    const latestDecision = [...decisions].sort((a, b) => b.sequence - a.sequence)[0];
    decisionState = latestDecision?.decisionState ?? null;
  }
  const currentSnapshot = await db.ownerFinancialSnapshot.findFirst({
    where: { workspaceId, businessId, supersededById: null },
    orderBy: [{ periodEnd: "desc" }, { version: "desc" }],
    select: { id: true },
  });
  const previous = await db.ownerFinancialSnapshot.findFirst({
    where: { workspaceId, businessId, supersededById: snapshot.id },
    select: { id: true },
  });

  return {
    read,
    businessId,
    currency: business.currency,
    cycleId: cycle.id,
    snapshotId: snapshot.id,
    candidateId,
    decisionState,
    stale: Boolean(currentSnapshot && currentSnapshot.id !== snapshot.id),
    previousSnapshotId: previous?.id ?? null,
  };
}

// ── Progressive OBQ ────────────────────────────────────────────────────────────────────────────────────────────

export interface NextQuestionView {
  result: NextQuestionResult;
  inputHref: string | null;
  inputActionLabel: string | null;
}

export async function getNextQuestionView(
  workspaceId: string,
  businessId: string,
  opts: { skipped: readonly string[]; answeredCount: number },
): Promise<NextQuestionView> {
  const valid = new Set<string>(OWNER_INPUT_CATEGORIES);
  const skipped = opts.skipped.filter((c) => valid.has(c));
  const guidance = await getOwnerInputGuidance({ db: db as unknown as PrismaClient, workspaceId, businessId, now: new Date() });
  if (!guidance.found) throw new NotFoundError("OwnerBusiness", businessId);
  const result = selectNextQuestion({ guidance, skipped, answeredCount: Math.max(0, opts.answeredCount) });
  if (result.done) return { result, inputHref: null, inputActionLabel: null };
  const target = inputTargetForCategory(result.question.category);
  return { result, inputHref: target.href, inputActionLabel: target.actionLabel };
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

async function insertInteractionOnce(args: {
  workspaceId: string;
  businessId: string;
  actorId: string;
  snapshotId: string | null;
  kind: "IMPROVEMENT_REQUESTED" | "FEEDBACK" | "RESULT_VIEWED";
  rating?: string;
  reason?: string;
  idempotencyKey: string;
}): Promise<{ created: boolean }> {
  const existing = await db.ownerFirstResultInteraction.findFirst({
    where: { workspaceId: args.workspaceId, idempotencyKey: args.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { created: false };
  try {
    await db.ownerFirstResultInteraction.create({
      data: {
        id: randomUUID(),
        workspaceId: args.workspaceId,
        businessId: args.businessId,
        snapshotId: args.snapshotId,
        kind: args.kind,
        rating: args.rating ?? null,
        reason: args.reason ?? null,
        idempotencyKey: args.idempotencyKey,
        createdBy: args.actorId,
      },
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
    logger.warn("product milestone not recorded", undefined, { event: args.name, error: error instanceof Error ? error.message : String(error) });
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
    logger.warn("activation not recorded", undefined, { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function recordActivationIfFirstUnsafe(workspaceId: string, actorId: string, businessId: string): Promise<boolean> {
  const hasDiagnosis = Boolean(
    await db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, select: { id: true } }),
  );
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

export async function recordFirstResultViewed(workspaceId: string, actorId: string, businessId: string): Promise<void> {
  const view = await getFirstMoneyRead(workspaceId, businessId);
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: view.snapshotId, kind: "RESULT_VIEWED", idempotencyKey: `viewed:${view.cycleId}`,
  });
  if (created) {
    await recordProductEventOnce({
      name: "first_result_viewed",
      eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_VIEWED,
      workspaceId, actorId, businessId,
      props: { evidenceQuality: view.read.evidenceQuality ?? undefined, confidenceTier: view.read.confidenceTier },
    });
  }
}

export async function requestImprovement(
  workspaceId: string, actorId: string, businessId: string, idempotencyKey: string,
): Promise<{ replayed: boolean }> {
  await assertBusiness(workspaceId, businessId);
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { workspaceId, businessId }, orderBy: { sequenceNumber: "desc" }, select: { snapshotId: true },
  });
  if (!cycle) throw new ValidationError("There is no first read to improve yet.", { fieldErrors: [] });
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: cycle.snapshotId, kind: "IMPROVEMENT_REQUESTED", idempotencyKey: `improve:${idempotencyKey}`,
  });
  if (created) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PRODUCT_FIRST_RESULT_IMPROVEMENT_REQUESTED, workspaceId, actorId,
      entityType: "OwnerBusiness", entityId: businessId, payload: {}, visibility: "internal",
    });
    await recordActivationIfFirst(workspaceId, actorId, businessId);
  }
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
  const cycle = await db.ownerFinanceCycle.findFirst({
    where: { workspaceId, businessId }, orderBy: { sequenceNumber: "desc" }, select: { snapshotId: true },
  });
  const { created } = await insertInteractionOnce({
    workspaceId, businessId, actorId, snapshotId: cycle?.snapshotId ?? null, kind: "FEEDBACK",
    rating: input.rating, reason: input.reason, idempotencyKey: `feedback:${input.idempotencyKey}`,
  });
  if (created) {
    await recordProductEvent({
      name: "first_value_feedback", workspaceId, actorId, businessId,
      props: { rating: input.rating, ...(input.reason ? { reason: input.reason } : {}) },
    });
  }
  return { replayed: !created };
}
