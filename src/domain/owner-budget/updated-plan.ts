/**
 * Dynamic Updated Owner Plan Engine (Section 7). Pure, deterministic.
 *
 * Orchestrates the budget core into a single owner-facing plan: mode → cash posture
 * → capital allocation → spend restrictions → accountable roles → generated actions
 * → forecasts → review loop. REUSES the collective decision engine (runCollective)
 * for cross-domain "what not to do" instead of duplicating that logic. Advice is
 * specific (names the constraint, role, proof, review) — never generic.
 */

import {
  type BudgetAssessmentInput,
  type AllocationCandidate,
  type BudgetGeneratedAction,
  type BudgetSignal,
  type ChangeDescriptor,
  type PlanDecisionType,
  type UpdatedOwnerPlan,
} from "@/domain/owner-budget/types";
import { resolveLiquidity } from "@/domain/owner-finance/liquidity";
import { classifyBudgetMode } from "@/domain/owner-budget/mode-classifier";
import { rankCapitalAllocation } from "@/domain/owner-budget/capital-allocation";
import { assessWorkingCapital } from "@/domain/owner-budget/working-capital";
import { detectRevenueLeakage } from "@/domain/owner-budget/revenue-assurance";
import { assessVendorControl } from "@/domain/owner-budget/vendor-control";
import { detectUnderinvestment } from "@/domain/owner-budget/underinvestment";
import { assessArchetypePack, resolveBudgetArchetype } from "@/domain/owner-budget/archetype-packs";
import { assessArchetypeWorkingCapital } from "@/domain/owner-budget/archetype-working-capital";
import { detectCollusionRisk } from "@/domain/owner-budget/collusion";
import { runCollective } from "@/domain/collective-training/collective-engine";
import type {
  DomainSignalInput,
  RecommendationConfidence,
  SignalStatus,
  TrainingSeverity,
} from "@/domain/collective-training/collective-types";
import type { BudgetConfidenceLevel } from "@/domain/owner-budget/types";

/**
 * A prior funded-initiative outcome the plan should learn from (M9). Sourced from persisted
 * `FundedInitiativeOutcome` rows; only outcomes explicitly `safeForLearning` steer the next plan.
 */
export interface PriorInitiativeOutcome {
  initiativeLabel: string;
  outcome: string;
  safeForLearning: boolean;
  /**
   * Stored learning disposition (repeat | modify | escalate | block). When present it selects the corrective
   * path directly; when absent it is derived from `outcome` (+ repeat-failure count). `repeat`/absent-success
   * never steers.
   */
  disposition?: "repeat" | "modify" | "escalate" | "block";
  /** Expected/actual impact for the closed initiative — used only to show the owner the variance, never to fabricate. */
  expectedImpact?: number | null;
  actualImpact?: number | null;
}

export interface UpdatedPlanInput {
  assessment: BudgetAssessmentInput;
  change?: ChangeDescriptor | null;
  candidates?: AllocationCandidate[];
  allocationContext?: {
    approvedBudget?: number | null;
    committedSpend?: number | null;
    paidSpend?: number | null;
    accruedObligations?: number | null;
  };
  affectedBudgetLines?: string[];
  /**
   * Prior recorded funded-initiative outcomes (M9). A FAILED/BLOCKED outcome for an initiative demonstrably
   * steers the next plan — the matching candidate is deferred and a guard signal + what-not-to-do is added, so
   * the owner is not told to blindly re-fund what already failed. Absent → behaviour is unchanged.
   */
  outcomeHistory?: PriorInitiativeOutcome[];
}

function toRecConfidence(c: BudgetConfidenceLevel): RecommendationConfidence {
  switch (c) {
    case "AUDITED":
    case "VERIFIED":
      return "HIGH";
    case "OPERATIONAL":
      return "MEDIUM";
    case "PARTIAL":
      return "LOW";
    case "UNVERIFIED":
    default:
      return "BLOCKED";
  }
}

function fmtMoney(n: number | null): string {
  return n === null ? "unknown (data missing)" : `${Math.round(n)}`;
}

export function composeUpdatedPlan(input: UpdatedPlanInput): UpdatedOwnerPlan {
  const mode = classifyBudgetMode(input.assessment);
  const conf = mode.confidence;
  const cash = mode.cash;

  const allocation = rankCapitalAllocation({
    approvedBudget: input.allocationContext?.approvedBudget ?? null,
    committedSpend: input.allocationContext?.committedSpend ?? null,
    paidSpend: input.allocationContext?.paidSpend ?? null,
    accruedObligations: input.allocationContext?.accruedObligations ?? null,
    reserveRequired: cash.statutoryReserveRequired,
    obligationsDueSoon: cash.obligationsDueInHorizon,
    candidates: input.candidates ?? [],
    mode: mode.primaryMode,
    confidence: conf,
  });

  // ---- Archetype-specific budget pack (laundry / housekeeping / generic fallback) ----
  // Reasons with the business type's cost structure / leakage / levers instead of
  // generic advice. Reuses the existing plan pipeline (signals + extra actions /
  // restrictions / what-not-to-do); it is NOT a parallel budget or action engine.
  const archetypePack = assessArchetypePack({
    archetype: resolveBudgetArchetype(input.assessment.finance.industryTemplate),
    laundry: input.assessment.archetypeSignals?.laundry ?? null,
    housekeeping: input.assessment.archetypeSignals?.housekeeping ?? null,
  });
  // Working-capital × archetype cross-integration: combine the ageing assessment
  // (PR #45) with the archetype pack so cash-cycle guidance is business-specific
  // (e.g. profitable B2B laundry contract that is cash-negative due to overdue
  // receivables). Empty when ageing or a specific archetype is absent.
  const archetypeWc = assessArchetypeWorkingCapital({
    archetype: archetypePack.archetype,
    ageing: input.assessment.workingCapital?.ageing ?? null,
    laundry: input.assessment.archetypeSignals?.laundry ?? null,
    housekeeping: input.assessment.archetypeSignals?.housekeeping ?? null,
  });
  // A hard archetype OR combined cash-cycle constraint (negative delivery economics,
  // high travel time, profitable-but-cash-trapped B2B/recurring work) defers offensive
  // (growth/scale/experiment) candidates through the EXISTING allocation result, so the
  // existing growth-blocked signal + blocked-candidate action loop fire naturally — no
  // bypass of the confidence gate or a new ranker.
  if (archetypePack.growthBlocked || archetypeWc.growthBlocked) {
    let fundedTotal = 0;
    for (const r of allocation.ranked) {
      const offensive =
        r.candidate.category === "growth_roi" ||
        r.candidate.category === "scale_after_readiness" ||
        r.candidate.category === "strategic_experiment";
      if (offensive && (r.decision === "FUND" || r.decision === "PARTIAL_FUND")) {
        r.decision = "DEFER";
        r.fundedAmount = 0;
        r.reason = `Deferred by ${archetypePack.archetype} working-economics / cash-cycle gate: ${archetypeWc.reasons[0] ?? archetypePack.signals[0]?.message ?? "archetype scale gate not met"}`;
      }
      fundedTotal += r.fundedAmount;
    }
    allocation.fundedTotal = fundedTotal;
    allocation.blockedCount = allocation.ranked.filter((r) => r.decision === "BLOCK" || r.decision === "DEFER").length;
  }

  // ---- Prior-outcome steering (M9 + Wave 3): a recorded NON-SUCCESS funded-initiative outcome must change the next
  // plan — never re-recommend the same funded action unchanged. The learning disposition (stored, else derived from
  // the outcome + repeat-failure count) selects the corrective path: modify (partial / underperformance) / escalate
  // (first failure) / block (repeat failure). Only safeForLearning outcomes steer (external-factor / owner-override /
  // unverified are excluded upstream). The matching FUND/PARTIAL_FUND candidate is DEFERRED (funding withheld, so the
  // steer is real) with an owner-visible reason carrying the expected-vs-actual variance when known. SUCCESS never
  // steers, and no success/profit is ever claimed here. ----
  const outcomeSteerSignals: BudgetSignal[] = [];
  const outcomeWhatNotToDo: string[] = [];
  const safeOutcomes = (input.outcomeHistory ?? []).filter((o) => o.safeForLearning);
  const failedCountByLabel = new Map<string, number>();
  for (const o of safeOutcomes) {
    if (o.outcome === "FAILED") {
      const l = o.initiativeLabel.replace(/^budget-action:/, "");
      failedCountByLabel.set(l, (failedCountByLabel.get(l) ?? 0) + 1);
    }
  }
  const dispositionFor = (o: PriorInitiativeOutcome, label: string): "modify" | "escalate" | "block" | null => {
    if (o.disposition === "modify" || o.disposition === "escalate" || o.disposition === "block") return o.disposition;
    if (o.disposition === "repeat") return null;
    // Derived when not stored: partial → modify; failed → escalate (first) / block (repeat); success → no steer.
    if (o.outcome === "PARTIAL") return "modify";
    if (o.outcome === "FAILED") return (failedCountByLabel.get(label) ?? 0) >= 2 ? "block" : "escalate";
    return null;
  };
  const varianceText = (o: PriorInitiativeOutcome): string => {
    if (typeof o.expectedImpact === "number" && typeof o.actualImpact === "number" && o.expectedImpact !== 0) {
      return ` (actual ${o.actualImpact} vs expected ${o.expectedImpact} ≈ ${Math.round((o.actualImpact / o.expectedImpact) * 100)}% of target)`;
    }
    return "";
  };
  const CORRECTIVE: Record<"modify" | "escalate" | "block", string> = {
    modify: "modify the approach and add evidence before re-funding unchanged",
    escalate: "escalate: re-prove the fix before re-funding",
    block: "block re-funding until a changed approach is proven",
  };
  const steered = new Set<string>();
  for (const o of safeOutcomes) {
    const label = o.initiativeLabel.replace(/^budget-action:/, "");
    const disp = dispositionFor(o, label);
    if (!disp || steered.has(label)) continue;
    steered.add(label);
    outcomeSteerSignals.push({
      type: "prior_initiative_failure",
      severity: disp === "modify" ? "MEDIUM" : "HIGH",
      message: `Initiative "${label}" recorded a prior ${o.outcome} outcome${varianceText(o)} — ${CORRECTIVE[disp]}.`,
    });
    outcomeWhatNotToDo.push(`Re-fund "${label}" unchanged after its ${o.outcome} outcome — ${CORRECTIVE[disp]}.`);
    for (const r of allocation.ranked) {
      if ((r.decision === "FUND" || r.decision === "PARTIAL_FUND") && (label === r.candidate.label || o.initiativeLabel.includes(r.candidate.label))) {
        r.decision = "DEFER";
        r.fundedAmount = 0;
        r.reason = `Deferred by prior-outcome learning (${disp}): this initiative recorded a ${o.outcome} outcome${varianceText(o)} — ${CORRECTIVE[disp]}.`;
      }
    }
  }
  if (steered.size > 0) {
    allocation.fundedTotal = allocation.ranked.reduce((s, r) => s + r.fundedAmount, 0);
    allocation.blockedCount = allocation.ranked.filter((r) => r.decision === "BLOCK" || r.decision === "DEFER").length;
  }

  // ---- Cross-domain "what not to do" via the reused collective engine ----
  const signalsForCollective = buildDomainSignals(input.assessment, mode.netMarginPct, cash.runwayDays, conf);
  const packet = runCollective({
    archetype: input.assessment.finance.industryTemplate ?? "generic_service",
    ownerGoal: input.assessment.ownerGoal ?? "stabilize_and_protect_the_business",
    signals: signalsForCollective,
    lowDataConfidence: conf === "PARTIAL" || conf === "UNVERIFIED",
    missingCriticalProof: mode.missingCriticalData.length > 0,
  });
  const whatNotToDo = [
    ...packet.whatNotToDo.prohibited,
    ...packet.whatNotToDo.temporarilyBlocked,
  ];

  // ---- Budget signals ----
  const signals: BudgetSignal[] = [];
  signals.push(...outcomeSteerSignals); // M9 prior-outcome guards surface first
  if (cash.reserveBreached) signals.push({ type: "statutory_reserve_breach", severity: "CRITICAL", message: "Cash below required statutory/cash reserve." });
  if (cash.runwayDays !== null && cash.runwayDays < 45) signals.push({ type: "cash_runway_risk", severity: cash.runwayDays < 14 ? "CRITICAL" : "HIGH", message: `Cash runway ${cash.runwayDays} days.` });
  if (mode.netMarginPct !== null && mode.netMarginPct < 10) signals.push({ type: "profit_guardrail_breach", severity: mode.netMarginPct < 0 ? "HIGH" : "MEDIUM", message: `Net margin ${mode.netMarginPct.toFixed(1)}% below target.` });
  if (input.assessment.unitEconomicsPositive === false) signals.push({ type: "unit_economics_negative", severity: "HIGH", message: "Unit economics negative — growth spend unsafe." });
  if (allocation.ranked.some((r) => r.candidate.category === "growth_roi" && (r.decision === "FUND" || r.decision === "PARTIAL_FUND"))) {
    signals.push({ type: "growth_budget_available", severity: "INFO", message: "Growth budget available within guardrails." });
  }
  if (allocation.ranked.some((r) => r.candidate.category === "growth_roi" && (r.decision === "BLOCK" || r.decision === "DEFER"))) {
    signals.push({ type: "growth_budget_blocked", severity: "MEDIUM", message: "Growth budget blocked/deferred by mode or confidence gate." });
  }
  if (allocation.ranked.some((r) => r.candidate.category === "scale_after_readiness" && r.decision === "FUND")) {
    signals.push({ type: "scale_budget_ready", severity: "INFO", message: "Scale budget cleared readiness + confidence gates." });
  } else if (allocation.ranked.some((r) => r.candidate.category === "scale_after_readiness")) {
    signals.push({ type: "scale_budget_blocked", severity: "MEDIUM", message: "Scale budget blocked until readiness/confidence proven." });
  }
  // ---- Working capital / revenue assurance / vendor control (Sections 12, 20, 22) ----
  const f = input.assessment.finance;
  const wc = assessWorkingCapital({
    cashOnHand: resolveLiquidity(f).totalLiquidFunds,
    receivables: f.receivables ?? null,
    receivablesOverdue: f.receivablesOverdue ?? null,
    payables: f.payables ?? null,
    payablesOverdue: f.payablesOverdue ?? null,
    inventoryStockCashLock: f.inventoryStockCashLock ?? null,
    reserveRequired: cash.statutoryReserveRequired,
    collectionGapDays: input.assessment.workingCapital?.collectionGapDays ?? null,
    pendingReceiptValue: input.assessment.workingCapital?.pendingReceiptValue ?? null,
  });
  const ra = detectRevenueLeakage({
    revenue: f.revenue ?? null,
    discountAmount: f.discountAmount ?? null,
    refundAmount: f.refundAmount ?? null,
    ...(input.assessment.revenueAssurance ?? {}),
  });
  const vc = input.assessment.vendorControl ? assessVendorControl(input.assessment.vendorControl) : null;

  const extraRestrictions: string[] = [];
  const extraActions: BudgetGeneratedAction[] = [];
  const extraWhatNotToDo: string[] = [];

  if (wc.collectionGapRisk && !wc.canFundGrowthGivenGap) {
    signals.push({ type: "working_capital_risk", severity: "HIGH", message: wc.reasons.join(" ") });
    extraRestrictions.push("Do not fund growth/scale on uncollected receipts — cash reserve cannot survive the collection gap.");
    extraWhatNotToDo.push("Approve growth spend that depends on a delayed (e.g. 45-day) receipt.");
  } else if (wc.receivablesPressure === "HIGH" || wc.payablesPressure === "HIGH") {
    signals.push({ type: "working_capital_risk", severity: "MEDIUM", message: wc.reasons.join(" ") || "Working-capital pressure present." });
  }

  // ---- Working-capital ageing (ageing-aware guidance; reuses the ageing engine
  // assessment computed upstream from persisted manual/import-ready items) ----
  const ageing = input.assessment.workingCapital?.ageing;
  if (ageing) {
    const ageingSeverity = (s: string): BudgetSignal["severity"] =>
      s === "collection_first_required" || s === "profitable_but_cash_negative" ||
      s === "vendor_pressure_risk" || s === "growth_blocked_by_working_capital"
        ? "HIGH"
        : "MEDIUM";
    const ageingMessage: Record<string, string> = {
      receivables_ageing_risk: `Overdue receivables ${Math.round(ageing.receivablesOverdue)} (90+: ${Math.round(ageing.receivables.d90_plus)}).`,
      payables_ageing_risk: `Overdue payables ${Math.round(ageing.payablesOverdue)} (90+: ${Math.round(ageing.payables.d90_plus)}).`,
      collection_first_required: "Receivables 90+ days overdue — collect first before new discretionary/growth spend.",
      vendor_pressure_risk: "Overdue payables create vendor/supply risk — negotiate terms or stage critical payments.",
      cash_conversion_risk: "Cash conversion impaired — booked profit is not yet spendable cash.",
      profitable_but_cash_negative: "Profitable on the books but free cash is non-positive — cash is trapped in overdue receivables.",
      growth_blocked_by_working_capital: "Growth/scale spend blocked until collections improve and reserve survives the collection gap.",
      working_capital_data_stale: "Manual working-capital data is stale — refresh before irreversible decisions.",
      working_capital_data_insufficient: "Some balances have no due date — ageing cannot be classified confidently.",
    };
    for (const sig of ageing.signals) {
      signals.push({ type: sig, severity: ageingSeverity(sig), message: ageingMessage[sig] ?? sig });
    }
    if (ageing.collectionFirstRequired) {
      extraActions.push({
        title: "Collection-first: recover 90+ day overdue receivables",
        accountableRole: "owner",
        decisionType: "INVESTIGATE",
        requiredProof: "Updated receivables ageing + collection commitments/dates",
        reviewInDays: 7,
        expectedFinancialImpact: "Convert trapped receivables into spendable cash before any growth spend",
        killRule: "Escalate accounts unpaid after one collection cycle to formal recovery.",
      });
      extraRestrictions.push("Collect 90+ day overdue receivables before approving new discretionary/growth spend.");
    }
    if (ageing.vendorPressureRisk) {
      extraActions.push({
        title: "Negotiate / stage overdue payables to protect supply",
        accountableRole: "owner",
        decisionType: "INVESTIGATE",
        requiredProof: "Vendor payment plan + prioritised critical-supplier list",
        reviewInDays: 5,
        expectedFinancialImpact: "Prevent supply disruption and late penalties without breaching reserve",
        killRule: "Do not skip payroll/tax/rent to clear a non-critical vendor.",
      });
      extraRestrictions.push("Stage overdue payables against the reserve; protect payroll/rent/tax obligations first.");
    }
    if (ageing.growthBlockedByWorkingCapital) {
      extraRestrictions.push("Block new growth/scale spend until overdue collections improve and the reserve survives the collection gap.");
      extraWhatNotToDo.push("Treat booked B2B profit as available cash — it is trapped in overdue receivables; profit is not free cash.");
    }
  }

  if (ra.hasLeakage) {
    const top = ra.exceptions.find((e) => e.severity === "HIGH") ?? ra.exceptions[0];
    signals.push({ type: "revenue_leakage_risk", severity: top.severity === "HIGH" ? "HIGH" : "MEDIUM", message: top.message });
    extraActions.push({
      title: `Investigate revenue leakage: ${ra.exceptions.map((e) => e.type).join(", ")}`,
      accountableRole: "owner",
      decisionType: "INVESTIGATE",
      requiredProof: "Order/invoice/cash/deposit reconciliation",
      reviewInDays: 7,
      expectedFinancialImpact: "Recover leaked revenue before any cost-cut or growth spend",
      killRule: "Escalate if leakage persists after one reconciliation cycle.",
    });
    extraWhatNotToDo.push("Cut costs or add growth spend before closing revenue leakage.");
  }

  if (vc && vc.flags.length > 0) {
    signals.push({ type: "vendor_control_risk", severity: vc.riskLevel === "CRITICAL" ? "CRITICAL" : vc.riskLevel === "HIGH" ? "HIGH" : "MEDIUM", message: vc.flags[0] });
    if (vc.blockPayment) extraRestrictions.push("Hold vendor payment until control flags are cleared (bank verification / duplicate check).");
    extraActions.push({
      title: `Resolve vendor/procurement control flags (${vc.riskLevel})`,
      accountableRole: "owner",
      decisionType: vc.blockPayment ? "BLOCK" : "INVESTIGATE",
      requiredProof: vc.requiredActions.join("; ") || "Vendor verification evidence",
      reviewInDays: 5,
      expectedFinancialImpact: "Prevent overpayment / fraud leakage",
      killRule: "Do not release payment while a CRITICAL vendor flag is open.",
    });
  }

  // ---- Underinvestment detection (Section 24) ----
  if (input.assessment.underinvestment) {
    const cashSafeForInvest =
      input.assessment.underinvestment.cashSafe ??
      (mode.primaryMode === "GROW" || mode.primaryMode === "SCALE" || mode.primaryMode === "PROFIT_INCREASE");
    const ui = detectUnderinvestment({ ...input.assessment.underinvestment, cashSafe: cashSafeForInvest });
    for (const finding of ui.findings.filter((x) => x.classification === "harmful_underinvestment" || x.classification === "delayed_necessary_spend")) {
      signals.push({ type: "underinvestment_detected", severity: finding.severity === "HIGH" ? "HIGH" : "MEDIUM", message: finding.message });
      extraActions.push({
        title: `Address underinvestment in ${finding.area}`,
        accountableRole: "owner",
        decisionType: "INCREASE",
        requiredProof: "Trend evidence (downtime/rework/churn/refund/pipeline) + spend baseline",
        reviewInDays: 14,
        expectedFinancialImpact: finding.recommendedAction,
        killRule: "Stop if the adverse trend does not improve within two review cycles.",
      });
    }
  }

  // ---- Collusion / fraud risk (Section 25) ----
  if (input.assessment.collusion) {
    const col = detectCollusionRisk(input.assessment.collusion);
    for (const finding of col.findings) {
      signals.push({
        type: finding.pattern === "self_approval_pattern" || finding.pattern === "repeated_override_pair" ? "approval_bypass_risk" : "manager_budget_violation",
        severity: finding.severity === "HIGH" ? "HIGH" : "MEDIUM",
        message: finding.message,
      });
    }
    if (col.requiresOwnerReview) {
      extraRestrictions.push("Elevated control risk detected — owner review required before further discretionary spend.");
      extraActions.push({
        title: "Investigate control-risk pattern (requires owner review)",
        accountableRole: "owner",
        decisionType: "INVESTIGATE",
        requiredProof: "Approval/refund/discount logs for the flagged actors",
        reviewInDays: 5,
        expectedFinancialImpact: "Prevent leakage/fraud; no accusation — review only",
        killRule: "Escalate if the pattern persists after review.",
      });
    }
  }

  // ---- Reconciliation exceptions (Section 21) ----
  if ((input.assessment.reconciliationExceptionCount ?? 0) > 0) {
    signals.push({ type: "reconciliation_exception", severity: "MEDIUM", message: `${input.assessment.reconciliationExceptionCount} spend(s) unreconciled/disputed — actuals partly unverified.` });
    extraRestrictions.push("Recommendations rely partly on unreconciled spend; verify before irreversible decisions.");
  }

  signals.push({ type: "updated_plan_ready", severity: "INFO", message: `Updated plan generated in ${mode.primaryMode} mode.` });

  // ---- Decision + next best action ----
  const { decisionType, nextBestAction, topConstraint } = deriveNextAction(mode.primaryMode, cash, mode.netMarginPct, mode.missingCriticalData, mode.reasons);

  // ---- Generated actions ----
  const generatedActions: BudgetGeneratedAction[] = [];
  if (mode.primaryMode === "EMERGENCY" || cash.reserveBreached || (cash.runwayDays !== null && cash.runwayDays < 14)) {
    generatedActions.push({
      title: "Protect cash: freeze discretionary spend and stage critical payments by due date",
      accountableRole: "owner",
      decisionType: "BLOCK",
      requiredProof: "Updated cash position + obligation due-date schedule",
      reviewInDays: 2,
      expectedFinancialImpact: `Preserve reserve of ${fmtMoney(cash.statutoryReserveRequired)} and avoid due-date default`,
      killRule: "Reassess immediately on any new committed obligation or cash receipt.",
    });
  }
  for (const r of allocation.ranked.filter((x) => x.decision === "BLOCK" || x.decision === "DEFER" || x.decision === "INVESTIGATE")) {
    generatedActions.push({
      title: `${r.decision === "INVESTIGATE" ? "Investigate" : "Hold"} "${r.candidate.label}" (${r.candidate.category})`,
      accountableRole: r.candidate.accountableRole ?? "owner",
      decisionType: r.decision === "INVESTIGATE" ? "INVESTIGATE" : r.decision === "DEFER" ? "DEFER" : "BLOCK",
      requiredProof: r.candidate.proofRequired ?? "Evidence the spend protects survival/profit before release",
      reviewInDays: r.reviewInDays,
      expectedFinancialImpact: r.candidate.expectedReturnPct != null ? `Expected return ${r.candidate.expectedReturnPct}% (unproven at current confidence)` : "Not estimable until evidence collected",
      killRule: r.killRule,
    });
  }
  if (mode.primaryMode === "DATA_INSUFFICIENT") {
    generatedActions.push({
      title: `Collect missing critical data: ${mode.missingCriticalData.join(", ") || "core financials"}`,
      accountableRole: "owner",
      decisionType: "COLLECT_EVIDENCE",
      requiredProof: "Owner-entered or uploaded financial records",
      reviewInDays: 7,
      expectedFinancialImpact: "Cannot estimate impact until data is provided",
      killRule: "No high-risk spend approved until data confidence reaches OPERATIONAL.",
    });
  }

  // ---- Merge the archetype pack + working-capital×archetype cross-integration ----
  signals.push(...archetypePack.signals, ...archetypeWc.signals);
  extraActions.push(...archetypePack.actions, ...archetypeWc.actions);
  extraRestrictions.push(...archetypePack.spendRestrictions, ...archetypeWc.spendRestrictions);
  extraWhatNotToDo.push(...archetypePack.whatNotToDo, ...archetypePack.scaleBlocks, ...archetypeWc.whatNotToDo);

  // ---- Restrictions ----
  const spendRestrictions: string[] = [];
  if (mode.primaryMode === "EMERGENCY" || mode.primaryMode === "STABILIZE" || mode.primaryMode === "HYBRID") {
    spendRestrictions.push(
      cash.liquidityComplete
        ? "Discretionary and experimental spend paused until cash/controls stabilize."
        : "Discretionary and experimental spend paused until the bank balance is confirmed and cash/controls are clear."
    );
  }
  if (!["VERIFIED", "AUDITED"].includes(conf)) {
    spendRestrictions.push("Irreversible spend (hiring, capex, new branch, major marketing) blocked below VERIFIED confidence.");
  }
  if (cash.reserveBreached) spendRestrictions.push("All non-essential payments require owner approval until reserve restored.");
  spendRestrictions.push(...extraRestrictions);
  generatedActions.push(...extraActions);

  const accountableRoles = [...new Set([
    "owner",
    ...allocation.ranked.map((r) => r.candidate.accountableRole).filter((x): x is string => !!x),
    packet.whoShouldDoIt.who,
  ])];

  const requiredProof = [...new Set([
    ...allocation.ranked.filter((r) => r.candidate.proofRequired).map((r) => r.candidate.proofRequired as string),
    mode.primaryMode === "DATA_INSUFFICIENT" ? "Core financial data" : "",
  ].filter(Boolean))];

  const reviewInDays = mode.primaryMode === "EMERGENCY" ? 2 : mode.primaryMode === "STABILIZE" || mode.primaryMode === "HYBRID" ? 7 : 14;

  return {
    mode: mode.primaryMode,
    topConstraint,
    nextBestAction,
    decisionType,
    whatChanged: input.change ?? null,
    affectedBudgetLines: input.affectedBudgetLines ?? [],
    affectedFunctions: [...new Set(allocation.ranked.map((r) => r.candidate.category))],
    fundAllocationChanges: allocation.ranked.map(
      (r) => `${r.candidate.label}: ${r.decision}${r.fundedAmount ? ` (${r.fundedAmount})` : ""} — ${r.reason}`
    ),
    spendRestrictions,
    accountableRoles,
    generatedActions,
    requiredProof,
    cashImpact: `Free cash after obligations: ${fmtMoney(cash.freeCashAfterObligations)}; reserve required: ${fmtMoney(cash.statutoryReserveRequired)}.`,
    profitImpact: mode.netMarginPct === null ? "Net margin not computable from current data." : `Net margin ${mode.netMarginPct.toFixed(1)}%.`,
    runwayImpact: cash.runwayDays === null ? (cash.liquidityComplete ? "Runway not at risk or not computable." : "Runway cannot be confirmed until the bank balance is recorded.") : `Runway ${cash.runwayDays} days.`,
    confidence: conf,
    reviewInDays,
    killRule: "Reassess on any material budget/spend/revenue/proof/cash change.",
    signals,
    whatNotToDo: [...whatNotToDo, ...extraWhatNotToDo, ...outcomeWhatNotToDo],
    highRiskBlocked: mode.primaryMode === "DATA_INSUFFICIENT",
  };
}

function deriveNextAction(
  mode: UpdatedOwnerPlan["mode"],
  cash: ReturnType<typeof classifyBudgetMode>["cash"],
  margin: number | null,
  missing: string[],
  reasons: string[] = []
): { decisionType: PlanDecisionType; nextBestAction: string; topConstraint: string } {
  switch (mode) {
    case "EMERGENCY":
      return {
        decisionType: "BLOCK",
        topConstraint: cash.reserveBreached ? "Reserve breach" : "Imminent cash/obligation failure",
        nextBestAction: "Freeze discretionary spend, protect statutory reserve, and stage critical payments by due date this week.",
      };
    case "DATA_INSUFFICIENT":
      return {
        decisionType: "COLLECT_EVIDENCE",
        topConstraint: `Missing critical data: ${missing.join(", ") || "core financials"}`,
        nextBestAction: "Enter/upload core financial data (revenue, cash, obligations) before any growth or capex decision.",
      };
    case "STABILIZE":
      // Held in STABILIZE ONLY because total liquidity is unconfirmed: an evidence request, not a distress verdict.
      if (!cash.liquidityComplete && !reasons.some((r) => r.startsWith("Cash/margin/controls weak"))) {
        return {
          decisionType: "COLLECT_EVIDENCE",
          topConstraint: "Bank balance not confirmed",
          nextBestAction: "Confirm your bank balance (Guided setup or Cashflow; enter 0 if you hold none) so OpsIQ can confirm your total cash before clearing growth or scale spending.",
        };
      }
      return {
        decisionType: "REDUCE",
        topConstraint: margin !== null && margin < 0 ? "Negative net margin" : "Weak cash/margin/controls",
        nextBestAction: "Tighten spend approvals, cut margin leakage (discounts/rework), and rebuild cash buffer before growth.",
      };
    case "PROFIT_INCREASE":
      return {
        decisionType: "REALLOCATE",
        topConstraint: "Margin below target with revenue present",
        nextBestAction: "Fix profit leakage: review pricing/minimum-order/discount and low-margin service mix before adding spend.",
      };
    case "GROW":
      return {
        decisionType: "APPROVE",
        topConstraint: "Revenue below target with safe cash and acceptable unit economics",
        nextBestAction: "Fund the highest-ROI proven channel with a capped test, proof tracking, and a kill rule.",
      };
    case "SCALE":
      return {
        decisionType: "INCREASE",
        topConstraint: "Capacity constraint with proven repeatable demand",
        nextBestAction: "Fund the scale step that relieves the proven bottleneck, with payback proof and staged release.",
      };
    case "HYBRID":
    default:
      return {
        decisionType: "REALLOCATE",
        topConstraint: "Stabilize cash while testing controlled growth",
        nextBestAction: "Protect reserve first, then fund a single small capped growth test with a strict kill rule.",
      };
  }
}

/** Map budget state to collective DomainSignalInput[] (reuse, not duplicate). */
function buildDomainSignals(
  input: BudgetAssessmentInput,
  margin: number | null,
  runwayDays: number | null,
  conf: BudgetConfidenceLevel
): DomainSignalInput[] {
  const recConf = toRecConfidence(conf);
  const signals: DomainSignalInput[] = [];

  const cashStatus: SignalStatus = runwayDays !== null && runwayDays < 14 ? "RED" : runwayDays !== null && runwayDays < 45 ? "AMBER" : "GREEN";
  const cashSev: TrainingSeverity = cashStatus === "RED" ? "CRITICAL" : cashStatus === "AMBER" ? "MEDIUM" : "LOW";
  signals.push({ domain: "cash-survival", status: cashStatus, severity: cashSev, confidence: recConf });

  if (margin !== null) {
    const pStatus: SignalStatus = margin < 0 ? "RED" : margin < 10 ? "AMBER" : "GREEN";
    const pSev: TrainingSeverity = margin < 0 ? "HIGH" : margin < 10 ? "MEDIUM" : "LOW";
    signals.push({ domain: "profit-improvement", status: pStatus, severity: pSev, confidence: recConf });
  }

  if (input.capacityUtilizationPct != null || input.workloadOverloaded != null) {
    const overloaded = input.workloadOverloaded === true || (input.capacityUtilizationPct ?? 0) >= 90;
    signals.push({ domain: "capacity", status: overloaded ? "RED" : "GREEN", severity: overloaded ? "HIGH" : "LOW", confidence: recConf });
  }

  if (input.demandRepeatable != null) {
    signals.push({ domain: "growth-readiness", status: input.demandRepeatable ? "GREEN" : "AMBER", severity: input.demandRepeatable ? "LOW" : "MEDIUM", confidence: recConf });
  }

  return signals;
}
