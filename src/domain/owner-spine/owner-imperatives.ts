/**
 * Owner Intelligence Spine — target semantics and the ONE reconciler for owner-facing imperatives.
 *
 * Only the canonical owner decision (`resolveOwnerDecision`) issues overall-business imperatives. Every
 * other system that says "do not / stop / blocked" (the decision's own guardrails, Now View's avoid
 * list, the control center, Command Center plan analysis, Recovery) describes a CONSTRAINT; before it
 * is shown beside the decision it passes through `reconcileOwnerProhibition`, which turns any
 * prohibition that would veto the canonical target (or one of its supporting steps) into a condition
 * on HOW to carry that target out. Prohibitions unrelated to the target are left as they are.
 *
 * Two pure, fixed semantics decide whether a prohibition touches a target — never the domain name:
 *   - `ownerTargetIntent` — what the target DOES (SAFETY / STABILISE / REPAIR / EVIDENCE / EXECUTE /
 *     GROW), from the canonical priority class and finding semantics. A Sales or Marketing target can
 *     be a repair (wasted spend, complaints) or growth (scale a winner); the domain never decides.
 *   - `ownerLeverKey` — the business lever a finding moves. Two findings share a lever ONLY when their
 *     rule definitions measure the same source metric (a risk and the opportunity that fixes it, or the
 *     same metric read by Finance and Cash flow). Enforced against the rule files by
 *     src/__tests__/owner-decision/owner-imperatives.test.ts.
 *
 * Pure: no I/O.
 */
import { classifyOwnerFindingCode, type OwnerCandidateSource, type OwnerPriorityClass } from "./owner-decision";

// --- Intent ----------------------------------------------------------------------------------------

export const OWNER_TARGET_INTENTS = ["SAFETY", "STABILISE", "REPAIR", "EVIDENCE", "EXECUTE", "GROW"] as const;
export type OwnerTargetIntent = (typeof OWNER_TARGET_INTENTS)[number];

const INTENT_BY_CLASS: Record<OwnerPriorityClass, OwnerTargetIntent> = {
  SAFETY_COMPLIANCE: "SAFETY",
  SURVIVAL_CASH: "STABILISE",
  // Overload blocking the business from serving customers: relieve it before anything else moves.
  OVERLOAD_BLOCKING: "STABILISE",
  // Holding back from a plan that would put money or delivery at risk is protection, not growth.
  PLAN_COMMITMENT_RISK: "STABILISE",
  CUSTOMER_SERVICE_FAILURE: "REPAIR",
  PROFIT_LOSS: "REPAIR",
  BLOCKED_EXECUTION: "EXECUTE",
  PROCESS_OPTIMISATION: "EXECUTE",
  MISSING_CRITICAL_EVIDENCE: "EVIDENCE",
  GROWTH_OPPORTUNITY: "GROW",
};

/**
 * Codes whose own rule text contradicts their class's default intent. Fixed; each entry cites its rule.
 */
const INTENT_BY_CODE: Readonly<Record<string, OwnerTargetIntent>> = Object.freeze({
  // Strategy data gaps sit in the growth class (they belong to an optional plan) but ask for information.
  STR_MISSING_CRITICAL_DATA: "EVIDENCE",
  STR_INVALID_CURRENCY: "EVIDENCE",
  STR_MISSING_CASH: "EVIDENCE",
  STR_MISSING_RISK_LEVEL: "EVIDENCE",
  // "*_OPP_DATA_QUALITY": raise data confidence (their sourceMetric is dataConfidenceScore).
  FIN_OPP_DATA_QUALITY: "EVIDENCE",
  CF_OPP_DATA_QUALITY: "EVIDENCE",
  SALES_OPP_DATA_QUALITY: "EVIDENCE",
  OPS_OPP_DATA_QUALITY: "EVIDENCE",
  SOP_OPP_DATA_QUALITY: "EVIDENCE",
  MKT_OPP_DATA_QUALITY: "EVIDENCE",
  // "Enter the EMI for the recorded debt" (finance opportunity-rules.ts): a data request.
  FIN_NOTABLE_OUTSTANDING_DEBT: "EVIDENCE",
  // "Use spare capacity to take more orders … absorb more demand" (operations opportunity-rules.ts).
  OPS_OPP_USE_CAPACITY_HEADROOM: "GROW",
});

/** What a target does. A refresh target is epistemic work (confirm old figures), never an action. */
export function ownerTargetIntent(t: { source: OwnerCandidateSource; priorityClass: OwnerPriorityClass; findingCode: string }): OwnerTargetIntent {
  if (t.source === "evidence_refresh") return "EVIDENCE";
  return INTENT_BY_CODE[t.findingCode] ?? INTENT_BY_CLASS[t.priorityClass];
}

/** Intent of a finding code on its own (e.g. a rule-produced item not yet a candidate). */
export function ownerFindingIntent(findingCode: string): OwnerTargetIntent {
  return INTENT_BY_CODE[findingCode] ?? INTENT_BY_CLASS[classifyOwnerFindingCode(findingCode)];
}

// --- Business lever ----------------------------------------------------------------------------------

/**
 * Lever → finding codes whose rule definitions share one source metric (the metric in parentheses).
 * Fixed: never derived from titles or text at run time.
 */
export const OWNER_LEVER_CODES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  cash_runway: ["FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY"], // cashRunwayDays
  supplier_payables: ["FIN_HIGH_PAYABLES", "CF_VENDOR_CUTOFF_RISK", "CF_OPP_DEFER_PAYABLES"], // payablesPressurePct
  receivables_collection: ["FIN_HIGH_RECEIVABLES", "FIN_OPP_RECEIVABLES_COLLECTION"], // receivablesPressurePct
  overdue_receivables: ["CF_HIGH_OVERDUE_RECEIVABLES", "CF_OPP_COLLECT_OVERDUE"], // overdueReceivablesPct
  owner_withdrawal: ["CF_OWNER_WITHDRAWAL_PRESSURE", "CF_OPP_REDUCE_OWNER_WITHDRAWAL"], // ownerWithdrawalPressurePct
  debt_service: ["FIN_HIGH_DEBT_PRESSURE", "FIN_OPP_DEBT_REDUCTION"], // debtServicePressurePct
  net_margin: ["FIN_NEGATIVE_NET_MARGIN", "FIN_OPP_MARGIN_IMPROVEMENT"], // netMarginPct
  break_even: ["FIN_BELOW_BREAK_EVEN", "FIN_OPP_BREAK_EVEN_RECOVERY"], // revenue
  campaign_return: ["MKT_WASTED_SPEND", "MKT_OPP_SCALE_WINNER"], // campaignRoiPct
  marketing_conversion: ["MKT_POOR_CONVERSION", "MKT_OPP_LIFT_CONVERSION"], // leadConversionPct
  referrals: ["MKT_LOW_REFERRAL", "MKT_OPP_ACTIVATE_REFERRALS"], // referralRatePct
  organic_share: ["MKT_WRONG_CHANNEL_MIX", "MKT_OPP_BUILD_ORGANIC"], // organicSharePct
  marketing_followup: ["MKT_NO_FOLLOWUP", "MKT_OPP_ADD_FOLLOWUP"], // campaignFollowupRatePct
  delivery_delays: ["OPS_HIGH_DELAY", "OPS_OPP_RECOVER_DELAYS"], // delayRatePct
  rework: ["OPS_HIGH_REWORK", "OPS_OPP_CUT_REWORK"], // reworkRatePct
  idle_time: ["OPS_HIGH_IDLE", "OPS_OPP_RECLAIM_IDLE"], // idleRatePct
  sop_compliance: ["OPS_SOP_NONCOMPLIANCE", "OPS_OPP_CLOSE_SOP_GAP"], // sopCompliancePct
  capacity: ["OPS_CAPACITY_BOTTLENECK", "OPS_OPP_USE_CAPACITY_HEADROOM"], // capacityUtilizationPct
  sales_conversion: ["SALES_LOW_CONVERSION", "SALES_OPP_RAISE_CONVERSION"], // leadToSaleConversionPct
  repeat_customers: ["SALES_WEAK_REPEAT", "SALES_OPP_IMPROVE_RETENTION"], // repeatRatePct
  lost_customers: ["SALES_LOST_CUSTOMER_LEAKAGE", "SALES_OPP_WINBACK"], // lostCustomerRatePct
  discount_control: ["SALES_DISCOUNT_DEPENDENCE", "SALES_OPP_TIGHTEN_DISCOUNT"], // discountDependencePct
  b2b_pipeline: ["SALES_WEAK_B2B_PIPELINE", "SALES_OPP_CONVERT_PIPELINE"], // b2bPipelineCoveragePct
  sop_overdue: ["SOP_HIGH_OVERDUE", "SOP_OPP_CLEAR_OVERDUE"], // overdueRatePct
  sop_repeated_failures: ["SOP_REPEATED_FAILURES", "SOP_OPP_CONVERT_TO_SOP"], // repeatedFailureRatePct
  sop_coverage: ["SOP_LOW_COVERAGE", "SOP_OPP_CLOSE_COVERAGE_GAP"], // sopCoveragePct
  sop_verification: ["SOP_LOW_VERIFICATION", "SOP_OPP_RAISE_VERIFICATION"], // verificationRatePct
  plan_return: ["STR_NEGATIVE_ROI", "STR_WEAK_ROI", "STR_OPP_STRONG_RETURN"], // roiAnnualPct
  plan_payback: ["STR_LONG_PAYBACK", "STR_OPP_FAST_PAYBACK"], // paybackMonths
  plan_downside: ["STR_NEGATIVE_WORST_CASE", "STR_OPP_SAFE_UPSIDE"], // worstMonthlyProfitDelta
});

const LEVER_BY_CODE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(OWNER_LEVER_CODES).flatMap(([lever, codes]) => codes.map((c) => [c, lever] as const)))
);

/** The business lever a finding moves, or null when no rule-proven relationship exists. */
export function ownerLeverKey(findingCode: string): string | null {
  return LEVER_BY_CODE[findingCode] ?? null;
}

// --- Imperative reconciliation -------------------------------------------------------------------------

export interface OwnerImperativeTarget {
  title: string;
  source: OwnerCandidateSource;
  intent: OwnerTargetIntent;
  lever: string | null;
}

export interface OwnerImperativeContext {
  /** A canonical decision is shown on the page (with or without a target): secondary systems defer to it. */
  decisionPresent: boolean;
  /** The canonical main target (null ⇒ no target: prohibitions stand as they are). */
  primary: OwnerImperativeTarget | null;
  /** The canonical supporting steps the owner is told to do next. */
  supporting: OwnerImperativeTarget[];
}

type DecisionTargetLike = { title: string; source: OwnerCandidateSource; priorityClass: OwnerPriorityClass; findingCode: string };

export function toOwnerImperativeTarget(t: DecisionTargetLike): OwnerImperativeTarget {
  return { title: t.title, source: t.source, intent: ownerTargetIntent(t), lever: t.source === "evidence_refresh" ? null : ownerLeverKey(t.findingCode) };
}

export function ownerImperativeContext(
  decision: { primaryTarget: DecisionTargetLike | null; supportingSteps: readonly DecisionTargetLike[] } | null | undefined
): OwnerImperativeContext {
  if (!decision) return { decisionPresent: false, primary: null, supporting: [] };
  if (!decision.primaryTarget) return { decisionPresent: true, primary: null, supporting: [] };
  return { decisionPresent: true, primary: toOwnerImperativeTarget(decision.primaryTarget), supporting: decision.supportingSteps.map(toOwnerImperativeTarget) };
}

/**
 * A prohibition from any owner-facing system, described by what it would forbid.
 *   - `vetoes`: "GROW" — forbids growth/demand work (only a genuine GROW target is touched);
 *     "ANY_ACTION" — forbids taking on new work of any kind (every action target is touched);
 *     "NONE" — touches a target only through a shared lever.
 *   - `levers`: business levers the prohibition names directly.
 */
export interface OwnerProhibition {
  text: string;
  vetoes: "GROW" | "ANY_ACTION" | "NONE";
  levers?: readonly string[];
  /** How the prohibition reads as a condition on executing `targetTitle`. */
  asCondition: (targetTitle: string) => string;
}

export interface ReconciledProhibition {
  text: string;
  /** The canonical target the prohibition became a condition on (null ⇒ unchanged). */
  conditionOn: string | null;
}

/**
 * The ONE reconciliation of a prohibition against the canonical decision. A prohibition never vetoes
 * the main target or a supporting step: when it would (by intent or shared lever) it becomes a
 * condition on executing that target. A refresh (evidence) main target is a data request, never vetoed,
 * so nothing is rewritten around it. Otherwise the prohibition is returned unchanged.
 */
export function reconcileOwnerProhibition(p: OwnerProhibition, ctx: OwnerImperativeContext): ReconciledProhibition {
  const primary = ctx.primary;
  if (!primary || primary.source === "evidence_refresh") return { text: p.text, conditionOn: null };
  for (const t of [primary, ...ctx.supporting]) {
    if (t.source === "evidence_refresh") continue;
    const byLever = t.lever !== null && (p.levers ?? []).includes(t.lever);
    const byIntent = (p.vetoes === "GROW" && t.intent === "GROW") || (p.vetoes === "ANY_ACTION" && t === primary && t.intent !== "EVIDENCE");
    if (byLever || byIntent) return { text: p.asCondition(t.title), conditionOn: t.title };
  }
  return { text: p.text, conditionOn: null };
}

// --- Secondary-system constraints (plan analysis, Recovery) ----------------------------------------------

/**
 * Recovery's fixed "blocked before stabilisation" growth entries (business-survival-recovery.ts). These
 * forbid growth; with a canonical GROW target they become a condition on that target.
 */
const RECOVERY_GROWTH_BLOCKS = new Set([
  "scale / growth / expansion before stabilization is proven",
  "marketing before stabilization + validation",
  "growth before stabilization + validation",
  "launch before stabilization + validation",
  "discount before margin/cash impact is known",
]);

/** Recovery's blocked list, reconciled with the canonical decision (other entries are automation safety). */
export function reconcileRecoveryBlocks(blocked: readonly string[], ctx: OwnerImperativeContext): string[] {
  return blocked.map((b) =>
    RECOVERY_GROWTH_BLOCKS.has(b)
      ? reconcileOwnerProhibition(
          { text: b, vetoes: "GROW", asCondition: (t) => `taking "${t}" beyond a small, controlled first step until stabilisation is proven (${b})` },
          ctx
        ).text
      : b
  );
}

/**
 * Plan analysis (the whole-business plan model) is a secondary system: beside a canonical decision it
 * may describe constraints and suggestions, never issue whole-business "stop / do not / now / next"
 * instructions. These functions restate its imperatives as context for the canonical target. Without a
 * canonical decision on the page the plan output is returned unchanged.
 */
export function planConstraintAsCondition(planStop: string, ctx: OwnerImperativeContext): string {
  if (!ctx.decisionPresent) return planStop;
  const primary = ctx.primary;
  if (!primary) return `Plan constraint: ${planStop}.`;
  return primary.source === "evidence_refresh"
    ? `Plan constraint: ${planStop} — noted for when current figures confirm what to do.`
    : `Plan constraint: ${planStop} — if "${primary.title}" involves this, keep it within that limit.`;
}

const STOP_PREFIX = /^Stop:\s*/;

export interface PlanPriorityLike { severity: string; whatIsWrong: string; doNext: string }
export interface PlanSummaryLike {
  /** Set by reconcilePlanSummary: `doNotDo` now holds constraints on the canonical target, not orders. */
  stopItemsAreConstraints?: boolean;
  doNotDo: string[];
  topPriorities: PlanPriorityLike[];
  cadence: { now: string; thisWeek: string; stopLoss: string };
}

/** The supervisor summary with its imperatives restated as context for the canonical decision. */
export function reconcilePlanSummary<T extends PlanSummaryLike>(summary: T, ctx: OwnerImperativeContext): T {
  if (!ctx.decisionPresent) return summary;
  const suggestion = (x: string) => (x && x !== "—" ? `Plan analysis suggestion: ${x}` : x);
  const stopLoss = summary.cadence.stopLoss.startsWith("Do not act")
    ? "The plan analysis's own suggestion is gated until its gate clears; this does not change your main target."
    : summary.cadence.stopLoss.replace(/^Stop and reassess/, "Reassess the plan");
  return {
    ...summary,
    stopItemsAreConstraints: true,
    doNotDo: summary.doNotDo.map((d) => planConstraintAsCondition(d, ctx)),
    topPriorities: summary.topPriorities.map((p) =>
      STOP_PREFIX.test(p.whatIsWrong)
        ? { ...p, whatIsWrong: planConstraintAsCondition(p.whatIsWrong.replace(STOP_PREFIX, ""), ctx), doNext: "Context for your main target, not a separate instruction." }
        : { ...p, whatIsWrong: p.whatIsWrong.replace(/^Biggest constraint:/, "Plan analysis constraint:"), doNext: suggestion(p.doNext) }
    ),
    cadence: { ...summary.cadence, now: suggestion(summary.cadence.now), thisWeek: suggestion(summary.cadence.thisWeek), stopLoss },
  };
}

export interface PlanCardLike { id: string; whatIsWrong: string; whyItMatters: string; nextStep: string }

/** Plan checkpoint cards with the stop card restated as a constraint on the canonical target. */
export function reconcilePlanCards<T extends PlanCardLike>(cards: readonly T[], ctx: OwnerImperativeContext): T[] {
  if (!ctx.decisionPresent) return [...cards];
  return cards.map((c) =>
    c.id === "do_not_do"
      ? {
          ...c,
          whatIsWrong: planConstraintAsCondition(c.whatIsWrong.replace(STOP_PREFIX, ""), ctx),
          whyItMatters: "The plan analysis sees this as making its dominant constraint worse.",
          nextStep: "Context for your main target, not a separate instruction.",
        }
      : c
  );
}

/** The plan's growth/scale gate, as a condition on a genuine growth target or as plain context. */
export function reconcilePlanGrowthGate(gate: { scaleAllowed: boolean; blockedBy: readonly string[] }, ctx: OwnerImperativeContext): string {
  const blockers = gate.blockedBy.map((b) => b.replace(/_/g, " ")).join(", ");
  if (gate.scaleAllowed) return "scale allowed (capped pilot)";
  const gated = blockers ? `scaling is gated by: ${blockers}` : "scaling is gated";
  if (!ctx.decisionPresent) return blockers ? `scale gated — blocked by: ${blockers}` : "scale gated";
  const primary = ctx.primary;
  return primary && primary.intent === "GROW" && primary.source !== "evidence_refresh"
    ? `keep "${primary.title}" to a controlled first step — ${gated}`
    : `${gated} (context; it does not change your main target)`;
}
