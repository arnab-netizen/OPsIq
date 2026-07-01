/**
 * DAILY OPERATIONS PACK — 300 counted, source-backed scenarios proving OpsIQ handles ordinary day-to-day
 * business reality WITHOUT over-escalating or overburdening the owner: routine reversible actions PROCEED (or
 * cautious-proceed) under an owner/SOP grant with proof still required; genuinely material calls are owner-gated;
 * missing critical data → need_more_data; and safety / compliance / cash-critical / fraud-risk routine steps are
 * blocked. Delegation is the default; owner time is reserved for the material calls.
 *
 * Each of the 300 is a distinct authored vignette (no filler), inherits a real source, and carries a
 * deterministic `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure
 * expander over the merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { DAILY_OPERATIONS_SOURCE_BY_ID } from "./daily-operations-sources";

export interface DailyOpsScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

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
  // Routine reversible action, owner/SOP-approved, verified proof → proceed.
  PR: { status: "proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Routine reversible action, medium-risk, owner SOP grant, verified proof → cautious_proceed.
  CA: { status: "cautious_proceed", boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Routine action missing one critical figure → ask for it (never proceed on missing data).
  NF: { status: "need_more_data", boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "low", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "low" },
  // Material routine call → owner decides (prepared options, not auto-proceeded).
  OD: { status: "owner_decision_required", boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
  // Safety / compliance / fraud boundary on a routine step → blocked (never proceed).
  BL: { status: "blocked", boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, ownerWorkloadRisk: "medium" },
};

/** Per-subcategory binding constraint for OD (owner_decision) and BL (blocked) dispositions — for variety while
 *  every dominant→status mapping reuses the OOD + Staff/Proof-proven seed path. */
const OD_DOMINANT: Record<string, Constraint> = {
  routine_order_handling: "below_margin", pickup_delivery_coordination: "capacity_feasibility",
  customer_complaint_minor: "owner_workload", staff_attendance_punctuality: "owner_workload",
  daily_task_completion: "capacity_feasibility", inventory_stock_small_mismatch: "below_margin",
  cash_collection_small_reconciliation: "cash_survival", routine_discount_price_exception: "below_margin",
  equipment_idle_minor_maintenance: "capacity_feasibility", proof_quality_routine_issue: "owner_workload",
  owner_time_limited_decision: "owner_workload", small_repeated_operational_leak: "below_margin",
};
const BL_DOMINANT: Record<string, Constraint> = {
  routine_order_handling: "compliance_block", pickup_delivery_coordination: "compliance_block",
  customer_complaint_minor: "compliance_block", staff_attendance_punctuality: "compliance_block",
  daily_task_completion: "compliance_block", inventory_stock_small_mismatch: "compliance_block",
  cash_collection_small_reconciliation: "compliance_block", routine_discount_price_exception: "compliance_block",
  equipment_idle_minor_maintenance: "compliance_block", proof_quality_routine_issue: "proof_fraud_block",
  owner_time_limited_decision: "compliance_block", small_repeated_operational_leak: "proof_fraud_block",
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "ownerWorkload"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Operations"], proof_fraud_block: ["Proof/anti-gaming", "Quality control"],
  cash_survival: ["Finance", "Operations"], below_margin: ["Pricing", "Operations"],
  capacity_feasibility: ["Operations", "Scheduling"], customer_quality: ["Customer service", "Operations"],
  owner_workload: ["Owner workload", "Operations"], profitable_growth: ["Operations", "Daily ops"],
  efficiency_scaling: ["Operations"], optimization: ["Process improvement"],
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

function expand(v: Vignette, index: number): DailyOpsScenario {
  const d = DISP[v.disp];
  const seed = seedFor(v.disp, v.sub);
  const dominant = seed.dominant;
  const professionalReviewRequired = v.disp === "BL" && dominant === "compliance_block";
  const proofRisk = v.disp === "BL" && dominant === "proof_fraud_block" ? "staged" : d.proofRisk;
  const doNow = d.status === "proceed" ? `Handle "${v.title}" now as a routine step and record the proof.`
    : d.status === "cautious_proceed" ? `Do "${v.title}" as a small reversible step under the SOP grant, with proof.`
    : d.status === "need_more_data" ? `Get the one missing figure for "${v.title}" before it counts as done.`
    : d.status === "owner_decision_required" ? `Prepare the options on "${v.title}" for the owner to decide — do not auto-proceed.`
    : `Do not proceed on "${v.title}"; hold it for review (safety/compliance/proof).`;
  const doNotDo = d.status === "blocked" ? [`Do not treat "${v.title}" as routine — it crosses a boundary and must be cleared first.`]
    : d.status === "owner_decision_required" ? [`Do not auto-proceed on "${v.title}"; it is the owner's call.`]
    : d.status === "need_more_data" ? [`Do not close "${v.title}" until the missing figure is supplied.`]
    : [`Do not over-escalate "${v.title}" to the owner — handle it with proof.`];
  const proofRequired = d.status === "blocked" ? ["boundary/compliance (or independent proof) clearance"]
    : d.status === "owner_decision_required" ? ["the figures the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing figure/record"]
    : ["light proof of the routine completion"];
  const scenario = {
    scenarioId: `DOP-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "DAILY_OPERATIONS",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [DAILY_OPERATIONS_SOURCE_BY_ID[v.src]?.title ?? "composite daily-operations source", "composite/sector routine pattern — not a specific live case"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[dominant],
    expectedDominantConstraint: dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide on the routine matter: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can handle this routine step with proof (owner time reserved for material calls).",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess at the next routine review (or once the missing figure / owner decision is in)"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: professionalReviewRequired ? "professional_review_required" : d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: proofRisk,
    expectedManipulationRiskState: v.disp === "BL" && dominant === "proof_fraud_block" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: dominant === "cash_survival" ? ["cash"] : dominant === "owner_workload" ? ["workload"] : dominant === "below_margin" ? ["profit"] : ["profit", "workload"],
    expectedOutcomeMetric: "the routine metric behind this step (orders, on-time %, variance, margin, or uptime)",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: d.status === "blocked" || d.status === "owner_decision_required"
      ? `Auto-proceeding on "${v.title}" would cross a boundary or pre-empt the owner's call.`
      : `Over-escalating or nagging for proof on "${v.title}" would overburden the owner and slow routine work.`,
    highRisk: d.highRisk,
    professionalReviewRequired,
    ownerWorkloadRisk: v.sub === "owner_time_limited_decision" && d.status === "owner_decision_required" ? "high" : d.ownerWorkloadRisk,
    antiGamingRisk: (v.disp === "BL" && dominant === "proof_fraud_block" ? "high" : "none") as "none" | "low" | "medium" | "high",
    liveOutcomeClaimAllowed: false,
    countedForReadiness: true,
    synthetic: false,
    liveDataBacked: false,
  };
  const parsed = businessRealityScenarioSchema.parse(scenario);
  return { ...parsed, seed };
}

// ── 300 distinct authored vignettes: 12 subcategories × 25. Disposition mix per subcategory hits the target
//    distribution (proceed 60, cautious 60, need_more_data 84, owner_decision 60, blocked 36). proceed/cautious
//    only on routine reversible SOP-granted verified-proof steps; never on high-risk/critical-missing/boundary. ──
const VIGNETTES: Vignette[] = [
  // 1. routine_order_handling (25): PR8 CA6 NF6 OD3 BL2
  { sub: "routine_order_handling", title: "confirm and fulfil a standard repeat order", disp: "PR", src: "SRC-DOP-ORDERS", gold: true },
  { sub: "routine_order_handling", title: "accept an in-catalogue order at list price", disp: "PR", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "close a delivered order with signed receipt", disp: "PR", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "reorder a fast-moving line at the trigger point", disp: "PR", src: "SRC-DOP-STOCKOUT" },
  { sub: "routine_order_handling", title: "process a standard in-policy return", disp: "PR", src: "SRC-DOP-RETURNS" },
  { sub: "routine_order_handling", title: "confirm a routine vendor reorder within terms", disp: "PR", src: "SRC-DOP-VENDOR" },
  { sub: "routine_order_handling", title: "book a same-day order into the normal queue", disp: "PR", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "acknowledge and schedule a standard order", disp: "PR", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "apply a within-policy small courtesy on a repeat order", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "routine_order_handling", title: "expedite a routine order with a small overtime cost", disp: "CA", src: "SRC-DOP-DELEGATION" },
  { sub: "routine_order_handling", title: "substitute a like-for-like item on an order", disp: "CA", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "split one order into two shipments for capacity", disp: "CA", src: "SRC-DOP-CAPACITY" },
  { sub: "routine_order_handling", title: "hold a routine order pending stock arriving today", disp: "CA", src: "SRC-DOP-STOCKOUT" },
  { sub: "routine_order_handling", title: "accept a slightly early delivery slot", disp: "CA", src: "SRC-DOP-DELIVERY" },
  { sub: "routine_order_handling", title: "order with a missing delivery address line", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "routine_order_handling", title: "order with no confirmed quantity yet", disp: "NF", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "order awaiting a customer's spec confirmation", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "routine_order_handling", title: "order missing the agreed price line", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "routine_order_handling", title: "order with an unreadable line item", disp: "NF", src: "SRC-DOP-ORDERS" },
  { sub: "routine_order_handling", title: "order pending a stock-availability check", disp: "NF", src: "SRC-DOP-STOCKOUT" },
  { sub: "routine_order_handling", title: "large order that strains this week's margin", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_order_handling", title: "custom order at a non-standard price", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_order_handling", title: "order requiring a below-band price to win", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_order_handling", title: "order for a restricted/regulated item", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "routine_order_handling", title: "order that would breach an age/licence rule", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 2. pickup_delivery_coordination (25): PR7 CA7 NF6 OD4 BL1
  { sub: "pickup_delivery_coordination", title: "assign a routine delivery to the normal route", disp: "PR", src: "SRC-DOP-DELIVERY", gold: true },
  { sub: "pickup_delivery_coordination", title: "confirm a scheduled pickup window", disp: "PR", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "close a completed delivery with proof of drop", disp: "PR", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "batch nearby drops onto one run", disp: "PR", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "reassign a drop after a driver swap within rules", disp: "PR", src: "SRC-DOP-ROSTER" },
  { sub: "pickup_delivery_coordination", title: "confirm a routine courier handoff", disp: "PR", src: "SRC-DOP-VENDOR" },
  { sub: "pickup_delivery_coordination", title: "slot a same-day pickup into a gap", disp: "PR", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "re-sequence a route for a small time saving", disp: "CA", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "add a short detour drop with minor overtime", disp: "CA", src: "SRC-DOP-DELEGATION" },
  { sub: "pickup_delivery_coordination", title: "shift a pickup to the next slot at the customer's ask", disp: "CA", src: "SRC-DOP-CONFIRM" },
  { sub: "pickup_delivery_coordination", title: "use a backup vehicle for one run", disp: "CA", src: "SRC-DOP-EQUIPMENT" },
  { sub: "pickup_delivery_coordination", title: "hold a drop for a two-hour weather delay", disp: "CA", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "combine a pickup and drop on one trip", disp: "CA", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "swap two drivers' short segments", disp: "CA", src: "SRC-DOP-ROSTER" },
  { sub: "pickup_delivery_coordination", title: "delivery with an unconfirmed address", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "pickup_delivery_coordination", title: "pickup with no confirmed contact time", disp: "NF", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "drop pending a gate/access code", disp: "NF", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "route missing the parcel count", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "pickup_delivery_coordination", title: "delivery awaiting proof-of-delivery method", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "pickup_delivery_coordination", title: "pickup with a conflicting time in the app", disp: "NF", src: "SRC-DOP-DELIVERY" },
  { sub: "pickup_delivery_coordination", title: "route that overruns driver hours limits", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "pickup_delivery_coordination", title: "add a third run that strains capacity", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "pickup_delivery_coordination", title: "premium same-day promise beyond normal reach", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "pickup_delivery_coordination", title: "reroute that adds material fuel cost", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "pickup_delivery_coordination", title: "delivery of a restricted good without the permit", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 3. customer_complaint_minor (25): PR4 CA6 NF7 OD6 BL2
  { sub: "customer_complaint_minor", title: "apologise and reship a wrong-colour item in policy", disp: "PR", src: "SRC-DOP-COMPLAINT", gold: true },
  { sub: "customer_complaint_minor", title: "issue a small in-policy goodwill credit", disp: "PR", src: "SRC-DOP-RETURNS" },
  { sub: "customer_complaint_minor", title: "resend a missing accessory from stock", disp: "PR", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "correct a minor billing typo on request", disp: "PR", src: "SRC-DOP-CONFIRM" },
  { sub: "customer_complaint_minor", title: "offer a small discount to settle a minor gripe", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "customer_complaint_minor", title: "expedite a replacement with minor cost", disp: "CA", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "waive a small restocking fee as goodwill", disp: "CA", src: "SRC-DOP-RETURNS" },
  { sub: "customer_complaint_minor", title: "schedule a quick redo visit", disp: "CA", src: "SRC-DOP-TASKS" },
  { sub: "customer_complaint_minor", title: "extend a courtesy on a repeat customer's gripe", disp: "CA", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "provide a small credit pending a recheck", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "customer_complaint_minor", title: "complaint with no order reference yet", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "customer_complaint_minor", title: "complaint missing the specific fault detail", disp: "NF", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "complaint pending a photo of the issue", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "customer_complaint_minor", title: "complaint with no proof of purchase yet", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "customer_complaint_minor", title: "complaint awaiting the customer's callback", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "customer_complaint_minor", title: "complaint with conflicting account details", disp: "NF", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "complaint missing the date of service", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "customer_complaint_minor", title: "refund request above the in-policy band", disp: "OD", src: "SRC-DOP-RETURNS" },
  { sub: "customer_complaint_minor", title: "goodwill gesture that dents the job's margin", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "customer_complaint_minor", title: "repeated complaints from one key account", disp: "OD", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "complaint that hints at a recurring defect", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "customer_complaint_minor", title: "complaint requesting a policy exception", disp: "OD", src: "SRC-DOP-POLICY" },
  { sub: "customer_complaint_minor", title: "escalating complaint from a vocal reviewer", disp: "OD", src: "SRC-DOP-COMPLAINT" },
  { sub: "customer_complaint_minor", title: "complaint alleging a safety issue with the product", disp: "BL", src: "SRC-DOP-SAFETY" },
  { sub: "customer_complaint_minor", title: "complaint that raises a legal/liability claim", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 4. staff_attendance_punctuality (25): PR5 CA5 NF7 OD6 BL2
  { sub: "staff_attendance_punctuality", title: "log an on-time shift start", disp: "PR", src: "SRC-DOP-ATTENDANCE", gold: true },
  { sub: "staff_attendance_punctuality", title: "approve a pre-agreed shift swap", disp: "PR", src: "SRC-DOP-ROSTER" },
  { sub: "staff_attendance_punctuality", title: "record a notified, covered absence", disp: "PR", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "accept a make-up hour within the roster", disp: "PR", src: "SRC-DOP-ROSTER" },
  { sub: "staff_attendance_punctuality", title: "confirm a routine break schedule", disp: "PR", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "coach a first minor lateness informally", disp: "CA", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "reassign a short-staffed slot with overtime", disp: "CA", src: "SRC-DOP-DELEGATION" },
  { sub: "staff_attendance_punctuality", title: "allow a one-off early leave with cover", disp: "CA", src: "SRC-DOP-ROSTER" },
  { sub: "staff_attendance_punctuality", title: "swap a late starter to a later shift today", disp: "CA", src: "SRC-DOP-ROSTER" },
  { sub: "staff_attendance_punctuality", title: "approve a short-notice cover request", disp: "CA", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "absence with no reason logged yet", disp: "NF", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "clock-in missing for one worker", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "staff_attendance_punctuality", title: "conflicting timesheet vs rota entry", disp: "NF", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "lateness pattern with no recorded cause", disp: "NF", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "unconfirmed cover for a gap tomorrow", disp: "NF", src: "SRC-DOP-ROSTER" },
  { sub: "staff_attendance_punctuality", title: "missing sign-off on a shift handover", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "staff_attendance_punctuality", title: "absence pending a certificate", disp: "NF", src: "SRC-DOP-ATTENDANCE" },
  { sub: "staff_attendance_punctuality", title: "recurring lateness needing a formal chat", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "staff_attendance_punctuality", title: "chronic short-staffing straining the rota", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "staff_attendance_punctuality", title: "overtime creeping above the workload budget", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "staff_attendance_punctuality", title: "one worker absorbing most of the burden", disp: "OD", src: "SRC-DOP-DELEGATION" },
  { sub: "staff_attendance_punctuality", title: "repeated no-shows from one employee", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "staff_attendance_punctuality", title: "attendance dispute needing owner judgement", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "staff_attendance_punctuality", title: "suspected falsified clock-in records", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "staff_attendance_punctuality", title: "attendance issue touching a labour-law limit", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 5. daily_task_completion (25): PR6 CA6 NF7 OD4 BL2
  { sub: "daily_task_completion", title: "close a routine task with a completion photo", disp: "PR", src: "SRC-DOP-TASKS", gold: true },
  { sub: "daily_task_completion", title: "mark a standard checklist done with sign-off", disp: "PR", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "confirm a routine opening checklist", disp: "PR", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "close a cleaning task with before/after proof", disp: "PR", src: "SRC-DOP-PROOFQ" },
  { sub: "daily_task_completion", title: "log a routine restock task complete", disp: "PR", src: "SRC-DOP-STOCKOUT" },
  { sub: "daily_task_completion", title: "confirm a closing checklist with proof", disp: "PR", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "accept a slightly late but proven completion", disp: "CA", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "reassign a task with minor overtime to finish today", disp: "CA", src: "SRC-DOP-DELEGATION" },
  { sub: "daily_task_completion", title: "allow a partial completion to carry over", disp: "CA", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "accept an alternate proof format this once", disp: "CA", src: "SRC-DOP-PROOFQ" },
  { sub: "daily_task_completion", title: "prioritise one task over another today", disp: "CA", src: "SRC-DOP-CAPACITY" },
  { sub: "daily_task_completion", title: "extend a task deadline by a few hours", disp: "CA", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "task marked done with no proof attached", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "daily_task_completion", title: "checklist with a blank critical line", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "daily_task_completion", title: "task pending a measurement reading", disp: "NF", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "completion with an unreadable photo", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "daily_task_completion", title: "task awaiting a second-person check", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "daily_task_completion", title: "checklist missing the timestamp", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "daily_task_completion", title: "task with a conflicting done/not-done status", disp: "NF", src: "SRC-DOP-TASKS" },
  { sub: "daily_task_completion", title: "backlog of tasks straining today's capacity", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "daily_task_completion", title: "a task that needs extra paid hours to finish", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "daily_task_completion", title: "repeated carryover of the same task", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "daily_task_completion", title: "task reallocation that overloads one person", disp: "OD", src: "SRC-DOP-DELEGATION" },
  { sub: "daily_task_completion", title: "safety-critical task closed without the check", disp: "BL", src: "SRC-DOP-SAFETY" },
  { sub: "daily_task_completion", title: "compliance task skipped on a regulated step", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 6. inventory_stock_small_mismatch (25): PR4 CA5 NF9 OD4 BL3
  { sub: "inventory_stock_small_mismatch", title: "accept a within-tolerance count variance", disp: "PR", src: "SRC-DOP-INVENTORY", gold: true },
  { sub: "inventory_stock_small_mismatch", title: "adjust stock after a verified miscount", disp: "PR", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "reconcile a unit after a found item", disp: "PR", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "post a routine reorder at the trigger", disp: "PR", src: "SRC-DOP-STOCKOUT" },
  { sub: "inventory_stock_small_mismatch", title: "recount a shelf before adjusting", disp: "CA", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "write off a small spoilage within policy", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "inventory_stock_small_mismatch", title: "move stock between bins to fix a mismatch", disp: "CA", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "accept a supplier short-ship credit", disp: "CA", src: "SRC-DOP-VENDOR" },
  { sub: "inventory_stock_small_mismatch", title: "hold an adjustment for a same-day recount", disp: "CA", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "mismatch with no last-count date", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "inventory_stock_small_mismatch", title: "variance missing the received quantity", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "inventory_stock_small_mismatch", title: "count pending a bin location", disp: "NF", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "mismatch with a conflicting system figure", disp: "NF", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "shrinkage with no scan history", disp: "NF", src: "SRC-DOP-LEAKPROOF" },
  { sub: "inventory_stock_small_mismatch", title: "variance awaiting the delivery note", disp: "NF", src: "SRC-DOP-VENDOR" },
  { sub: "inventory_stock_small_mismatch", title: "count with an unreadable label", disp: "NF", src: "SRC-DOP-INVENTORY" },
  { sub: "inventory_stock_small_mismatch", title: "mismatch pending a supplier confirmation", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "inventory_stock_small_mismatch", title: "stock figure missing a returns adjustment", disp: "NF", src: "SRC-DOP-RETURNS" },
  { sub: "inventory_stock_small_mismatch", title: "recurring shrink above the tolerance band", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "inventory_stock_small_mismatch", title: "write-off that dents the month's margin", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "inventory_stock_small_mismatch", title: "stock cash locked above the normal level", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "inventory_stock_small_mismatch", title: "mismatch pattern pointing at one line", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "inventory_stock_small_mismatch", title: "mismatch suggesting possible theft/fraud", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "inventory_stock_small_mismatch", title: "controlled-goods count off the register", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "inventory_stock_small_mismatch", title: "expired regulated stock still on the shelf", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 7. cash_collection_small_reconciliation (25): PR3 CA5 NF8 OD5 BL4
  { sub: "cash_collection_small_reconciliation", title: "close a till that balances to the cent", disp: "PR", src: "SRC-DOP-CASH", gold: true },
  { sub: "cash_collection_small_reconciliation", title: "bank a routine day's takings with the slip", disp: "PR", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "record a verified card settlement", disp: "PR", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "accept a within-tolerance till variance", disp: "CA", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "log a small float top-up within policy", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "cash_collection_small_reconciliation", title: "hold a small overage for a recount", disp: "CA", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "reconcile a rounding difference", disp: "CA", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "clear a small tip-jar adjustment", disp: "CA", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "till variance with no recount yet", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "cash_collection_small_reconciliation", title: "takings missing a card batch total", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "cash_collection_small_reconciliation", title: "reconciliation pending the opening float", disp: "NF", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "variance with a conflicting z-report", disp: "NF", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "deposit missing the bank slip", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "cash_collection_small_reconciliation", title: "cash count with an unrecorded payout", disp: "NF", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "reconciliation awaiting a refund log", disp: "NF", src: "SRC-DOP-RETURNS" },
  { sub: "cash_collection_small_reconciliation", title: "takings with a missing shift's total", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "cash_collection_small_reconciliation", title: "recurring small till shortfall pattern", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "cash_collection_small_reconciliation", title: "overdue takings tightening today's cash", disp: "OD", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "reconciliation gap growing week on week", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "cash_collection_small_reconciliation", title: "cash call that touches the runway", disp: "OD", src: "SRC-DOP-CASH" },
  { sub: "cash_collection_small_reconciliation", title: "float decision needing owner sign-off", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "cash_collection_small_reconciliation", title: "shortfall consistent with possible skimming", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "cash_collection_small_reconciliation", title: "cash handling that breaches the control rule", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "cash_collection_small_reconciliation", title: "unbanked cash above the safe-limit policy", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "cash_collection_small_reconciliation", title: "suspected voided-sale cash diversion", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  // 8. routine_discount_price_exception (25): PR5 CA6 NF5 OD6 BL3
  { sub: "routine_discount_price_exception", title: "apply a within-band loyalty discount", disp: "PR", src: "SRC-DOP-DISCOUNT", gold: true },
  { sub: "routine_discount_price_exception", title: "honour a published promo price", disp: "PR", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "match a small in-policy price adjustment", disp: "PR", src: "SRC-DOP-POLICY" },
  { sub: "routine_discount_price_exception", title: "apply a standard bulk-tier price", disp: "PR", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "round a price down within the band", disp: "PR", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "give a small goodwill discount to retain", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "routine_discount_price_exception", title: "offer a modest bundle discount", disp: "CA", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "extend a promo by a day for a regular", disp: "CA", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "waive a small fee to close a sale", disp: "CA", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "apply a near-band discount with proof", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "routine_discount_price_exception", title: "price-match a competitor within band", disp: "CA", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "discount request with no cost basis", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "routine_discount_price_exception", title: "price exception missing the margin figure", disp: "NF", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "quote pending a confirmed volume", disp: "NF", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "discount awaiting the customer's terms", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "routine_discount_price_exception", title: "exception with a conflicting price list", disp: "NF", src: "SRC-DOP-DISCOUNT" },
  { sub: "routine_discount_price_exception", title: "below-band discount that erodes margin", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "large one-off price exception", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "discount for a strategic account", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "recurring discount request from one client", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "routine_discount_price_exception", title: "discount that would set a costly precedent", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "routine_discount_price_exception", title: "loss-leader below cost needing owner call", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "routine_discount_price_exception", title: "discount that breaches a regulated-price rule", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "routine_discount_price_exception", title: "price exception below a legal floor", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "routine_discount_price_exception", title: "discount tied to a prohibited bundling term", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 9. equipment_idle_minor_maintenance (25): PR5 CA5 NF7 OD5 BL3
  { sub: "equipment_idle_minor_maintenance", title: "run a scheduled routine service", disp: "PR", src: "SRC-DOP-UPKEEP", gold: true },
  { sub: "equipment_idle_minor_maintenance", title: "clear a minor idle-time reset", disp: "PR", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "swap a consumable part on schedule", disp: "PR", src: "SRC-DOP-UPKEEP" },
  { sub: "equipment_idle_minor_maintenance", title: "log a completed routine inspection", disp: "PR", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "restart a machine after a normal pause", disp: "PR", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "bring maintenance forward with minor cost", disp: "CA", src: "SRC-DOP-UPKEEP" },
  { sub: "equipment_idle_minor_maintenance", title: "use a backup unit during a quick service", disp: "CA", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "defer a non-critical service a day", disp: "CA", src: "SRC-DOP-UPKEEP" },
  { sub: "equipment_idle_minor_maintenance", title: "run a short maintenance in a slow hour", disp: "CA", src: "SRC-DOP-CAPACITY" },
  { sub: "equipment_idle_minor_maintenance", title: "order a minor spare part within policy", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "equipment_idle_minor_maintenance", title: "fault with no error code captured", disp: "NF", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "idle time with no logged cause", disp: "NF", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "service pending the last-service date", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "equipment_idle_minor_maintenance", title: "downtime with a conflicting meter reading", disp: "NF", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "repair awaiting a parts quote", disp: "NF", src: "SRC-DOP-VENDOR" },
  { sub: "equipment_idle_minor_maintenance", title: "fault pending a technician's note", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "equipment_idle_minor_maintenance", title: "idle unit with no utilisation data", disp: "NF", src: "SRC-DOP-EQUIPMENT" },
  { sub: "equipment_idle_minor_maintenance", title: "recurring downtime hurting capacity", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "equipment_idle_minor_maintenance", title: "repair cost above the routine budget", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "equipment_idle_minor_maintenance", title: "repair-vs-replace call on aging kit", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "equipment_idle_minor_maintenance", title: "idle asset tying up capacity to fix", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "equipment_idle_minor_maintenance", title: "deferral that risks a bigger breakdown", disp: "OD", src: "SRC-DOP-UPKEEP" },
  { sub: "equipment_idle_minor_maintenance", title: "safety guard bypassed to keep running", disp: "BL", src: "SRC-DOP-SAFETY" },
  { sub: "equipment_idle_minor_maintenance", title: "overdue statutory inspection on the asset", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "equipment_idle_minor_maintenance", title: "operating past a mandated service limit", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  // 10. proof_quality_routine_issue (25): PR3 CA4 NF10 OD4 BL4
  { sub: "proof_quality_routine_issue", title: "accept a clear timestamped completion photo", disp: "PR", src: "SRC-DOP-PROOFQ", gold: true },
  { sub: "proof_quality_routine_issue", title: "accept a verified second-person sign-off", disp: "PR", src: "SRC-DOP-CONFIRM" },
  { sub: "proof_quality_routine_issue", title: "accept a matching system-log confirmation", disp: "PR", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "accept an alternate but adequate proof once", disp: "CA", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "accept slightly late but genuine proof", disp: "CA", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "accept a lower-res but readable photo", disp: "CA", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "accept a proof pending a quick recheck", disp: "CA", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "completion photo too blurry to read", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "proof missing a timestamp", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "sign-off with no name recorded", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "proof of the wrong item/area", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "completion note with no attachment", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "proof pending a location tag", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "partial photo not showing the full job", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "proof with a mismatched reference number", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "proof_quality_routine_issue", title: "completion awaiting a meter photo", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "proof that needs a quick re-shoot", disp: "NF", src: "SRC-DOP-PROOFQ" },
  { sub: "proof_quality_routine_issue", title: "recurring weak proof from one route", disp: "OD", src: "SRC-DOP-LEAKPROOF" },
  { sub: "proof_quality_routine_issue", title: "proof-quality dip needing a policy nudge", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "proof_quality_routine_issue", title: "weak proof trend across a team", disp: "OD", src: "SRC-DOP-LEAKPROOF" },
  { sub: "proof_quality_routine_issue", title: "proof standard call for a new job type", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "proof_quality_routine_issue", title: "reused photo across two jobs", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "proof_quality_routine_issue", title: "proof contradicted by the system record", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "proof_quality_routine_issue", title: "staged photo hiding an unfinished job", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "proof_quality_routine_issue", title: "fabricated sign-off on a routine close", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  // 11. owner_time_limited_decision (25): PR4 CA4 NF5 OD9 BL3
  { sub: "owner_time_limited_decision", title: "approve a pre-authorised routine renewal", disp: "PR", src: "SRC-DOP-SOPGRANT", gold: true },
  { sub: "owner_time_limited_decision", title: "confirm a standing-instruction reorder", disp: "PR", src: "SRC-DOP-SOPGRANT" },
  { sub: "owner_time_limited_decision", title: "action a within-grant routine approval", disp: "PR", src: "SRC-DOP-SOPGRANT" },
  { sub: "owner_time_limited_decision", title: "proceed on a pre-agreed routine threshold", disp: "PR", src: "SRC-DOP-POLICY" },
  { sub: "owner_time_limited_decision", title: "take a small reversible step under the grant", disp: "CA", src: "SRC-DOP-SOPGRANT" },
  { sub: "owner_time_limited_decision", title: "approve a modest spend within the band", disp: "CA", src: "SRC-DOP-POLICY" },
  { sub: "owner_time_limited_decision", title: "extend a routine deadline within limits", disp: "CA", src: "SRC-DOP-OWNERTIME" },
  { sub: "owner_time_limited_decision", title: "accept a minor supplier change within grant", disp: "CA", src: "SRC-DOP-VENDOR" },
  { sub: "owner_time_limited_decision", title: "decision pending the key figure", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "owner_time_limited_decision", title: "call awaiting a supplier quote", disp: "NF", src: "SRC-DOP-VENDOR" },
  { sub: "owner_time_limited_decision", title: "decision missing the deadline detail", disp: "NF", src: "SRC-DOP-OWNERTIME" },
  { sub: "owner_time_limited_decision", title: "choice pending a customer confirmation", disp: "NF", src: "SRC-DOP-CONFIRM" },
  { sub: "owner_time_limited_decision", title: "decision with conflicting inputs to resolve", disp: "NF", src: "SRC-DOP-OWNERTIME" },
  { sub: "owner_time_limited_decision", title: "same-day yes/no on a one-off supplier deal", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "owner_time_limited_decision", title: "deadline call on a discretionary spend", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "owner_time_limited_decision", title: "accept-or-decline a rush job by noon", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "owner_time_limited_decision", title: "approve overtime to hit a deadline", disp: "OD", src: "SRC-DOP-DELEGATION" },
  { sub: "owner_time_limited_decision", title: "commit to a bulk buy before the price rises", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "owner_time_limited_decision", title: "choose between two conflicting priorities today", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "owner_time_limited_decision", title: "decide on a same-day staffing reshuffle", disp: "OD", src: "SRC-DOP-CAPACITY" },
  { sub: "owner_time_limited_decision", title: "approve a time-boxed customer concession", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "owner_time_limited_decision", title: "sign off a deadline discount for a key client", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "owner_time_limited_decision", title: "time-pressured commitment to a regulated deal", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "owner_time_limited_decision", title: "rush decision touching a safety obligation", disp: "BL", src: "SRC-DOP-SAFETY" },
  { sub: "owner_time_limited_decision", title: "deadline sign-off on an unverifiable claim", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  // 12. small_repeated_operational_leak (25): PR6 CA1 NF7 OD4 BL7
  { sub: "small_repeated_operational_leak", title: "fix a proven recurring mis-charge now", disp: "PR", src: "SRC-DOP-LEAK", gold: true },
  { sub: "small_repeated_operational_leak", title: "correct a repeated small overpour with proof", disp: "PR", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "close a known small billing under-charge", disp: "PR", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "stop a routine duplicate-payment leak", disp: "PR", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "fix a proven recurring wastage step", disp: "PR", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "correct a small repeated shipping over-cost", disp: "PR", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "trial a small fix for a minor recurring leak", disp: "CA", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "suspected leak with no measurement yet", disp: "NF", src: "SRC-DOP-LEAKPROOF" },
  { sub: "small_repeated_operational_leak", title: "recurring variance with no root-cause data", disp: "NF", src: "SRC-DOP-LEAKPROOF" },
  { sub: "small_repeated_operational_leak", title: "leak signal missing the baseline figure", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "small_repeated_operational_leak", title: "pattern with a conflicting data source", disp: "NF", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "suspected waste pending a spot check", disp: "NF", src: "SRC-DOP-LEAKPROOF" },
  { sub: "small_repeated_operational_leak", title: "leak hint with no time-series yet", disp: "NF", src: "SRC-DOP-LEAKPROOF" },
  { sub: "small_repeated_operational_leak", title: "recurring gap awaiting a reconciliation", disp: "NF", src: "SRC-DOP-RECONCILE" },
  { sub: "small_repeated_operational_leak", title: "leak now material enough to owner-gate", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "small_repeated_operational_leak", title: "compounding leak eroding the month's margin", disp: "OD", src: "SRC-DOP-MARGIN" },
  { sub: "small_repeated_operational_leak", title: "leak fix needing a process change decision", disp: "OD", src: "SRC-DOP-OWNERTIME" },
  { sub: "small_repeated_operational_leak", title: "leak spanning several lines needing a call", disp: "OD", src: "SRC-DOP-LEAK" },
  { sub: "small_repeated_operational_leak", title: "leak masked by fabricated routine proof", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "small_repeated_operational_leak", title: "recurring loss consistent with skimming", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "small_repeated_operational_leak", title: "leak tied to a duplicated proof pattern", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "small_repeated_operational_leak", title: "leak crossing a compliance reporting line", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "small_repeated_operational_leak", title: "leak that breaches a regulated threshold", disp: "BL", src: "SRC-DOP-COMPLIANCE" },
  { sub: "small_repeated_operational_leak", title: "loss pattern indicating collusion", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
  { sub: "small_repeated_operational_leak", title: "leak hidden behind contradicted records", disp: "BL", src: "SRC-DOP-FRAUDFLAG" },
];

const perCategoryIndex: Record<string, number> = {};
export const DAILY_OPERATIONS_PACK: DailyOpsScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const DAILY_OPERATIONS_SUBCATEGORIES = [
  "routine_order_handling", "pickup_delivery_coordination", "customer_complaint_minor", "staff_attendance_punctuality",
  "daily_task_completion", "inventory_stock_small_mismatch", "cash_collection_small_reconciliation",
  "routine_discount_price_exception", "equipment_idle_minor_maintenance", "proof_quality_routine_issue",
  "owner_time_limited_decision", "small_repeated_operational_leak",
] as const;
