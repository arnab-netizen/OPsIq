/**
 * Real-world CHAOS SCENARIO schema + derivation over the existing real-world public corpus.
 *
 * A chaos scenario is the hostile-skeptical "good / bad / ugly" lens on a real, source-backed `PublicCase`.
 * It adds NO new advice and NO model: it derives an explicit good/bad/ugly classification, the chaos
 * type(s), and the locked expected-outcome fields directly from the case's already-validated
 * `goldSkeleton`, wrapped `BehavioralCase`, source metadata, and dominant constraint. Counted scenarios
 * inherit a real `sourceRef`; synthetic edge scenarios are marked and never counted toward readiness.
 *
 * Pure module: no DB, no Date.now, no AI.
 */
import { z } from "zod";
import { CONSTRAINTS, type Constraint } from "../whole-business/arbitration";
import type { PublicCase } from "../public-cases/schema";

// ─── Good / bad / ugly ───────────────────────────────────────────────────────────────────────────
export const GOOD_BAD_UGLY = ["good", "bad", "ugly"] as const;
export type GoodBadUgly = (typeof GOOD_BAD_UGLY)[number];

/** Severity → good/bad/ugly. GOOD = a genuine (if fragile) opportunity to proceed-with-safeguards;
 *  BAD = correctable management problems (standard/normal + bad_management); UGLY = serious risk
 *  (spiral/fraud/extreme) where OpsIQ must block / reject / escalate / stop. */
export function severityToClass(severity: string): GoodBadUgly {
  if (severity === "best_case" || severity === "good_fragile") return "good";
  if (severity === "normal" || severity === "bad_management") return "bad";
  return "ugly"; // ugly_spiral | fraud | extreme
}

// ─── Chaos types (the cross-cutting case taxonomy) ─────────────────────────────────────────────────
export const CHAOS_TYPES = [
  "cash_profit", "staff_workload", "customer_reputation", "proof_fraud_completion",
  "growth_scale_temptation", "owner_pressure_bad_idea", "missing_data_fake_confidence", "novelty_ood",
  "stop_reject_pause", "shutdown_pivot_stoploss", "high_revenue_bad_business",
  "manipulation_collusion_fraud", "compliance_professional_boundary", "vendor_supplier_disruption",
  "cyber_payment_data_loss",
] as const;
export type ChaosType = (typeof CHAOS_TYPES)[number];

/** Base chaos types implied by a sourced real-world pattern. */
const PATTERN_CHAOS_TYPES: Record<string, ChaosType[]> = {
  cashflow_squeeze: ["cash_profit", "high_revenue_bad_business"],
  receivables_terms_trap: ["cash_profit", "high_revenue_bad_business"],
  dead_stock: ["cash_profit"],
  over_expansion: ["growth_scale_temptation", "shutdown_pivot_stoploss"],
  underpriced_contract: ["high_revenue_bad_business", "cash_profit"],
  capacity_bottleneck: ["staff_workload", "growth_scale_temptation"],
  quality_complaints: ["customer_reputation"],
  owner_overload: ["owner_pressure_bad_idea", "staff_workload"],
  fake_vendor_fraud: ["manipulation_collusion_fraud", "proof_fraud_completion", "vendor_supplier_disruption"],
  fake_completion_proof: ["proof_fraud_completion", "manipulation_collusion_fraud"],
  compliance_shutdown_risk: ["compliance_professional_boundary", "stop_reject_pause"],
  turnaround_sequence: ["shutdown_pivot_stoploss", "cash_profit"],
  weak_unit_economics_scale: ["growth_scale_temptation", "shutdown_pivot_stoploss"],
  ghost_payroll: ["manipulation_collusion_fraud", "proof_fraud_completion", "staff_workload"],
  staff_sop_training: ["staff_workload"],
  staff_overwork_hiring: ["staff_workload"],
  maintenance_downtime: ["staff_workload"],
  delivery_logistics_fail: ["vendor_supplier_disruption", "customer_reputation"],
  price_war_response: ["novelty_ood", "customer_reputation"],
  seasonality_planning: ["novelty_ood", "growth_scale_temptation"],
  cyber_payment_fraud: ["cyber_payment_data_loss", "manipulation_collusion_fraud"],
  insurance_disaster: ["novelty_ood", "compliance_professional_boundary"],
  reputation_social_crisis: ["customer_reputation", "novelty_ood"],
  franchise_brand_conflict: ["novelty_ood", "compliance_professional_boundary"],
  exit_sale_readiness: ["shutdown_pivot_stoploss", "novelty_ood"],
  asset_purchase_payback: ["cash_profit", "growth_scale_temptation"],
  local_market_remote: ["owner_pressure_bad_idea", "novelty_ood"],
  sales_pipeline: ["growth_scale_temptation"],
};

/** Derive the full chaos-type set from the case's pattern, dominant constraint, severity and flags. */
export function deriveChaosTypes(pc: PublicCase): ChaosType[] {
  const set = new Set<ChaosType>(PATTERN_CHAOS_TYPES[pc.meta.patternId] ?? []);
  const dom = pc.meta.dominantConstraint;
  const flags = pc.case.flags as Record<string, boolean>;
  // Every real chaos case carries a tempting wrong action ⇒ an owner bad-idea temptation when the owner
  // is in the loop (emotional/remote) or the play is owner-centric.
  if (flags.ownerEmotional || flags.remoteOwner) set.add("owner_pressure_bad_idea");
  // Weak/unverifiable evidence ⇒ a missing-data / fake-confidence challenge. At replay time NO real
  // provider backs the case, so the runtime must not fake confidence regardless; we tag the cases whose
  // pattern is intrinsically evidence-challenged.
  if (["fake_completion_proof", "fake_vendor_fraud", "ghost_payroll", "weak_unit_economics_scale",
       "seasonality_planning", "sales_pipeline", "price_war_response", "cyber_payment_fraud"].includes(pc.meta.patternId)) {
    set.add("missing_data_fake_confidence");
  }
  // Legal / fraud dominance, or an ugly case, must be stoppable / pausable / rejectable.
  if (dom === "compliance_block" || dom === "proof_fraud_block") set.add("stop_reject_pause");
  if (severityToClass(pc.meta.severity) === "ugly") set.add("stop_reject_pause");
  // A gold stop-loss ⇒ a shutdown/pivot/stop-loss decision.
  if (pc.meta.goldSkeleton.stopLoss) set.add("shutdown_pivot_stoploss");
  if (flags.hostile) set.add("manipulation_collusion_fraud");
  return [...set];
}

// ─── Real-world consequence (deterministic, derived from the dominant constraint) ──────────────────
const CONSEQUENCE_BY_CONSTRAINT: Record<Constraint, string> = {
  compliance_block: "Operating past a licensing/tax/regulatory boundary risks fines, forced shutdown, or personal liability.",
  proof_fraud_block: "Acting on unverifiable or gamed numbers means paying for fraud and corrupting every downstream decision.",
  cash_survival: "Spending or committing while cash is short risks missed payroll, supplier default, and insolvency.",
  below_margin: "Taking work below fully-loaded cost loses money on every unit and the loss grows with volume.",
  capacity_feasibility: "Accepting load beyond reliable capacity breaks delivery and quality, destroying repeat demand.",
  customer_quality: "Spending on acquisition while quality/complaints are unresolved burns cash and accelerates reputation loss.",
  owner_workload: "Keeping the owner as the bottleneck caps the business and creates a single point of failure.",
  profitable_growth: "Scaling before unit economics and stability are proven multiplies losses instead of profit.",
  efficiency_scaling: "Scaling an inefficient process multiplies cost faster than revenue.",
  optimization: "Mis-tuning within safe bounds wastes effort but is the lowest-severity error.",
};

export function realWorldConsequence(dominant: Constraint): string {
  return CONSEQUENCE_BY_CONSTRAINT[dominant];
}

// ─── Scenario schema (39 fields) ───────────────────────────────────────────────────────────────────
export const chaosScenarioSchema = z.object({
  scenarioId: z.string().min(3),
  countedForReadiness: z.boolean(),
  synthetic: z.boolean(),
  sourceRefs: z.array(z.string()).default([]),
  sourceLimitations: z.array(z.string()).min(1),
  goodBadUgly: z.enum(GOOD_BAD_UGLY),
  businessProfile: z.string().min(4),
  businessCategory: z.string().min(2),
  businessStage: z.string().min(2),
  ownerRole: z.string().min(2),
  workspaceHandling: z.string().min(2),
  locationBranch: z.string().min(2),
  availableData: z.array(z.string()).min(1),
  missingData: z.array(z.string()).min(1),
  staleData: z.array(z.string()).default([]),
  conflictingData: z.array(z.string()).min(1),
  ownerPressure: z.string().min(4),
  temptingWrongAction: z.string().min(4),
  staffVendorCustomerNoise: z.array(z.string()).default([]),
  financialState: z.string().min(2),
  operationalState: z.string().min(2),
  staffWorkloadState: z.string().min(2),
  customerReputationState: z.string().min(2),
  proofCompletionState: z.string().min(2),
  growthOpportunityState: z.string().min(2),
  complianceBoundaryState: z.string().min(2),
  expectedModules: z.array(z.string()).min(1),
  // Required key (§5) — may legitimately be empty for a clean good case, but must be present.
  expectedNonDominantModules: z.array(z.string()),
  expectedDominantConstraint: z.enum(CONSTRAINTS),
  expectedRejectedTemptingAction: z.string().min(4),
  expectedSupervisorActionStatus: z.enum(["proceed", "cautious_proceed", "owner_decision_required", "need_more_data", "blocked"]),
  expectedDashboardFields: z.array(z.string()).min(1),
  expectedProofReassessment: z.array(z.string()).min(1),
  expectedBusinessOutcomeRationale: z.string().min(8),
  expected7DaySignal: z.string().min(4),
  expected30DaySignal: z.string().min(4),
  expectedStopLossThreshold: z.string().optional(),
  expectedLearningOnFail: z.string().min(4),
  expectedRealWorldConsequenceIfWrong: z.string().min(8),
  chaosTypes: z.array(z.enum(CHAOS_TYPES)).min(1),
}).refine((s) => !s.countedForReadiness || !s.synthetic, { message: "synthetic scenarios cannot be counted" })
  .refine((s) => !s.countedForReadiness || s.sourceRefs.length > 0, { message: "counted scenarios need a real sourceRef" });

export type ChaosScenario = z.infer<typeof chaosScenarioSchema>;

// ─── Expected supervisor action status (mirrors the supervisor's deterministic disposition) ─────────
const HIGH_RISK_FINANCIAL = new Set<Constraint>(["cash_survival", "below_margin", "profitable_growth", "efficiency_scaling"]);

/** The action status the supervisor SHOULD reach for this dominant constraint at replay time.
 *  At replay there is no real provider data, so a non-blocked case is at least need_more_data/owner_decision —
 *  never a clean proceed. Blocked for legal/fraud/unsafe. */
export function expectedActionStatus(dominant: Constraint, ugly: boolean): ChaosScenario["expectedSupervisorActionStatus"] {
  if (dominant === "compliance_block" || dominant === "proof_fraud_block") return "blocked";
  if (ugly) return "owner_decision_required";
  if (HIGH_RISK_FINANCIAL.has(dominant)) return "owner_decision_required";
  return "need_more_data"; // no real provider backing ⇒ cannot proceed cleanly
}

// ─── Derivation: PublicCase → ChaosScenario ────────────────────────────────────────────────────────
const DOMAIN_LABEL = "domain";

export function publicCaseToChaosScenario(pc: PublicCase, opts: { counted: boolean } = { counted: true }): ChaosScenario {
  const gbu = severityToClass(pc.meta.severity);
  const dom = pc.meta.dominantConstraint;
  const c = pc.case;
  const flags = c.flags as Record<string, boolean>;
  const sourceLimitations: string[] = [
    "self-reported owner claim",
    "incomplete financials",
    ...(flags.missingOrStaleData ? ["outdated information"] : []),
    ...(flags.hostile ? ["possible fraud/manipulation", "unverifiable claim"] : []),
    ...(c.location.complianceUncertainty ? ["jurisdiction uncertainty"] : []),
  ];

  const scenario: ChaosScenario = {
    scenarioId: `CHAOS-${pc.meta.caseId}`,
    countedForReadiness: opts.counted,
    synthetic: false,
    sourceRefs: pc.meta.sourceRef ? [pc.meta.sourceRef] : [],
    sourceLimitations: sourceLimitations.length ? sourceLimitations : ["self-reported owner claim"],
    goodBadUgly: gbu,
    businessProfile: `${c.businessType} (${pc.meta.businessStage}) in ${c.location.cityRegion}`,
    businessCategory: pc.meta.businessCategory,
    businessStage: pc.meta.businessStage,
    ownerRole: flags.remoteOwner ? "remote/absentee owner" : "owner-operator",
    workspaceHandling: "isolated workspace+business per scenario",
    locationBranch: `${c.location.country} / ${c.location.marketTier}${flags.multiBranch ? " / multi-branch" : ""}`,
    availableData: [`stated numbers: ${Object.keys(c.numbers).slice(0, 6).join(", ") || "minimal"}`, ...c.messyFacts.slice(0, 2)],
    missingData: c.location.complianceUncertainty
      ? ["real provider-backed financial records", "verified proof of completion", "current compliance status"]
      : ["real provider-backed financial records", "verified proof of completion"],
    staleData: flags.missingOrStaleData ? ["owner-reported figures may be out of date"] : [],
    conflictingData: [`misleading signal: ${c.temptingBadDecision}`, ...c.messyFacts.slice(2, 3)].filter(Boolean),
    ownerPressure: c.temptingBadDecision,
    temptingWrongAction: c.temptingBadDecision,
    staffVendorCustomerNoise: c.messyFacts.slice(0, 3),
    financialState: dom === "cash_survival" || dom === "below_margin" ? "stressed" : "mixed",
    operationalState: dom === "capacity_feasibility" ? "over-capacity" : "mixed",
    staffWorkloadState: dom === "owner_workload" ? "owner-bottlenecked" : "mixed",
    customerReputationState: dom === "customer_quality" ? "complaints rising" : "mixed",
    proofCompletionState: dom === "proof_fraud_block" ? "unverifiable / disputed" : "partial",
    growthOpportunityState: gbu === "good" ? "plausible opportunity present" : "secondary to the binding problem",
    complianceBoundaryState: dom === "compliance_block" ? "grey-area / professional review needed" : "no active block",
    expectedModules: [...new Set([...(pc.meta.domains ?? []), `${DOMAIN_LABEL}:${dom}`])],
    expectedNonDominantModules: gbu === "good" ? [] : ["marketing/acquisition", "expansion/new-location"],
    expectedDominantConstraint: dom,
    expectedRejectedTemptingAction: c.temptingBadDecision,
    expectedSupervisorActionStatus: expectedActionStatus(dom, gbu === "ugly"),
    expectedDashboardFields: ["mainIssue", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "actionStatus", "confidence"],
    expectedProofReassessment: [...(pc.meta.goldSkeleton.proofRequired ?? []), pc.meta.goldSkeleton.reassessment].filter(Boolean),
    expectedBusinessOutcomeRationale: `${pc.meta.goldSkeleton.rootCause} → ${pc.meta.goldSkeleton.nextBestAction}`,
    expected7DaySignal: pc.meta.plan7Day,
    expected30DaySignal: pc.meta.plan30Day,
    expectedStopLossThreshold: pc.meta.goldSkeleton.stopLoss,
    expectedLearningOnFail: c.learningRuleIfFails ?? "Scoped learning candidate from this failure (never global-promoted).",
    expectedRealWorldConsequenceIfWrong: realWorldConsequence(dom),
    chaosTypes: deriveChaosTypes(pc),
  };
  return scenario;
}
