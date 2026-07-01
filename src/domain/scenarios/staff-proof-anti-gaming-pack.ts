/**
 * STAFF / PROOF / ANTI-GAMING PACK — 120 counted, source-backed scenarios proving OpsIQ DETECTS, RESISTS,
 * ESCALATES, and PREVENTS UNSAFE RELIANCE on staff/proof/manipulation risks: proof-quality grading → weak proof
 * lowers confidence → demand fresh/complete proof → contradiction triggers dispute/confirmation → suspected
 * collusion requires independent verification → confirmed fraud blocks → owner-gate the serious calls → proof +
 * reassessment → local adjudicated learning. It does NOT claim staff fraud can be fully prevented.
 *
 * Each of the 120 is a distinct authored vignette (no filler), inherits a real source, and carries a
 * deterministic `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure
 * expander over the merged `business-reality-scenario` contract. No new engine.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { STAFF_PROOF_SOURCE_BY_ID } from "./staff-proof-sources";

export interface StaffProofScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

/** Disposition codes → the fields that vary by disposition (kept consistent with the action-status policy). */
type Disp = "NF" | "NS" | "NT" | "BF" | "BS" | "BX" | "BT" | "OW" | "OM" | "OP" | "OK" | "OX" | "CA" | "PR";

type ProofRisk = BusinessRealityScenario["expectedProofRiskState"];
type ManipRisk = BusinessRealityScenario["expectedManipulationRiskState"];

interface DispSpec {
  status: BusinessRealityScenario["expectedActionStatus"];
  dominant: Constraint;
  seed: ScenarioSeedPlan;
  boundary: BusinessRealityScenario["expectedBoundaryState"];
  novelty: BusinessRealityScenario["expectedNoveltyState"];
  inputQuality: BusinessRealityScenario["expectedInputQualityState"];
  proofRisk: ProofRisk;
  manipRisk: ManipRisk;
  tag: KnownToUnknownTag;
  gbu: "good" | "bad" | "ugly";
  severity: string;
  highRisk: boolean;
  professionalReviewRequired: boolean;
  antiGamingRisk: "none" | "low" | "medium" | "high";
  ownerWorkloadRisk: "low" | "medium" | "high";
}

const DISP: Record<Disp, DispSpec> = {
  // ── need_more_data: proof is weak/stale/late/absent → demand fresh, complete, contemporaneous proof (never verifies) ──
  NF: { status: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, boundary: "needs_external_verification", novelty: "novel_low_risk", inputQuality: "critical_missing", proofRisk: "weak", manipRisk: "suspected", tag: "known_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "medium" },
  NS: { status: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, boundary: "needs_external_verification", novelty: "novel_low_risk", inputQuality: "stale", proofRisk: "stale", manipRisk: "suspected", tag: "known_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "medium" },
  NT: { status: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, boundary: "needs_external_verification", novelty: "novel_low_risk", inputQuality: "data_limited", proofRisk: "unverified", manipRisk: "low", tag: "known_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "low", ownerWorkloadRisk: "medium" },
  // ── blocked: confirmed proof-fraud / staged / fabricated / collusion-with-fraud → do not accept, independent review ──
  BF: { status: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, boundary: "blocked_until_review", novelty: "novel_high_risk", inputQuality: "conflicting", proofRisk: "fabricated", manipRisk: "confirmed_pattern", tag: "pattern_adjacent_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
  BS: { status: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, boundary: "blocked_until_review", novelty: "novel_high_risk", inputQuality: "conflicting", proofRisk: "staged", manipRisk: "confirmed_pattern", tag: "pattern_adjacent_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
  BX: { status: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, boundary: "blocked_until_review", novelty: "novel_high_risk", inputQuality: "conflicting", proofRisk: "unverified", manipRisk: "collusion_suspected", tag: "pattern_adjacent_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
  BT: { status: "blocked", dominant: "compliance_block", seed: { dominant: "compliance_block", goodBadUgly: "ugly" }, boundary: "professional_review_required", novelty: "novel_high_risk", inputQuality: "data_limited", proofRisk: "unverified", manipRisk: "low", tag: "known_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: true, antiGamingRisk: "low", ownerWorkloadRisk: "medium" },
  // ── owner_decision_required: serious but not auto-blocked → escalate to the owner (with independent verification) ──
  OW: { status: "owner_decision_required", dominant: "owner_workload", seed: { dominant: "owner_workload", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "owner_estimate_only", proofRisk: "weak", manipRisk: "suspected", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "high" },
  OM: { status: "owner_decision_required", dominant: "below_margin", seed: { dominant: "below_margin", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "data_limited", proofRisk: "weak", manipRisk: "suspected", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "medium" },
  OP: { status: "owner_decision_required", dominant: "capacity_feasibility", seed: { dominant: "capacity_feasibility", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_low_risk", inputQuality: "data_limited", proofRisk: "weak", manipRisk: "suspected", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "medium" },
  OK: { status: "owner_decision_required", dominant: "capacity_feasibility", seed: { dominant: "capacity_feasibility", goodBadUgly: "bad" }, boundary: "owner_approval_required", novelty: "novel_high_risk", inputQuality: "conflicting", proofRisk: "contradictory", manipRisk: "suspected", tag: "pattern_adjacent_unknown", gbu: "bad", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "medium", ownerWorkloadRisk: "medium" },
  OX: { status: "owner_decision_required", dominant: "cash_survival", seed: { dominant: "cash_survival", goodBadUgly: "ugly" }, boundary: "owner_approval_required", novelty: "novel_high_risk", inputQuality: "conflicting", proofRisk: "contradictory", manipRisk: "collusion_suspected", tag: "pattern_adjacent_unknown", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
  // ── verified good proof + owner SOP grant → the safe contrast cases (never a fraud case) ──
  CA: { status: "cautious_proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" }, boundary: "safe_operational", novelty: "novel_low_risk", inputQuality: "sufficient", proofRisk: "verified", manipRisk: "low", tag: "known", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "low", ownerWorkloadRisk: "low" },
  PR: { status: "proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" }, boundary: "safe_operational", novelty: "known", inputQuality: "sufficient", proofRisk: "verified", manipRisk: "none", tag: "known", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "proofRisk", "manipulationRisk", "impact", "reassessment", "confidence", "missingData"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofRisk", "manipulationRisk", "proofNeeded", "reassessment"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Training/SOP"], proof_fraud_block: ["Proof/anti-gaming", "Quality control"],
  cash_survival: ["Finance", "Proof/anti-gaming"], below_margin: ["Pricing", "Proof/anti-gaming"],
  capacity_feasibility: ["Operations", "Proof/anti-gaming"], customer_quality: ["Customer service", "Proof/anti-gaming"],
  owner_workload: ["Owner workload", "Proof/anti-gaming"], profitable_growth: ["Proof/anti-gaming", "Quality control"],
  efficiency_scaling: ["Operations"], optimization: ["Process improvement"],
};

/** One authored vignette: subcategory, a distinct title, disposition preset, source id, gold flag. */
interface Vignette { sub: string; title: string; disp: Disp; src: string; gold?: boolean }

function expand(v: Vignette, index: number): StaffProofScenario {
  const d = DISP[v.disp];
  const proofRisk = d.proofRisk ?? "none";
  const manipRisk = d.manipRisk ?? "none";
  const doNow = d.status === "need_more_data"
      ? `Demand fresh, job-specific, timestamped proof for "${v.title}" before it counts as done.`
    : d.status === "blocked"
      ? `Do not accept "${v.title}"; freeze acceptance and require independent verification / review.`
    : d.status === "owner_decision_required"
      ? `Escalate "${v.title}" to the owner with an independent check — do not let approval alone settle it.`
      : `Accept the small reversible step for "${v.title}" only against the verified fresh proof already on file.`;
  const doNotDo = d.status === "blocked"
      ? [`Do not mark "${v.title}" verified/complete on manipulated or unverifiable proof.`]
    : manipRisk === "collusion_suspected"
      ? [`Do not rely on the same-chain sign-off for "${v.title}"; require an out-of-chain check.`]
    : d.status === "need_more_data"
      ? [`Do not treat "${v.title}" as complete on weak, stale, or late proof.`]
      : [`Do not inflate performance or hide overload from "${v.title}".`];
  const proofRequired = d.status === "blocked" ? ["independent / out-of-chain verification of the disputed proof"]
    : d.status === "owner_decision_required" ? ["an independent check (customer/vendor/system) before the owner decides"]
    : d.status === "need_more_data" ? ["fresh, job-specific, timestamped completion proof"]
    : ["the verified fresh proof already accepted for this step"];
  const scenario = {
    scenarioId: `SPA-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "STAFF_PROOF_ANTI_GAMING",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: d.tag,
    sourceRefs: [v.src],
    sourceLimitations: [STAFF_PROOF_SOURCE_BY_ID[v.src]?.title ?? "composite staff/proof source", "composite/sector proof pattern — not a specific live case"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[d.dominant],
    expectedDominantConstraint: d.dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide on the staff/proof risk: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can gather independent verification with proof.",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess once fresh/independent proof or the owner decision is in"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: d.boundary,
    expectedNoveltyState: d.novelty,
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: manipRisk,
    expectedProfitCashWorkloadImpact: d.dominant === "cash_survival" ? ["cash"] : d.dominant === "below_margin" ? ["profit"] : d.dominant === "owner_workload" ? ["workload"] : ["profit", "workload"],
    expectedOutcomeMetric: "the metric behind the completion once independently verified",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: `Accepting "${v.title}" as verified on weak/manipulated proof corrupts the diagnosis and rewards gaming.`,
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

// ── 120 distinct authored vignettes: 12 subcategories × 10. Dispositions chosen so fake/weak/stale proof never
//    verifies, fraud/collusion blocks or owner-gates, and only verified fresh proof (+ owner SOP grant) proceeds. ──
const VIGNETTES: Vignette[] = [
  // 1. fake_task_completion (10)
  { sub: "fake_task_completion", title: "job marked done with no completion evidence at all", disp: "NF", src: "SRC-SPA-FAKECOMPLETE", gold: true },
  { sub: "fake_task_completion", title: "checklist ticked complete before the site visit occurred", disp: "NF", src: "SRC-SPA-FAKECOMPLETE" },
  { sub: "fake_task_completion", title: "closed ticket with a note but no artefact", disp: "NF", src: "SRC-SPA-PROOFQUALITY" },
  { sub: "fake_task_completion", title: "app status flipped to done from an off-site location", disp: "NF", src: "SRC-SPA-TIMESTAMP" },
  { sub: "fake_task_completion", title: "batch of tasks all closed in the same minute", disp: "NF", src: "SRC-SPA-FAKECOMPLETE" },
  { sub: "fake_task_completion", title: "fabricated sign-off sheet for work never started", disp: "BF", src: "SRC-SPA-FAKECOMPLETE" },
  { sub: "fake_task_completion", title: "forged customer signature on a completion form", disp: "BF", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "fake_task_completion", title: "completion claimed but the customer reports nothing done", disp: "OX", src: "SRC-SPA-CONTRADICT" },
  { sub: "fake_task_completion", title: "recurring maintenance logged done without meter readings", disp: "OM", src: "SRC-SPA-SELECTIVE" },
  { sub: "fake_task_completion", title: "re-inspection confirmed the job; small follow-up under SOP grant", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 2. reused_stale_photo_proof (10)
  { sub: "reused_stale_photo_proof", title: "same completion photo submitted for two different addresses", disp: "NS", src: "SRC-SPA-REUSEDPHOTO", gold: true },
  { sub: "reused_stale_photo_proof", title: "last month's photo reused for this month's service", disp: "NS", src: "SRC-SPA-REUSEDPHOTO" },
  { sub: "reused_stale_photo_proof", title: "photo with no timestamp offered as fresh proof", disp: "NS", src: "SRC-SPA-TIMESTAMP" },
  { sub: "reused_stale_photo_proof", title: "screenshot of an old photo instead of a live capture", disp: "NS", src: "SRC-SPA-REUSEDPHOTO" },
  { sub: "reused_stale_photo_proof", title: "stock-looking image submitted as on-site evidence", disp: "NS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "reused_stale_photo_proof", title: "identical image hash reused across a run of jobs", disp: "NS", src: "SRC-SPA-DUPLICATE" },
  { sub: "reused_stale_photo_proof", title: "duplicated proof file detected across distinct tickets", disp: "BF", src: "SRC-SPA-DUPLICATE" },
  { sub: "reused_stale_photo_proof", title: "photo date predates the scheduled service window", disp: "OP", src: "SRC-SPA-TIMESTAMP" },
  { sub: "reused_stale_photo_proof", title: "fresh geotagged re-shoot requested and pending", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  { sub: "reused_stale_photo_proof", title: "new timestamped photo supplied and cross-checked clean", disp: "PR", src: "SRC-SPA-VERIFIEDGOOD" },
  // 3. staged_misleading_proof (10)
  { sub: "staged_misleading_proof", title: "photo cropped to hide the unfinished area", disp: "BS", src: "SRC-SPA-STAGEDPROOF", gold: true },
  { sub: "staged_misleading_proof", title: "clean corner staged while the rest is untouched", disp: "BS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "staged_misleading_proof", title: "before-photo passed off as the after-photo", disp: "BS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "staged_misleading_proof", title: "angle chosen to conceal a known defect", disp: "BS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "staged_misleading_proof", title: "edited image misrepresents the real completion state", disp: "BS", src: "SRC-SPA-DUPLICATE" },
  { sub: "staged_misleading_proof", title: "partial-fix photo implying a full repair", disp: "NF", src: "SRC-SPA-PROOFQUALITY" },
  { sub: "staged_misleading_proof", title: "staged readout on a device not actually installed", disp: "NF", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "staged_misleading_proof", title: "misleading proof contradicted by the system log", disp: "OK", src: "SRC-SPA-CONTRADICT" },
  { sub: "staged_misleading_proof", title: "ambiguous proof escalated for an independent site check", disp: "OX", src: "SRC-SPA-INDEPVERIFY" },
  { sub: "staged_misleading_proof", title: "independent re-inspection cleared it; low-risk follow-up", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 4. manager_rubber_stamping (10)
  { sub: "manager_rubber_stamping", title: "manager approved a batch without opening the proof", disp: "NF", src: "SRC-SPA-RUBBERSTAMP", gold: true },
  { sub: "manager_rubber_stamping", title: "sign-off within seconds of submission, no review time", disp: "NF", src: "SRC-SPA-RUBBERSTAMP" },
  { sub: "manager_rubber_stamping", title: "approval stands despite a missing artefact", disp: "NF", src: "SRC-SPA-RUBBERSTAMP" },
  { sub: "manager_rubber_stamping", title: "blanket approval of every job in the queue", disp: "NF", src: "SRC-SPA-RUBBERSTAMP" },
  { sub: "manager_rubber_stamping", title: "approver overrode a failed quality flag", disp: "OP", src: "SRC-SPA-RUBBERSTAMP" },
  { sub: "manager_rubber_stamping", title: "manager approval used to close a customer dispute", disp: "OP", src: "SRC-SPA-CONTRADICT" },
  { sub: "manager_rubber_stamping", title: "approver signed off on proof that was later fabricated", disp: "BF", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "manager_rubber_stamping", title: "sign-off on duplicated proof passed as fresh", disp: "BF", src: "SRC-SPA-DUPLICATE" },
  { sub: "manager_rubber_stamping", title: "approval pattern gaming a same-day-close metric", disp: "OM", src: "SRC-SPA-METRICINFLATE" },
  { sub: "manager_rubber_stamping", title: "manager verified independently before approving; SOP grant", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 5. staff_manager_collusion (10)
  { sub: "staff_manager_collusion", title: "staff and approver share a single sign-off chain", disp: "BX", src: "SRC-SPA-COLLUSION", gold: true },
  { sub: "staff_manager_collusion", title: "manager consistently approves one worker's unverifiable proof", disp: "BX", src: "SRC-SPA-COLLUSION" },
  { sub: "staff_manager_collusion", title: "paired sign-offs that never touch independent evidence", disp: "BX", src: "SRC-SPA-INDEPVERIFY" },
  { sub: "staff_manager_collusion", title: "approver edits then approves the same worker's proof", disp: "BX", src: "SRC-SPA-COLLUSION" },
  { sub: "staff_manager_collusion", title: "suspected collusion on inflated completion counts", disp: "OX", src: "SRC-SPA-METRICINFLATE" },
  { sub: "staff_manager_collusion", title: "same two names on every disputed job", disp: "OX", src: "SRC-SPA-COLLUSION" },
  { sub: "staff_manager_collusion", title: "collusive close-out contradicted by vendor records", disp: "OX", src: "SRC-SPA-VENDORCONFIRM" },
  { sub: "staff_manager_collusion", title: "possible collusion needing an out-of-chain reviewer", disp: "NF", src: "SRC-SPA-INDEPVERIFY" },
  { sub: "staff_manager_collusion", title: "unclear whether pairing is collusion or scheduling", disp: "NF", src: "SRC-SPA-COLLUSION" },
  { sub: "staff_manager_collusion", title: "independent reviewer confirmed the batch clean; SOP follow-up", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 6. delayed_after_the_fact_proof (10)
  { sub: "delayed_after_the_fact_proof", title: "proof produced a week after the job closed", disp: "NF", src: "SRC-SPA-DELAYEDPROOF", gold: true },
  { sub: "delayed_after_the_fact_proof", title: "evidence reconstructed only after a complaint", disp: "NF", src: "SRC-SPA-DELAYEDPROOF" },
  { sub: "delayed_after_the_fact_proof", title: "back-dated log entry with no contemporaneous record", disp: "NF", src: "SRC-SPA-TIMESTAMP" },
  { sub: "delayed_after_the_fact_proof", title: "photo taken after the reminder, not at the job", disp: "NF", src: "SRC-SPA-DELAYEDPROOF" },
  { sub: "delayed_after_the_fact_proof", title: "completion note written from memory days later", disp: "NF", src: "SRC-SPA-DELAYEDPROOF" },
  { sub: "delayed_after_the_fact_proof", title: "late proof stale by the time it arrived", disp: "NS", src: "SRC-SPA-DELAYEDPROOF" },
  { sub: "delayed_after_the_fact_proof", title: "after-the-fact evidence with an inconsistent timeline", disp: "NS", src: "SRC-SPA-TIMESTAMP" },
  { sub: "delayed_after_the_fact_proof", title: "delayed proof disputed against the customer's timeline", disp: "OP", src: "SRC-SPA-CONTRADICT" },
  { sub: "delayed_after_the_fact_proof", title: "reconstruction indistinguishable from fabrication", disp: "BF", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "delayed_after_the_fact_proof", title: "contemporaneous proof later supplied and verified", disp: "PR", src: "SRC-SPA-VERIFIEDGOOD" },
  // 7. proof_contradiction_customer_vendor_system (10)
  { sub: "proof_contradiction_customer_vendor_system", title: "staff proof conflicts with the customer's account", disp: "NF", src: "SRC-SPA-CONTRADICT", gold: true },
  { sub: "proof_contradiction_customer_vendor_system", title: "completion time contradicts the access-system log", disp: "NF", src: "SRC-SPA-CONTRADICT" },
  { sub: "proof_contradiction_customer_vendor_system", title: "reported materials contradict the vendor invoice", disp: "NF", src: "SRC-SPA-VENDORCONFIRM" },
  { sub: "proof_contradiction_customer_vendor_system", title: "GPS trail contradicts the on-site claim", disp: "OK", src: "SRC-SPA-CONTRADICT" },
  { sub: "proof_contradiction_customer_vendor_system", title: "meter reading contradicts the usage the system recorded", disp: "OK", src: "SRC-SPA-VENDORCONFIRM" },
  { sub: "proof_contradiction_customer_vendor_system", title: "photo location contradicts the job address", disp: "BS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "proof_contradiction_customer_vendor_system", title: "signature contradicts the customer's later denial", disp: "BS", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "proof_contradiction_customer_vendor_system", title: "quantities contradict the delivery records", disp: "BS", src: "SRC-SPA-DUPLICATE" },
  { sub: "proof_contradiction_customer_vendor_system", title: "conflicting proof escalated for owner adjudication", disp: "OX", src: "SRC-SPA-CONTRADICT" },
  { sub: "proof_contradiction_customer_vendor_system", title: "customer confirmation resolved the conflict; SOP follow-up", disp: "CA", src: "SRC-SPA-CUSTCONFIRM" },
  // 8. selective_reporting_omitted_bad_facts (10)
  { sub: "selective_reporting_omitted_bad_facts", title: "only the successful jobs reported, failures omitted", disp: "NF", src: "SRC-SPA-SELECTIVE", gold: true },
  { sub: "selective_reporting_omitted_bad_facts", title: "complaint volume left out of the weekly summary", disp: "NF", src: "SRC-SPA-SELECTIVE" },
  { sub: "selective_reporting_omitted_bad_facts", title: "rework hidden by reporting only first-pass counts", disp: "NF", src: "SRC-SPA-SELECTIVE" },
  { sub: "selective_reporting_omitted_bad_facts", title: "adverse safety near-miss omitted from the log", disp: "NF", src: "SRC-SPA-SOPDRIFT" },
  { sub: "selective_reporting_omitted_bad_facts", title: "cherry-picked metric window that hides the dip", disp: "NF", src: "SRC-SPA-METRICINFLATE" },
  { sub: "selective_reporting_omitted_bad_facts", title: "margin-eroding discounts omitted from the report", disp: "OM", src: "SRC-SPA-SELECTIVE" },
  { sub: "selective_reporting_omitted_bad_facts", title: "returned/refunded jobs left out of the totals", disp: "OM", src: "SRC-SPA-SELECTIVE" },
  { sub: "selective_reporting_omitted_bad_facts", title: "omitted overtime cost behind the headline output", disp: "OM", src: "SRC-SPA-OVERLOAD" },
  { sub: "selective_reporting_omitted_bad_facts", title: "reported summary contradicted by the raw system export", disp: "BF", src: "SRC-SPA-CONTRADICT" },
  { sub: "selective_reporting_omitted_bad_facts", title: "full reconciled report supplied and verified", disp: "PR", src: "SRC-SPA-VERIFIEDGOOD" },
  // 9. false_excuse_patterns (10)
  { sub: "false_excuse_patterns", title: "same weather excuse across dry days", disp: "NF", src: "SRC-SPA-EXCUSE", gold: true },
  { sub: "false_excuse_patterns", title: "recurring access excuse the customer contradicts", disp: "NF", src: "SRC-SPA-EXCUSE" },
  { sub: "false_excuse_patterns", title: "equipment excuse with no maintenance record", disp: "NF", src: "SRC-SPA-EXCUSE" },
  { sub: "false_excuse_patterns", title: "traffic excuse repeated on short local routes", disp: "NF", src: "SRC-SPA-EXCUSE" },
  { sub: "false_excuse_patterns", title: "repeated excuse pattern masking non-performance", disp: "OW", src: "SRC-SPA-EXCUSE" },
  { sub: "false_excuse_patterns", title: "excuses concentrated on one worker's routes", disp: "OW", src: "SRC-SPA-EXCUSE" },
  { sub: "false_excuse_patterns", title: "excuse pattern shifting workload onto peers", disp: "OW", src: "SRC-SPA-OVERLOAD" },
  { sub: "false_excuse_patterns", title: "excuse used to justify a margin-eroding redo", disp: "OM", src: "SRC-SPA-SELECTIVE" },
  { sub: "false_excuse_patterns", title: "excuse paired with fabricated supporting proof", disp: "BF", src: "SRC-SPA-STAGEDPROOF" },
  { sub: "false_excuse_patterns", title: "verified one-off cause confirmed; low-risk follow-up", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 10. task_splitting_metric_gaming (10)
  { sub: "task_splitting_metric_gaming", title: "one job split into many tickets to inflate counts", disp: "OM", src: "SRC-SPA-TASKSPLIT", gold: true },
  { sub: "task_splitting_metric_gaming", title: "micro-tasking to game a jobs-per-day target", disp: "OM", src: "SRC-SPA-METRICINFLATE" },
  { sub: "task_splitting_metric_gaming", title: "re-opening and re-closing to pad throughput", disp: "OM", src: "SRC-SPA-METRICINFLATE" },
  { sub: "task_splitting_metric_gaming", title: "unit gaming that leaves real output unchanged", disp: "NF", src: "SRC-SPA-TASKSPLIT" },
  { sub: "task_splitting_metric_gaming", title: "count inflation unsupported by customer-visible work", disp: "NF", src: "SRC-SPA-TASKSPLIT" },
  { sub: "task_splitting_metric_gaming", title: "split tickets with no distinct proof per unit", disp: "NF", src: "SRC-SPA-PROOFQUALITY" },
  { sub: "task_splitting_metric_gaming", title: "fabricated sub-tasks to hit a bonus threshold", disp: "BF", src: "SRC-SPA-METRICINFLATE" },
  { sub: "task_splitting_metric_gaming", title: "duplicated closures inflating the completion metric", disp: "BF", src: "SRC-SPA-DUPLICATE" },
  { sub: "task_splitting_metric_gaming", title: "splitting that overloads downstream capacity", disp: "OP", src: "SRC-SPA-OVERLOAD" },
  { sub: "task_splitting_metric_gaming", title: "legitimate scoped subtasks each independently verified", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
  // 11. workload_gaming_burden_shifting (10)
  { sub: "workload_gaming_burden_shifting", title: "easy jobs cherry-picked, hard jobs pushed to peers", disp: "OW", src: "SRC-SPA-WORKLOADGAME", gold: true },
  { sub: "workload_gaming_burden_shifting", title: "burden shifted so one worker's overload is hidden", disp: "OW", src: "SRC-SPA-OVERLOAD" },
  { sub: "workload_gaming_burden_shifting", title: "aggregate totals conceal an individual burnout risk", disp: "OW", src: "SRC-SPA-OVERLOAD" },
  { sub: "workload_gaming_burden_shifting", title: "schedule gamed to dodge the unpopular shifts", disp: "OW", src: "SRC-SPA-WORKLOADGAME" },
  { sub: "workload_gaming_burden_shifting", title: "reassignment pattern loading the same few people", disp: "OW", src: "SRC-SPA-WORKLOADGAME" },
  { sub: "workload_gaming_burden_shifting", title: "unclear if uneven load is gaming or skill routing", disp: "NF", src: "SRC-SPA-WORKLOADGAME" },
  { sub: "workload_gaming_burden_shifting", title: "hidden overtime behind a flattering utilisation number", disp: "NF", src: "SRC-SPA-OVERLOAD" },
  { sub: "workload_gaming_burden_shifting", title: "burden-shift complaint needing workload data", disp: "NF", src: "SRC-SPA-WORKLOADGAME" },
  { sub: "workload_gaming_burden_shifting", title: "shifting paired with collusive sign-off on the gaps", disp: "OX", src: "SRC-SPA-COLLUSION" },
  { sub: "workload_gaming_burden_shifting", title: "balanced rota verified against real workload; proceed", disp: "PR", src: "SRC-SPA-VERIFIEDGOOD" },
  // 12. training_noncompliance_sop_drift (10)
  { sub: "training_noncompliance_sop_drift", title: "staff skipping the required SOP step over time", disp: "NT", src: "SRC-SPA-SOPDRIFT", gold: true },
  { sub: "training_noncompliance_sop_drift", title: "lapsed training certification still on active duty", disp: "NT", src: "SRC-SPA-TRAININGGAP" },
  { sub: "training_noncompliance_sop_drift", title: "procedure drift from the documented checklist", disp: "NT", src: "SRC-SPA-SOPDRIFT" },
  { sub: "training_noncompliance_sop_drift", title: "shortcut behaviour spreading across the team", disp: "NT", src: "SRC-SPA-TRAININGGAP" },
  { sub: "training_noncompliance_sop_drift", title: "new hire never completed the onboarding SOP module", disp: "NT", src: "SRC-SPA-SOPDRIFT" },
  { sub: "training_noncompliance_sop_drift", title: "safety-critical SOP breach requiring formal review", disp: "BT", src: "SRC-SPA-TRAININGGAP" },
  { sub: "training_noncompliance_sop_drift", title: "regulated step performed by an uncertified worker", disp: "BT", src: "SRC-SPA-SOPDRIFT" },
  { sub: "training_noncompliance_sop_drift", title: "drift contradicted by the completion records", disp: "OP", src: "SRC-SPA-CONTRADICT" },
  { sub: "training_noncompliance_sop_drift", title: "drift concentrated where workload is highest", disp: "OW", src: "SRC-SPA-OVERLOAD" },
  { sub: "training_noncompliance_sop_drift", title: "retraining completed and verified; low-risk resumption", disp: "CA", src: "SRC-SPA-VERIFIEDGOOD" },
];

const perCategoryIndex: Record<string, number> = {};
export const STAFF_PROOF_ANTI_GAMING_PACK: StaffProofScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const STAFF_PROOF_SUBCATEGORIES = [
  "fake_task_completion", "reused_stale_photo_proof", "staged_misleading_proof", "manager_rubber_stamping",
  "staff_manager_collusion", "delayed_after_the_fact_proof", "proof_contradiction_customer_vendor_system",
  "selective_reporting_omitted_bad_facts", "false_excuse_patterns", "task_splitting_metric_gaming",
  "workload_gaming_burden_shifting", "training_noncompliance_sop_drift",
] as const;
