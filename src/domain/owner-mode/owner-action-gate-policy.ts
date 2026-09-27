/**
 * The owner-mode action gate's policy (pure) — ONE evaluation used twice:
 *   - by the server-side gate (owner-action-gate.service.ts), the final enforcement at mutation time;
 *   - by the canonical owner decision (owner-decision.ts canonicalEligibility), so it never elects or
 *     lists as a supporting step an action the gate would refuse at the state the decision was resolved
 *     with. The gate re-checks at mutation time (state can change between the two — TOCTOU); this module
 *     is not a second arbiter: it decides nothing about priority, only whether a transition is permitted.
 *
 * The constraints are a business's current safety state, loaded by the service. How they apply depends on
 * the action's INTENT (owner-imperatives.ts — the same intent the canonical decision uses):
 *   - SAFETY / STABILISE / REPAIR / EVIDENCE respond to a danger: never held back by the growth limits
 *     (capacity, cash, margin) nor by a broad do-not-repeat area rule.
 *   - GROW: every limit applies (capacity, cash at AT_RISK or worse, known margin below the floor).
 *   - EXECUTE (carrying out existing work — process, SOP and execution fixes): not growth. It adds no volume
 *     and commits no new spend, so the capacity and margin limits do not apply, and cash holds it only at
 *     existential (insolvency) risk — the cash gate's GENERAL sensitivity. A broad do-not-repeat area rule
 *     does not hold it (an exact finding memory does).
 *   - unknown intent (no finding code — the documented legacy fallback): the domain's own sensitivity
 *     (capacity, spend, margin), and a broad do-not-repeat area rule applies (do-not-repeat-scope.ts).
 *   - An expired, business-attributed compliance obligation is a professional-review hard stop for every
 *     material action, protective or not (renew or review it first; the owner may use the audited opt-out).
 *     Rows recorded with no business (obligations, equipment, do-not-repeat memories) apply only when the
 *     action's business is the workspace's sole real business (appliesToBusiness) — never to every business.
 */
import { assessFleetCapacity, type CapacityStatus, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
import { evaluateCashSafetyGate, type FinancialHealthState } from "@/domain/owner-finance/cash-safety-gate";
import { evaluateMarginSafety, DEFAULT_MARGIN_FLOOR_PCT, MarginSafetyOutcome } from "@/domain/owner-finance/margin-safety-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { isExpired } from "@/domain/owner-mode/compliance-boundary";
import { canonicalOwnerScopeDomain, ownerDoNotRepeatApplies } from "@/domain/owner-mode/do-not-repeat-scope";
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";

/** Material owner-action transitions that must pass the gate. */
export const MATERIAL_ACTION_STATUSES: ReadonlySet<string> = new Set(["in_progress", "completed"]);

/** Domains whose actions consume physical capacity. */
export const CAPACITY_SENSITIVE_DOMAINS: ReadonlySet<string> = new Set(["marketing", "sales", "strategy", "operations"]);

/** Domains where pushing an action while gross margin is below the floor scales a loss (pricing/growth). */
export const MARGIN_SENSITIVE_DOMAINS: ReadonlySet<string> = new Set(["sales", "marketing"]);

/** What an owner domain's actions spend, as the cash gate's sensitivity. */
export const DOMAIN_CASH_SENSITIVITY: Readonly<Record<string, RecommendationSensitivity>> = Object.freeze({
  finance: RecommendationSensitivity.FINANCE_SENSITIVE,
  cashflow: RecommendationSensitivity.FINANCE_SENSITIVE,
  marketing: RecommendationSensitivity.GROWTH_SENSITIVE,
  sales: RecommendationSensitivity.GROWTH_SENSITIVE,
  strategy: RecommendationSensitivity.GROWTH_SENSITIVE,
  operations: RecommendationSensitivity.GROWTH_SENSITIVE,
  sop: RecommendationSensitivity.GENERAL,
  recovery: RecommendationSensitivity.GENERAL,
});

/** Intents that respond to a danger: never held back by the growth limits or a broad do-not-repeat rule. */
export const PROTECTIVE_INTENTS: ReadonlySet<OwnerTargetIntent> = new Set(["SAFETY", "STABILISE", "REPAIR", "EVIDENCE"]);

/** Owner-mode only: recorded when a GROW / non-protective pricing-domain action advances with an unknown margin. */
export const OWNER_MARGIN_ABSTENTION_CODE = "CANNOT_ASSESS_MARGIN_SAFETY";
/** What an owner business must supply for its margin to be assessed. */
export const OWNER_MARGIN_REQUIRED_DATA: readonly string[] = [
  "current revenue for this business (latest financial snapshot)",
  "current cost of goods sold for this business (latest financial snapshot)",
];

export type OwnerGateBlockCode = "DO_NOT_REPEAT_BLOCKED" | "CAPACITY_BLOCKED" | "CASH_SAFETY_BLOCKED" | "MARGIN_SAFETY_BLOCKED" | "COMPLIANCE_BLOCKED";

/** One active, blocking do-not-repeat memory without a changed-context override. */
export interface OwnerGateDoNotRepeatRule {
  /** The rule's id (the owner records what has changed on this rule to lift it). */
  id: string;
  /** The owner domain its key names (alias-resolved; parseOwnerDnrKey). */
  domain: string;
  /** "broad": an area key (`scope:<domain>`); "exact": a finding-specific key. */
  match: "broad" | "exact";
  /** The finding an exact memory is about (`scope:<area>:finding:<id>`); null for a broad area memory. */
  findingId: string | null;
}

/** A business's current safety state, as the gate reads it. */
export interface OwnerGateConstraints {
  /** The owner's audited gate opt-out is active: nothing is enforced. */
  optedOut: boolean;
  /** False when the action carries no business: the business-level cash and margin limits cannot apply. */
  businessScoped: boolean;
  doNotRepeat: readonly OwnerGateDoNotRepeatRule[];
  capacity: { status: CapacityStatus; reason: string; bottlenecks: string[] };
  /**
   * The ONE current cash/finance reading's gate state (null ⇒ no reading: nothing to enforce) and what
   * drives it (current-cash-finance-reading.ts gateDriver) — a block is named by its real cause.
   */
  cash: { gateState: FinancialHealthState | null; basis: string; driver: "cash" | "finance_profit" | "unverified" | null };
  /** Gross margin of the business's current effective snapshot (null ⇒ unknown). */
  grossMarginPct: number | null;
  /** The first expired obligation that applies to this business (attributed), or null. */
  expiredCompliance: { name: string; kind: string } | null;
}

/** No constraint at all (e.g. no business, or nothing recorded). */
export const NO_OWNER_GATE_CONSTRAINTS: OwnerGateConstraints = Object.freeze({
  optedOut: false,
  businessScoped: true,
  doNotRepeat: [],
  capacity: { status: "safe" as CapacityStatus, reason: "No equipment tracked.", bottlenecks: [] },
  cash: { gateState: null, basis: "", driver: null },
  grossMarginPct: null,
  expiredCompliance: null,
});

export interface OwnerGateSubject {
  domain: string;
  intent: OwnerTargetIntent | null;
  /** The action's finding (matches an exact do-not-repeat memory). */
  findingId?: string | null;
}

export type OwnerGateVerdict =
  | { allowed: true; marginAbstention: readonly string[] | null }
  | { allowed: false; code: OwnerGateBlockCode; reason: string; ruleId?: string };

const STATE_WORDS: Readonly<Record<FinancialHealthState, string>> = Object.freeze({
  SAFE: "safe",
  WATCH: "on watch",
  AT_RISK: "at risk",
  CRITICAL: "critical",
  INSOLVENT_RISK: "at risk of insolvency",
});
const DOMAIN_WORDS: Readonly<Record<string, string>> = Object.freeze({
  finance: "Finance", cashflow: "Cash flow", sales: "Sales", operations: "Operations", sop: "Execution",
  marketing: "Marketing", strategy: "Strategy", recovery: "Recovery",
});

/** The owner-facing reason for a cash hold, named by what drives it (never a Consulting enum). */
function cashHoldReason(c: OwnerGateConstraints["cash"], state: FinancialHealthState, area: string, growth: boolean): string {
  const s = STATE_WORDS[state];
  if (c.driver === "finance_profit") {
    return `Financial survival is ${s} in your Finance diagnosis, driven by profit and margin rather than cash${c.basis}. This ${area} step waits until profitability is restored.`;
  }
  if (c.driver === "unverified") {
    return `Your cash and Finance figures are not current (out of date, or amended and not yet re-diagnosed); OpsIQ cannot treat them as safe (last reading: ${s}). This ${area} step waits until current figures are entered and diagnosed.`;
  }
  return `Cash survival is ${s}${c.basis}. This ${area} step waits until cash is ${growth ? "safe enough for growth" : "no longer at this level"}.`;
}

/** Pure constraint builders over the rows the service loads. */
export function capacityConstraint(fleet: Array<EquipmentRecord & { name: string }>, now: Date): OwnerGateConstraints["capacity"] {
  const c = assessFleetCapacity(fleet, now);
  return { status: c.status, reason: c.reason, bottlenecks: c.bottlenecks };
}

/**
 * Which obligations apply to a business: its own, and — only when it IS the workspace's sole real business —
 * those recorded with no business (appliesToBusiness). In a multi-business workspace a business-less
 * obligation is UNATTRIBUTED: it is surfaced for attribution (owner decision) but restricts no business.
 */
export function expiredComplianceFor(
  items: ReadonlyArray<{ businessId: string | null; name: string; kind: string; expiresAt: Date | null }>,
  businessId: string | null,
  soleRealBusinessId: string | null,
  now: Date
): { name: string; kind: string } | null {
  const hit = items.find((c) => isExpired(c.expiresAt, now) && appliesToBusiness(c.businessId, businessId, soleRealBusinessId));
  return hit ? { name: hit.name, kind: hit.kind } : null;
}

/**
 * Whether a row recorded for `rowBusinessId` (null ⇒ recorded with no business) applies to an action of
 * `businessId`: its own business's rows always; a business-less row only when this business IS the
 * workspace's sole real business (null never means "every business"). An action with no business: only
 * business-less rows.
 */
export function appliesToBusiness(rowBusinessId: string | null, businessId: string | null, soleRealBusinessId: string | null): boolean {
  if (businessId === null) return rowBusinessId === null;
  return rowBusinessId === businessId || (rowBusinessId === null && soleRealBusinessId === businessId);
}

/**
 * Evaluate one material transition against the constraints. Order (the first failing check decides):
 * do-not-repeat → capacity → cash → margin → compliance.
 */
export function evaluateOwnerActionGate(c: OwnerGateConstraints, s: OwnerGateSubject): OwnerGateVerdict {
  if (c.optedOut) return { allowed: true, marginAbstention: null };
  const protective = s.intent !== null && PROTECTIVE_INTENTS.has(s.intent);
  const growth = s.intent === "GROW";
  const execute = s.intent === "EXECUTE";
  const domain = canonicalOwnerScopeDomain(s.domain) ?? s.domain;
  const area = DOMAIN_WORDS[domain] ?? s.domain;

  // 1. Do-not-repeat: an exact memory of this finding applies to any intent; a broad area memory only to
  //    growth (or unknown intent).
  const dnr = c.doNotRepeat.find(
    (r) => r.domain === domain && (r.match === "broad" || (s.findingId != null && r.findingId === s.findingId)) && ownerDoNotRepeatApplies(r.match, s.intent)
  );
  if (dnr) {
    return {
      allowed: false,
      code: "DO_NOT_REPEAT_BLOCKED",
      reason: `This ${area} step repeats a decision marked do-not-repeat after an earlier result. Record what has changed on that rule (Cockpit → Do-not-repeat rules) to proceed.`,
      ruleId: dnr.id,
    };
  }

  if (!protective) {
    // 2. Capacity — only for work that adds volume (never EXECUTE).
    if (!execute && CAPACITY_SENSITIVE_DOMAINS.has(s.domain) && (c.capacity.status === "blocked" || c.capacity.status === "high_risk")) {
      return {
        allowed: false,
        code: "CAPACITY_BLOCKED",
        reason: `Capacity is unsafe (${c.capacity.reason}${c.capacity.bottlenecks.length ? `: ${c.capacity.bottlenecks.join(", ")}` : ""}). This ${area} step waits until the bottleneck is cleared.`,
      };
    }
    // 3. Cash — growth at AT_RISK or worse; EXECUTE only at existential risk; otherwise by the domain's spend.
    if (c.businessScoped && c.cash.gateState) {
      const sensitivity = growth
        ? RecommendationSensitivity.GROWTH_SENSITIVE
        : execute
          ? RecommendationSensitivity.GENERAL
          : DOMAIN_CASH_SENSITIVITY[s.domain] ?? RecommendationSensitivity.GENERAL;
      const r = evaluateCashSafetyGate(c.cash.gateState, c.cash.gateState, sensitivity);
      if (!r.allowed) {
        return { allowed: false, code: "CASH_SAFETY_BLOCKED", reason: cashHoldReason(c.cash, c.cash.gateState, area, growth) };
      }
    }
    // 4. Margin — a KNOWN margin below the floor stops pricing-domain work that scales volume (never EXECUTE).
    if (!execute && c.businessScoped && MARGIN_SENSITIVE_DOMAINS.has(s.domain)) {
      const m = evaluateMarginSafety(c.grossMarginPct, RecommendationSensitivity.PRICING_SENSITIVE, DEFAULT_MARGIN_FLOOR_PCT);
      if (m.outcome === MarginSafetyOutcome.BLOCKED_BELOW_FLOOR) {
        return {
          allowed: false,
          code: "MARGIN_SAFETY_BLOCKED",
          reason: `Gross margin is ${Math.round((c.grossMarginPct ?? 0) * 10) / 10}%, below the ${DEFAULT_MARGIN_FLOOR_PCT}% safety floor. This ${area} step waits until margin is restored above the floor.`,
        };
      }
    }
  }

  // 5. Compliance — an expired, attributed obligation is a professional-review hard stop.
  if (c.expiredCompliance) {
    return {
      allowed: false,
      code: "COMPLIANCE_BLOCKED",
      reason: `Professional review required: "${c.expiredCompliance.name}" (${c.expiredCompliance.kind}) has expired. Renew it (or get professional review) before this ${area} step goes ahead.`,
    };
  }

  // Allowed. A pricing-domain action that scales volume, whose margin is unknown, is not claimed as a loss
  // (the shared margin gate's contract) — the Owner-mode abstention is reported for the caller to record.
  const abstain = c.businessScoped && !protective && !execute && MARGIN_SENSITIVE_DOMAINS.has(s.domain) && c.grossMarginPct === null;
  return { allowed: true, marginAbstention: abstain ? OWNER_MARGIN_REQUIRED_DATA : null };
}
