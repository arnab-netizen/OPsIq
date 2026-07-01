/**
 * FINANCE / CASH / CAPITAL ALLOCATION PACK — 120 counted, source-backed scenarios proving OpsIQ protects cash,
 * margin, payroll, debt obligations, and capital allocation: cash-critical calls are owner-gated (never
 * auto-proceed), missing critical financial data blocks the decision (need_more_data), debt/financing/tax/legal/
 * compliance issues block or professional-gate, and only routine within-threshold financial actions with verified
 * data + an owner/SOP grant proceed. Does NOT give final investment/tax/legal/financing/accounting advice; no live
 * profit claim.
 *
 * Each of the 120 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
 * `seed` plan so the existing DB path resolves the intended disposition. Pure data + a pure expander over the
 * merged `business-reality-scenario` contract. No new engine, no schema change.
 */
import { businessRealityScenarioSchema, type BusinessRealityScenario, type KnownToUnknownTag } from "./business-reality-scenario";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";
import type { Constraint } from "../../behavioral-validation/whole-business/arbitration";
import { FINANCE_CASH_SOURCE_BY_ID } from "./finance-cash-sources";

export interface FinanceScenario extends BusinessRealityScenario { seed: ScenarioSeedPlan }

/** Disposition codes: PR proceed, CA cautious, NF need-data, OC owner(cash), OM owner(margin), OD owner(capex/alloc),
 *  BC blocked(compliance/professional), BF blocked(financial fraud). */
type Disp = "PR" | "CA" | "NF" | "OC" | "OM" | "OD" | "BC" | "BF";

type ProofRisk = BusinessRealityScenario["expectedProofRiskState"];

interface DispSpec {
  status: BusinessRealityScenario["expectedActionStatus"];
  dominant: Constraint;
  seed: ScenarioSeedPlan;
  boundary: BusinessRealityScenario["expectedBoundaryState"];
  inputQuality: BusinessRealityScenario["expectedInputQualityState"];
  proofRisk: ProofRisk;
  gbu: "good" | "bad" | "ugly";
  severity: string;
  highRisk: boolean;
  professionalReviewRequired: boolean;
  antiGamingRisk: "none" | "low" | "medium" | "high";
  ownerWorkloadRisk: "low" | "medium" | "high";
}

const DISP: Record<Disp, DispSpec> = {
  PR: { status: "proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "low" }, boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
  CA: { status: "cautious_proceed", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "good", sopRiskClass: "medium" }, boundary: "safe_operational", inputQuality: "sufficient", proofRisk: "verified", gbu: "good", severity: "low", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
  NF: { status: "need_more_data", dominant: "profitable_growth", seed: { dominant: "profitable_growth", goodBadUgly: "bad", stripCriticalData: true }, boundary: "needs_external_verification", inputQuality: "critical_missing", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "low" },
  OC: { status: "owner_decision_required", dominant: "cash_survival", seed: { dominant: "cash_survival", goodBadUgly: "ugly" }, boundary: "owner_approval_required", inputQuality: "owner_estimate_only", proofRisk: "weak", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "high" },
  OM: { status: "owner_decision_required", dominant: "below_margin", seed: { dominant: "below_margin", goodBadUgly: "bad" }, boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  OD: { status: "owner_decision_required", dominant: "capacity_feasibility", seed: { dominant: "capacity_feasibility", goodBadUgly: "bad" }, boundary: "owner_approval_required", inputQuality: "data_limited", proofRisk: "weak", gbu: "bad", severity: "medium", highRisk: false, professionalReviewRequired: false, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  BC: { status: "blocked", dominant: "compliance_block", seed: { dominant: "compliance_block", goodBadUgly: "ugly" }, boundary: "professional_review_required", inputQuality: "data_limited", proofRisk: "unverified", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: true, antiGamingRisk: "none", ownerWorkloadRisk: "medium" },
  BF: { status: "blocked", dominant: "proof_fraud_block", seed: { dominant: "proof_fraud_block", goodBadUgly: "ugly" }, boundary: "blocked_until_review", inputQuality: "conflicting", proofRisk: "staged", gbu: "ugly", severity: "high", highRisk: true, professionalReviewRequired: false, antiGamingRisk: "high", ownerWorkloadRisk: "medium" },
};

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence", "missingData", "cashImpact", "ownerWorkload"];
const MOBILE_FIELDS = ["mainIssue", "actionStatus", "confidence", "proofNeeded", "reassessment", "cashImpact"];

const MODULES: Record<Constraint, string[]> = {
  compliance_block: ["Compliance review", "Finance"], proof_fraud_block: ["Proof/anti-gaming", "Finance"],
  cash_survival: ["Finance", "Cash/runway"], below_margin: ["Pricing", "Finance"],
  capacity_feasibility: ["Capital allocation", "Finance"], customer_quality: ["Customer", "Finance"],
  owner_workload: ["Owner workload", "Finance"], profitable_growth: ["Finance", "Capital allocation"],
  efficiency_scaling: ["Finance"], optimization: ["Finance"],
};

interface Vignette { sub: string; title: string; disp: Disp; src: string; gold?: boolean }

function expand(v: Vignette, index: number): FinanceScenario {
  const d = DISP[v.disp];
  const doNow = d.status === "proceed" ? `Make the routine within-threshold financial action for "${v.title}" and record the figures.`
    : d.status === "cautious_proceed" ? `Take the small reversible financial step for "${v.title}" under the SOP grant, with the figures on file.`
    : d.status === "need_more_data" ? `Get the missing financial figure (cash/margin/runway) for "${v.title}" before deciding.`
    : d.status === "owner_decision_required" ? `Prepare the cash/margin impact of "${v.title}" for the owner to decide — do not auto-commit funds.`
    : `Do not proceed on "${v.title}"; hold for professional/owner review (financing/tax/legal/compliance or fraud).`;
  const doNotDo = d.status === "blocked" ? [`Do not commit funds on "${v.title}" before professional/owner review clears it.`]
    : d.status === "owner_decision_required" ? [`Do not auto-commit cash on "${v.title}"; it is the owner's call and must not be hidden.`]
    : d.status === "need_more_data" ? [`Do not decide "${v.title}" without the cash/margin figures.`]
    : [`Do not over-escalate the routine within-threshold action "${v.title}".`];
  const proofRequired = d.status === "blocked" ? ["professional/owner review of the financial obligation"]
    : d.status === "owner_decision_required" ? ["the cash/margin/runway figures the owner needs to decide"]
    : d.status === "need_more_data" ? ["the specific missing financial figure"]
    : ["the verified figures for this within-threshold action"];
  const scenario = {
    scenarioId: `FIN-${v.sub}-${String(index).padStart(3, "0")}`,
    scenarioPack: "FINANCE_CASH_CAPITAL_ALLOCATION",
    category: v.sub,
    severity: d.severity,
    goodBadUgly: d.gbu,
    knownToUnknownTag: (d.status === "proceed" || d.status === "cautious_proceed" ? "known" : "known_unknown") as KnownToUnknownTag,
    sourceRefs: [v.src],
    sourceLimitations: [FINANCE_CASH_SOURCE_BY_ID[v.src]?.title ?? "composite finance source", "composite/sector finance pattern — not a specific live case; not final financial advice"],
    independentGold: v.gold === true,
    businessArchetype: v.sub,
    expectedModules: MODULES[d.dominant],
    expectedDominantConstraint: d.dominant,
    expectedActionStatus: d.status,
    expectedOwnerDecision: d.status === "owner_decision_required" ? `Owner must decide on the financial matter: ${v.title}.` : "",
    expectedDelegation: d.status === "blocked" ? "" : "OpsIQ + staff can prepare the figures with proof (fund commitment stays with the owner).",
    expectedDoNow: doNow,
    expectedDoNotDo: doNotDo,
    expectedProofRequired: proofRequired,
    expectedReassessment: ["reassess once the missing figure / owner decision / professional review is in"],
    expectedInputQualityState: d.inputQuality,
    expectedBoundaryState: d.boundary,
    expectedNoveltyState: "known",
    expectedProofRiskState: d.proofRisk,
    expectedManipulationRiskState: v.disp === "BF" ? "confirmed_pattern" : "none",
    expectedProfitCashWorkloadImpact: d.dominant === "cash_survival" ? ["cash"] : d.dominant === "below_margin" ? ["profit"] : ["cash", "profit"],
    expectedOutcomeMetric: "the financial metric behind this decision (runway days, margin %, cash balance, or payback) — expected only, not proven actual",
    expectedDashboardFields: DASHBOARD_FIELDS,
    expectedMobileFields: MOBILE_FIELDS,
    badOutcomeIfFollowed: `Committing funds on "${v.title}" without owner-gate / figures / professional review risks payroll, runway, or a compliance breach.`,
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

// ── 120 distinct authored vignettes: 12 subcategories × 10. Cash-critical never proceeds (owner-gated); missing
//    figures block; debt/tax/legal/financing/compliance block or professional-gate; only routine within-threshold
//    actions with verified figures + owner/SOP grant proceed. ──
const VIGNETTES: Vignette[] = [
  // 1. cash_runway_pressure (10): NF3 OC5 BC1 CA1
  { sub: "cash_runway_pressure", title: "runway under 30 days with a large outflow due", disp: "OC", src: "SRC-FIN-RUNWAY", gold: true },
  { sub: "cash_runway_pressure", title: "cash dip forcing a spend-freeze decision", disp: "OC", src: "SRC-FIN-RUNWAY" },
  { sub: "cash_runway_pressure", title: "runway call needing the current cash balance", disp: "NF", src: "SRC-FIN-RUNWAY" },
  { sub: "cash_runway_pressure", title: "runway estimate missing this month's outflows", disp: "NF", src: "SRC-FIN-TIMING" },
  { sub: "cash_runway_pressure", title: "cash-flow timing mismatch this week", disp: "OC", src: "SRC-FIN-TIMING" },
  { sub: "cash_runway_pressure", title: "should we draw on the buffer to bridge the gap", disp: "OC", src: "SRC-FIN-RESERVE" },
  { sub: "cash_runway_pressure", title: "runway projection with conflicting bank figures", disp: "NF", src: "SRC-FIN-RUNWAY" },
  { sub: "cash_runway_pressure", title: "delay a discretionary spend to extend runway", disp: "OC", src: "SRC-FIN-RUNWAY" },
  { sub: "cash_runway_pressure", title: "cash move that would risk a legal obligation", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "cash_runway_pressure", title: "defer a small non-critical cost within policy", disp: "CA", src: "SRC-FIN-ROUTINE" },
  // 2. payroll_staff_payment_pressure (10): NF2 OC5 BC2 CA1
  { sub: "payroll_staff_payment_pressure", title: "payroll due but cash is tight this cycle", disp: "OC", src: "SRC-FIN-PAYROLL", gold: true },
  { sub: "payroll_staff_payment_pressure", title: "choose between payroll and a supplier this week", disp: "OC", src: "SRC-FIN-PAYROLL" },
  { sub: "payroll_staff_payment_pressure", title: "partial payroll vs full payroll decision", disp: "OC", src: "SRC-FIN-PAYROLL" },
  { sub: "payroll_staff_payment_pressure", title: "payroll shortfall needing the exact wage total", disp: "NF", src: "SRC-FIN-PAYROLL" },
  { sub: "payroll_staff_payment_pressure", title: "payroll run missing this cycle's hours", disp: "NF", src: "SRC-FIN-TIMING" },
  { sub: "payroll_staff_payment_pressure", title: "delay payroll to preserve cash — owner call", disp: "OC", src: "SRC-FIN-PAYROLL" },
  { sub: "payroll_staff_payment_pressure", title: "bonus payout while cash is under pressure", disp: "OC", src: "SRC-FIN-RUNWAY" },
  { sub: "payroll_staff_payment_pressure", title: "delaying payroll that would breach wage law", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "payroll_staff_payment_pressure", title: "payroll tax remittance near a filing deadline", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "payroll_staff_payment_pressure", title: "approve a small pre-agreed reimbursement", disp: "CA", src: "SRC-FIN-ROUTINE" },
  // 3. vendor_payment_prioritization (10): NF3 OD4 CA2 PR1
  { sub: "vendor_payment_prioritization", title: "sequence three payables under tight cash", disp: "OD", src: "SRC-FIN-VENDORPAY", gold: true },
  { sub: "vendor_payment_prioritization", title: "pay a critical supplier vs two minor ones", disp: "OD", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "supplier demands an advance to keep supplying", disp: "OD", src: "SRC-FIN-ADVANCE" },
  { sub: "vendor_payment_prioritization", title: "early-pay discount vs holding cash", disp: "OD", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "payables list missing the due dates", disp: "NF", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "vendor payment missing the invoice amount", disp: "NF", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "prioritisation pending the cash balance", disp: "NF", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "hold a non-critical payable a few days within terms", disp: "CA", src: "SRC-FIN-VENDORPAY" },
  { sub: "vendor_payment_prioritization", title: "stagger a payment inside the agreed terms", disp: "CA", src: "SRC-FIN-ROUTINE" },
  { sub: "vendor_payment_prioritization", title: "pay a small approved invoice on schedule", disp: "PR", src: "SRC-FIN-ROUTINE" },
  // 4. delayed_receivables_b2b_credit_risk (10): NF4 OM3 BC1 CA2
  { sub: "delayed_receivables_b2b_credit_risk", title: "extend credit to a slow-paying B2B customer", disp: "OM", src: "SRC-FIN-RECEIVABLES", gold: true },
  { sub: "delayed_receivables_b2b_credit_risk", title: "one customer is most of the overdue receivables", disp: "OM", src: "SRC-FIN-CONCENTRATION" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "write off a long-overdue small debt", disp: "OM", src: "SRC-FIN-WRITEOFF" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "credit request missing the payment history", disp: "NF", src: "SRC-FIN-RECEIVABLES" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "receivable aging missing the amounts", disp: "NF", src: "SRC-FIN-RECEIVABLES" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "credit call pending the customer's terms", disp: "NF", src: "SRC-FIN-RECEIVABLES" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "overdue account with conflicting statements", disp: "NF", src: "SRC-FIN-RECEIVABLES" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "collections step that risks a legal dispute", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "send a routine in-policy payment reminder", disp: "CA", src: "SRC-FIN-ROUTINE" },
  { sub: "delayed_receivables_b2b_credit_risk", title: "apply an agreed installment plan within policy", disp: "CA", src: "SRC-FIN-RECEIVABLES" },
  // 5. discount_vs_margin_decision (10): NF3 OM3 CA3 PR1
  { sub: "discount_vs_margin_decision", title: "deep discount that would cut into margin", disp: "OM", src: "SRC-FIN-DISCOUNT", gold: true },
  { sub: "discount_vs_margin_decision", title: "match a competitor price below our margin floor", disp: "OM", src: "SRC-FIN-MARGINLEAK" },
  { sub: "discount_vs_margin_decision", title: "volume discount for a large but thin-margin order", disp: "OM", src: "SRC-FIN-UNDERPRICED" },
  { sub: "discount_vs_margin_decision", title: "discount request missing the cost basis", disp: "NF", src: "SRC-FIN-DISCOUNT" },
  { sub: "discount_vs_margin_decision", title: "offer pending the current margin figure", disp: "NF", src: "SRC-FIN-DISCOUNT" },
  { sub: "discount_vs_margin_decision", title: "discount with a conflicting price list", disp: "NF", src: "SRC-FIN-DISCOUNT" },
  { sub: "discount_vs_margin_decision", title: "small within-band loyalty discount", disp: "CA", src: "SRC-FIN-DISCOUNT" },
  { sub: "discount_vs_margin_decision", title: "modest bundle discount inside margin policy", disp: "CA", src: "SRC-FIN-DISCOUNT" },
  { sub: "discount_vs_margin_decision", title: "seasonal promo priced within the margin band", disp: "CA", src: "SRC-FIN-ROUTINE" },
  { sub: "discount_vs_margin_decision", title: "apply a pre-approved standard tier discount", disp: "PR", src: "SRC-FIN-ROUTINE" },
  // 6. capex_equipment_purchase (10): NF4 OD4 BC1 CA1
  { sub: "capex_equipment_purchase", title: "buy a new machine that needs an ROI review", disp: "OD", src: "SRC-FIN-CAPEX", gold: true },
  { sub: "capex_equipment_purchase", title: "capex vs marketing spend allocation", disp: "OD", src: "SRC-FIN-ROI" },
  { sub: "capex_equipment_purchase", title: "equipment upgrade straining the runway", disp: "OD", src: "SRC-FIN-CAPEX" },
  { sub: "capex_equipment_purchase", title: "emergency repair vs reserve preservation", disp: "OD", src: "SRC-FIN-RESERVE" },
  { sub: "capex_equipment_purchase", title: "capex missing the payback estimate", disp: "NF", src: "SRC-FIN-CAPEX" },
  { sub: "capex_equipment_purchase", title: "purchase pending the maintenance/running cost", disp: "NF", src: "SRC-FIN-CAPEX" },
  { sub: "capex_equipment_purchase", title: "capex missing the capacity/utilisation data", disp: "NF", src: "SRC-FIN-CAPEX" },
  { sub: "capex_equipment_purchase", title: "equipment quote with a conflicting spec/price", disp: "NF", src: "SRC-FIN-CAPEX" },
  { sub: "capex_equipment_purchase", title: "financed purchase needing a financing review", disp: "BC", src: "SRC-FIN-DEBT" },
  { sub: "capex_equipment_purchase", title: "buy a small within-budget consumable tool", disp: "CA", src: "SRC-FIN-ROUTINE" },
  // 7. debt_emi_financing_pressure (10): NF2 OD3 BC4 CA1
  { sub: "debt_emi_financing_pressure", title: "take a new loan to cover a cash gap", disp: "BC", src: "SRC-FIN-DEBT", gold: true },
  { sub: "debt_emi_financing_pressure", title: "restructure/refinance an existing loan", disp: "BC", src: "SRC-FIN-REFINANCE" },
  { sub: "debt_emi_financing_pressure", title: "skip an EMI to preserve cash this month", disp: "BC", src: "SRC-FIN-DEBT" },
  { sub: "debt_emi_financing_pressure", title: "partner/family cash injection with terms", disp: "BC", src: "SRC-FIN-INJECTION" },
  { sub: "debt_emi_financing_pressure", title: "EMI due while cash is tight — owner call", disp: "OD", src: "SRC-FIN-DEBT" },
  { sub: "debt_emi_financing_pressure", title: "prepay debt vs keep the cash buffer", disp: "OD", src: "SRC-FIN-RESERVE" },
  { sub: "debt_emi_financing_pressure", title: "take a supplier-financing offer — owner call", disp: "OD", src: "SRC-FIN-ADVANCE" },
  { sub: "debt_emi_financing_pressure", title: "financing decision missing the interest terms", disp: "NF", src: "SRC-FIN-DEBT" },
  { sub: "debt_emi_financing_pressure", title: "EMI plan missing the outstanding balance", disp: "NF", src: "SRC-FIN-DEBT" },
  { sub: "debt_emi_financing_pressure", title: "make a scheduled EMI already in the plan", disp: "CA", src: "SRC-FIN-ROUTINE" },
  // 8. emergency_reserve_buffer_decision (10): NF3 OC4 CA2 PR1
  { sub: "emergency_reserve_buffer_decision", title: "dip into the emergency reserve for an outflow", disp: "OC", src: "SRC-FIN-RESERVE", gold: true },
  { sub: "emergency_reserve_buffer_decision", title: "rebuild the buffer after a shock", disp: "OC", src: "SRC-FIN-RESERVE" },
  { sub: "emergency_reserve_buffer_decision", title: "seasonal reserve draw-down decision", disp: "OC", src: "SRC-FIN-SEASONAL" },
  { sub: "emergency_reserve_buffer_decision", title: "use reserve for an emergency repair", disp: "OC", src: "SRC-FIN-RESERVE" },
  { sub: "emergency_reserve_buffer_decision", title: "reserve target missing the monthly burn rate", disp: "NF", src: "SRC-FIN-RESERVE" },
  { sub: "emergency_reserve_buffer_decision", title: "buffer call pending the season's forecast", disp: "NF", src: "SRC-FIN-SEASONAL" },
  { sub: "emergency_reserve_buffer_decision", title: "reserve figure with a conflicting balance", disp: "NF", src: "SRC-FIN-RESERVE" },
  { sub: "emergency_reserve_buffer_decision", title: "top up the buffer with a small routine transfer", disp: "CA", src: "SRC-FIN-RESERVE" },
  { sub: "emergency_reserve_buffer_decision", title: "set aside a within-policy weekly reserve amount", disp: "CA", src: "SRC-FIN-ALLOCATION" },
  { sub: "emergency_reserve_buffer_decision", title: "move a small pre-agreed amount to reserve", disp: "PR", src: "SRC-FIN-ROUTINE" },
  // 9. owner_draw_cash_extraction (10): NF2 OC4 BC2 CA2
  { sub: "owner_draw_cash_extraction", title: "large owner draw while obligations are due", disp: "OC", src: "SRC-FIN-OWNERDRAW", gold: true },
  { sub: "owner_draw_cash_extraction", title: "owner draw that would dip below the safe balance", disp: "OC", src: "SRC-FIN-OWNERDRAW" },
  { sub: "owner_draw_cash_extraction", title: "owner wants to extract profit early this month", disp: "OC", src: "SRC-FIN-OWNERDRAW" },
  { sub: "owner_draw_cash_extraction", title: "draw decision competing with payroll", disp: "OC", src: "SRC-FIN-PAYROLL" },
  { sub: "owner_draw_cash_extraction", title: "draw request missing the obligations list", disp: "NF", src: "SRC-FIN-OWNERDRAW" },
  { sub: "owner_draw_cash_extraction", title: "extraction pending the safe-balance figure", disp: "NF", src: "SRC-FIN-OWNERDRAW" },
  { sub: "owner_draw_cash_extraction", title: "owner spending business cash on personal items", disp: "BC", src: "SRC-FIN-MIXING" },
  { sub: "owner_draw_cash_extraction", title: "commingling personal and business accounts", disp: "BC", src: "SRC-FIN-MIXING" },
  { sub: "owner_draw_cash_extraction", title: "take a small within-policy scheduled draw", disp: "CA", src: "SRC-FIN-ALLOCATION" },
  { sub: "owner_draw_cash_extraction", title: "draw a pre-agreed amount after reserves are met", disp: "CA", src: "SRC-FIN-ROUTINE" },
  // 10. pricing_margin_leakage (10): NF4 OM3 CA2 PR1
  { sub: "pricing_margin_leakage", title: "a high-volume customer priced below margin", disp: "OM", src: "SRC-FIN-UNDERPRICED", gold: true },
  { sub: "pricing_margin_leakage", title: "silent margin erosion across a product line", disp: "OM", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "fees not passed through, leaking margin", disp: "OM", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "margin review missing the true cost of goods", disp: "NF", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "leakage signal missing the per-line margins", disp: "NF", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "pricing call pending the delivery-cost figure", disp: "NF", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "margin figure conflicts across two reports", disp: "NF", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "apply a small proven price correction in policy", disp: "CA", src: "SRC-FIN-MARGINLEAK" },
  { sub: "pricing_margin_leakage", title: "restore a within-band price after a proven leak", disp: "CA", src: "SRC-FIN-ROUTINE" },
  { sub: "pricing_margin_leakage", title: "apply the standard published price with proof", disp: "PR", src: "SRC-FIN-ROUTINE" },
  // 11. tax_compliance_professional_boundary_finance (10): NF2 BC6 OD2
  { sub: "tax_compliance_professional_boundary_finance", title: "GST/tax filing treatment uncertainty", disp: "BC", src: "SRC-FIN-TAXBOUND", gold: true },
  { sub: "tax_compliance_professional_boundary_finance", title: "how to categorise an expense for tax", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "a tax-saving scheme of unclear legality", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "a disputed tax invoice needing an accountant", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "statutory remittance near its deadline", disp: "BC", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "commingling that raises a compliance flag", disp: "BC", src: "SRC-FIN-MIXING" },
  { sub: "tax_compliance_professional_boundary_finance", title: "tax question missing the filing records", disp: "NF", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "compliance query missing the transaction detail", disp: "NF", src: "SRC-FIN-TAXBOUND" },
  { sub: "tax_compliance_professional_boundary_finance", title: "timing of a large deductible spend — owner call", disp: "OD", src: "SRC-FIN-ROI" },
  { sub: "tax_compliance_professional_boundary_finance", title: "provision for an estimated tax liability — owner call", disp: "OD", src: "SRC-FIN-RESERVE" },
  // 12. profit_first_allocation_rule_decision (10): NF2 OD2 CA3 PR3
  { sub: "profit_first_allocation_rule_decision", title: "set the profit/tax/operating allocation split", disp: "OD", src: "SRC-FIN-ALLOCATION", gold: true },
  { sub: "profit_first_allocation_rule_decision", title: "change the allocation percentages materially", disp: "OD", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "allocation call missing this period's revenue", disp: "NF", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "split pending the confirmed profit figure", disp: "NF", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "make a small within-rule allocation transfer", disp: "CA", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "route a normal week's revenue by the rule", disp: "CA", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "top up the tax bucket per the standing rule", disp: "CA", src: "SRC-FIN-ROUTINE" },
  { sub: "profit_first_allocation_rule_decision", title: "apply the pre-agreed profit-first split with proof", disp: "PR", src: "SRC-FIN-ALLOCATION" },
  { sub: "profit_first_allocation_rule_decision", title: "move the routine operating allocation on schedule", disp: "PR", src: "SRC-FIN-ROUTINE" },
  { sub: "profit_first_allocation_rule_decision", title: "sweep a small surplus to the profit bucket by rule", disp: "PR", src: "SRC-FIN-ALLOCATION" },
];

const perCategoryIndex: Record<string, number> = {};
export const FINANCE_CASH_PACK: FinanceScenario[] = VIGNETTES.map((v) => {
  const n = (perCategoryIndex[v.sub] = (perCategoryIndex[v.sub] ?? 0) + 1);
  return expand(v, n);
});

export const FINANCE_CASH_SUBCATEGORIES = [
  "cash_runway_pressure", "payroll_staff_payment_pressure", "vendor_payment_prioritization",
  "delayed_receivables_b2b_credit_risk", "discount_vs_margin_decision", "capex_equipment_purchase",
  "debt_emi_financing_pressure", "emergency_reserve_buffer_decision", "owner_draw_cash_extraction",
  "pricing_margin_leakage", "tax_compliance_professional_boundary_finance", "profit_first_allocation_rule_decision",
] as const;
