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
import {
  classifyOwnerFindingCode,
  OWNER_PRIORITY_CLASS_BY_CODE,
  strategyCandidatePriorityClass,
  type OwnerCandidateSource,
  type OwnerPriorityClass,
  type StrategyDecisionCodeForPriority,
} from "./owner-decision";

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
  // Strategy decision steps (owner-strategy/decision.ts): correcting an invalid input is a data request;
  // "go ahead as planned" is the plan's growth step.
  STR_DECISION_INVALID_INPUT: "EVIDENCE",
  STR_DECISION_GO: "GROW",
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
  // The decision's own gate-blocker target: review the do-not-repeat memory (record what has changed) —
  // establishing context, not executing the held work.
  GATE_DO_NOT_REPEAT_REVIEW: "EVIDENCE",
  // A business-less compliance item in a multi-business workspace: assign it to the business it affects.
  COMPLIANCE_UNATTRIBUTED: "EVIDENCE",
});

/** What a target does. A refresh target is epistemic work (confirm old figures), never an action. */
export function ownerTargetIntent(t: { source: OwnerCandidateSource; priorityClass: OwnerPriorityClass; findingCode: string }): OwnerTargetIntent {
  if (t.source === "evidence_refresh") return "EVIDENCE";
  return INTENT_BY_CODE[t.findingCode] ?? INTENT_BY_CLASS[t.priorityClass];
}

/**
 * Intent of a finding code on its own (e.g. a rule-produced item not yet a candidate, or an owner action
 * at the action gate). A code with no explicit classification falls back to classifyOwnerFindingCode's
 * documented default (growth) — the most conservative intent for the growth limits; every code the
 * domains emit is explicitly classified (src/__tests__/governance/owner-action-intent-exhaustiveness.test.ts).
 */
export function ownerFindingIntent(findingCode: string): OwnerTargetIntent {
  return INTENT_BY_CODE[findingCode] ?? INTENT_BY_CLASS[classifyOwnerFindingCode(findingCode)];
}

/** Whether a finding code has an explicit intent classification (by code, or by its known class). */
export function hasExplicitOwnerIntent(findingCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTENT_BY_CODE, findingCode) || Object.prototype.hasOwnProperty.call(OWNER_PRIORITY_CLASS_BY_CODE, findingCode);
}

/**
 * Intent of a Strategy step under Strategy's RESOLVED decision — the same class the canonical decision
 * gives it (strategyCandidatePriorityClass), so the action gate and the owner decision agree.
 */
export function ownerStrategyStepIntent(decisionCode: StrategyDecisionCodeForPriority | null, findingCode: string): OwnerTargetIntent {
  return ownerTargetIntent({ source: "domain_action", priorityClass: strategyCandidatePriorityClass(decisionCode, findingCode), findingCode });
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

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"` — the protected steps a condition talks about. */
export function quoteTitles(titles: readonly string[]): string {
  const q = titles.map((t) => `"${t}"`);
  return q.length <= 1 ? (q[0] ?? "") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

/**
 * A prohibition from any owner-facing system, described by what it would forbid.
 *   - `vetoes`: "GROW" — forbids growth/demand work (only a genuine GROW step is touched);
 *     "ANY_ACTION" — forbids taking on new work of any kind (every actionable step is touched);
 *     "NONE" — touches a step only through a shared lever.
 *   - `levers`: business levers the prohibition names directly.
 *   - `asCondition`: the PERMITTED SCOPE for the protected steps it touches (never a restatement of the
 *     prohibition that would forbid them).
 */
export interface OwnerProhibition {
  text: string;
  vetoes: "GROW" | "ANY_ACTION" | "NONE";
  levers?: readonly string[];
  asCondition: (protectedTitles: readonly string[]) => string;
}

export interface ReconciledProhibition {
  /** "prohibition": unchanged, still a "do not"; "condition": positive guidance on executing canonical steps. */
  kind: "prohibition" | "condition";
  text: string;
  /** Titles of the canonical steps the prohibition became a condition on (empty ⇒ unchanged). */
  conditionOn: string[];
}

/** Every actionable canonical step: the main target and the supporting steps (refresh targets are data requests). */
function protectedSteps(ctx: OwnerImperativeContext): OwnerImperativeTarget[] {
  return [ctx.primary, ...ctx.supporting].filter((t): t is OwnerImperativeTarget => t !== null && t.source !== "evidence_refresh");
}

/**
 * The ONE reconciliation of a prohibition against the canonical decision. It never vetoes the main
 * target or a supporting step: every protected step it would forbid (by intent or shared lever) is
 * named in a condition that defines how that step may be carried out. Unrelated prohibitions are
 * returned unchanged.
 */
export function reconcileOwnerProhibition(p: OwnerProhibition, ctx: OwnerImperativeContext): ReconciledProhibition {
  const touched = protectedSteps(ctx).filter((t) => {
    const byLever = t.lever !== null && (p.levers ?? []).includes(t.lever);
    const byIntent = (p.vetoes === "GROW" && t.intent === "GROW") || (p.vetoes === "ANY_ACTION" && t.intent !== "EVIDENCE");
    return byLever || byIntent;
  });
  if (touched.length === 0) return { kind: "prohibition", text: p.text, conditionOn: [] };
  const titles = [...new Set(touched.map((t) => t.title))];
  return { kind: "condition", text: p.asCondition(titles), conditionOn: titles };
}

/** Split reconciled items into what still forbids and what now qualifies canonical steps. */
export function partitionReconciled(items: readonly ReconciledProhibition[]): { prohibitions: string[]; conditions: string[] } {
  return {
    prohibitions: items.filter((i) => i.kind === "prohibition").map((i) => i.text),
    conditions: items.filter((i) => i.kind === "condition").map((i) => i.text),
  };
}

// --- Secondary-system constraints (plan analysis, Recovery) ----------------------------------------------

/**
 * Recovery's fixed "blocked before stabilisation" growth entries (business-survival-recovery.ts and the
 * owner-recovery-status fallback). They constrain GROW work only; beside a genuine growth step they
 * become a condition on it. A repair or stabilising step (whatever its domain) is untouched by them.
 */
const RECOVERY_GROWTH_BLOCKS = new Set([
  "scale / growth / expansion before stabilization is proven",
  "Scaling (acquisition spend, campaign expansion, new launches) stays blocked until stabilization is proven.",
  "scaling acquisition spend before stabilization + validation",
  "growth expansion before stabilization + validation",
  "new launches before stabilization + validation",
]);
// "discount before margin/cash impact is known" is deliberately NOT here: it is a pricing-safety block,
// not a scale block, so it stays a prohibition whatever the canonical steps are (never folded into the
// scale condition and lost).

/** Recovery's blocked list reconciled with the canonical decision (automation-safety entries are unchanged). */
export function reconcileRecoveryBlocks(blocked: readonly string[], ctx: OwnerImperativeContext): { blocked: string[]; conditions: string[] } {
  const items = blocked.map((b) =>
    RECOVERY_GROWTH_BLOCKS.has(b)
      ? reconcileOwnerProhibition(
          {
            text: b,
            vetoes: "GROW",
            asCondition: (t) => `Run only the next validated step of ${quoteTitles(t)}, within its existing budget, until stabilisation is proven.`,
          },
          ctx
        )
      : { kind: "prohibition" as const, text: b, conditionOn: [] }
  );
  const { prohibitions, conditions } = partitionReconciled(items);
  return { blocked: prohibitions, conditions: [...new Set(conditions)] };
}

/**
 * Recovery's growth-gate label (e.g. "Growth blocked until stabilization") beside a genuine growth step.
 * Only a BLOCKED gate constrains anything; an open gate is returned unchanged.
 */
export function reconcileRecoveryGrowthGate(label: string, ctx: OwnerImperativeContext, gateBlocked = true): string {
  const grow = protectedSteps(ctx).filter((t) => t.intent === "GROW");
  return !gateBlocked || grow.length === 0 ? label : `${label} — ${quoteTitles(grow.map((t) => t.title))} runs only as a validated next step until then`;
}

const stripEnd = (x: string) => x.trim().replace(/[.\s]+$/, "");
/** Plan output uses constraint codes (cash_survival); owners read words. */
const humanizeCodes = (x: string) => x.replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, " "));

/**
 * Plan analysis (the whole-business plan model) is a secondary system: beside a canonical decision it
 * may describe constraints and suggestions, never issue whole-business "stop / do not / now / next"
 * instructions. These functions restate its imperatives as context for the canonical decision. Without
 * a canonical decision on the page the plan output is returned unchanged.
 */
/**
 * Plan-analysis statements, classified STRUCTURALLY (one sentence at a time, by its leading clause) —
 * never a blind rewrite of the prose:
 *   - a PROHIBITION ("Do not …", "Don't …", "Stop …", "Never …", "Avoid …", "Hold off on …") becomes
 *     "the plan analysis holds back …";
 *   - a whole-business ORDERING imperative ("First: …", "Start with …", "Before anything else, …", "Highest
 *     priority: …", "Immediately …", "First thing, …", "Must …", "Now: …") keeps its content and loses its
 *     claim to be the owner's first/overriding move — ordering words and inline ordering phrases ("before
 *     any action/commitment", "as a first step", "immediately", a trailing "first") are removed;
 *   - any other sentence is description and is left exactly as written (a factual "payroll must be paid
 *     by Friday" is not an order about the owner's priorities).
 * Only CurrentOwnerDecision owns the overall imperative; beside it the plan describes, it never instructs.
 */
/** Leading clauses that are an ordering claim whatever follows ("Start with …", "Before anything else, …"). */
const PLAN_ORDER_LEAD_ALWAYS = /^(?:start\s+(?:with|by)|begin\s+(?:with|by)|before\s+anything\s+else|first\s+thing|immediately|right\s+now|above\s+all|must(?!\s+not\b|n['’]?t\b))\b\s*[:,—–-]?\s*/i;
/** Leading labels that are an ordering claim only as a label ("First: …", "Top priority — …"), never "The first cohort …". */
const PLAN_ORDER_LEAD_LABEL = /^(?:the\s+)?(?:first\s+priority|first\s+step|highest\s+priority|top\s+priority|priority\s+one|number\s+one|urgent(?:ly)?|first|now)\s*[:,—–-]\s*/i;
const PLAN_PROHIBITION_LEAD = /^(?:do\s+not|don['’]?t|never|stop(?!-)|avoid|must\s+not|mustn['’]?t|hold\s+off(?:\s+on)?)\b\s*:?\s*/i;
/**
 * A sentence that OPENS with an imperative verb addressed to the owner ("Collect receivables first.").
 * Inline ordering phrases and a trailing "first" are removed only from such a sentence (or one with an
 * ordering lead) — factual prose ("Revenue dropped immediately after the price rise.", "The loan is repaid
 * first.") is never rewritten.
 */
const PLAN_IMPERATIVE_VERB = /^(?:please\s+)?(?:add|address|build|call|cancel|chase|check|clear|close|collect|confirm|consolidate|contact|create|cut|defer|delay|drop|ensure|expand|fix|focus|freeze|get|grow|hire|improve|increase|invest|keep|launch|lock|lower|make|measure|move|negotiate|open|pause|pay|prioriti[sz]e|protect|raise|record|recover|reduce|renegotiate|reprice|resolve|restore|review|run|scale|secure|sell|set|shift|stabili[sz]e|target|test|tighten|track|trim|verify)\b/i;
/** A prohibition introduced inside the sentence after a dash ("Protect cash — do not add growth spend."). */
const PLAN_PROHIBITION_ASIDE = /(\s[—–]\s)(?:do\s+not|don['’]?t|never|stop(?!-)|avoid)\b\s*:?\s*/gi;
/** Inline ordering phrases; "before any action/commitment/…" takes the rest of its clause with it. */
const PLAN_ORDER_INLINE = /\s*,?\s*\b(?:before\s+anything\s+else|before\s+any\s+(?:(?:other|new|further)\s+)?(?:action|commitment|spend|spending|decision|step|move|investment)s?\b[^,.;!?]*|as\s+(?:a|the|your)\s+first\s+(?:step|move|priority)|first\s+thing|right\s+away|immediately|at\s+once|as\s+(?:the|a|your)\s+(?:highest|top)\s+priority)\b/gi;
/** An ordering "first" closing a clause ("Stabilise first, then …", "Collect receivables first."). */
const PLAN_TRAILING_FIRST = /\s+first(?=\s*(?:[,;!]|\.|$))/i;

function capitalize(x: string): string {
  return x ? x[0].toUpperCase() + x.slice(1) : x;
}

function stripOrderLeads(body: string): { body: string; ordered: boolean } {
  let ordered = false;
  for (;;) {
    const m = PLAN_ORDER_LEAD_ALWAYS.exec(body) ?? PLAN_ORDER_LEAD_LABEL.exec(body);
    if (!m || m[0].length === 0) return { body, ordered };
    body = body.slice(m[0].length);
    ordered = true;
  }
}

/** One plan sentence restated (see above). */
function neutralizePlanSentence(sentence: string): { text: string; heldBack: boolean } {
  const lead = /^\s*/.exec(sentence)![0];
  const { body, ordered } = stripOrderLeads(sentence.slice(lead.length));
  const prohibition = PLAN_PROHIBITION_LEAD.exec(body);
  if (prohibition) {
    return { text: `${lead}the plan analysis holds back ${body.slice(prohibition[0].length).replace(PLAN_ORDER_INLINE, "")}`, heldBack: true };
  }
  let heldBack = false;
  const asides = body.replace(PLAN_PROHIBITION_ASIDE, (_m, dash: string) => {
    heldBack = true;
    return `${dash}the plan analysis holds back `;
  });
  // Ordering words are removed only from an owner-directed imperative (an ordering lead, or an opening
  // imperative verb); a descriptive sentence keeps its words exactly.
  const directed = ordered || PLAN_IMPERATIVE_VERB.test(asides);
  const inline = new RegExp(PLAN_ORDER_INLINE.source, "i").test(asides);
  const imperative = directed && (ordered || inline || PLAN_TRAILING_FIRST.test(asides));
  if (!imperative) return { text: heldBack ? `${lead}${asides}` : sentence, heldBack };
  const cleaned = asides.replace(PLAN_ORDER_INLINE, "").replace(PLAN_TRAILING_FIRST, "");
  return { text: `${lead}${capitalize(cleaned.trimStart())}`, heldBack };
}

export function neutralizePlanImperatives(text: string): { text: string; heldBack: boolean } {
  let heldBack = false;
  // Each sentence is classified on its own leading clause.
  const out = text
    .split(/(?<=[.;!?])(?=\s)/)
    .map((p) => {
      const n = neutralizePlanSentence(p);
      if (n.heldBack) heldBack = true;
      return n.text;
    })
    .join("");
  return { text: humanizeCodes(out), heldBack };
}

/** The plan model's next-best-action line beside the canonical decision (unchanged without one). */
export function planNextActionText(text: string, ctx: OwnerImperativeContext): string {
  return ctx.decisionPresent && text ? neutralizePlanImperatives(text).text : text;
}

/** The permitted scope of the canonical GROW steps a held-back plan move may touch (empty when none). */
function growScope(ctx: OwnerImperativeContext): string {
  const grow = protectedSteps(ctx).filter((t) => t.intent === "GROW");
  return grow.length === 0 ? "" : ` Where ${quoteTitles(grow.map((t) => t.title))} touches it, run only the next validated step within the existing budget.`;
}

export function planConstraintAsCondition(planStop: string, ctx: OwnerImperativeContext): string {
  if (!ctx.decisionPresent) return planStop;
  const n = neutralizePlanImperatives(stripEnd(planStop));
  const body = n.heldBack ? n.text : `the plan analysis holds back: ${n.text}`;
  return `Plan constraint (context, not an instruction): ${body}.${growScope(ctx)}`;
}

/**
 * Plan prose (7/30/90-day plan, summaries) beside a canonical decision: its imperatives restated as
 * description and reconciled against the main target and supporting steps (a held-back move that a
 * canonical GROW step touches gets that step's permitted scope).
 */
export function reconcilePlanProse(text: string, ctx: OwnerImperativeContext): string {
  if (!ctx.decisionPresent || !text) return text;
  const n = neutralizePlanImperatives(text);
  return `Plan analysis (context): ${n.text}${n.heldBack ? growScope(ctx) : ""}`;
}

const STOP_PREFIX = /^Stop:\s*/;

export interface PlanPriorityLike { severity: string; whatIsWrong: string; doNext: string }
export interface PlanSummaryLike {
  /** Set by reconcilePlanSummary: `doNotDo` now holds constraints on the canonical target, not orders. */
  stopItemsAreConstraints?: boolean;
  /** The plan's own "do now" line (shown as "Plan analysis suggests: …"). */
  doNow?: string;
  doNotDo: string[];
  topPriorities: PlanPriorityLike[];
  cadence: { now: string; thisWeek: string; stopLoss: string };
}

function contextNote(ctx: OwnerImperativeContext): string {
  return ctx.primary ? "Context for your main target, not a separate instruction." : "Plan analysis context, not an instruction.";
}

function planSuggestion(x: string): string {
  return x && x !== "—" ? `Plan analysis suggestion: ${neutralizePlanImperatives(x).text}` : x;
}

/** The supervisor summary with its imperatives restated as context for the canonical decision. */
export function reconcilePlanSummary<T extends PlanSummaryLike>(summary: T, ctx: OwnerImperativeContext): T {
  if (!ctx.decisionPresent) return summary;
  const stopLoss = summary.cadence.stopLoss.replace(/^Stop and reassess/, "Reassess the plan");
  return {
    ...summary,
    stopItemsAreConstraints: true,
    ...(typeof summary.doNow === "string" ? { doNow: neutralizePlanImperatives(summary.doNow).text } : {}),
    doNotDo: summary.doNotDo.map((d) => planConstraintAsCondition(d, ctx)),
    topPriorities: summary.topPriorities.map((p) =>
      STOP_PREFIX.test(p.whatIsWrong)
        ? { ...p, whatIsWrong: planConstraintAsCondition(p.whatIsWrong.replace(STOP_PREFIX, ""), ctx), doNext: contextNote(ctx) }
        : { ...p, whatIsWrong: humanizeCodes(p.whatIsWrong.replace(/^Biggest constraint:/, "Plan analysis constraint:")), doNext: planSuggestion(p.doNext) }
    ),
    cadence: { ...summary.cadence, now: planSuggestion(summary.cadence.now), thisWeek: planSuggestion(summary.cadence.thisWeek), stopLoss },
  };
}

export interface PlanCardLike { id: string; whatIsWrong: string; whyItMatters: string; nextStep: string; proof?: string }

/**
 * Plan checkpoint cards beside a canonical decision: the stop card becomes a constraint, and every
 * card's step reads as the plan analysis's suggestion (the canonical decision alone says what is next).
 */
export function reconcilePlanCards<T extends PlanCardLike>(cards: readonly T[], ctx: OwnerImperativeContext): T[] {
  if (!ctx.decisionPresent) return [...cards];
  return cards.map((c) =>
    c.id === "do_not_do"
      ? {
          ...c,
          whatIsWrong: planConstraintAsCondition(c.whatIsWrong.replace(STOP_PREFIX, ""), ctx),
          whyItMatters: "The plan analysis sees this as making its dominant constraint worse.",
          nextStep: contextNote(ctx),
          proof: "Not an action — context for your canonical steps.",
        }
      : c.id === "cash_margin"
        // A financial-risk constraint: context for the canonical steps, never a second "do this first".
        ? { ...c, whatIsWrong: humanizeCodes(c.whatIsWrong), nextStep: contextNote(ctx) }
        : { ...c, whatIsWrong: humanizeCodes(c.whatIsWrong), nextStep: planSuggestion(c.nextStep) }
  );
}

/** The plan's growth/scale gate, as a condition on a genuine growth step or as plain context. */
export function reconcilePlanGrowthGate(gate: { scaleAllowed: boolean; blockedBy: readonly string[] }, ctx: OwnerImperativeContext): string {
  const blockers = gate.blockedBy.map((b) => b.replace(/_/g, " ")).join(", ");
  if (gate.scaleAllowed) return "scale allowed (capped pilot)";
  const gated = blockers ? `scaling is gated by: ${blockers}` : "scaling is gated";
  if (!ctx.decisionPresent) return blockers ? `scale gated — blocked by: ${blockers}` : "scale gated";
  const grow = protectedSteps(ctx).filter((t) => t.intent === "GROW");
  return grow.length > 0
    ? `${quoteTitles(grow.map((t) => t.title))} runs only as a validated next step within its existing budget — ${gated}`
    : `${gated} (context${ctx.primary ? "; it does not change your main target" : ""})`;
}

/**
 * A domain page's data-gap notice. When the page's domain owns a canonical step, the notice says the
 * issue needs attention and only the numerical score is provisional — it never says "don't act" on work
 * the canonical decision selected. Otherwise the domain's own caution stands.
 */
export function domainDataGapNotice(domainLabel: string, missing: readonly string[], ownsCanonicalStep: boolean, fallback: string): string {
  if (!ownsCanonicalStep) return fallback;
  const what = missing.length > 0 ? missing.join(", ") : `the missing ${domainLabel} data`;
  return `The ${domainLabel} issue needs attention now, but its numerical score is provisional until ${what} ${missing.length > 1 ? "are" : "is"} supplied.`;
}
