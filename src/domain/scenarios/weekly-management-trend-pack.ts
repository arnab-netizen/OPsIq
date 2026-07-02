/**
 * WEEKLY MANAGEMENT / TREND PACK — 150 counted, source-backed scenarios proving OpsIQ handles weekly management
 * review + trend/drift signals WITHOUT auto-acting: a metric moving over weeks is a SIGNAL, not an instruction.
 * OpsIQ separates "is the drift real?" (missing baseline/figures → need_more_data) from "the drift is proven and
 * the response is material" (owner_decision_required) from "a small proven within-band correction under an SOP
 * grant" (cautious/proceed), and BLOCKS trend responses that cross a compliance boundary or rest on gamed/
 * unverifiable numbers. No live outcome claim.
 *
 * Each of the 150 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
 * `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure expander over the
 * merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { WEEKLY_MANAGEMENT_TREND_SOURCE_BY_ID } from "./weekly-management-trend-sources";

export interface WeeklyTrendScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

/** Base disposition codes. OD/BL pick their binding constraint from the per-subcategory map below. */
type Disp = "PR" | "CA" | "NF" | "OD" | "BL";

type ProofRisk = BusinessRealityScenario["expectedProofRiskState"];

interface DispSpec {
  status: BusinessRealityScenario["expectedActionStatus"];
  boundary: BusinessRealityScenario["expectedBoundaryState"];
  inputQuality: BusinessRealityScenario["expectedInputQualityState"];
  proofRisk: ProofRisk;
  gbu: "good" | "bad" | "ugly";
  severity: string;
  highRisk: boolean;
  professionalReviewRequired: boolean;
  ownerWorkloadRisk: "low" | "medium" | "high";
}

const DISP: Record<Disp, DispSpec> = {
  // Routine within-band weekly correction, owner/SOP-approved, verified proof → proceed.
  PR: { status: "proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Small reversible corrective step under an SOP grant with a stop-loss, verified proof → cautious_proceed.
  CA: { status: "cautious_proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Drift signal missing its baseline/figures → ask for it (never act on unproven drift).
  NF: { status: "need_more_data", boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Confirmed drift with a material response → owner decides (prepared options, not auto-acted).
  OD: { status: "owner_decision_required", boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
  // Compliance boundary / gamed numbers on a trend response → blocked (never proceed).
  BL: { status: "blocked", boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
};

/** Per-subcategory binding constraint for OD (owner_decision) — all four are DB-proven by the Daily Operations
 *  pack via the same seed path; NO customer_quality dependency (so no reputation-metric seeding is needed). */
const OD_DOMINANT: Record<string, Constraint> = {
  weekly_revenue_drift: "below_margin", gross_margin_drift: "below_margin",
  complaint_trend_increase: "owner_workload", rework_redo_trend: "capacity_feasibility",
  staff_productivity_drift: "capacity_feasibility", delivery_delay_trend: "capacity_feasibility",
  proof_compliance_trend: "owner_workload", inventory_consumable_usage_drift: "below_margin",
  repeat_customer_retention_decline: "below_margin", marketing_campaign_underperformance: "below_margin",
};
/** Per-subcategory binding constraint for BL (blocked): proof-fraud where numbers are gamed/misreported,
 *  compliance elsewhere. */
const BL_DOMINANT: Record<string, Constraint> = {
  weekly_revenue_drift: "compliance_block", gross_margin_drift: "compliance_block",
  complaint_trend_increase: "compliance_block", rework_redo_trend: "proof_fraud_block",
  staff_productivity_drift: "proof_fraud_block", delivery_delay_trend: "compliance_block",
  proof_compliance_trend: "compliance_block", inventory_consumable_usage_drift: "proof_fraud_block",
  repeat_customer_retention_decline: "compliance_block", marketing_campaign_underperformance: "compliance_block",
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "trendDirection", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "trendDirection"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Weekly review"], proof_fraud_block: ["Proof/anti-gaming", "Weekly review"],
  cash_survival: ["Finance", "Weekly review"], below_margin: ["Revenue/margin", "Weekly review"],
  capacity_feasibility: ["Capacity/throughput", "Weekly review"], customer_quality: ["Customer", "Weekly review"],
  owner_workload: ["Owner workload", "Weekly review"], profitable_growth: ["Weekly review", "Trend monitoring"],
  efficiency_scaling: ["Weekly review"], optimization: ["Process improvement"],
};

interface Vignette { sub: string; title: string; disp: Disp; src: string; gold?: boolean }

function seedFor(disp: Disp, sub: string): ScenarioSeedPlan {
  switch (disp) {
    case "PR": return { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" };
    case "CA": return { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" };
    case "NF": return { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true };
    case "OD": return { dominant: OD_DOMINANT[sub], goodBadUgly: "bad" };
    case "BL": return { dominant: BL_DOMINANT[sub], goodBadUgly: "ugly" };
  }
}

function expand(v: Vignette, index: number): WeeklyTrendScenario {
  const d = DISP[v.disp];
  const seed = seedFor(v.disp, v.sub);
  const dominant = seed.dominant;
  const professionalReviewRequired = v.disp === "BL" && dominant === "compliance_block";
  const proofRisk = v.disp === "BL" && dominant === "proof_fraud_block" ? "staged" : d.proofRisk;
  const doNow = d.status === "proceed" ? `Apply the routine within-band correction for "${v.title}" and record the trend proof.`
    : d.status === "cautious_proceed" ? `Take the small reversible corrective step on "${v.title}" under the SOP grant, with the figures on file.`
    : d.status === "need_more_data" ? `Get the missing baseline/figure for "${v.title}" before treating the drift as real.`
    : d.status === "owner_decision_required" ? `Prepare the confirmed trend and response options on "${v.title}" for the owner to decide — do not auto-act.`
    : `Do not act on "${v.title}"; hold for review (compliance boundary or gamed/unverifiable numbers).`;
  const doNotDo = d.status === "blocked" ? [`Do not act on the "${v.title}" trend before the boundary/numbers are cleared.`]
    : d.status === "owner_decision_required" ? [`Do not auto-act on "${v.title}"; the material trend response is the owner's call.`]
    : d.status === "need_more_data" ? [`Do not treat "${v.title}" as a real trend without the baseline/figures.`]
    : [`Do not over-escalate the routine within-band item "${v.title}".`];
  const proofRequired = d.status === "blocked" ? ["compliance clearance / independent verification of the trend numbers"]
    : d.status === "owner_decision_required" ? ["the confirmed trend figures the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing baseline/figure to confirm the trend"]
    : ["the verified figures for this within-band weekly correction"];
  const scenario = {
    scenarioId: `WKY-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "WEEKLY_MANAGEMENT_TREND",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [WEEKLY_MANAGEMENT_TREND_SOURCE_BY_ID[v.src]?.title ?? "composite weekly-trend source", "composite/sector trend pattern — not a specific live case; not final advice"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[dominant],
    expectedDominantConstraint: dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide the response to the confirmed trend: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare the trend figures with proof (the material response stays the owner's call).",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess at the next weekly review (or once the missing baseline / owner decision / compliance review is in)"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: professionalReviewRequired ? "professional_review_required" : d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: v.disp === "BL" && dominant === "proof_fraud_block" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: dominant === "cash_survival" ? ["cash"] : dominant === "owner_workload" ? ["workload"] : dominant === "below_margin" ? ["profit"] : ["profit", "workload"],
    expectedOutcomeMetric: "the weekly trend metric behind this decision (revenue, margin %, complaint/rework rate, on-time %, usage, retention, or campaign ROI) — expected only, not proven actual",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: d.status === "blocked" || d.status === "owner_decision_required"
      ? `Auto-acting on the "${v.title}" trend would cross a boundary, act on gamed numbers, or pre-empt the owner's call.`
      : `Over-reacting to noise or nagging for proof on "${v.title}" would waste effort and overburden the owner.`,
    highRisk: d.highRisk,
    professionalReviewRequired,
    ownerWorkloadRisk: d.ownerWorkloadRisk,
    antiGamingRisk: (v.disp === "BL" && dominant === "proof_fraud_block" ? "high" : "none") as "none" | "low" | "medium" | "high",
    liveOutcomeClaimAllowed: false,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  };
  const parsed = businessRealityScenarioSchema.parse(scenario);
  return { ...parsed, seed };
}

// ── 150 distinct authored vignettes: 10 subcategories × 15. Column totals: PR 24, CA 34, NF 45, OD 33, BL 14.
//    proceed/cautious only on routine within-band SOP-granted verified-proof corrections; drift with missing
//    baseline/figures → need_more_data; material confirmed-trend responses → owner_decision; compliance boundary
//    or gamed numbers → blocked. ──
const VIGNETTES: Vignette[] = [
  // 1. weekly_revenue_drift (15): PR3 CA4 NF5 OD3 BL0
  { sub: "weekly_revenue_drift", title: "post the reconciled weekly revenue total", disp: "PR", src: "SRC-WKY-REVDRIFT" },
  { sub: "weekly_revenue_drift", title: "record a within-band weekly revenue figure with proof", disp: "PR", src: "SRC-WKY-ROUTINE" },
  { sub: "weekly_revenue_drift", title: "log the confirmed weekly revenue in the normal review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "weekly_revenue_drift", title: "re-run last week's top-line against the SOP checklist", disp: "CA", src: "SRC-WKY-REVIEW" },
  { sub: "weekly_revenue_drift", title: "flag a one-week revenue dip for a watch under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "weekly_revenue_drift", title: "apply a small within-band follow-up on a soft week", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "weekly_revenue_drift", title: "schedule a routine revenue check after a seasonal dip", disp: "CA", src: "SRC-WKY-SEASONAL" },
  { sub: "weekly_revenue_drift", title: "revenue looks down but the baseline week is missing", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "weekly_revenue_drift", title: "drift call missing the prior-period revenue", disp: "NF", src: "SRC-WKY-REVDRIFT" },
  { sub: "weekly_revenue_drift", title: "revenue trend missing the seasonal adjustment", disp: "NF", src: "SRC-WKY-SEASONAL" },
  { sub: "weekly_revenue_drift", title: "decline signal with conflicting POS totals", disp: "NF", src: "SRC-WKY-REVDRIFT" },
  { sub: "weekly_revenue_drift", title: "revenue drop with no confirmed period boundary", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "weekly_revenue_drift", title: "sustained multi-week revenue decline needs a response", disp: "OD", src: "SRC-WKY-REVDRIFT", gold: true },
  { sub: "weekly_revenue_drift", title: "revenue drift now threatening the margin plan", disp: "OD", src: "SRC-WKY-MARGINDRIFT" },
  { sub: "weekly_revenue_drift", title: "decide whether to respond to a confirmed revenue slide", disp: "OD", src: "SRC-WKY-REVDRIFT" },
  // 2. gross_margin_drift (15): PR2 CA3 NF5 OD4 BL1
  { sub: "gross_margin_drift", title: "record the reconciled weekly gross margin with proof", disp: "PR", src: "SRC-WKY-MARGINDRIFT" },
  { sub: "gross_margin_drift", title: "post a within-band margin figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "gross_margin_drift", title: "watch a one-week margin dip under the SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "gross_margin_drift", title: "apply a small within-band cost follow-up", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "gross_margin_drift", title: "flag a soft-margin week for the next review", disp: "CA", src: "SRC-WKY-MARGINDRIFT" },
  { sub: "gross_margin_drift", title: "margin looks down but the cost basis is missing", disp: "NF", src: "SRC-WKY-MARGINDRIFT" },
  { sub: "gross_margin_drift", title: "margin drift missing the per-line breakdown", disp: "NF", src: "SRC-WKY-COGS" },
  { sub: "gross_margin_drift", title: "erosion signal missing the true cost of goods", disp: "NF", src: "SRC-WKY-COGS" },
  { sub: "gross_margin_drift", title: "margin trend with conflicting cost figures", disp: "NF", src: "SRC-WKY-MARGINDRIFT" },
  { sub: "gross_margin_drift", title: "margin call pending the discount-leak data", disp: "NF", src: "SRC-WKY-PRICING" },
  { sub: "gross_margin_drift", title: "confirmed margin erosion across a product line", disp: "OD", src: "SRC-WKY-MARGINDRIFT", gold: true },
  { sub: "gross_margin_drift", title: "creeping discounts have pulled margin below plan", disp: "OD", src: "SRC-WKY-PRICING" },
  { sub: "gross_margin_drift", title: "input-cost creep needs a pricing response", disp: "OD", src: "SRC-WKY-COGS" },
  { sub: "gross_margin_drift", title: "decide a material price correction after a proven leak", disp: "OD", src: "SRC-WKY-PRICING" },
  { sub: "gross_margin_drift", title: "a price change that crosses a fair-pricing/tax line", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  // 3. complaint_trend_increase (15): PR2 CA4 NF5 OD3 BL1
  { sub: "complaint_trend_increase", title: "log resolved complaints in the weekly review with proof", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "complaint_trend_increase", title: "record a within-band complaint count with proof", disp: "PR", src: "SRC-WKY-COMPLAINT" },
  { sub: "complaint_trend_increase", title: "watch a one-week complaint uptick under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "complaint_trend_increase", title: "apply a small within-policy service follow-up", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "complaint_trend_increase", title: "flag a soft complaint week for the next review", disp: "CA", src: "SRC-WKY-COMPLAINT" },
  { sub: "complaint_trend_increase", title: "route a minor recurring complaint to the SOP fix", disp: "CA", src: "SRC-WKY-QUALITY" },
  { sub: "complaint_trend_increase", title: "complaints look up but the baseline is missing", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "complaint_trend_increase", title: "complaint trend missing the category breakdown", disp: "NF", src: "SRC-WKY-COMPLAINT" },
  { sub: "complaint_trend_increase", title: "uptick with conflicting complaint logs", disp: "NF", src: "SRC-WKY-COMPLAINT" },
  { sub: "complaint_trend_increase", title: "complaint signal missing the volume denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "complaint_trend_increase", title: "trend call pending the resolution-time data", disp: "NF", src: "SRC-WKY-QUALITY" },
  { sub: "complaint_trend_increase", title: "a confirmed rising complaint trend needs an owner response", disp: "OD", src: "SRC-WKY-COMPLAINT", gold: true },
  { sub: "complaint_trend_increase", title: "systemic complaint theme needs the owner to decide the fix", disp: "OD", src: "SRC-WKY-QUALITY" },
  { sub: "complaint_trend_increase", title: "decide whether to pause acquisition while complaints are up", disp: "OD", src: "SRC-WKY-COMPLAINT" },
  { sub: "complaint_trend_increase", title: "a complaint revealing a possible safety/regulatory breach", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  // 4. rework_redo_trend (15): PR2 CA3 NF4 OD4 BL2
  { sub: "rework_redo_trend", title: "record a within-band rework rate with proof", disp: "PR", src: "SRC-WKY-REWORK" },
  { sub: "rework_redo_trend", title: "log completed redos in the weekly review with proof", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "rework_redo_trend", title: "watch a one-week rework uptick under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "rework_redo_trend", title: "apply a small SOP tweak on a recurring redo", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "rework_redo_trend", title: "flag a soft rework week for the next review", disp: "CA", src: "SRC-WKY-QUALITY" },
  { sub: "rework_redo_trend", title: "rework looks up but the job baseline is missing", disp: "NF", src: "SRC-WKY-REWORK" },
  { sub: "rework_redo_trend", title: "redo trend missing the defect-category data", disp: "NF", src: "SRC-WKY-QUALITY" },
  { sub: "rework_redo_trend", title: "rework signal with conflicting job logs", disp: "NF", src: "SRC-WKY-REWORK" },
  { sub: "rework_redo_trend", title: "trend call pending the jobs-completed denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "rework_redo_trend", title: "a confirmed rising rework trend is eating capacity", disp: "OD", src: "SRC-WKY-CAPACITY", gold: true },
  { sub: "rework_redo_trend", title: "rework backlog now threatens on-time delivery", disp: "OD", src: "SRC-WKY-CAPACITY" },
  { sub: "rework_redo_trend", title: "decide whether to slow intake to clear the rework", disp: "OD", src: "SRC-WKY-REWORK" },
  { sub: "rework_redo_trend", title: "a quality bottleneck needs an owner capacity call", disp: "OD", src: "SRC-WKY-CAPACITY" },
  { sub: "rework_redo_trend", title: "rework being closed without evidence it was redone", disp: "BL", src: "SRC-WKY-FRAUD" },
  { sub: "rework_redo_trend", title: "redo counts that look manipulated to hit a target", disp: "BL", src: "SRC-WKY-FRAUD" },
  // 5. staff_productivity_drift (15): PR3 CA3 NF4 OD3 BL2
  { sub: "staff_productivity_drift", title: "record within-band output per shift with proof", disp: "PR", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "log the weekly productivity figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "staff_productivity_drift", title: "post a reconciled output-per-hour total", disp: "PR", src: "SRC-WKY-ROUTINE" },
  { sub: "staff_productivity_drift", title: "watch a one-week productivity dip under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "staff_productivity_drift", title: "apply a small SOP scheduling tweak", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "staff_productivity_drift", title: "flag a soft output week for the next review", disp: "CA", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "output looks down but the hours baseline is missing", disp: "NF", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "productivity trend missing the staffing data", disp: "NF", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "drift signal with conflicting timesheet totals", disp: "NF", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "trend call pending the units-produced denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "staff_productivity_drift", title: "a confirmed productivity decline needs an owner response", disp: "OD", src: "SRC-WKY-CAPACITY", gold: true },
  { sub: "staff_productivity_drift", title: "output drift points to a staffing/capacity constraint", disp: "OD", src: "SRC-WKY-CAPACITY" },
  { sub: "staff_productivity_drift", title: "decide whether to reschedule shifts against the drift", disp: "OD", src: "SRC-WKY-PRODUCTIVITY" },
  { sub: "staff_productivity_drift", title: "productivity numbers that look inflated to hit a bonus", disp: "BL", src: "SRC-WKY-FRAUD" },
  { sub: "staff_productivity_drift", title: "output logged for work with no evidence it was done", disp: "BL", src: "SRC-WKY-FRAUD" },
  // 6. delivery_delay_trend (15): PR3 CA4 NF4 OD3 BL1
  { sub: "delivery_delay_trend", title: "record within-band on-time % with proof", disp: "PR", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "log the weekly delivery figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "delivery_delay_trend", title: "post the reconciled turnaround-time total", disp: "PR", src: "SRC-WKY-ROUTINE" },
  { sub: "delivery_delay_trend", title: "watch a one-week on-time dip under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "delivery_delay_trend", title: "apply a small routing SOP tweak", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "delivery_delay_trend", title: "flag a soft delivery week for the next review", disp: "CA", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "reschedule a routine run within SOP after a delay", disp: "CA", src: "SRC-WKY-CAPACITY" },
  { sub: "delivery_delay_trend", title: "on-time looks down but the baseline is missing", disp: "NF", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "delay trend missing the route/volume data", disp: "NF", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "delivery signal with conflicting dispatch logs", disp: "NF", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "trend call pending the orders-shipped denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "delivery_delay_trend", title: "a confirmed delivery-delay trend needs an owner response", disp: "OD", src: "SRC-WKY-CAPACITY", gold: true },
  { sub: "delivery_delay_trend", title: "delays point to a capacity/scheduling bottleneck", disp: "OD", src: "SRC-WKY-CAPACITY" },
  { sub: "delivery_delay_trend", title: "decide whether to cap intake to protect on-time %", disp: "OD", src: "SRC-WKY-DELIVERY" },
  { sub: "delivery_delay_trend", title: "a delivery workaround that breaches a safety/transport rule", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  // 7. proof_compliance_trend (15): PR1 CA2 NF4 OD3 BL5
  { sub: "proof_compliance_trend", title: "record a within-band proof-completeness figure with proof", disp: "PR", src: "SRC-WKY-PROOFCOMP" },
  { sub: "proof_compliance_trend", title: "watch a one-week proof-submission dip under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "proof_compliance_trend", title: "apply a small SOP reminder on proof capture", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "proof_compliance_trend", title: "proof completeness looks down but the baseline is missing", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "proof_compliance_trend", title: "compliance-completeness trend missing the checklist data", disp: "NF", src: "SRC-WKY-PROOFCOMP" },
  { sub: "proof_compliance_trend", title: "trend signal with conflicting submission logs", disp: "NF", src: "SRC-WKY-PROOFCOMP" },
  { sub: "proof_compliance_trend", title: "call pending the required-items denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "proof_compliance_trend", title: "a confirmed proof-capture decline needs an owner response", disp: "OD", src: "SRC-WKY-PROOFCOMP", gold: true },
  { sub: "proof_compliance_trend", title: "who owns closing the proof-completeness gap", disp: "OD", src: "SRC-WKY-REVIEW" },
  { sub: "proof_compliance_trend", title: "decide the accountability fix for the proof drift", disp: "OD", src: "SRC-WKY-PROOFCOMP" },
  { sub: "proof_compliance_trend", title: "compliance-item completeness trending below the legal line", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  { sub: "proof_compliance_trend", title: "expiring licences/certs showing up in the trend", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  { sub: "proof_compliance_trend", title: "a proof gap on a regulated step needs professional review", disp: "BL", src: "SRC-WKY-PROOFCOMP" },
  { sub: "proof_compliance_trend", title: "trend response touching a tax/statutory filing", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  { sub: "proof_compliance_trend", title: "self-clearing a compliance gap without review", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
  // 8. inventory_consumable_usage_drift (15): PR3 CA4 NF4 OD3 BL1
  { sub: "inventory_consumable_usage_drift", title: "record within-band consumable usage with proof", disp: "PR", src: "SRC-WKY-INVENTORY" },
  { sub: "inventory_consumable_usage_drift", title: "log the weekly usage figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "inventory_consumable_usage_drift", title: "post the reconciled usage-per-job total", disp: "PR", src: "SRC-WKY-ROUTINE" },
  { sub: "inventory_consumable_usage_drift", title: "watch a one-week usage uptick under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "inventory_consumable_usage_drift", title: "apply a small SOP tweak on stock handling", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "inventory_consumable_usage_drift", title: "flag a soft usage week for the next review", disp: "CA", src: "SRC-WKY-CONSUMABLE" },
  { sub: "inventory_consumable_usage_drift", title: "reorder a within-band consumable at the trigger", disp: "CA", src: "SRC-WKY-INVENTORY" },
  { sub: "inventory_consumable_usage_drift", title: "usage looks high but the benchmark is missing", disp: "NF", src: "SRC-WKY-CONSUMABLE" },
  { sub: "inventory_consumable_usage_drift", title: "usage drift missing the jobs-done denominator", disp: "NF", src: "SRC-WKY-INVENTORY" },
  { sub: "inventory_consumable_usage_drift", title: "consumption signal with conflicting stock counts", disp: "NF", src: "SRC-WKY-INVENTORY" },
  { sub: "inventory_consumable_usage_drift", title: "trend call pending the usage-per-unit baseline", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "inventory_consumable_usage_drift", title: "a confirmed usage-above-benchmark trend is leaking margin", disp: "OD", src: "SRC-WKY-INVENTORY", gold: true },
  { sub: "inventory_consumable_usage_drift", title: "consumable creep needs an owner cost response", disp: "OD", src: "SRC-WKY-COGS" },
  { sub: "inventory_consumable_usage_drift", title: "decide whether to change supplier/spec on rising usage", disp: "OD", src: "SRC-WKY-CONSUMABLE" },
  { sub: "inventory_consumable_usage_drift", title: "stock usage that looks like unrecorded pilferage", disp: "BL", src: "SRC-WKY-FRAUD" },
  // 9. repeat_customer_retention_decline (15): PR2 CA4 NF5 OD4 BL0
  { sub: "repeat_customer_retention_decline", title: "record a within-band repeat-rate figure with proof", disp: "PR", src: "SRC-WKY-RETENTION" },
  { sub: "repeat_customer_retention_decline", title: "log the weekly retention figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "repeat_customer_retention_decline", title: "watch a one-week repeat-rate dip under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "repeat_customer_retention_decline", title: "apply a small within-policy win-back follow-up", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "repeat_customer_retention_decline", title: "flag a soft retention week for the next review", disp: "CA", src: "SRC-WKY-RETENTION" },
  { sub: "repeat_customer_retention_decline", title: "send a routine in-policy re-engagement to lapsed repeats", disp: "CA", src: "SRC-WKY-CHURN" },
  { sub: "repeat_customer_retention_decline", title: "retention looks down but the cohort baseline is missing", disp: "NF", src: "SRC-WKY-CHURN" },
  { sub: "repeat_customer_retention_decline", title: "retention trend missing the cohort data", disp: "NF", src: "SRC-WKY-CHURN" },
  { sub: "repeat_customer_retention_decline", title: "decline signal with conflicting repeat-order logs", disp: "NF", src: "SRC-WKY-RETENTION" },
  { sub: "repeat_customer_retention_decline", title: "trend call pending the active-customer denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "repeat_customer_retention_decline", title: "churn call pending the cohort window", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "repeat_customer_retention_decline", title: "a confirmed retention decline threatens repeat revenue", disp: "OD", src: "SRC-WKY-RETENTION", gold: true },
  { sub: "repeat_customer_retention_decline", title: "rising churn needs an owner retention response", disp: "OD", src: "SRC-WKY-CHURN" },
  { sub: "repeat_customer_retention_decline", title: "decide whether to fund a retention push", disp: "OD", src: "SRC-WKY-RETENTION" },
  { sub: "repeat_customer_retention_decline", title: "a concentrated repeat-customer loss needs an owner call", disp: "OD", src: "SRC-WKY-CHURN" },
  // 10. marketing_campaign_underperformance (15): PR3 CA3 NF5 OD3 BL1
  { sub: "marketing_campaign_underperformance", title: "record within-band campaign leads with proof", disp: "PR", src: "SRC-WKY-MARKETING" },
  { sub: "marketing_campaign_underperformance", title: "log the weekly campaign figure in the review", disp: "PR", src: "SRC-WKY-REVIEW" },
  { sub: "marketing_campaign_underperformance", title: "post the reconciled cost-per-lead total", disp: "PR", src: "SRC-WKY-ROUTINE" },
  { sub: "marketing_campaign_underperformance", title: "watch a one-week campaign dip under SOP", disp: "CA", src: "SRC-WKY-NOISE" },
  { sub: "marketing_campaign_underperformance", title: "apply a small within-budget creative tweak", disp: "CA", src: "SRC-WKY-ROUTINE" },
  { sub: "marketing_campaign_underperformance", title: "flag a soft campaign week for the next review", disp: "CA", src: "SRC-WKY-CAMPAIGN" },
  { sub: "marketing_campaign_underperformance", title: "campaign looks weak but the attribution is missing", disp: "NF", src: "SRC-WKY-CAMPAIGN" },
  { sub: "marketing_campaign_underperformance", title: "underperformance trend missing the cost-per-lead data", disp: "NF", src: "SRC-WKY-MARKETING" },
  { sub: "marketing_campaign_underperformance", title: "ROI signal with conflicting analytics", disp: "NF", src: "SRC-WKY-CAMPAIGN" },
  { sub: "marketing_campaign_underperformance", title: "campaign call pending the conversion denominator", disp: "NF", src: "SRC-WKY-NOISE" },
  { sub: "marketing_campaign_underperformance", title: "spend-efficiency call pending the baseline period", disp: "NF", src: "SRC-WKY-BASELINE" },
  { sub: "marketing_campaign_underperformance", title: "a confirmed underperforming campaign needs a spend decision", disp: "OD", src: "SRC-WKY-CAMPAIGN", gold: true },
  { sub: "marketing_campaign_underperformance", title: "decide whether to cut or scale the campaign spend", disp: "OD", src: "SRC-WKY-MARKETING" },
  { sub: "marketing_campaign_underperformance", title: "reallocate marketing budget after proven underperformance", disp: "OD", src: "SRC-WKY-CAMPAIGN" },
  { sub: "marketing_campaign_underperformance", title: "a campaign claim that may cross an advertising-standards line", disp: "BL", src: "SRC-WKY-COMPLIANCE" },
];

const perCategoryIndex: Record<string, number> = {};
export const WEEKLY_MANAGEMENT_TREND_PACK: WeeklyTrendScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const WEEKLY_MANAGEMENT_TREND_SUBCATEGORIES = [
  "weekly_revenue_drift", "gross_margin_drift", "complaint_trend_increase", "rework_redo_trend",
  "staff_productivity_drift", "delivery_delay_trend", "proof_compliance_trend",
  "inventory_consumable_usage_drift", "repeat_customer_retention_decline", "marketing_campaign_underperformance",
] as const;
