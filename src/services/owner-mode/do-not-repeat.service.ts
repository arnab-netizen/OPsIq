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
import { canonicalOwnerScopeDomain, consultingScopeKey, exactScopeKey, ownerDoNotRepeatApplies, ownerScopeKey, ownerScopeLookupKeys, parseOwnerDnrKey } from "@/domain/owner-mode/do-not-repeat-scope";
import { ownerDomainLabel } from "@/domain/owner-spine/owner-decision";
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { MIN_CHANGED_CONTEXT_LENGTH } from "@/domain/owner-mode/decision-memory";
import { appliesToBusiness, evaluateOwnerActionGate, NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import {
  DNR_OWNER_OVERRIDE_MEMORY_TYPE,
  DNR_OWNER_OVERRIDE_SOURCE_MODEL,
  dnrOwnerOverrideKey,
  dnrOwnerOverrideKeyPrefix,
  dnrOwnerOverrideSourceId,
  parseDnrOwnerOverride,
  type DnrOwnerOverride,
} from "@/domain/owner-mode/dnr-owner-override";

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
  /**
   * The main target is an open ISSUE whose earlier STEP the rule forbids repeating: the rule holds the step,
   * never the issue (the problem stays the target; respond another way or review the rule).
   */
  issueStaysOpen?: boolean;
  /** The rule annotated (the exact rule the gate enforces for the target); null for a legacy lookup. */
  ruleId?: string | null;
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
  const ruleTable = db.ownerDoNotRepeatRule;
  const areaKeys = canonicalOwnerScopeDomain(impactArea) ? ownerScopeLookupKeys(impactArea) : [consultingScopeKey(impactArea)].filter((k): k is string => k !== null);
  if (areaKeys.length === 0) return null;

  const exactKeys = findingId ? areaKeys.map((k) => exactScopeKey(k, findingId)) : [];

  // P1-2: exact always outranks broad, independent of createdAt/DB order. A single findFirst over both
  // key sets combined would let a more recently created broad rule shadow an older exact one — search the
  // exact keys first and only fall back to the broad area keys when no exact rule matches.
  const lookup = (keys: string[]) =>
    keys.length === 0
      ? null
      : ruleTable.findFirst({
          where: {
            workspaceId, memoryKey: { in: keys }, blocksRepetition: true, active: true, changedContextExplanation: null,
            ...(businessId ? { OR: [{ businessId }, { businessId: null }] } : {}),
          },
          orderBy: { createdAt: "desc" },
        });

  const rule = (await lookup(exactKeys)) ?? (await lookup(areaKeys));

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

/**
 * The Owner Cockpit's do-not-repeat annotation for the canonical main target, derived from the SAME gate
 * constraints the owner action gate enforces (loadOwnerGateConstraints: business attribution, the audited
 * opt-out, lifted rules and this business's Owner overrides) — never a second lookup with its own rules.
 *   - opted out, or no rule of the target's owner domain in force → no annotation;
 *   - `holdsBackTarget` only when the gate itself holds that work: the gate refuses the target's step for a
 *     do-not-repeat rule, or the target IS the review of a rule holding held work. A step the gate allows is
 *     never claimed to be held (an area rule is then shown as history only).
 * Every rule annotated is one the Cockpit's do-not-repeat panel lists for that business.
 */
export function ownerDnrAnnotationFromGate(
  gate: OwnerGateConstraints | null | undefined,
  target: { source: string; domain: string; findingId: string | null; findingCode: string; intent: OwnerTargetIntent | null; ruleId?: string | null } | null
): DoNotRepeatAnnotation | null {
  if (!gate || gate.optedOut || !target) return null;
  const review = target.source === "safety_gate" && target.findingCode === "GATE_DO_NOT_REPEAT_REVIEW";
  if (!review && target.source !== "domain_action" && target.source !== "survival_reading") return null;
  const domain = canonicalOwnerScopeDomain(target.domain);
  if (!domain) return null;
  const rules = gate.doNotRepeat.filter((r) => r.domain === domain);
  const verdict = review
    ? null
    : evaluateOwnerActionGate(
        { ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: gate.doNotRepeat },
        { domain: target.domain, intent: target.intent, findingId: target.findingId, findingCode: target.findingCode }
      );
  const gateHolds = verdict !== null && !verdict.allowed && verdict.code === "DO_NOT_REPEAT_BLOCKED";
  // The rule named is the one the gate enforces: the target's own rule (a review target carries it), else the
  // rule the gate's verdict names; a broad rule of the area only as history when no rule holds the target.
  const enforcedRuleId = target.ruleId ?? (gateHolds ? verdict.ruleId ?? null : null);
  const rule =
    (enforcedRuleId ? gate.doNotRepeat.find((r) => r.id === enforcedRuleId) : undefined) ??
    (review ? undefined : rules.find((r) => r.match === "broad"));
  if (!rule) return null;
  const issueStaysOpen = target.source === "survival_reading" && gateHolds;
  const holdsBackTarget = review || (gateHolds && !issueStaysOpen);
  return {
    blocked: true,
    legacyMatch: false,
    areaOnly: rule.match === "broad",
    holdsBackTarget,
    issueStaysOpen,
    ruleId: rule.id,
    priorActionSummary: rule.summary ?? "",
    blockedReason: rule.reason ?? "",
    changedContextCondition: null,
    matchedScope: rule.memoryKey ?? ownerScopeKey(rule.domain) ?? rule.domain,
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

// ─── Owner-mode rules: list and the business-scoped Owner override ─────────

/** Minimal operating-memory reader for the Owner overrides (dnr-owner-override.ts). */
export interface DnrOwnerOverrideDb {
  operatingMemoryEntry?: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { memoryType: true; sourceId: true; key: true; data: true };
    }): Promise<Array<{ memoryType: string; sourceId: string; key: string; data: unknown }>>;
  };
}

/**
 * The Owner overrides recorded for ONE business, by rule id (current, unexpired, valid entries only). Read
 * by the owner gate loader and the rules list — never by Formal Consulting Mode.
 */
export async function loadOwnerDnrOverrides(
  db: DnrOwnerOverrideDb,
  workspaceId: string,
  businessId: string | null,
  now: Date
): Promise<Map<string, DnrOwnerOverride>> {
  const out = new Map<string, DnrOwnerOverride>();
  if (!businessId || !db.operatingMemoryEntry) return out;
  const rows = await db.operatingMemoryEntry.findMany({
    where: {
      workspaceId,
      memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE,
      supersededById: null,
      key: { startsWith: dnrOwnerOverrideKeyPrefix(businessId) },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { memoryType: true, sourceId: true, key: true, data: true },
  });
  for (const r of rows) {
    const o = parseDnrOwnerOverride(r, businessId);
    if (o) out.set(o.ruleId, o);
  }
  return out;
}

export interface OwnerDoNotRepeatRuleView {
  id: string;
  businessId: string | null;
  memoryKey: string;
  summary: string;
  reason: string;
  /**
   * What has changed, as recorded for THIS business in Owner Mode (the Owner override), or on the rule itself
   * by its originating workflow; null while the rule still holds this business's work back.
   */
  changedContextExplanation: string | null;
  /** Whether the Owner override for this business is what lifted it (vs the rule's own recorded change). */
  ownerOverride: boolean;
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

type RuleRow = { id: string; businessId: string | null; memoryKey: string; summary: string; reason: string; changedContextExplanation: string | null; createdAt: Date };

function ruleView(r: RuleRow, override: DnrOwnerOverride | null): OwnerDoNotRepeatRuleView {
  const own = r.changedContextExplanation && r.changedContextExplanation.trim() ? r.changedContextExplanation : null;
  return {
    id: r.id,
    businessId: r.businessId,
    memoryKey: r.memoryKey,
    summary: r.summary,
    reason: r.reason,
    changedContextExplanation: own ?? override?.reason ?? null,
    ownerOverride: own === null && override !== null,
    holds: dnrHoldsText(r.memoryKey),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Whether a rule can be lifted through the Owner path at all: an owner-domain key (parseOwnerDnrKey). */
function ownerOverridable(memoryKey: string): boolean {
  return parseOwnerDnrKey(memoryKey) !== null;
}

async function ownerBusinessContext(workspaceId: string, businessId: string) {
  const { db } = await import("@/lib/db");
  const business = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  const real = await db.ownerBusiness.findMany({ where: { workspaceId, isActive: true, isFixtureBusiness: false }, select: { id: true }, take: 2 });
  return { db, soleRealBusinessId: real.length === 1 ? real[0].id : null };
}

/**
 * The active blocking do-not-repeat rules the Owner can act on for one business: rules attributable to it
 * (appliesToBusiness — the owner gate's own applicability: its own rules, and business-less rules only when
 * it is the workspace's sole real business) whose key is an owner-domain key (Consulting-only keys are
 * never listed: the Owner path cannot lift them). Each carries this business's Owner override, if any.
 */
export async function listOwnerDoNotRepeatRules(workspaceId: string, businessId: string): Promise<OwnerDoNotRepeatRuleView[]> {
  const { db, soleRealBusinessId } = await ownerBusinessContext(workspaceId, businessId);
  const [rules, overrides] = await Promise.all([
    db.ownerDoNotRepeatRule.findMany({
      where: { workspaceId, active: true, blocksRepetition: true, OR: [{ businessId }, { businessId: null }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, businessId: true, memoryKey: true, summary: true, reason: true, changedContextExplanation: true, createdAt: true },
    }),
    loadOwnerDnrOverrides(db as unknown as DnrOwnerOverrideDb, workspaceId, businessId, new Date()),
  ]);
  return (rules as RuleRow[])
    .filter((r) => appliesToBusiness(r.businessId, businessId, soleRealBusinessId) && ownerOverridable(r.memoryKey))
    .map((r) => ruleView(r, overrides.get(r.id) ?? null));
}

export interface RecordOwnerDnrOverrideInput {
  workspaceId: string;
  businessId: string;
  ruleId: string;
  actorId: string;
  reason: string;
}

/** Why an Owner override was refused, as a stable code the Owner UI maps to its own actionable text. */
export type OwnerDnrOverrideRefusal = "REASON_TOO_SHORT" | "RULE_INACTIVE" | "ALREADY_RECORDED";
export class OwnerDnrOverrideRefusedError extends ValidationError {
  constructor(readonly refusal: OwnerDnrOverrideRefusal, message: string) {
    super(message);
    this.name = "OwnerDnrOverrideRefusedError";
  }
}

/**
 * Record, for Owner Mode of ONE business, what has changed since a do-not-repeat rule was set (Decision 3).
 * The shared rule row is never modified, so Formal Consulting Mode's semantics are unchanged. Governed:
 *   - the business belongs to the workspace; the rule is in the workspace, active, blocking, an
 *     owner-domain rule (Consulting-only keys cannot be lifted here) and attributable to that business
 *     (appliesToBusiness) — a rule of another business, or a business-less rule in a multi-business
 *     workspace, is refused (never silently lifted);
 *   - a meaningful reason (MIN_CHANGED_CONTEXT_LENGTH characters after trimming);
 *   - append-only: an override already recorded for this rule and business is never replaced — the same
 *     text again is idempotent, a different one is refused; a concurrent duplicate resolves the same way;
 *   - the override fact and its audit event are written in one transaction.
 */
export async function recordOwnerDnrOverride(input: RecordOwnerDnrOverrideInput): Promise<OwnerDoNotRepeatRuleView> {
  const reason = input.reason.trim();
  if (reason.length < MIN_CHANGED_CONTEXT_LENGTH) {
    throw new OwnerDnrOverrideRefusedError("REASON_TOO_SHORT", `Describe what has changed in at least ${MIN_CHANGED_CONTEXT_LENGTH} characters.`);
  }
  const { db, soleRealBusinessId } = await ownerBusinessContext(input.workspaceId, input.businessId);
  const rule = (await db.ownerDoNotRepeatRule.findFirst({
    where: { id: input.ruleId, workspaceId: input.workspaceId },
    select: { id: true, businessId: true, memoryKey: true, summary: true, reason: true, changedContextExplanation: true, active: true, blocksRepetition: true, createdAt: true },
  })) as (RuleRow & { active: boolean; blocksRepetition: boolean }) | null;
  if (!rule || !appliesToBusiness(rule.businessId, input.businessId, soleRealBusinessId) || !ownerOverridable(rule.memoryKey)) {
    throw new NotFoundError("OwnerDoNotRepeatRule", input.ruleId);
  }
  if (!rule.active || !rule.blocksRepetition) {
    throw new OwnerDnrOverrideRefusedError("RULE_INACTIVE", "This do-not-repeat rule is no longer active, so it holds nothing back.");
  }
  const sourceId = dnrOwnerOverrideSourceId(rule.id, input.businessId);
  const existing = async () =>
    (await loadOwnerDnrOverrides(db as unknown as DnrOwnerOverrideDb, input.workspaceId, input.businessId, new Date())).get(rule.id) ?? null;
  const settle = (o: DnrOwnerOverride) => {
    if (o.reason.trim() === reason) return ruleView(rule, o);
    throw new OwnerDnrOverrideRefusedError("ALREADY_RECORDED", "What has changed was already recorded on this rule for this business. It cannot be replaced.");
  };
  const prior = await existing();
  if (prior) return settle(prior);

  const recordedAt = new Date().toISOString();
  const override: DnrOwnerOverride = { ruleId: rule.id, businessId: input.businessId, actorId: input.actorId, reason, recordedAt };
  try {
    await db.$transaction(async (tx: import("@/generated/prisma/client").Prisma.TransactionClient) => {
      // Version 1 only: the (workspace, type, source, version) unique key makes a concurrent duplicate fail
      // here instead of superseding the first override.
      await tx.operatingMemoryEntry.create({
        data: {
          workspaceId: input.workspaceId,
          memoryType: DNR_OWNER_OVERRIDE_MEMORY_TYPE,
          sourceModel: DNR_OWNER_OVERRIDE_SOURCE_MODEL,
          sourceId,
          version: 1,
          key: dnrOwnerOverrideKey(rule.id, input.businessId),
          summary: `Owner recorded what has changed for do-not-repeat rule "${rule.summary}"`.slice(0, 1000),
          data: { ...override },
        },
      });
      await emitAuditEvent(
        {
          workspaceId: input.workspaceId,
          eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_CONTEXT_CHANGED,
          actorId: input.actorId,
          actorType: "user",
          entityType: "owner_do_not_repeat_rule",
          entityId: rule.id,
          payload: {
            scope: "owner_business_override",
            ruleId: rule.id,
            businessId: input.businessId,
            ruleBusinessId: rule.businessId,
            memoryKey: rule.memoryKey,
            changedContextExplanation: reason,
            recordedAt,
          },
        },
        tx,
      );
    });
  } catch (err) {
    // A concurrent request recorded the override first: same text → idempotent, different → refused.
    if ((err as { code?: string })?.code === "P2002") {
      const won = await existing();
      if (won) return settle(won);
      throw new ConflictError("This rule was changed by another request. Reload and retry.", { ruleId: rule.id });
    }
    throw err;
  }
  return ruleView(rule, override);
}
