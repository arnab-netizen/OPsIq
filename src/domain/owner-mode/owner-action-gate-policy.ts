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
 *   - EXECUTE (carrying out existing work): not treated as growth. The limits apply by what the action
 *     consumes — its domain: capacity for capacity-consuming domains, cash by the domain's spend
 *     sensitivity, margin for pricing domains.
 *   - unknown intent (no finding code — the documented legacy fallback): as EXECUTE, and a broad
 *     do-not-repeat area rule applies (do-not-repeat-scope.ts).
 *   - An expired, business-attributed compliance obligation is a professional-review hard stop for every
 *     material action, protective or not (renew or review it first; the owner may use the audited opt-out).
 *     An obligation with no business in a multi-business workspace is never attributed here.
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
  /** The ONE current cash/finance reading's gate state (null ⇒ no reading: nothing to enforce). */
  cash: { gateState: FinancialHealthState | null; basis: string };
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
  cash: { gateState: null, basis: "" },
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
  | { allowed: false; code: OwnerGateBlockCode; reason: string };

/** Pure constraint builders over the rows the service loads. */
export function capacityConstraint(fleet: Array<EquipmentRecord & { name: string }>, now: Date): OwnerGateConstraints["capacity"] {
  const c = assessFleetCapacity(fleet, now);
  return { status: c.status, reason: c.reason, bottlenecks: c.bottlenecks };
}

/**
 * Which obligations apply to a business: its own, and — only when it is the workspace's sole real business —
 * those recorded with no business. In a multi-business workspace a business-less obligation is
 * UNATTRIBUTED: it is surfaced for attribution (owner decision) but restricts no business's actions.
 */
export function expiredComplianceFor(
  items: ReadonlyArray<{ businessId: string | null; name: string; kind: string; expiresAt: Date | null }>,
  businessId: string | null,
  soleRealBusiness: boolean,
  now: Date
): { name: string; kind: string } | null {
  const hit = items.find(
    (c) => isExpired(c.expiresAt, now) && (businessId === null || c.businessId === businessId || (c.businessId === null && soleRealBusiness))
  );
  return hit ? { name: hit.name, kind: hit.kind } : null;
}

/**
 * Evaluate one material transition against the constraints. Order (the first failing check decides):
 * do-not-repeat → capacity → cash → margin → compliance.
 */
export function evaluateOwnerActionGate(c: OwnerGateConstraints, s: OwnerGateSubject): OwnerGateVerdict {
  if (c.optedOut) return { allowed: true, marginAbstention: null };
  const protective = s.intent !== null && PROTECTIVE_INTENTS.has(s.intent);
  const growth = s.intent === "GROW";
  const domain = canonicalOwnerScopeDomain(s.domain) ?? s.domain;

  // 1. Do-not-repeat: an exact memory of this finding applies to any intent; a broad area memory only to
  //    growth (or unknown intent).
  const dnr = c.doNotRepeat.find(
    (r) => r.domain === domain && (r.match === "broad" || (s.findingId != null && r.findingId === s.findingId)) && ownerDoNotRepeatApplies(r.match, s.intent)
  );
  if (dnr) {
    return {
      allowed: false,
      code: "DO_NOT_REPEAT_BLOCKED",
      reason: `This ${s.domain} action repeats a decision marked do-not-repeat. Provide a changed-context reason to override.`,
    };
  }

  if (!protective) {
    // 2. Capacity — for actions that consume capacity.
    if (CAPACITY_SENSITIVE_DOMAINS.has(s.domain) && (c.capacity.status === "blocked" || c.capacity.status === "high_risk")) {
      return {
        allowed: false,
        code: "CAPACITY_BLOCKED",
        reason: `Capacity is unsafe (${c.capacity.reason}${c.capacity.bottlenecks.length ? `: ${c.capacity.bottlenecks.join(", ")}` : ""}). Clear the bottleneck before advancing this ${s.domain} action.`,
      };
    }
    // 3. Cash — growth at AT_RISK or worse; spend by the domain's sensitivity.
    if (c.businessScoped && c.cash.gateState) {
      const sensitivity = growth ? RecommendationSensitivity.GROWTH_SENSITIVE : DOMAIN_CASH_SENSITIVITY[s.domain] ?? RecommendationSensitivity.GENERAL;
      const r = evaluateCashSafetyGate(c.cash.gateState, c.cash.gateState, sensitivity);
      if (!r.allowed) {
        return { allowed: false, code: "CASH_SAFETY_BLOCKED", reason: `${r.reason}${c.cash.basis} Resolve cash/finance survival before advancing this ${s.domain} action.` };
      }
    }
    // 4. Margin — a KNOWN margin below the floor stops pricing-domain actions (scaling a proven loss).
    if (c.businessScoped && MARGIN_SENSITIVE_DOMAINS.has(s.domain)) {
      const m = evaluateMarginSafety(c.grossMarginPct, RecommendationSensitivity.PRICING_SENSITIVE, DEFAULT_MARGIN_FLOOR_PCT);
      if (m.outcome === MarginSafetyOutcome.BLOCKED_BELOW_FLOOR) {
        return { allowed: false, code: "MARGIN_SAFETY_BLOCKED", reason: `${m.reason} Restore margin above the floor before advancing this ${s.domain} action.` };
      }
    }
  }

  // 5. Compliance — an expired, attributed obligation is a professional-review hard stop.
  if (c.expiredCompliance) {
    return {
      allowed: false,
      code: "COMPLIANCE_BLOCKED",
      reason: `Professional-review required: "${c.expiredCompliance.name}" (${c.expiredCompliance.kind}) is expired. Renew it (or seek professional review) before advancing this ${s.domain} action.`,
    };
  }

  // Allowed. A non-protective pricing-domain action whose margin is unknown is not claimed as a loss (the
  // shared margin gate's contract) — the Owner-mode abstention is reported for the caller to record.
  const abstain = c.businessScoped && !protective && MARGIN_SENSITIVE_DOMAINS.has(s.domain) && c.grossMarginPct === null;
  return { allowed: true, marginAbstention: abstain ? OWNER_MARGIN_REQUIRED_DATA : null };
}
