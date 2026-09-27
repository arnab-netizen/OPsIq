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
import { canonicalOwnerScopeDomain, consultingScopeKey, exactScopeKey, ownerDoNotRepeatApplies, ownerScopeLookupKeys } from "@/domain/owner-mode/do-not-repeat-scope";
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";

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

  const rule = await db.ownerDoNotRepeatRule.findFirst({
    where: {
      workspaceId, memoryKey: { in: keysToSearch }, blocksRepetition: true, active: true,
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
