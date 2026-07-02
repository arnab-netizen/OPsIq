/**
 * CUSTOMER / VENDOR / MARKET PACK — 100 counted, source-backed scenarios proving OpsIQ handles customer, vendor,
 * and market decisions safely: routine in-policy customer/vendor handling proceeds (with proof); a decision missing
 * the customer/vendor/market figures blocks on data (need_more_data); material relationship/contract/pricing calls
 * are owner-gated; and moves that cross a consumer-law / contract-law / anti-competitive boundary — or rest on a
 * fraudulent refund/chargeback claim or a falsified vendor credential — are blocked. Does NOT prove live outcome/
 * retention improvement (no live data).
 *
 * Each of the 100 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
 * `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure expander over the
 * merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { CUSTOMER_VENDOR_MARKET_SOURCE_BY_ID } from "./customer-vendor-market-sources";

export interface CustomerVendorScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

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
  // Routine in-policy customer/vendor action, owner/SOP-approved, verified proof → proceed.
  PR: { status: "proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Small reversible in-policy step under an SOP grant with a stop-loss, verified proof → cautious_proceed.
  CA: { status: "cautious_proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Decision missing its customer/vendor/market figures → ask for it (never act on missing data).
  NF: { status: "need_more_data", boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Material relationship/contract/pricing call → owner decides (prepared options, not auto-committed).
  OD: { status: "owner_decision_required", boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
  // Consumer/contract/anti-competitive boundary or fraudulent claim / falsified credential → blocked.
  BL: { status: "blocked", boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
};

/** Per-subcategory binding constraint for OD (owner_decision) — all are DB-proven by the Daily Operations /
 *  Finance / Weekly / Growth packs via the same seed path; NO customer_quality dependency. */
const OD_DOMINANT: Record<string, Constraint> = {
  customer_complaint_resolution: "owner_workload", customer_refund_dispute: "below_margin",
  key_customer_relationship_risk: "owner_workload", customer_churn_winback: "below_margin",
  vendor_reliability_quality_issue: "capacity_feasibility", vendor_price_increase_negotiation: "below_margin",
  vendor_dependency_single_source_risk: "capacity_feasibility", new_vendor_onboarding_vetting: "below_margin",
  competitor_pricing_pressure: "below_margin", market_demand_shift_signal: "below_margin",
};
/** Per-subcategory binding constraint for BL (blocked): proof-fraud for fraudulent refund/chargeback + falsified
 *  vendor credentials; compliance elsewhere (consumer-law / contract-law / anti-competitive boundary). */
const BL_DOMINANT: Record<string, Constraint> = {
  customer_complaint_resolution: "compliance_block", customer_refund_dispute: "proof_fraud_block",
  key_customer_relationship_risk: "compliance_block", customer_churn_winback: "compliance_block",
  vendor_reliability_quality_issue: "proof_fraud_block", vendor_price_increase_negotiation: "compliance_block",
  vendor_dependency_single_source_risk: "compliance_block", new_vendor_onboarding_vetting: "compliance_block",
  competitor_pricing_pressure: "compliance_block", market_demand_shift_signal: "compliance_block",
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "relationshipImpact", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "relationshipImpact"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Customer/Vendor"], proof_fraud_block: ["Proof/anti-gaming", "Customer/Vendor"],
  cash_survival: ["Finance", "Customer/Vendor"], below_margin: ["Revenue/margin", "Customer/Vendor"],
  capacity_feasibility: ["Vendor/supply chain", "Operations"], customer_quality: ["Customer experience", "Operations"],
  owner_workload: ["Owner workload", "Customer/Vendor"], profitable_growth: ["Customer/Vendor", "Market"],
  efficiency_scaling: ["Customer/Vendor"], optimization: ["Process improvement"],
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

function expand(v: Vignette, index: number): CustomerVendorScenario {
  const d = DISP[v.disp];
  const seed = seedFor(v.disp, v.sub);
  const dominant = seed.dominant;
  const professionalReviewRequired = v.disp === "BL" && dominant === "compliance_block";
  const proofRisk = v.disp === "BL" && dominant === "proof_fraud_block" ? "staged" : d.proofRisk;
  const doNow = d.status === "proceed" ? `Handle "${v.title}" as a routine in-policy action and record the proof.`
    : d.status === "cautious_proceed" ? `Take the small reversible step on "${v.title}" under the SOP grant, with the figures on file.`
    : d.status === "need_more_data" ? `Get the missing customer/vendor/market figure for "${v.title}" before deciding.`
    : d.status === "owner_decision_required" ? `Prepare the relationship/contract/margin impact of "${v.title}" for the owner to decide — do not auto-commit.`
    : `Do not act on "${v.title}"; hold for professional review (consumer/contract/competition law) or independent verification (fraudulent claim / falsified credential).`;
  const doNotDo = d.status === "blocked" ? [`Do not act on "${v.title}" before the legal boundary / claim is cleared.`]
    : d.status === "owner_decision_required" ? [`Do not auto-commit on "${v.title}"; the material relationship/contract call is the owner's.`]
    : d.status === "need_more_data" ? [`Do not decide "${v.title}" without the customer/vendor/market figures.`]
    : [`Do not over-escalate the routine in-policy item "${v.title}".`];
  const proofRequired = d.status === "blocked" ? ["professional clearance of the legal boundary / independent verification of the claim or credential"]
    : d.status === "owner_decision_required" ? ["the relationship/contract/margin figures the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing customer/vendor/market figure"]
    : ["the verified figures for this routine in-policy action"];
  const scenario = {
    scenarioId: `CVM-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "CUSTOMER_VENDOR_MARKET",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [CUSTOMER_VENDOR_MARKET_SOURCE_BY_ID[v.src]?.title ?? "composite customer/vendor/market source", "composite/sector pattern — not a specific live case; not final legal advice"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[dominant],
    expectedDominantConstraint: dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide the customer/vendor/market matter: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare the customer/vendor/market figures with proof (the material call stays the owner's).",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess once the missing figure / owner decision / professional review is in, or at the next account/vendor review"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: professionalReviewRequired ? "professional_review_required" : d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: v.disp === "BL" && dominant === "proof_fraud_block" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: dominant === "cash_survival" ? ["cash"] : dominant === "owner_workload" ? ["workload"] : dominant === "below_margin" ? ["profit"] : ["profit", "workload"],
    expectedOutcomeMetric: "the customer/vendor/market metric behind this decision (complaint/refund cost, retention, vendor reliability/cost, or share) — expected only, not proven actual",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: d.status === "blocked" || d.status === "owner_decision_required"
      ? `Auto-acting on "${v.title}" would cross a legal boundary, pay a fraudulent claim, or pre-empt the owner's relationship/contract call.`
      : `Over-escalating or mishandling the routine item "${v.title}" would waste effort or harm the relationship.`,
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

// ── 100 distinct authored vignettes: 10 subcategories × 10. Column totals: PR 15, CA 28, NF 27, OD 22, BL 8.
//    proceed/cautious only on routine in-policy SOP-granted verified actions; missing customer/vendor/market figures
//    → need_more_data; material relationship/contract/pricing calls → owner_decision; consumer/contract/
//    anti-competitive boundary or fraudulent refund / falsified vendor credential → blocked. ──
const VIGNETTES: Vignette[] = [
  // 1. customer_complaint_resolution (10): PR2 CA3 NF2 OD2 BL1  (OD owner_workload, BL compliance)
  { sub: "customer_complaint_resolution", title: "close a resolved in-policy complaint with proof", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "customer_complaint_resolution", title: "acknowledge and log a routine complaint per SOP", disp: "PR", src: "SRC-CVM-COMPLAINT" },
  { sub: "customer_complaint_resolution", title: "offer a small within-policy goodwill gesture", disp: "CA", src: "SRC-CVM-COMPLAINT" },
  { sub: "customer_complaint_resolution", title: "apply a routine service-recovery step under SOP", disp: "CA", src: "SRC-CVM-FEEDBACK" },
  { sub: "customer_complaint_resolution", title: "escalate a repeat complaint to a supervised fix", disp: "CA", src: "SRC-CVM-ROUTINE" },
  { sub: "customer_complaint_resolution", title: "complaint decision missing the order/service record", disp: "NF", src: "SRC-CVM-COMPLAINT" },
  { sub: "customer_complaint_resolution", title: "resolution pending the customer's account history", disp: "NF", src: "SRC-CVM-FEEDBACK" },
  { sub: "customer_complaint_resolution", title: "a systemic complaint theme needs an owner response", disp: "OD", src: "SRC-CVM-COMPLAINT", gold: true },
  { sub: "customer_complaint_resolution", title: "an escalating VIP complaint needs the owner", disp: "OD", src: "SRC-CVM-KEYCUST" },
  { sub: "customer_complaint_resolution", title: "a complaint alleging a safety/regulatory breach", disp: "BL", src: "SRC-CVM-CONSUMERLAW" },
  // 2. customer_refund_dispute (10): PR1 CA3 NF3 OD2 BL1  (OD below_margin, BL proof_fraud)
  { sub: "customer_refund_dispute", title: "process a standard in-policy refund with proof", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "customer_refund_dispute", title: "issue a small within-policy partial refund", disp: "CA", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "apply a routine goodwill credit under SOP", disp: "CA", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "offer a within-policy replacement instead of a refund", disp: "CA", src: "SRC-CVM-ROUTINE" },
  { sub: "customer_refund_dispute", title: "refund decision missing the proof of purchase", disp: "NF", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "dispute pending the delivery/condition evidence", disp: "NF", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "refund call with conflicting transaction records", disp: "NF", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "a large refund that dents this period's margin", disp: "OD", src: "SRC-CVM-REFUND", gold: true },
  { sub: "customer_refund_dispute", title: "a contested high-value refund needs an owner call", disp: "OD", src: "SRC-CVM-REFUND" },
  { sub: "customer_refund_dispute", title: "a refund/chargeback claim that looks fraudulent", disp: "BL", src: "SRC-CVM-REFUNDFRAUD" },
  // 3. key_customer_relationship_risk (10): PR1 CA3 NF3 OD2 BL1  (OD owner_workload, BL compliance)
  { sub: "key_customer_relationship_risk", title: "log a routine check-in with a key account", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "key_customer_relationship_risk", title: "schedule a supervised account review under SOP", disp: "CA", src: "SRC-CVM-KEYCUST" },
  { sub: "key_customer_relationship_risk", title: "send a within-policy retention touch to a key client", disp: "CA", src: "SRC-CVM-RETENTION" },
  { sub: "key_customer_relationship_risk", title: "apply a routine account-care step", disp: "CA", src: "SRC-CVM-ROUTINE" },
  { sub: "key_customer_relationship_risk", title: "relationship-risk call missing the account revenue share", disp: "NF", src: "SRC-CVM-CONCENTRATION" },
  { sub: "key_customer_relationship_risk", title: "retention decision missing the churn-signal data", disp: "NF", src: "SRC-CVM-KEYCUST" },
  { sub: "key_customer_relationship_risk", title: "key-account call missing the contract terms", disp: "NF", src: "SRC-CVM-KEYCUST" },
  { sub: "key_customer_relationship_risk", title: "a key account signalling it may leave needs the owner", disp: "OD", src: "SRC-CVM-KEYCUST", gold: true },
  { sub: "key_customer_relationship_risk", title: "a concentrated key-account dependency needs an owner call", disp: "OD", src: "SRC-CVM-CONCENTRATION" },
  { sub: "key_customer_relationship_risk", title: "a retention deal touching a contract/legal boundary", disp: "BL", src: "SRC-CVM-CONTRACTLAW" },
  // 4. customer_churn_winback (10): PR2 CA3 NF3 OD2 BL0  (OD below_margin)
  { sub: "customer_churn_winback", title: "send a routine in-policy win-back message", disp: "PR", src: "SRC-CVM-CHURN" },
  { sub: "customer_churn_winback", title: "log a standard re-engagement per SOP", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "customer_churn_winback", title: "offer a small within-policy win-back discount", disp: "CA", src: "SRC-CVM-CHURN" },
  { sub: "customer_churn_winback", title: "trial a routine loyalty nudge under SOP", disp: "CA", src: "SRC-CVM-RETENTION" },
  { sub: "customer_churn_winback", title: "apply a within-band re-engagement offer", disp: "CA", src: "SRC-CVM-CHURN" },
  { sub: "customer_churn_winback", title: "win-back plan missing the churn-cohort data", disp: "NF", src: "SRC-CVM-CHURN" },
  { sub: "customer_churn_winback", title: "retention offer missing the customer value figure", disp: "NF", src: "SRC-CVM-CHURN" },
  { sub: "customer_churn_winback", title: "churn call missing the reason-for-leaving data", disp: "NF", src: "SRC-CVM-FEEDBACK" },
  { sub: "customer_churn_winback", title: "a costly win-back offer that erodes margin", disp: "OD", src: "SRC-CVM-CHURN", gold: true },
  { sub: "customer_churn_winback", title: "a broad discounted win-back campaign needs an owner call", disp: "OD", src: "SRC-CVM-RETENTION" },
  // 5. vendor_reliability_quality_issue (10): PR1 CA3 NF2 OD2 BL2  (OD capacity, BL proof_fraud)
  { sub: "vendor_reliability_quality_issue", title: "log a routine vendor quality check with proof", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "vendor_reliability_quality_issue", title: "raise a routine SLA reminder with the vendor", disp: "CA", src: "SRC-CVM-SLA" },
  { sub: "vendor_reliability_quality_issue", title: "apply a within-policy incoming-quality recheck", disp: "CA", src: "SRC-CVM-VENDORQUALITY" },
  { sub: "vendor_reliability_quality_issue", title: "switch a small order to a backup vendor under SOP", disp: "CA", src: "SRC-CVM-VENDORQUALITY" },
  { sub: "vendor_reliability_quality_issue", title: "vendor quality call missing the defect-rate data", disp: "NF", src: "SRC-CVM-VENDORQUALITY" },
  { sub: "vendor_reliability_quality_issue", title: "reliability decision missing the SLA/delivery record", disp: "NF", src: "SRC-CVM-SLA" },
  { sub: "vendor_reliability_quality_issue", title: "a vendor quality slip now threatens delivery capacity", disp: "OD", src: "SRC-CVM-VENDORQUALITY", gold: true },
  { sub: "vendor_reliability_quality_issue", title: "a repeated vendor failure needs an owner sourcing call", disp: "OD", src: "SRC-CVM-SUPPLYRISK" },
  { sub: "vendor_reliability_quality_issue", title: "a vendor quality certificate that appears falsified", disp: "BL", src: "SRC-CVM-VENDORFRAUD" },
  { sub: "vendor_reliability_quality_issue", title: "vendor test results that look fabricated", disp: "BL", src: "SRC-CVM-VENDORFRAUD" },
  // 6. vendor_price_increase_negotiation (10): PR2 CA3 NF3 OD2 BL0  (OD below_margin)
  { sub: "vendor_price_increase_negotiation", title: "accept a within-budget contractual price adjustment", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "vendor_price_increase_negotiation", title: "log a routine agreed price update with proof", disp: "PR", src: "SRC-CVM-VENDORPRICE" },
  { sub: "vendor_price_increase_negotiation", title: "negotiate a small price step within policy", disp: "CA", src: "SRC-CVM-VENDORPRICE" },
  { sub: "vendor_price_increase_negotiation", title: "apply a within-band cost pass-through under SOP", disp: "CA", src: "SRC-CVM-VENDORPRICE" },
  { sub: "vendor_price_increase_negotiation", title: "trial a reversible switch to a cheaper approved input", disp: "CA", src: "SRC-CVM-ROUTINE" },
  { sub: "vendor_price_increase_negotiation", title: "price-rise response missing the margin impact", disp: "NF", src: "SRC-CVM-VENDORPRICE" },
  { sub: "vendor_price_increase_negotiation", title: "negotiation missing the alternative-vendor quotes", disp: "NF", src: "SRC-CVM-VENDORPRICE" },
  { sub: "vendor_price_increase_negotiation", title: "cost call missing the volume/commitment terms", disp: "NF", src: "SRC-CVM-SLA" },
  { sub: "vendor_price_increase_negotiation", title: "a material vendor price increase across a key input", disp: "OD", src: "SRC-CVM-VENDORPRICE", gold: true },
  { sub: "vendor_price_increase_negotiation", title: "a multi-year contract renegotiation needs an owner call", disp: "OD", src: "SRC-CVM-CONTRACTLAW" },
  // 7. vendor_dependency_single_source_risk (10): PR1 CA3 NF3 OD2 BL1  (OD capacity, BL compliance)
  { sub: "vendor_dependency_single_source_risk", title: "log a routine backup-vendor check per SOP", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "vendor_dependency_single_source_risk", title: "qualify a small trial order with a second vendor", disp: "CA", src: "SRC-CVM-SINGLESOURCE" },
  { sub: "vendor_dependency_single_source_risk", title: "keep a within-policy safety-stock buffer", disp: "CA", src: "SRC-CVM-SUPPLYRISK" },
  { sub: "vendor_dependency_single_source_risk", title: "run a reversible dual-sourcing pilot under SOP", disp: "CA", src: "SRC-CVM-SINGLESOURCE" },
  { sub: "vendor_dependency_single_source_risk", title: "dependency call missing the single-source exposure figure", disp: "NF", src: "SRC-CVM-SINGLESOURCE" },
  { sub: "vendor_dependency_single_source_risk", title: "diversification pending the alternative-supplier options", disp: "NF", src: "SRC-CVM-SINGLESOURCE" },
  { sub: "vendor_dependency_single_source_risk", title: "supply-risk call missing the lead-time data", disp: "NF", src: "SRC-CVM-SUPPLYRISK" },
  { sub: "vendor_dependency_single_source_risk", title: "heavy dependence on one vendor threatens supply continuity", disp: "OD", src: "SRC-CVM-SINGLESOURCE", gold: true },
  { sub: "vendor_dependency_single_source_risk", title: "a sole-supplier switch that risks capacity needs an owner call", disp: "OD", src: "SRC-CVM-SUPPLYRISK" },
  { sub: "vendor_dependency_single_source_risk", title: "a supply arrangement crossing a contract/legal boundary", disp: "BL", src: "SRC-CVM-CONTRACTLAW" },
  // 8. new_vendor_onboarding_vetting (10): PR2 CA3 NF2 OD2 BL1  (OD below_margin, BL compliance)
  { sub: "new_vendor_onboarding_vetting", title: "onboard a pre-vetted vendor within policy", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "new_vendor_onboarding_vetting", title: "log a routine approved-vendor addition with proof", disp: "PR", src: "SRC-CVM-ONBOARD" },
  { sub: "new_vendor_onboarding_vetting", title: "trial a small first order with a vetted new vendor", disp: "CA", src: "SRC-CVM-ONBOARD" },
  { sub: "new_vendor_onboarding_vetting", title: "run a reversible onboarding pilot under SOP", disp: "CA", src: "SRC-CVM-VETTING" },
  { sub: "new_vendor_onboarding_vetting", title: "add a low-risk vendor within the approval policy", disp: "CA", src: "SRC-CVM-ONBOARD" },
  { sub: "new_vendor_onboarding_vetting", title: "onboarding missing the vendor's compliance documents", disp: "NF", src: "SRC-CVM-VETTING" },
  { sub: "new_vendor_onboarding_vetting", title: "vetting pending the references/credit check", disp: "NF", src: "SRC-CVM-ONBOARD" },
  { sub: "new_vendor_onboarding_vetting", title: "a new vendor offering lower cost but unproven quality", disp: "OD", src: "SRC-CVM-ONBOARD", gold: true },
  { sub: "new_vendor_onboarding_vetting", title: "a material new-vendor commitment needs an owner call", disp: "OD", src: "SRC-CVM-VENDORPRICE" },
  { sub: "new_vendor_onboarding_vetting", title: "a vendor with unclear licences/compliance status", disp: "BL", src: "SRC-CVM-VETTING" },
  // 9. competitor_pricing_pressure (10): PR2 CA2 NF3 OD2 BL1  (OD below_margin, BL anti-competitive)
  { sub: "competitor_pricing_pressure", title: "apply a pre-approved within-band price adjustment", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "competitor_pricing_pressure", title: "hold the standard price with a proof-backed value message", disp: "PR", src: "SRC-CVM-COMPETITOR" },
  { sub: "competitor_pricing_pressure", title: "trial a small reversible promo to defend share", disp: "CA", src: "SRC-CVM-COMPETITOR" },
  { sub: "competitor_pricing_pressure", title: "apply a within-margin price tweak under SOP", disp: "CA", src: "SRC-CVM-PRICEMATCH" },
  { sub: "competitor_pricing_pressure", title: "price-match decision missing the true cost/margin", disp: "NF", src: "SRC-CVM-PRICEMATCH" },
  { sub: "competitor_pricing_pressure", title: "competitor response missing the market-share data", disp: "NF", src: "SRC-CVM-COMPETITOR" },
  { sub: "competitor_pricing_pressure", title: "pricing call missing the elasticity/volume figure", disp: "NF", src: "SRC-CVM-PRICEMATCH" },
  { sub: "competitor_pricing_pressure", title: "matching a competitor below the margin floor", disp: "OD", src: "SRC-CVM-PRICEMATCH", gold: true },
  { sub: "competitor_pricing_pressure", title: "a broad price cut to counter a competitor needs an owner call", disp: "OD", src: "SRC-CVM-COMPETITOR" },
  { sub: "competitor_pricing_pressure", title: "a proposal to coordinate prices with a competitor", disp: "BL", src: "SRC-CVM-ANTICOMPETE" },
  // 10. market_demand_shift_signal (10): PR1 CA2 NF3 OD4 BL0  (OD below_margin)
  { sub: "market_demand_shift_signal", title: "log a routine within-band demand observation with proof", disp: "PR", src: "SRC-CVM-ROUTINE" },
  { sub: "market_demand_shift_signal", title: "run a small reversible test against a demand signal", disp: "CA", src: "SRC-CVM-DEMAND" },
  { sub: "market_demand_shift_signal", title: "apply a within-policy assortment tweak under SOP", disp: "CA", src: "SRC-CVM-SEGMENT" },
  { sub: "market_demand_shift_signal", title: "demand-shift response missing the validated trend data", disp: "NF", src: "SRC-CVM-DEMAND" },
  { sub: "market_demand_shift_signal", title: "repositioning pending the segment/size figures", disp: "NF", src: "SRC-CVM-SEGMENT" },
  { sub: "market_demand_shift_signal", title: "market call missing the confirmed demand evidence", disp: "NF", src: "SRC-CVM-DEMAND" },
  { sub: "market_demand_shift_signal", title: "a confirmed demand shift needs a material repositioning call", disp: "OD", src: "SRC-CVM-DEMAND", gold: true },
  { sub: "market_demand_shift_signal", title: "reallocating the mix to a growing segment needs an owner call", disp: "OD", src: "SRC-CVM-SEGMENT" },
  { sub: "market_demand_shift_signal", title: "dropping a declining line is a material owner call", disp: "OD", src: "SRC-CVM-DEMAND" },
  { sub: "market_demand_shift_signal", title: "a demand-driven pricing change needs an owner call", disp: "OD", src: "SRC-CVM-PRICEMATCH" },
];

const perCategoryIndex: Record<string, number> = {};
export const CUSTOMER_VENDOR_MARKET_PACK: CustomerVendorScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const CUSTOMER_VENDOR_MARKET_SUBCATEGORIES = [
  "customer_complaint_resolution", "customer_refund_dispute", "key_customer_relationship_risk",
  "customer_churn_winback", "vendor_reliability_quality_issue", "vendor_price_increase_negotiation",
  "vendor_dependency_single_source_risk", "new_vendor_onboarding_vetting", "competitor_pricing_pressure",
  "market_demand_shift_signal",
] as const;
