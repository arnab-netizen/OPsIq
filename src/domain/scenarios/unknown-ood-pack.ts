/**
 * UNKNOWN / NOVEL / OUT-OF-DISTRIBUTION PACK — 110 counted, source-backed scenarios proving OpsIQ SAFELY
 * handles unknown/novel situations: novelty → confidence↓ → closest-pattern → weak-analogy label → specific
 * data request → block high-risk → proof/reassessment → local adjudicated learning. It does NOT claim to solve
 * unknown-unknowns; the `unknown_unknown_guardrail` cases test GUARDRAIL BEHAVIOUR (refuse fake confidence,
 * ask for data, block), not solution correctness.
 *
 * Each of the 110 is a distinct authored vignette (no filler), inherits a real OOD source, and carries a
 * deterministic `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure
 * expander over the merged `business-reality-scenario` contract. No new engine.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { OOD_SOURCE_BY_ID } from "./unknown-ood-sources";

export interface OodScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

/** Disposition codes → the fields that vary by disposition (kept consistent with the action-status policy). */
type Disp = "ND" | "BC" | "BP" | "OC" | "OM" | "OP" | "OW" | "CA" | "PR";

interface DispSpec {
  status: BusinessRealityScenario["expectedActionStatus"];
  dominant: Constraint;
  seed: ScenarioSeedPlan;
  boundary: BusinessRealityScenario["expectedBoundaryState"];
  novelty: BusinessRealityScenario["expectedNoveltyState"];
  inputQuality: BusinessRealityScenario["expectedInputQualityState"];
  tag: KnownToUnknownTag;
  gbu: "good" | "bad" | "ugly";
  severity: string;
  highRisk: boolean;
  professionalReviewRequired: boolean;
  antiGamingRisk: "none" | "low" | "medium" | "high";
  ownerWorkloadRisk: "low" | "medium" | "high";
}

const DISP: Record<Disp, DispSpec> = {
  // Novelty with missing critical data → ask for data (never high-risk; never proceeds).
  ND: { status: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, boundary: "needs_external_verification", novelty: "novel_low_risk", inputQuality: "critical_missing", tag: "known_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  // Boundary/compliance/professional-review → blocked until review.
  BC: { status: "blocked", dominant: "compliance_block", seed: { dominant: "compliance_block", goodBadUgly: "ugly" }, boundary: "blocked_until_review", novelty: "novel_high_risk", inputQuality: "data_limited", tag: "known_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: true, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  // Novel unverifiable proof/fraud → blocked (guardrail).
  BP: { status: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, boundary: "safe_operational", novelty: "novel_high_risk", inputQuality: "conflicting", tag: "unknown_unknown_guardrail", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
  // Material cash-risk unknown → owner decision.
  OC: { status: "owner_decision_required", dominant: "cash_survival", seed: { dominant: "cash_survival", goodBadUgly: "ugly" }, boundary: "owner_approval_required", novelty: "novel_high_risk", inputQuality: "owner_estimate_only", tag: "pattern_adjacent_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  OM: { status: "owner_decision_required", dominant: "below_margin", seed: { dominant: "below_margin", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "data_limited", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  OP: { status: "owner_decision_required", dominant: "capacity_feasibility", seed: { dominant: "capacity_feasibility", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "data_limited", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  OW: { status: "owner_decision_required", dominant: "owner_workload", seed: { dominant: "owner_workload", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "owner_estimate_only", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "high" },
  // Reversible low/medium-risk novel step with an owner SOP grant → cautious_proceed.
  CA: { status: "cautious_proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" }, boundary: "safe_operational", novelty: "novel_low_risk", inputQuality: "sufficient", tag: "known_unknown", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
  // Routine owner-approved safe step → proceed (rare).
  PR: { status: "proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" }, boundary: "safe_operational", novelty: "known", inputQuality: "sufficient", tag: "known_unknown", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
}; // (unknown_unknown_guardrail also assigned to selected ND rows via the `guardrail` flag below.)

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "novelty"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "missingData", "proofNeeded", "reassessment"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Risk management"], proof_fraud_block: ["Proof/anti-gaming", "Quality control"],
  cash_survival: ["Finance", "Risk management"], below_margin: ["Pricing", "Opportunity evaluation"],
  capacity_feasibility: ["Operations", "Maintenance/downtime"], customer_quality: ["Customer service", "Process control"],
  owner_workload: ["Owner workload", "Operations"], profitable_growth: ["Sales", "Finance", "Novelty/OOD"],
  efficiency_scaling: ["Operations"], optimization: ["Process improvement"],
};

/** One authored vignette: subcategory, a distinct title, disposition, source, and gold/guardrail flags. */
interface Vignette { sub: string; title: string; disp: Disp; src: string; gold?: boolean; guardrail?: boolean }

function expand(v: Vignette, index: number): OodScenario {
  const d = DISP[v.disp];
  const tag: KnownToUnknownTag = v.guardrail ? "unknown_unknown_guardrail" : d.tag;
  const doNow = d.status === "need_more_data" ? `Ask for the specific missing records before deciding on: ${v.title}.`
    : d.status === "blocked" ? `Do not act on "${v.title}" until the boundary/proof review clears it.`
    : d.status === "owner_decision_required" ? `Prepare the options for the owner to decide on: ${v.title}.`
    : `Run the small reversible step for "${v.title}" with proof.`;
  const doNotDo = d.status === "blocked" ? [`Do not proceed on "${v.title}" before professional/independent review.`]
    : d.highRisk ? [`Do not take an irreversible high-risk action on "${v.title}" while it is unproven.`]
    : [`Do not assume the novel case matches a known pattern without checking.`];
  const scenario = {
    scenarioId: `OOD-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "UNKNOWN_OOD",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: tag,
    sourceRefs: [v.src],
    sourceLimitations: [OOD_SOURCE_BY_ID[v.src]?.title ?? "composite OOD source", "novel situation — limited/absent historical baseline"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[d.dominant],
    expectedDominantConstraint: d.dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide on the novel situation: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare/gather data with proof.",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: d.status === "need_more_data" ? ["the specific missing critical records"] : d.status === "blocked" ? ["independent/professional verification"] : ["measured proof before scaling"],
    expectedReassessment: ["reassess once the missing data or review is in"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: d.boundary,
    expectedNoveltyState: d.novelty,
    expectedProfitCashWorkloadImpact: d.dominant === "cash_survival" ? ["cash"] : d.dominant === "below_margin" ? ["profit"] : d.dominant === "owner_workload" ? ["workload"] : ["profit", "cash"],
    expectedOutcomeMetric: "the metric behind the novel decision, once measurable",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: `Acting on "${v.title}" as if it were a known, proven case risks an unrecoverable error.`,
    highRisk: d.highRisk,
    professionalReviewRequired: d.professionalReviewRequired,
    ownerWorkloadRisk: d.ownerWorkloadRisk,
    antiGamingRisk: d.antiGamingRisk,
    liveOutcomeClaimAllowed: false,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  };
  const parsed = businessRealityScenarioSchema.parse(scenario);
  return { ...parsed, seed: d.seed };
}

// ── 110 authored vignettes (10 per subcategory). Distinct, concrete, source-backed. ──
const VIGNETTES: Vignette[] = [
  // 1. unfamiliar business model (10)
  { sub: "unfamiliar_business_model", title: "regional spice subscription box with no sales history", disp: "ND", src: "SRC-OOD-NEWMODEL", gold: true },
  { sub: "unfamiliar_business_model", title: "pay-per-use industrial 3D-printing bureau", disp: "ND", src: "SRC-OOD-NEWMODEL" },
  { sub: "unfamiliar_business_model", title: "community tool-library membership model", disp: "ND", src: "SRC-OOD-PARTNERSHIP" },
  { sub: "unfamiliar_business_model", title: "hybrid cafe + coworking revenue-share", disp: "ND", src: "SRC-OOD-PARTNERSHIP" },
  { sub: "unfamiliar_business_model", title: "outcome-based pricing for a repair service", disp: "ND", src: "SRC-OOD-PRICINGNOVEL" },
  { sub: "unfamiliar_business_model", title: "mobile-only pop-up rotating between markets", disp: "ND", src: "SRC-OOD-NEWMODEL" },
  { sub: "unfamiliar_business_model", title: "consignment-only inventory with no owned stock", disp: "OM", src: "SRC-OOD-PRICINGNOVEL" },
  { sub: "unfamiliar_business_model", title: "franchise-of-one licensing a solo brand", disp: "OC", src: "SRC-OOD-PARTNERSHIP" },
  { sub: "unfamiliar_business_model", title: "add a small proven upsell within the standing instruction", disp: "CA", src: "SRC-OOD-NEWMODEL" },
  { sub: "unfamiliar_business_model", title: "reorder the proven core consumables within budget", disp: "PR", src: "SRC-OOD-NEWMODEL" },

  // 2. new service category (10)
  { sub: "new_service_category", title: "laundry adds unproven leather-cleaning line", disp: "ND", src: "SRC-OOD-NEWSERVICE", gold: true },
  { sub: "new_service_category", title: "salon adds an unfamiliar medical-adjacent treatment", disp: "BC", src: "SRC-OOD-HEALTHSAFETY" },
  { sub: "new_service_category", title: "cafe adds catering with no cost model", disp: "ND", src: "SRC-OOD-NEWSERVICE" },
  { sub: "new_service_category", title: "repair shop adds EV-battery servicing", disp: "ND", src: "SRC-OOD-NEWSERVICE" },
  { sub: "new_service_category", title: "grocery adds a delivery subscription tier", disp: "ND", src: "SRC-OOD-CHANNELSHIFT" },
  { sub: "new_service_category", title: "agency adds a retainer product it has never sold", disp: "ND", src: "SRC-OOD-NEWSERVICE" },
  { sub: "new_service_category", title: "pharmacy adds a wellness-coaching service", disp: "ND", src: "SRC-OOD-NEWSERVICE" },
  { sub: "new_service_category", title: "housekeeping adds unproven deep-sanitisation package", disp: "OP", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_service_category", title: "restaurant adds a ghost-kitchen brand at unknown margin", disp: "OM", src: "SRC-OOD-PRICINGNOVEL" },
  { sub: "new_service_category", title: "pilot the new service to 10 existing customers with proof", disp: "CA", src: "SRC-OOD-NEWSERVICE" },

  // 3. new equipment / process (10)
  { sub: "new_equipment_process", title: "new automated press with unmeasured throughput", disp: "ND", src: "SRC-OOD-NEWEQUIP", gold: true },
  { sub: "new_equipment_process", title: "switch to a novel curing process, cycle time unknown", disp: "ND", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "adopt an unfamiliar POS/workflow system mid-season", disp: "ND", src: "SRC-OOD-STAFFSKILL" },
  { sub: "new_equipment_process", title: "second oven of an untested model", disp: "ND", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "new packing line with unproven defect rate", disp: "ND", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "commit to full-shift run on the unproven machine", disp: "OP", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "accept a big order that assumes the new capacity holds", disp: "OP", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "scale intake to the untested throughput", disp: "OP", src: "SRC-OOD-NEWEQUIP" },
  { sub: "new_equipment_process", title: "finance the new equipment on tight cash", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "new_equipment_process", title: "run the maintenance checklist already approved by the owner", disp: "PR", src: "SRC-OOD-NEWEQUIP" },

  // 4. new jurisdiction / local-rule uncertainty (10)
  { sub: "new_jurisdiction_rule", title: "expansion to a state with unclear licensing", disp: "BC", src: "SRC-OOD-LICENCE", gold: true },
  { sub: "new_jurisdiction_rule", title: "new local food-safety rule of uncertain applicability", disp: "BC", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "cross-border sales with unclear tax registration", disp: "BC", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "new labour rule may change staffing legality", disp: "BC", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "local zoning change may affect the premises", disp: "BC", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "regulated-product sale may need a new permit", disp: "BC", src: "SRC-OOD-LICENCE" },
  { sub: "new_jurisdiction_rule", title: "estimate the market size in the new region", disp: "ND", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "gauge demand before committing to the new area", disp: "ND", src: "SRC-OOD-JURIS" },
  { sub: "new_jurisdiction_rule", title: "commit deposits for the new-region launch on tight cash", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "new_jurisdiction_rule", title: "owner personally handling all new-region approvals", disp: "OW", src: "SRC-OOD-JURIS" },

  // 5. unusual B2B terms (10)
  { sub: "unusual_b2b_terms", title: "contract with an ambiguous penalty clause", disp: "BC", src: "SRC-OOD-CONTRACTCLAUSE", gold: true },
  { sub: "unusual_b2b_terms", title: "revenue-share with an uncapped clawback", disp: "BC", src: "SRC-OOD-CONTRACTCLAUSE" },
  { sub: "unusual_b2b_terms", title: "milestone terms with undefined acceptance criteria", disp: "ND", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "barter/part-payment-in-kind arrangement", disp: "ND", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "volume rebate tied to unverifiable targets", disp: "ND", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "contract priced below apparent loaded cost", disp: "OM", src: "SRC-OOD-PRICINGNOVEL" },
  { sub: "unusual_b2b_terms", title: "long-tenor deal that looks profitable on paper", disp: "OM", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "fixed-price multi-year deal with cost inflation risk", disp: "OM", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "90-day terms that would starve cash", disp: "OC", src: "SRC-OOD-B2BTERMS" },
  { sub: "unusual_b2b_terms", title: "large upfront commitment against uncertain receipts", disp: "OC", src: "SRC-OOD-B2BTERMS" },

  // 6. strange customer behaviour (10)
  { sub: "strange_customer_behavior", title: "sudden cluster of identical unusual orders", disp: "ND", src: "SRC-OOD-CUSTBEHAV", gold: true },
  { sub: "strange_customer_behavior", title: "unexplained spike in returns from one segment", disp: "ND", src: "SRC-OOD-CUSTBEHAV" },
  { sub: "strange_customer_behavior", title: "customers requesting an off-menu novel service", disp: "ND", src: "SRC-OOD-CUSTBEHAV" },
  { sub: "strange_customer_behavior", title: "abnormal chargeback pattern of unknown cause", disp: "ND", src: "SRC-OOD-CYBERNOVEL" },
  { sub: "strange_customer_behavior", title: "viral attention with unclear buying intent", disp: "ND", src: "SRC-OOD-DEMANDSPIKE" },
  { sub: "strange_customer_behavior", title: "repeat customers suddenly churning without complaint", disp: "ND", src: "SRC-OOD-CUSTBEHAV" },
  { sub: "strange_customer_behavior", title: "commit ad spend to chase the unexplained spike", disp: "OC", src: "SRC-OOD-DEMANDSPIKE" },
  { sub: "strange_customer_behavior", title: "send an already-approved recovery message to the segment", disp: "CA", src: "SRC-OOD-CUSTBEHAV" },
  { sub: "strange_customer_behavior", title: "run the approved retention template to churning repeats", disp: "CA", src: "SRC-OOD-CUSTBEHAV" },
  { sub: "strange_customer_behavior", title: "discount deeply to match the anomalous demand", disp: "OM", src: "SRC-OOD-PRICINGNOVEL" },

  // 7. unseen staff / proof manipulation (10)
  { sub: "unseen_staff_proof_manipulation", title: "novel pattern of duplicated completion photos", disp: "BP", src: "SRC-OOD-STAFFGAME", gold: true, guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "timestamps altered in an unfamiliar way", disp: "BP", src: "SRC-OOD-STAFFGAME", guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "proof records that pass checks but feel inconsistent", disp: "BP", src: "SRC-OOD-STAFFGAME", guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "collusion signal across two staff of unknown scope", disp: "BP", src: "SRC-OOD-STAFFGAME", guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "ghost-task completions with novel signature", disp: "BP", src: "SRC-OOD-STAFFGAME", guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "unverifiable overtime claims of a new kind", disp: "BP", src: "SRC-OOD-STAFFGAME", guardrail: true },
  { sub: "unseen_staff_proof_manipulation", title: "estimate the scope of the suspected gaming", disp: "ND", src: "SRC-OOD-STAFFGAME" },
  { sub: "unseen_staff_proof_manipulation", title: "gather independent evidence on the anomaly", disp: "ND", src: "SRC-OOD-STAFFGAME" },
  { sub: "unseen_staff_proof_manipulation", title: "owner personally re-checking every proof record", disp: "OW", src: "SRC-OOD-STAFFGAME" },
  { sub: "unseen_staff_proof_manipulation", title: "owner redesigning the proof process alone", disp: "OW", src: "SRC-OOD-STAFFGAME" },

  // 8. unusual vendor / supply (10)
  { sub: "unusual_vendor_supply", title: "new vendor with an unverifiable quality claim", disp: "BP", src: "SRC-OOD-VENDORFRAUD", gold: true },
  { sub: "unusual_vendor_supply", title: "supplier offering a too-good novel discount", disp: "BP", src: "SRC-OOD-VENDORFRAUD" },
  { sub: "unusual_vendor_supply", title: "unfamiliar supply source of uncertain reliability", disp: "ND", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "vendor changes terms mid-contract in a new way", disp: "ND", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "single-source dependency on a novel input", disp: "ND", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "unexpected substitute material of unknown effect", disp: "ND", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "prepay a large order to an unproven supplier", disp: "OC", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "commit cash to lock the novel discount", disp: "OC", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "switch to the cheaper input despite margin doubt", disp: "OM", src: "SRC-OOD-VENDOR" },
  { sub: "unusual_vendor_supply", title: "accept below-cost bundle from the new vendor", disp: "OM", src: "SRC-OOD-VENDOR" },

  // 9. sudden external shock (10)
  { sub: "sudden_external_shock", title: "sudden input-cost spike of uncertain duration", disp: "OC", src: "SRC-OOD-SHOCK", gold: true },
  { sub: "sudden_external_shock", title: "abrupt demand collapse from an external event", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "sudden_external_shock", title: "key supplier fails without warning", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "sudden_external_shock", title: "payment-processor outage freezes receipts", disp: "OC", src: "SRC-OOD-CYBERNOVEL" },
  { sub: "sudden_external_shock", title: "sudden regulatory freeze on a product line", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "sudden_external_shock", title: "estimate the shock's cash impact before acting", disp: "ND", src: "SRC-OOD-SHOCK" },
  { sub: "sudden_external_shock", title: "assess demand durability after the shock", disp: "ND", src: "SRC-OOD-DEMANDSPIKE" },
  { sub: "sudden_external_shock", title: "gauge how long the disruption will last", disp: "ND", src: "SRC-OOD-SHOCK" },
  { sub: "sudden_external_shock", title: "a safety-relevant incident of unclear cause", disp: "BC", src: "SRC-OOD-HEALTHSAFETY" },
  { sub: "sudden_external_shock", title: "push overtime to absorb the shock beyond safe capacity", disp: "OP", src: "SRC-OOD-NEWEQUIP" },

  // 10. contradictory / incomplete urgent owner question (10)
  { sub: "contradictory_incomplete_urgent", title: "\"should I expand or cut?\" with no numbers", disp: "ND", src: "SRC-OOD-URGENT", gold: true },
  { sub: "contradictory_incomplete_urgent", title: "urgent hire/fire ask with contradictory reasons", disp: "ND", src: "SRC-OOD-URGENT" },
  { sub: "contradictory_incomplete_urgent", title: "\"is this deal good?\" with conflicting figures", disp: "ND", src: "SRC-OOD-DATASPARSE" },
  { sub: "contradictory_incomplete_urgent", title: "\"are we profitable?\" with no cost data", disp: "ND", src: "SRC-OOD-DATASPARSE" },
  { sub: "contradictory_incomplete_urgent", title: "\"should I take the loan?\" with unclear use", disp: "ND", src: "SRC-OOD-DATASPARSE" },
  { sub: "contradictory_incomplete_urgent", title: "\"why is cash down?\" with contradictory notes", disp: "ND", src: "SRC-OOD-URGENT" },
  { sub: "contradictory_incomplete_urgent", title: "\"should I discount?\" with no margin data", disp: "ND", src: "SRC-OOD-DATASPARSE" },
  { sub: "contradictory_incomplete_urgent", title: "\"open a second location?\" with sparse records", disp: "ND", src: "SRC-OOD-DATASPARSE" },
  { sub: "contradictory_incomplete_urgent", title: "\"fire the vendor?\" with conflicting complaints", disp: "ND", src: "SRC-OOD-URGENT" },
  { sub: "contradictory_incomplete_urgent", title: "owner insisting on deciding everything urgently alone", disp: "OW", src: "SRC-OOD-URGENT" },

  // 11. weak analogy / pattern-adjacent unknown (10)
  { sub: "weak_analogy_pattern_adjacent", title: "looks like a cash crisis but the driver is different", disp: "ND", src: "SRC-OOD-WEAKANALOGY", gold: true },
  { sub: "weak_analogy_pattern_adjacent", title: "resembles a capacity issue but data is thin", disp: "ND", src: "SRC-OOD-WEAKANALOGY" },
  { sub: "weak_analogy_pattern_adjacent", title: "similar to a prior complaint spike, but new cause", disp: "ND", src: "SRC-OOD-WEAKANALOGY" },
  { sub: "weak_analogy_pattern_adjacent", title: "mimics a pricing problem yet margin looks fine", disp: "ND", src: "SRC-OOD-WEAKANALOGY" },
  { sub: "weak_analogy_pattern_adjacent", title: "echoes an owner-overload case but owner is remote", disp: "ND", src: "SRC-OOD-WEAKANALOGY" },
  { sub: "weak_analogy_pattern_adjacent", title: "reads like a below-margin deal on partial data", disp: "OM", src: "SRC-OOD-PRICINGNOVEL" },
  { sub: "weak_analogy_pattern_adjacent", title: "reads like an unviable contract but terms are novel", disp: "OM", src: "SRC-OOD-CONTRACTCLAUSE" },
  { sub: "weak_analogy_pattern_adjacent", title: "looks like a capacity bottleneck on weak evidence", disp: "OP", src: "SRC-OOD-NEWEQUIP" },
  { sub: "weak_analogy_pattern_adjacent", title: "resembles a cash-survival case but receipts differ", disp: "OC", src: "SRC-OOD-SHOCK" },
  { sub: "weak_analogy_pattern_adjacent", title: "run the small reversible test the analogy suggests, with proof", disp: "CA", src: "SRC-OOD-WEAKANALOGY" },
];

/** The 110 counted Unknown/OOD scenarios (expanded, schema-valid). */
export const UNKNOWN_OOD_PACK: OodScenario[] = VIGNETTES.map((v, i) => expand(v, i + 1));
