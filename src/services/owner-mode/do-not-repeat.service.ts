/**
 * Jarvis 360 Slice 12 — do-not-repeat enforcement at recommendation promotion (DI).
 *
 * Derives a memory key from the recommendation's linked finding code, looks up an
 * active do_not_repeat memory in OwnerDecisionMemory (reused), and blocks promotion
 * unless an explicit changed-context override exists. Also records do_not_repeat
 * memories. Reuses the pure rules; emits an audit event on block.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { evaluateDoNotRepeat, type DoNotRepeatMemory } from "@/domain/owner-mode/do-not-repeat";
import { canonicalOwnerScopeDomain, consultingScopeKey, exactScopeKey, ownerDoNotRepeatApplies, ownerScopeLookupKeys, parseOwnerDnrKey } from "@/domain/owner-mode/do-not-repeat-scope";
import { ownerDomainLabel } from "@/domain/owner-spine/owner-decision";
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { MIN_CHANGED_CONTEXT_LENGTH } from "@/domain/owner-mode/decision-memory";
import { appliesToBusiness } from "@/domain/owner-mode/owner-action-gate-policy";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

interface DnrDb {
  recommendation: {
    findUnique(args: { where: { id: string; workspaceId: string }; select: { findingId: true } }): Promise<{ findingId: string | null } | null>;
  };
  finding: {
    findFirst(args: { where: { id: string; engagement: { workspaceId: string } }; select: { impactArea: true } }): Promise<{ impactArea: string | null } | null>;
  };
  ownerDoNotRepeatRule: {
    findFirst(args: {
      where: {
        workspaceId: string; memoryKey: { in: string[] }; blocksRepetition: boolean; active: boolean;
        OR?: Array<{ businessId: string | null }>;
      };
      orderBy: { createdAt: "desc" };
    }): Promise<{ blocksRepetition: boolean; changedContextExplanation: string | null } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

/**
 * Formal Consulting Mode's scope token for a finding's impact area, e.g. "operations" → "scope:operations"
 * (unchanged semantics; built by the one scope taxonomy, do-not-repeat-scope.ts).
 */
export function scopeKeyForImpactArea(impactArea: string | null | undefined): string | null {
  return consultingScopeKey(impactArea);
}

export interface DnrDeps {
  db: DnrDb;
}

async function resolveDefaultDeps(): Promise<DnrDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as DnrDb };
}

export class DoNotRepeatBlockedError extends Error {
  readonly code = "DO_NOT_REPEAT_BLOCKED";
  constructor(recommendationId: string, reason: string) {
    super(`Recommendation ${recommendationId} blocked by a do-not-repeat rule: ${reason}`);
    this.name = "DoNotRepeatBlockedError";
  }
}

/**
 * Resolve the set of do-not-repeat keys a recommendation matches against: its finding
 * code AND a scope token derived from the finding's impact area. This is what makes
 * matching more than exact-code: a rule recorded by category/scope still blocks a repeat
 * even when the finding code differs (strict re-audit G17/G18).
 */
async function memoryKeysFor(recommendationId: string, workspaceId: string, deps: DnrDeps): Promise<string[]> {
  const rec = await deps.db.recommendation.findUnique({ where: { id: recommendationId, workspaceId }, select: { findingId: true } });
  if (!rec?.findingId) return [];
  const finding = await deps.db.finding.findFirst({ where: { id: rec.findingId, engagement: { workspaceId } }, select: { impactArea: true } });
  const keys = new Set<string>();
  const scopeKey = scopeKeyForImpactArea(finding?.impactArea);
  if (scopeKey) keys.add(scopeKey);
  return [...keys];
}

/** Block promotion when an active do_not_repeat memory matches the recommendation's code or scope. */
export async function enforceDoNotRepeatForPromotion(recommendationId: string, workspaceId: string, injected?: DnrDeps): Promise<void> {
  const deps = injected ?? (await resolveDefaultDeps());
  const keys = await memoryKeysFor(recommendationId, workspaceId, deps);
  if (keys.length === 0) return;
  const rule = await deps.db.ownerDoNotRepeatRule.findFirst({
    where: { workspaceId, memoryKey: { in: keys }, blocksRepetition: true, active: true },
    orderBy: { createdAt: "desc" },
  });
  // Adapt the dedicated rule row to the pure evaluator's shape (category is implicit).
  const memory: DoNotRepeatMemory | null = rule
    ? { category: "do_not_repeat", blocksRepetition: rule.blocksRepetition, memoryKey: keys[0] }
    : null;
  const decision = evaluateDoNotRepeat(memory, rule?.changedContextExplanation ?? null);
  if (decision.blocked) {
    await emitAuditEvent({
      workspaceId,
      eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_BLOCKED,
      actorType: "system",
      entityType: "recommendation",
      entityId: recommendationId,
      payload: { matchedKeys: keys },
    });
    throw new DoNotRepeatBlockedError(recommendationId, decision.reason ?? "blocked");
  }
}

// ─── Guidance-path DNR check (Now View) ─────────────────────────────────────

export interface DoNotRepeatAnnotation {
  blocked: boolean;
  /** true when only a legacy-format key matched (scope:area vs scope:area:finding:id) */
  legacyMatch: boolean;
  /**
   * true when the rule matched only the coarse area scope (scope:area), not the specific finding.
   * Such a match is history from the area — it does not prove the current target repeats the
   * failed approach, so surfaces present it as a caution about the approach, never as a veto.
   */
  areaOnly: boolean;
  /**
   * Whether the memory would hold back the target itself (ownerDoNotRepeatApplies): an exact memory
   * always; a broad area memory only for growth (or an unknown intent). Protective work (safety, stabilise,
   * repair, evidence) is never held back by a broad area memory.
   */
  holdsBackTarget: boolean;
  priorActionSummary: string;
  blockedReason: string;
  changedContextCondition: string | null;
  matchedScope: string;
}

/** Minimal DB interface needed by checkDoNotRepeatForGuidance — a subset of DnrDb. */
export interface DnrGuidanceDb {
  ownerDoNotRepeatRule?: {
    findFirst(args: {
      where: {
        workspaceId: string; memoryKey: { in: string[] }; blocksRepetition: boolean; active: boolean;
        changedContextExplanation: null;
        OR?: Array<{ businessId: string | null }>;
      };
      orderBy: { createdAt: "desc" };
    }): Promise<{ memoryKey: string; summary: string; reason: string; changedContextExplanation: string | null; blocksRepetition: boolean } | null>;
  };
}

/**
 * Check whether the owner's main target matches an active do-not-repeat memory. Keys come from the ONE
 * scope taxonomy: an owner domain matches its canonical key and legacy spellings (scope:cashflow and
 * scope:cash); any other area its recorded key. Prefers the exact key (area:finding:id) over the area key.
 * Returns null when no matching rule exists or the ownerDoNotRepeatRule table is unavailable.
 */
export async function checkDoNotRepeatForGuidance(
  workspaceId: string,
  impactArea: string | null | undefined,
  findingId: string | null | undefined,
  db: DnrGuidanceDb,
  /** When given, only this business's rules (and workspace-wide rules with no business) apply —
   *  another business's do-not-repeat memory never annotates this business's main target. */
  businessId?: string | null,
  /** The target's intent: decides whether an area-only match holds it back (null ⇒ unknown). */
  intent: OwnerTargetIntent | null = null,
): Promise<DoNotRepeatAnnotation | null> {
  if (!db.ownerDoNotRepeatRule) return null;
  const areaKeys = canonicalOwnerScopeDomain(impactArea) ? ownerScopeLookupKeys(impactArea) : [consultingScopeKey(impactArea)].filter((k): k is string => k !== null);
  if (areaKeys.length === 0) return null;

  const exactKeys = findingId ? areaKeys.map((k) => exactScopeKey(k, findingId)) : [];
  const keysToSearch: string[] = [...exactKeys, ...areaKeys];

  // A rule whose owner has recorded what has changed no longer holds anything back (the owner action
  // gate skips it the same way), so it never annotates the target either.
  const rule = await db.ownerDoNotRepeatRule.findFirst({
    where: {
      workspaceId, memoryKey: { in: keysToSearch }, blocksRepetition: true, active: true, changedContextExplanation: null,
      ...(businessId ? { OR: [{ businessId }, { businessId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!rule) return null;

  const areaOnly = areaKeys.includes(rule.memoryKey);
  const legacyMatch = areaOnly && exactKeys.length > 0;

  return {
    blocked: true,
    legacyMatch,
    areaOnly,
    holdsBackTarget: ownerDoNotRepeatApplies(areaOnly ? "broad" : "exact", intent),
    priorActionSummary: rule.summary,
    blockedReason: rule.reason,
    changedContextCondition: rule.changedContextExplanation,
    matchedScope: rule.memoryKey,
  };
}

export interface RecordDoNotRepeatInput {
  workspaceId: string;
  businessId: string;
  memoryKey: string;
  summary: string;
  reason: string;
  recommendationId?: string | null;
  /**
   * When true (default) the rule hard-blocks future matching promotions. When false it
   * is a non-blocking caution (e.g. a failure attributed to execution, not the rec).
   */
  blocksRepetition?: boolean;
  actorId?: string | null;
}

/** Record a do_not_repeat / caution memory so future matching recommendations are blocked or cautioned. */
export async function recordDoNotRepeat(input: RecordDoNotRepeatInput, injected?: DnrDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const blocks = input.blocksRepetition ?? true;
  const created = await deps.db.ownerDoNotRepeatRule.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      memoryKey: input.memoryKey,
      recommendationId: input.recommendationId ?? null,
      summary: input.summary,
      reason: input.reason,
      blocksRepetition: blocks,
      active: true,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_RECORDED,
    actorId: input.actorId ?? undefined,
    actorType: input.actorId ? "user" : "system",
    entityType: "owner_do_not_repeat_rule",
    entityId: created.id,
    payload: { memoryKey: input.memoryKey, blocksRepetition: blocks },
  });
  return created.id;
}

// ─── Owner-mode rules: list and changed-context override ────────────────────

export interface OwnerDoNotRepeatRuleView {
  id: string;
  businessId: string | null;
  memoryKey: string;
  summary: string;
  reason: string;
  /** The owner's recorded account of what has changed; null while the rule still holds work back. */
  changedContextExplanation: string | null;
  /** What the rule holds back, in owner words (from the one scope taxonomy). */
  holds: string;
  createdAt: string;
}

/** What a rule holds back, from its key (parseOwnerDnrKey — the gate's own reading of it). */
function dnrHoldsText(memoryKey: string): string {
  const parsed = parseOwnerDnrKey(memoryKey);
  if (!parsed) return "Matching recommendations in this area";
  const area = ownerDomainLabel(parsed.domain);
  return parsed.match === "exact" ? `Repeating that specific ${area} step` : `New growth steps in ${area}`;
}

/**
 * The active blocking do-not-repeat rules that apply to one business — the same applicability the owner
 * action gate uses (appliesToBusiness: its own rules, and business-less rules only when it is the
 * workspace's sole real business). The business must be a business of this workspace.
 */
export async function listOwnerDoNotRepeatRules(workspaceId: string, businessId: string): Promise<OwnerDoNotRepeatRuleView[]> {
  const { db } = await import("@/lib/db");
  const business = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  const [rules, real] = await Promise.all([
    db.ownerDoNotRepeatRule.findMany({
      where: { workspaceId, active: true, blocksRepetition: true, OR: [{ businessId }, { businessId: null }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, businessId: true, memoryKey: true, summary: true, reason: true, changedContextExplanation: true, createdAt: true },
    }),
    db.ownerBusiness.findMany({ where: { workspaceId, isActive: true, isFixtureBusiness: false }, select: { id: true }, take: 2 }),
  ]);
  const soleRealBusinessId = real.length === 1 ? real[0].id : null;
  return rules
    .filter((r: { businessId: string | null }) => appliesToBusiness(r.businessId, businessId, soleRealBusinessId))
    .map((r: { id: string; businessId: string | null; memoryKey: string; summary: string; reason: string; changedContextExplanation: string | null; createdAt: Date }) => ({
      id: r.id,
      businessId: r.businessId,
      memoryKey: r.memoryKey,
      summary: r.summary,
      reason: r.reason,
      changedContextExplanation: r.changedContextExplanation,
      holds: dnrHoldsText(r.memoryKey),
      createdAt: r.createdAt.toISOString(),
    }));
}

export interface RecordDoNotRepeatChangedContextInput {
  workspaceId: string;
  ruleId: string;
  actorId: string;
  explanation: string;
}

/**
 * Record what has changed since a do-not-repeat rule was set, on that exact rule. This is the override
 * the owner action gate and the guidance annotation already honour (changedContextExplanation) — no
 * second rule engine. Governed:
 *   - the exact rule, in this workspace; a rule recorded for a business must belong to a business of this
 *     workspace;
 *   - only an active, blocking rule without a recorded change (an explanation is never silently replaced:
 *     the same text again is idempotent, a different one is refused);
 *   - a meaningful reason (at least MIN_CHANGED_CONTEXT_LENGTH characters after trimming — the decision
 *     memory's repeat-guard minimum);
 *   - a compare-and-set on `changedContextExplanation: null` with the audit event (old → new) in the same
 *     transaction. The owner decision is resolved on read, so the next read reflects the override.
 */
export async function recordDoNotRepeatChangedContext(input: RecordDoNotRepeatChangedContextInput): Promise<OwnerDoNotRepeatRuleView> {
  const { db } = await import("@/lib/db");
  const explanation = input.explanation.trim();
  if (explanation.length < MIN_CHANGED_CONTEXT_LENGTH) {
    throw new ValidationError(`Describe what has changed in at least ${MIN_CHANGED_CONTEXT_LENGTH} characters.`);
  }
  const rule = await db.ownerDoNotRepeatRule.findFirst({
    where: { id: input.ruleId, workspaceId: input.workspaceId },
    select: { id: true, businessId: true, memoryKey: true, summary: true, reason: true, changedContextExplanation: true, active: true, blocksRepetition: true, createdAt: true },
  });
  if (!rule) throw new NotFoundError("OwnerDoNotRepeatRule", input.ruleId);
  if (rule.businessId) {
    const business = await db.ownerBusiness.findFirst({ where: { id: rule.businessId, workspaceId: input.workspaceId }, select: { id: true } });
    if (!business) throw new NotFoundError("OwnerDoNotRepeatRule", input.ruleId);
  }
  const view = (changed: string | null): OwnerDoNotRepeatRuleView => ({
    id: rule.id, businessId: rule.businessId, memoryKey: rule.memoryKey, summary: rule.summary, reason: rule.reason,
    changedContextExplanation: changed, holds: dnrHoldsText(rule.memoryKey), createdAt: rule.createdAt.toISOString(),
  });
  if (!rule.active || !rule.blocksRepetition) {
    throw new ValidationError("This do-not-repeat rule is no longer active, so it holds nothing back.");
  }
  if (rule.changedContextExplanation !== null && rule.changedContextExplanation.trim() !== "") {
    if (rule.changedContextExplanation.trim() === explanation) return view(rule.changedContextExplanation);
    throw new ValidationError("What has changed was already recorded on this rule.");
  }

  await db.$transaction(async (tx: import("@/generated/prisma/client").Prisma.TransactionClient) => {
    const res = await tx.ownerDoNotRepeatRule.updateMany({
      where: { id: rule.id, workspaceId: input.workspaceId, active: true, changedContextExplanation: rule.changedContextExplanation },
      data: { changedContextExplanation: explanation },
    });
    if (res.count !== 1) {
      throw new ConflictError("This rule was changed by another request. Reload and retry.", { ruleId: rule.id });
    }
    await emitAuditEvent(
      {
        workspaceId: input.workspaceId,
        eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_CONTEXT_CHANGED,
        actorId: input.actorId,
        actorType: "user",
        entityType: "owner_do_not_repeat_rule",
        entityId: rule.id,
        payload: {
          ruleId: rule.id,
          businessId: rule.businessId,
          memoryKey: rule.memoryKey,
          previousChangedContextExplanation: rule.changedContextExplanation,
          changedContextExplanation: explanation,
        },
      },
      tx,
    );
  });
  return view(explanation);
}
