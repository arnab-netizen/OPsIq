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
 *   - EXECUTE (carrying out existing work — process, SOP and execution fixes): intent describes the business
 *     PURPOSE, not the workflow state. EXECUTE is released from capacity by default — it is held by unsafe
 *     capacity only when its lever explicitly pushes more volume through capacity (CAPACITY_CONSUMING_CODES).
 *     It is NOT released from cash or margin: cash applies with the domain's normal spend sensitivity, and a
 *     KNOWN margin below the floor holds it when its lever is pricing/margin-sensitive (PRICING_SENSITIVE_CODES;
 *     the domain decides only when the action carries no finding code). Work that actually fixes a margin or
 *     cash problem is REPAIR / STABILISE, never EXECUTE. A broad do-not-repeat area rule does not hold it (an
 *     exact finding memory does).
 *   - unknown intent (no finding code — the documented legacy fallback): the domain's own sensitivity
 *     (capacity, spend, margin), and a broad do-not-repeat area rule applies (do-not-repeat-scope.ts).
 *   - An expired, business-attributed compliance obligation is a professional-review hard stop for every
 *     material action, protective or not (renew or review it first; the owner may use the audited opt-out).
 *     Rows recorded with no business (obligations, equipment, do-not-repeat memories) apply only when the
 *     action's business is the workspace's sole real business (appliesToBusiness) — never to every business.
 */
import { assessEquipmentCapacity, assessFleetCapacity, type CapacityStatus, type EquipmentRecord } from "@/domain/owner-mode/equipment-capacity";
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

/**
 * Levers that push more volume through physical capacity (by what the finding's remedy does, never by its
 * domain alone): an EXECUTE step with one of these is held by unsafe capacity like growth.
 */
export const CAPACITY_CONSUMING_CODES: ReadonlySet<string> = new Set([
  // "Recover delayed throughput": pulls late orders through the slow stage — more load on the bottleneck.
  "OPS_OPP_RECOVER_DELAYS",
  "OPS_OPP_USE_CAPACITY_HEADROOM",
  "SALES_OPP_CONVERT_PIPELINE", "SALES_OPP_RAISE_CONVERSION", "SALES_OPP_WINBACK", "SALES_OPP_IMPROVE_RETENTION",
  "MKT_OPP_SCALE_WINNER", "MKT_OPP_LIFT_CONVERSION", "MKT_OPP_ACTIVATE_REFERRALS", "MKT_OPP_BUILD_ORGANIC", "MKT_OPP_ADD_FOLLOWUP",
]);

/**
 * Levers that sell more volume at the current price/discount (a known below-floor margin scales the loss):
 * an EXECUTE step with one of these is held by a known below-floor margin. Repricing or tightening discounts
 * repairs margin (REPAIR), so it is not listed.
 */
export const PRICING_SENSITIVE_CODES: ReadonlySet<string> = new Set([
  "SALES_OPP_CONVERT_PIPELINE", "SALES_OPP_RAISE_CONVERSION", "SALES_OPP_WINBACK", "SALES_OPP_IMPROVE_RETENTION",
  "SALES_WEAK_B2B_PIPELINE", "B2B_CONCENTRATION",
  "MKT_OPP_SCALE_WINNER", "MKT_OPP_LIFT_CONVERSION", "MKT_OPP_ACTIVATE_REFERRALS", "MKT_OPP_BUILD_ORGANIC", "MKT_OPP_ADD_FOLLOWUP",
  "MKT_LOW_REFERRAL", "MKT_WRONG_CHANNEL_MIX",
]);

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

/** One failing check of a transition. */
export interface OwnerGateBlock {
  code: OwnerGateBlockCode;
  reason: string;
  /** The do-not-repeat rule that holds it (DO_NOT_REPEAT_BLOCKED only). */
  ruleId?: string;
}

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
  /** The rule's stored key (for surfaces that name it). */
  memoryKey?: string;
  /** What the rule records (for surfaces that name it); null when not loaded. */
  summary?: string | null;
  reason?: string | null;
}

/** A business's current safety state, as the gate reads it. */
export interface OwnerGateConstraints {
  /** The owner's audited gate opt-out is active: nothing is enforced. */
  optedOut: boolean;
  /** False when the action carries no business: the business-level cash and margin limits cannot apply. */
  businessScoped: boolean;
  doNotRepeat: readonly OwnerGateDoNotRepeatRule[];
  /**
   * Fleet capacity. `confidence` (0..1) comes from the equipment record that decides the status
   * (capacityConstraint): a dated fact (maintenance overdue) 1; a recorded state (down / out of service /
   * utilization at the ceiling) updated within the freshness window 0.9, older — or with no record time —
   * capped at 0.4; null ⇒ unknown (no blocking evidence).
   */
  capacity: { status: CapacityStatus; reason: string; bottlenecks: string[]; confidence?: number | null };
  /**
   * The ONE current cash/finance reading's gate state (null ⇒ no reading: nothing to enforce) and what
   * drives it (current-cash-finance-reading.ts gateDriver) — a block is named by its real cause.
   */
  cash: {
    gateState: FinancialHealthState | null;
    basis: string;
    driver: "cash" | "finance_profit" | "unverified" | null;
    /** Source-derived confidence in gateState, 0..1 (capped when unverified/provisional); null ⇒ unknown. */
    confidence?: number | null;
    /** The in-progress current period's figures decide gateState (label as in progress). */
    provisional?: boolean;
    /** Cash flow and Finance disagree and neither is more current: the worse reading is enforced as a fail-safe (advice policy: conflict requires resolution). */
    conflicting?: boolean;
    /** The source whose figures decide gateState (routes a refresh to the right source). */
    source?: "cashflow" | "finance" | null;
    /**
     * P2-8: each source's OWN in-progress reading, independent of `driver` (which names only the source
     * that wins the single overall enforced state). Home's cash card and financial card each tighten by
     * their own source's danger here — never dropped just because the other source is worse and wins the
     * enforcement decision above.
     */
    provisionalCashState?: "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK" | null;
    provisionalFinanceState?: "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK" | null;
    /**
     * Evidence sufficiency, SEPARATE from `gateState` (current-cash-finance-reading.ts `gateEvidenceSufficient`): false when a
     * present current reading rests on incomplete material cash evidence (a Cash flow position whose total cash is not
     * established, or Finance liquidity unconfirmed). It never raises `gateState` (unknown is not danger); a growth-sensitive
     * step needs BOTH a sufficiently safe state and sufficient evidence. Absent = sufficient (fixtures only: the loader always sets it).
     */
    evidenceSufficient?: boolean;
    /** The gaps behind `evidenceSufficient === false`: source, reason, and the unknown field(s). */
    evidenceGaps?: ReadonlyArray<{ source: "cashflow" | "finance"; reason: string; missing: readonly string[] }>;
  };
  /** Gross margin of the business's current effective snapshot (null ⇒ unknown). */
  grossMarginPct: number | null;
  /**
   * Confidence in that margin, 0..1 (null ⇒ unknown): the snapshot's own data confidence, capped at 0.4 when
   * its period ended more than the freshness window ago (out-of-date figures are never high confidence).
   */
  grossMarginConfidence?: number | null;
  /**
   * The margin figure rests on an out-of-date (or undated) completed snapshot: it is the LAST-KNOWN margin, not a current
   * measurement. Wording only: the hold itself is unchanged. (The margin source is the current effective completed snapshot;
   * in-progress margin readings are not used.)
   */
  grossMarginOutOfDate?: boolean;
  /** The first expired obligation that applies to this business (attributed), or null. */
  expiredCompliance: { name: string; kind: string } | null;
}

/** No constraint at all (e.g. no business, or nothing recorded). */
export const NO_OWNER_GATE_CONSTRAINTS: OwnerGateConstraints = Object.freeze({
  optedOut: false,
  businessScoped: true,
  doNotRepeat: [],
  capacity: { status: "safe" as CapacityStatus, reason: "No equipment tracked.", bottlenecks: [], confidence: null },
  cash: { gateState: null, basis: "", driver: null, confidence: null, provisional: false, source: null, provisionalCashState: null, provisionalFinanceState: null },
  grossMarginPct: null,
  grossMarginConfidence: null,
  expiredCompliance: null,
});

export interface OwnerGateSubject {
  domain: string;
  intent: OwnerTargetIntent | null;
  /** The action's finding (matches an exact do-not-repeat memory). */
  findingId?: string | null;
  /** The action's finding code — its lever (capacity-consuming / pricing-sensitive EXECUTE work). */
  findingCode?: string | null;
}

/**
 * A blocked verdict names its FIRST failing check (code/reason/ruleId — the order below) and lists EVERY
 * failing check in `blocks`, so a surface can show all simultaneous blockers (clearing one never reveals a
 * hidden second one).
 */
export type OwnerGateVerdict =
  | { allowed: true; marginAbstention: readonly string[] | null }
  | { allowed: false; code: OwnerGateBlockCode; reason: string; ruleId?: string; blocks: readonly OwnerGateBlock[] };

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
  if (c.driver === "finance_profit" && !c.provisional) {
    return `Financial survival is ${s} in your Finance diagnosis, driven by profit and margin rather than cash${c.basis}. This ${area} step waits until profitability is restored.`;
  }
  if (c.driver === "unverified") {
    return c.provisional
      ? `Only this period's in-progress figures are available, and they are not yet a completed reading; OpsIQ cannot treat them as safe. This ${area} step waits until a completed period is entered and diagnosed.`
      : `Your cash and Finance figures are not current (out of date, or amended and not yet re-diagnosed); OpsIQ cannot treat them as safe (last reading: ${s}). This ${area} step waits until current figures are entered and diagnosed.`;
  }
  const inProgress = c.provisional ? " in this period's in-progress figures" : "";
  if (c.driver === "finance_profit" && c.provisional) {
    return `Financial survival is ${s}${inProgress}, driven by profit and margin rather than cash${c.basis}. This ${area} step waits until profitability is restored.`;
  }
  return `Cash survival is ${s}${inProgress}${c.basis}. This ${area} step waits until cash is ${growth ? "safe enough for growth" : "no longer at this level"}.`;
}

const EVIDENCE_FIELD_WORDS: Readonly<Record<string, string>> = Object.freeze({ cashInHand: "cash in hand", bankBalance: "bank balance" });

/** Owner-facing hold when total cash is not established: names what to enter, never claims danger. */
function cashEvidenceReason(gaps: NonNullable<OwnerGateConstraints["cash"]["evidenceGaps"]>, area: string): string {
  const labels = [...new Set(gaps.flatMap((g) => g.missing.map((m) => EVIDENCE_FIELD_WORDS[m] ?? m)))];
  const what = labels.length > 0 ? labels.join(" and ") : "cash";
  return `Total cash is not confirmed yet; enter the missing ${what} figure before OpsIQ clears this ${area} growth step.`;
}

/** Pure constraint builders over the rows the service loads. */
/** Freshness window for recorded equipment state (the Owner evidence window). */
export const CAPACITY_RECORD_FRESH_DAYS = 45;
/** Confidence cap for out-of-date or undated evidence (the same cap as unverified cash/finance readings). */
export const OUT_OF_DATE_EVIDENCE_CONFIDENCE = 0.4;

export function capacityConstraint(fleet: Array<EquipmentRecord & { name: string; updatedAt?: Date | null }>, now: Date): OwnerGateConstraints["capacity"] {
  const c = assessFleetCapacity(fleet, now);
  // Confidence from the evidence that decides the status: the best-supported record at the worst status.
  let confidence: number | null = null;
  if (c.status === "blocked" || c.status === "high_risk") {
    for (const eq of fleet) {
      const a = assessEquipmentCapacity(eq, now);
      if (a.status !== c.status) continue;
      const datedFact = eq.maintenanceDueAt !== null && eq.maintenanceDueAt.getTime() <= now.getTime() && eq.downtimeState !== "down" && eq.status !== "out_of_service";
      const recordedAt = eq.updatedAt instanceof Date ? eq.updatedAt.getTime() : null;
      const fresh = recordedAt !== null && now.getTime() - recordedAt <= CAPACITY_RECORD_FRESH_DAYS * 86_400_000;
      const conf = datedFact ? 1 : fresh ? 0.9 : OUT_OF_DATE_EVIDENCE_CONFIDENCE;
      confidence = confidence === null ? conf : Math.max(confidence, conf);
    }
  }
  return { status: c.status, reason: c.reason, bottlenecks: c.bottlenecks, confidence };
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
 * Evaluate one material transition against the constraints. Every check runs; the verdict names the first
 * failing one in this order — do-not-repeat → capacity → cash → margin → compliance — and lists them all.
 */
export function evaluateOwnerActionGate(c: OwnerGateConstraints, s: OwnerGateSubject): OwnerGateVerdict {
  if (c.optedOut) return { allowed: true, marginAbstention: null };
  const protective = s.intent !== null && PROTECTIVE_INTENTS.has(s.intent);
  const growth = s.intent === "GROW";
  const execute = s.intent === "EXECUTE";
  const domain = canonicalOwnerScopeDomain(s.domain) ?? s.domain;
  const area = DOMAIN_WORDS[domain] ?? s.domain;
  const code = s.findingCode ?? null;
  const blocks: OwnerGateBlock[] = [];
  // EXECUTE levers (see the module doc): capacity only when it pushes volume through capacity; margin when
  // it sells volume at the current price (by domain only when the action carries no finding code).
  const consumesCapacity = execute ? code !== null && CAPACITY_CONSUMING_CODES.has(code) : CAPACITY_SENSITIVE_DOMAINS.has(s.domain);
  const pricingSensitive = execute ? (code !== null ? PRICING_SENSITIVE_CODES.has(code) : MARGIN_SENSITIVE_DOMAINS.has(s.domain)) : MARGIN_SENSITIVE_DOMAINS.has(s.domain);

  // 1. Do-not-repeat: an exact memory of this finding applies to any intent; a broad area memory only to
  //    growth (or unknown intent). P1-2: when BOTH an exact and a broad rule match, the exact rule always
  //    wins — deterministically, never by createdAt, row id, or the DB's return order for c.doNotRepeat.
  //    Ties within the same match kind (should not occur in practice, but the evaluator itself must stay
  //    total) break on the rule id's own sort order, never on array position.
  const matchingDnr = c.doNotRepeat.filter(
    (r) => r.domain === domain && (r.match === "broad" || (s.findingId != null && r.findingId === s.findingId)) && ownerDoNotRepeatApplies(r.match, s.intent)
  );
  const exactDnr = matchingDnr.filter((r) => r.match === "exact").sort((a, b) => a.id.localeCompare(b.id))[0];
  const broadDnr = matchingDnr.filter((r) => r.match === "broad").sort((a, b) => a.id.localeCompare(b.id))[0];
  const dnr = exactDnr ?? broadDnr;
  if (dnr) {
    blocks.push({
      code: "DO_NOT_REPEAT_BLOCKED",
      reason: `This ${area} step repeats a decision marked do-not-repeat after an earlier result. Record what has changed on that rule (Cockpit → Do-not-repeat rules) to proceed.`,
      ruleId: dnr.id,
    });
  }

  if (!protective) {
    // 2. Capacity — work that adds volume.
    if (consumesCapacity && (c.capacity.status === "blocked" || c.capacity.status === "high_risk")) {
      blocks.push({
        code: "CAPACITY_BLOCKED",
        reason: `Capacity is unsafe (${c.capacity.reason}${c.capacity.bottlenecks.length ? `: ${c.capacity.bottlenecks.join(", ")}` : ""}). This ${area} step waits until the bottleneck is cleared.`,
      });
    }
    // 3. Cash — growth at AT_RISK or worse; otherwise (EXECUTE included) by the domain's spend sensitivity.
    if (c.businessScoped && c.cash.gateState) {
      const sensitivity = growth ? RecommendationSensitivity.GROWTH_SENSITIVE : DOMAIN_CASH_SENSITIVITY[s.domain] ?? RecommendationSensitivity.GENERAL;
      const r = evaluateCashSafetyGate(c.cash.gateState, c.cash.gateState, sensitivity);
      if (!r.allowed) blocks.push({ code: "CASH_SAFETY_BLOCKED", reason: cashHoldReason(c.cash, c.cash.gateState, area, growth) });
      // State and EVIDENCE are separate: a safe-looking state resting on incomplete material cash evidence is not proof of
      // safety for discretionary growth (explicit GROW, or a legacy/unknown-intent step of a growth-sensitive domain).
      // Protective intents never reach here; EXECUTE is not stopped by an evidence gap.
      else if ((growth || s.intent === null) && sensitivity === RecommendationSensitivity.GROWTH_SENSITIVE && c.cash.evidenceSufficient === false) {
        blocks.push({ code: "CASH_SAFETY_BLOCKED", reason: cashEvidenceReason(c.cash.evidenceGaps ?? [], area) });
      }
    }
    // 4. Margin — a KNOWN margin below the floor stops pricing-sensitive work that scales volume.
    if (c.businessScoped && pricingSensitive) {
      const m = evaluateMarginSafety(c.grossMarginPct, RecommendationSensitivity.PRICING_SENSITIVE, DEFAULT_MARGIN_FLOOR_PCT);
      if (m.outcome === MarginSafetyOutcome.BLOCKED_BELOW_FLOOR) {
        const shown = Math.round((c.grossMarginPct ?? 0) * 10) / 10;
        blocks.push({
          code: "MARGIN_SAFETY_BLOCKED",
          // Out-of-date figures are never worded as a current measurement; the hold is unchanged.
          reason: c.grossMarginOutOfDate
            ? `Your last recorded gross margin (from out-of-date figures) was ${shown}%, below the ${DEFAULT_MARGIN_FLOOR_PCT}% safety floor. This ${area} step stays on hold until current margin figures are confirmed and above the floor.`
            : `Gross margin is ${shown}%, below the ${DEFAULT_MARGIN_FLOOR_PCT}% safety floor. This ${area} step waits until margin is restored above the floor.`,
        });
      }
    }
  }

  // 5. Compliance — an expired, attributed obligation is a professional-review hard stop.
  if (c.expiredCompliance) {
    blocks.push({
      code: "COMPLIANCE_BLOCKED",
      reason: `Professional review required: "${c.expiredCompliance.name}" (${c.expiredCompliance.kind}) has expired. Renew it (or get professional review) before this ${area} step goes ahead.`,
    });
  }

  if (blocks.length > 0) {
    const first = blocks[0];
    return { allowed: false, code: first.code, reason: first.reason, ...(first.ruleId ? { ruleId: first.ruleId } : {}), blocks };
  }

  // Allowed. Pricing-sensitive work that scales volume, whose margin is unknown, is not claimed as a loss
  // (the shared margin gate's contract) — the Owner-mode abstention is reported for the caller to record.
  const abstain = c.businessScoped && !protective && pricingSensitive && c.grossMarginPct === null;
  return { allowed: true, marginAbstention: abstain ? OWNER_MARGIN_REQUIRED_DATA : null };
}
