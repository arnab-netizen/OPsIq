/**
 * GROWTH / PROFIT / SCALING PACK — 150 counted, source-backed scenarios proving OpsIQ handles growth / profit /
 * scaling decisions WITHOUT reckless expansion: a scaling move is material and reversible-only-at-cost, so it is
 * owner-gated by default; a growth decision missing its ROI / capacity / margin / cash figures blocks on data
 * (need_more_data); expansion that crosses a licensing / labour / consumer-law / franchise-disclosure boundary or
 * rests on gamed growth numbers is blocked; and ONLY a small, proven, within-capacity, capped pilot with verified
 * data + an owner/SOP grant proceeds. Does NOT prove live profit/outcome improvement (no live data).
 *
 * Each of the 150 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
 * `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure expander over the
 * merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { GROWTH_PROFIT_SCALING_SOURCE_BY_ID } from "./growth-profit-scaling-sources";

export interface GrowthScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

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
  // Small, capped, reversible, within-capacity pilot; owner/SOP-approved; verified proof → proceed.
  PR: { status: "proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Reversible capped growth test under an SOP grant with a stop-loss, verified proof → cautious_proceed.
  CA: { status: "cautious_proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Growth move missing its ROI/capacity/margin/cash figures → ask for it (never scale on missing data).
  NF: { status: "need_more_data", boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Material scaling commitment → owner decides (prepared options, not auto-committed).
  OD: { status: "owner_decision_required", boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
  // Licensing / labour / consumer-law / franchise boundary or gamed growth numbers → blocked (never proceed).
  BL: { status: "blocked", boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
};

/** Per-subcategory binding constraint for OD (owner_decision) — all are DB-proven by the Daily Operations /
 *  Finance / Weekly packs via the same seed path; NO customer_quality dependency. */
const OD_DOMINANT: Record<string, Constraint> = {
  new_location_branch_expansion: "cash_survival", hiring_team_scaling: "capacity_feasibility",
  new_product_service_line: "below_margin", capacity_expansion_investment: "capacity_feasibility",
  market_geographic_expansion: "cash_survival", price_increase_for_profit: "below_margin",
  profit_margin_improvement_initiative: "below_margin", large_contract_bulk_order_scaling: "below_margin",
  marketing_channel_scale_up: "below_margin", partnership_franchise_scaling: "capacity_feasibility",
};
/** Per-subcategory binding constraint for BL (blocked): proof-fraud where growth numbers are gamed/inflated,
 *  compliance elsewhere (licensing / labour / consumer-law / franchise-disclosure boundary). */
const BL_DOMINANT: Record<string, Constraint> = {
  new_location_branch_expansion: "compliance_block", hiring_team_scaling: "compliance_block",
  new_product_service_line: "compliance_block", capacity_expansion_investment: "compliance_block",
  market_geographic_expansion: "compliance_block", price_increase_for_profit: "compliance_block",
  profit_margin_improvement_initiative: "proof_fraud_block", large_contract_bulk_order_scaling: "compliance_block",
  marketing_channel_scale_up: "proof_fraud_block", partnership_franchise_scaling: "compliance_block",
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "growthImpact", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "growthImpact"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Growth/scaling"], proof_fraud_block: ["Proof/anti-gaming", "Growth/scaling"],
  cash_survival: ["Finance", "Growth/scaling"], below_margin: ["Revenue/margin", "Growth/scaling"],
  capacity_feasibility: ["Capacity/throughput", "Growth/scaling"], customer_quality: ["Customer", "Growth/scaling"],
  owner_workload: ["Owner workload", "Growth/scaling"], profitable_growth: ["Growth/scaling", "Profitable growth"],
  efficiency_scaling: ["Efficiency/scaling"], optimization: ["Process improvement"],
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

function expand(v: Vignette, index: number): GrowthScenario {
  const d = DISP[v.disp];
  const seed = seedFor(v.disp, v.sub);
  const dominant = seed.dominant;
  const professionalReviewRequired = v.disp === "BL" && dominant === "compliance_block";
  const proofRisk = v.disp === "BL" && dominant === "proof_fraud_block" ? "staged" : d.proofRisk;
  const doNow = d.status === "proceed" ? `Run the small capped within-capacity pilot for "${v.title}" and record the proof.`
    : d.status === "cautious_proceed" ? `Take the reversible capped growth step on "${v.title}" under the SOP grant, with a stop-loss and the figures on file.`
    : d.status === "need_more_data" ? `Get the missing ROI / capacity / margin / cash figure for "${v.title}" before scaling.`
    : d.status === "owner_decision_required" ? `Prepare the ROI / capacity / cash impact of "${v.title}" for the owner to decide — do not auto-commit the scaling move.`
    : `Do not scale on "${v.title}"; hold for professional review (licensing/labour/consumer-law/franchise) or independent verification (gamed numbers).`;
  const doNotDo = d.status === "blocked" ? [`Do not commit to "${v.title}" before the legal boundary / numbers are cleared.`]
    : d.status === "owner_decision_required" ? [`Do not auto-commit capital/capacity on "${v.title}"; the scaling call is the owner's.`]
    : d.status === "need_more_data" ? [`Do not scale "${v.title}" without the ROI / capacity / margin / cash figures.`]
    : [`Do not over-scale "${v.title}" beyond the capped, reversible pilot.`];
  const proofRequired = d.status === "blocked" ? ["professional clearance of the legal boundary / independent verification of the growth numbers"]
    : d.status === "owner_decision_required" ? ["the ROI / capacity / cash figures the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing ROI / capacity / margin / cash figure"]
    : ["the verified figures + capacity headroom for this capped pilot"];
  const scenario = {
    scenarioId: `GRW-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "GROWTH_PROFIT_SCALING",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [GROWTH_PROFIT_SCALING_SOURCE_BY_ID[v.src]?.title ?? "composite growth source", "composite/sector growth pattern — not a specific live case; not final advice"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[dominant],
    expectedDominantConstraint: dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide the scaling commitment: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare the ROI/capacity/cash figures with proof (the scaling commitment stays the owner's call).",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess once the missing figure / owner decision / professional review is in, or at the pilot's stop-loss checkpoint"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: professionalReviewRequired ? "professional_review_required" : d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: v.disp === "BL" && dominant === "proof_fraud_block" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: dominant === "cash_survival" ? ["cash"] : dominant === "owner_workload" ? ["workload"] : dominant === "below_margin" ? ["profit"] : ["profit", "cash"],
    expectedOutcomeMetric: "the growth metric behind this decision (ROI/payback, added capacity, incremental margin, or cash drain) — expected only, not proven actual",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: d.status === "blocked" || d.status === "owner_decision_required"
      ? `Auto-committing to "${v.title}" would cross a legal boundary, scale on gamed numbers, or pre-empt the owner's capital/capacity call.`
      : `Over-scaling "${v.title}" beyond the capped pilot would drain cash or break capacity/quality.`,
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

// ── 150 distinct authored vignettes: 10 subcategories × 15. Column totals: PR 18, CA 34, NF 40, OD 45, BL 13.
//    proceed/cautious only on small capped reversible within-capacity SOP-granted verified pilots; growth missing
//    its ROI/capacity/margin/cash figures → need_more_data; material scaling commitments → owner_decision;
//    licensing/labour/consumer-law/franchise boundary or gamed numbers → blocked. ──
const VIGNETTES: Vignette[] = [
  // 1. new_location_branch_expansion (15): PR1 CA3 NF4 OD5 BL2  (OD cash_survival, BL compliance)
  { sub: "new_location_branch_expansion", title: "run a small capped pop-up test within existing cash", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "new_location_branch_expansion", title: "extend store hours as a small reversible growth test", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "new_location_branch_expansion", title: "trial a second service window under the SOP", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "new_location_branch_expansion", title: "test weekend opening within current capacity", disp: "CA", src: "SRC-GRW-BRANCH" },
  { sub: "new_location_branch_expansion", title: "branch plan missing the demand validation", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "new_location_branch_expansion", title: "expansion missing the location cash-flow projection", disp: "NF", src: "SRC-GRW-BRANCH" },
  { sub: "new_location_branch_expansion", title: "new-site decision missing the capex/payback figure", disp: "NF", src: "SRC-GRW-ROI" },
  { sub: "new_location_branch_expansion", title: "branch call missing the runway impact", disp: "NF", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "new_location_branch_expansion", title: "open a new branch that would drain most of the cash buffer", disp: "OD", src: "SRC-GRW-BRANCH", gold: true },
  { sub: "new_location_branch_expansion", title: "commit a lease deposit that dips below the safe balance", disp: "OD", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "new_location_branch_expansion", title: "expand to a second site while runway is tight", disp: "OD", src: "SRC-GRW-BRANCH" },
  { sub: "new_location_branch_expansion", title: "fund a branch fit-out from operating cash", disp: "OD", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "new_location_branch_expansion", title: "decide a branch opening that competes with reserves", disp: "OD", src: "SRC-GRW-BRANCH" },
  { sub: "new_location_branch_expansion", title: "a new site needing a licence/permit not yet cleared", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  { sub: "new_location_branch_expansion", title: "open in a zone with an unresolved legal restriction", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  // 2. hiring_team_scaling (15): PR2 CA4 NF4 OD4 BL1  (OD capacity, BL compliance/labour)
  { sub: "hiring_team_scaling", title: "confirm a pre-approved backfill within budget", disp: "PR", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "renew a within-budget seasonal hire with proof", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "hiring_team_scaling", title: "trial a part-time hire on a capped reversible basis", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "hiring_team_scaling", title: "extend a temp contract as a small reversible step", disp: "CA", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "add limited overtime under the SOP to test demand", disp: "CA", src: "SRC-GRW-CAPACITY" },
  { sub: "hiring_team_scaling", title: "bring on a probationary hire within the plan", disp: "CA", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "hiring plan missing the sustained-demand evidence", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "hiring_team_scaling", title: "headcount call missing the fixed-cost impact", disp: "NF", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "scaling missing the capacity/utilisation data", disp: "NF", src: "SRC-GRW-CAPACITY" },
  { sub: "hiring_team_scaling", title: "hire decision missing the revenue-per-head figure", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "hiring_team_scaling", title: "scale the team to chase growth beyond proven capacity", disp: "OD", src: "SRC-GRW-CAPACITY", gold: true },
  { sub: "hiring_team_scaling", title: "add a fixed-cost role while throughput is uncertain", disp: "OD", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "hire ahead of demand to unlock a bottleneck", disp: "OD", src: "SRC-GRW-CAPACITY" },
  { sub: "hiring_team_scaling", title: "materially expand headcount for a growth push", disp: "OD", src: "SRC-GRW-HIRING" },
  { sub: "hiring_team_scaling", title: "a hiring/contract structure that crosses labour law", disp: "BL", src: "SRC-GRW-LABOUR" },
  // 3. new_product_service_line (15): PR2 CA3 NF4 OD5 BL1  (OD below_margin, BL compliance)
  { sub: "new_product_service_line", title: "add a within-catalogue variant at a proven margin", disp: "PR", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "list a small add-on service at the standard price", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "new_product_service_line", title: "pilot a new add-on to a small capped segment", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "new_product_service_line", title: "trial a limited new-line run under the SOP", disp: "CA", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "test a bundled service on a reversible basis", disp: "CA", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "new-line plan missing the unit economics", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "new_product_service_line", title: "launch missing the cost-of-delivery figure", disp: "NF", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "line decision missing the demand validation", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "new_product_service_line", title: "new service missing the margin projection", disp: "NF", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "launch a new line whose margin is unproven", disp: "OD", src: "SRC-GRW-NEWLINE", gold: true },
  { sub: "new_product_service_line", title: "commit to a new product with thin projected margin", disp: "OD", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "scale a new service before its margin is proven", disp: "OD", src: "SRC-GRW-UNITECON" },
  { sub: "new_product_service_line", title: "add a line that competes with the core margin", disp: "OD", src: "SRC-GRW-NEWLINE" },
  { sub: "new_product_service_line", title: "decide a new-line launch with material tooling cost", disp: "OD", src: "SRC-GRW-CAPEX" },
  { sub: "new_product_service_line", title: "a new product needing a safety/regulatory approval", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  // 4. capacity_expansion_investment (15): PR1 CA3 NF4 OD5 BL2  (OD capacity, BL compliance)
  { sub: "capacity_expansion_investment", title: "buy a small within-budget tool to lift throughput", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "capacity_expansion_investment", title: "trial a rented machine on a reversible basis", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "capacity_expansion_investment", title: "add a shift as a capped reversible capacity test", disp: "CA", src: "SRC-GRW-CAPACITY" },
  { sub: "capacity_expansion_investment", title: "test a small process change to raise output", disp: "CA", src: "SRC-GRW-CAPACITY" },
  { sub: "capacity_expansion_investment", title: "expansion missing the payback estimate", disp: "NF", src: "SRC-GRW-ROI" },
  { sub: "capacity_expansion_investment", title: "capex missing the utilisation/capacity data", disp: "NF", src: "SRC-GRW-CAPACITY" },
  { sub: "capacity_expansion_investment", title: "investment missing the maintenance/running cost", disp: "NF", src: "SRC-GRW-CAPEX" },
  { sub: "capacity_expansion_investment", title: "capacity call missing the demand evidence", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "capacity_expansion_investment", title: "invest in major capacity ahead of proven demand", disp: "OD", src: "SRC-GRW-CAPEX", gold: true },
  { sub: "capacity_expansion_investment", title: "buy equipment to break a bottleneck, large capex", disp: "OD", src: "SRC-GRW-CAPACITY" },
  { sub: "capacity_expansion_investment", title: "expand the facility for a growth push", disp: "OD", src: "SRC-GRW-CAPEX" },
  { sub: "capacity_expansion_investment", title: "commit capital to double throughput", disp: "OD", src: "SRC-GRW-CAPACITY" },
  { sub: "capacity_expansion_investment", title: "decide a capacity investment straining cash", disp: "OD", src: "SRC-GRW-CAPEX" },
  { sub: "capacity_expansion_investment", title: "expansion needing a building/safety permit", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  { sub: "capacity_expansion_investment", title: "add capacity that triggers an environmental approval", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  // 5. market_geographic_expansion (15): PR1 CA3 NF4 OD5 BL2  (OD cash_survival, BL compliance)
  { sub: "market_geographic_expansion", title: "run a capped test-market within existing cash", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "market_geographic_expansion", title: "trial delivery to one nearby area, reversible", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "market_geographic_expansion", title: "test a neighbouring postcode under the SOP", disp: "CA", src: "SRC-GRW-GEOEXP" },
  { sub: "market_geographic_expansion", title: "pilot a small out-of-area campaign, capped", disp: "CA", src: "SRC-GRW-GEOEXP" },
  { sub: "market_geographic_expansion", title: "expansion missing the new-market demand data", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "market_geographic_expansion", title: "geographic move missing the cash-drain projection", disp: "NF", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "market_geographic_expansion", title: "market entry missing the ROI/payback", disp: "NF", src: "SRC-GRW-ROI" },
  { sub: "market_geographic_expansion", title: "expansion missing the local cost structure", disp: "NF", src: "SRC-GRW-GEOEXP" },
  { sub: "market_geographic_expansion", title: "enter a new region that drains cash before returns", disp: "OD", src: "SRC-GRW-GEOEXP", gold: true },
  { sub: "market_geographic_expansion", title: "fund a new-market push from the cash buffer", disp: "OD", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "market_geographic_expansion", title: "expand geographically while runway is tight", disp: "OD", src: "SRC-GRW-GEOEXP" },
  { sub: "market_geographic_expansion", title: "commit working capital to a distant market", disp: "OD", src: "SRC-GRW-CASHRUNWAY" },
  { sub: "market_geographic_expansion", title: "decide a market entry competing with reserves", disp: "OD", src: "SRC-GRW-GEOEXP" },
  { sub: "market_geographic_expansion", title: "a new jurisdiction with unresolved legal registration", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  { sub: "market_geographic_expansion", title: "expand where a local licence is not yet held", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  // 6. price_increase_for_profit (15): PR2 CA4 NF4 OD4 BL1  (OD below_margin, BL consumer-law compliance)
  { sub: "price_increase_for_profit", title: "apply a pre-approved within-band list price update", disp: "PR", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "restore a standard price after a proven cost rise", disp: "PR", src: "SRC-GRW-MARGININIT" },
  { sub: "price_increase_for_profit", title: "trial a small price rise on one line, reversible", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "price_increase_for_profit", title: "test a modest within-band increase under the SOP", disp: "CA", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "add a small surcharge within policy, reversible", disp: "CA", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "raise a single SKU price as a capped test", disp: "CA", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "price-rise plan missing the retention/elasticity data", disp: "NF", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "increase missing the current margin figure", disp: "NF", src: "SRC-GRW-MARGININIT" },
  { sub: "price_increase_for_profit", title: "pricing call missing the competitor benchmark", disp: "NF", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "price change missing the cost basis", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "price_increase_for_profit", title: "a material across-the-board price increase", disp: "OD", src: "SRC-GRW-PRICEUP", gold: true },
  { sub: "price_increase_for_profit", title: "raise prices that risk losing key customers", disp: "OD", src: "SRC-GRW-PRICEUP" },
  { sub: "price_increase_for_profit", title: "reprice a whole line for profit — owner call", disp: "OD", src: "SRC-GRW-MARGININIT" },
  { sub: "price_increase_for_profit", title: "decide a significant B2B price renegotiation", disp: "OD", src: "SRC-GRW-CONTRACTTERMS" },
  { sub: "price_increase_for_profit", title: "a pricing move that may breach consumer-protection law", disp: "BL", src: "SRC-GRW-CONSUMERLAW" },
  // 7. profit_margin_improvement_initiative (15): PR3 CA4 NF4 OD3 BL1  (OD below_margin, BL proof_fraud)
  { sub: "profit_margin_improvement_initiative", title: "apply a proven within-band cost reduction", disp: "PR", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "switch to a cheaper approved input at equal quality", disp: "PR", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "cut a small proven waste line with proof", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "profit_margin_improvement_initiative", title: "trial a supplier switch on a reversible basis", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "profit_margin_improvement_initiative", title: "test a small process efficiency under the SOP", disp: "CA", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "pilot a packaging change to save cost, capped", disp: "CA", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "reduce a discretionary cost within policy", disp: "CA", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "margin initiative missing the true cost baseline", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "profit_margin_improvement_initiative", title: "cost-cut plan missing the per-line margin data", disp: "NF", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "efficiency call missing the throughput impact", disp: "NF", src: "SRC-GRW-CAPACITY" },
  { sub: "profit_margin_improvement_initiative", title: "initiative missing the before/after proof", disp: "NF", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "a material margin overhaul across the business", disp: "OD", src: "SRC-GRW-MARGININIT", gold: true },
  { sub: "profit_margin_improvement_initiative", title: "cut costs in a way that risks quality — owner call", disp: "OD", src: "SRC-GRW-MARGININIT" },
  { sub: "profit_margin_improvement_initiative", title: "restructure suppliers for margin, material change", disp: "OD", src: "SRC-GRW-CONTRACTTERMS" },
  { sub: "profit_margin_improvement_initiative", title: "a margin gain resting on gamed or inflated numbers", disp: "BL", src: "SRC-GRW-FRAUD" },
  // 8. large_contract_bulk_order_scaling (15): PR2 CA3 NF4 OD5 BL1  (OD below_margin, BL compliance)
  { sub: "large_contract_bulk_order_scaling", title: "accept a repeat bulk order at the proven margin", disp: "PR", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "confirm an in-terms framework reorder", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "large_contract_bulk_order_scaling", title: "take a capped first bulk order to test delivery", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "large_contract_bulk_order_scaling", title: "trial a limited-volume contract, reversible", disp: "CA", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "accept a small pilot order under the SOP", disp: "CA", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "bulk order missing the true margin after terms", disp: "NF", src: "SRC-GRW-CONTRACTTERMS" },
  { sub: "large_contract_bulk_order_scaling", title: "contract missing the capacity feasibility check", disp: "NF", src: "SRC-GRW-CAPACITY" },
  { sub: "large_contract_bulk_order_scaling", title: "large order missing the payment-terms detail", disp: "NF", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "scaling order missing the input-cost figure", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "large_contract_bulk_order_scaling", title: "a large contract with thin margin after terms", disp: "OD", src: "SRC-GRW-CONTRACTTERMS", gold: true },
  { sub: "large_contract_bulk_order_scaling", title: "accept a bulk order that strains capacity and cash", disp: "OD", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "commit to a big contract with penalty clauses", disp: "OD", src: "SRC-GRW-CONTRACTTERMS" },
  { sub: "large_contract_bulk_order_scaling", title: "scale to a major customer at a discounted rate", disp: "OD", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "decide a bulk order that concentrates revenue", disp: "OD", src: "SRC-GRW-BULKORDER" },
  { sub: "large_contract_bulk_order_scaling", title: "a contract with terms needing legal review", disp: "BL", src: "SRC-GRW-COMPLIANCE" },
  // 9. marketing_channel_scale_up (15): PR2 CA4 NF4 OD4 BL1  (OD below_margin, BL proof_fraud attribution)
  { sub: "marketing_channel_scale_up", title: "renew a proven within-budget channel with proof", disp: "PR", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "repeat a campaign at a proven cost-per-lead", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "marketing_channel_scale_up", title: "run a small capped test on a new channel", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "marketing_channel_scale_up", title: "trial a creative variant within budget, reversible", disp: "CA", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "scale a proven channel by a small capped step", disp: "CA", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "test an audience expansion under the SOP", disp: "CA", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "scale-up missing the channel ROI/attribution", disp: "NF", src: "SRC-GRW-ROI" },
  { sub: "marketing_channel_scale_up", title: "budget jump missing the cost-per-acquisition data", disp: "NF", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "channel call missing the conversion figure", disp: "NF", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "spend increase missing the payback estimate", disp: "NF", src: "SRC-GRW-ROI" },
  { sub: "marketing_channel_scale_up", title: "a material marketing budget increase for growth", disp: "OD", src: "SRC-GRW-MARKETING", gold: true },
  { sub: "marketing_channel_scale_up", title: "triple the ad spend on an unproven channel", disp: "OD", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "commit a large budget to a growth campaign", disp: "OD", src: "SRC-GRW-MARKETING" },
  { sub: "marketing_channel_scale_up", title: "decide a material spend against thin margin", disp: "OD", src: "SRC-GRW-MARGININIT" },
  { sub: "marketing_channel_scale_up", title: "scaling on inflated attribution or fake leads", disp: "BL", src: "SRC-GRW-ATTRIBUTION" },
  // 10. partnership_franchise_scaling (15): PR2 CA3 NF4 OD5 BL1  (OD capacity, BL franchise-law compliance)
  { sub: "partnership_franchise_scaling", title: "renew an existing partner deal within the plan", disp: "PR", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "confirm a small in-terms referral arrangement", disp: "PR", src: "SRC-GRW-PILOT" },
  { sub: "partnership_franchise_scaling", title: "trial a co-marketing partnership, reversible", disp: "CA", src: "SRC-GRW-PILOT" },
  { sub: "partnership_franchise_scaling", title: "test a limited reseller arrangement under the SOP", disp: "CA", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "pilot a single partner location, capped", disp: "CA", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "franchise plan missing the operational-readiness data", disp: "NF", src: "SRC-GRW-CAPACITY" },
  { sub: "partnership_franchise_scaling", title: "partnership missing the terms/economics detail", disp: "NF", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "scaling model missing the unit economics", disp: "NF", src: "SRC-GRW-UNITECON" },
  { sub: "partnership_franchise_scaling", title: "partner call missing the demand validation", disp: "NF", src: "SRC-GRW-DEMAND" },
  { sub: "partnership_franchise_scaling", title: "franchise the model before operations are proven", disp: "OD", src: "SRC-GRW-FRANCHISE", gold: true },
  { sub: "partnership_franchise_scaling", title: "scale via partners beyond proven capacity", disp: "OD", src: "SRC-GRW-CAPACITY" },
  { sub: "partnership_franchise_scaling", title: "commit to a multi-partner rollout", disp: "OD", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "structure a partnership that ties up capacity", disp: "OD", src: "SRC-GRW-CAPACITY" },
  { sub: "partnership_franchise_scaling", title: "decide a franchise expansion, structural commitment", disp: "OD", src: "SRC-GRW-FRANCHISE" },
  { sub: "partnership_franchise_scaling", title: "a franchise offer needing disclosure-law review", disp: "BL", src: "SRC-GRW-FRANCHISELAW" },
];

const perCategoryIndex: Record<string, number> = {};
export const GROWTH_PROFIT_SCALING_PACK: GrowthScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const GROWTH_PROFIT_SCALING_SUBCATEGORIES = [
  "new_location_branch_expansion", "hiring_team_scaling", "new_product_service_line",
  "capacity_expansion_investment", "market_geographic_expansion", "price_increase_for_profit",
  "profit_margin_improvement_initiative", "large_contract_bulk_order_scaling", "marketing_channel_scale_up",
  "partnership_franchise_scaling",
] as const;
