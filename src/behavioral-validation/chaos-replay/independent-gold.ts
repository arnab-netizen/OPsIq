/**
 * INDEPENDENT GOLD CASES — hand-authored expected outcomes to reduce the MEDIUM circularity risk of the
 * derived corpus. Unlike the corpus `goldSkeleton` (engineered so `arbitrate()` agrees), each case here is
 * a real-world business vignette whose expected dominant constraint / modules / do-not-do / safe action /
 * rationale were written from business reasoning FIRST. A test then runs the case through the real engine
 * and asserts the engine INDEPENDENTLY agrees — a disagreement is a real finding, not an auto-pass.
 *
 * Each case also carries a NEW, distinct, privacy-clean public source (defined here, validated by the same
 * `sourceRecordSchema` + PII/long-text gates), broadening source coverage beyond the corpus's 11 patterns.
 *
 * Pure fixture: no DB, no Date.now, no AI. The expectations are NOT copied from `arbitrate()` or runtime output.
 */
import type { BehavioralCase, BusinessArchetype, DecisionCategory } from "../schema";
import { SEED_CASES } from "../seed-cases";
import { LOCATIONS } from "../locations";
import { sourceRecordSchema, type SourceRecord } from "../public-cases/source-register";
import type { Constraint } from "../whole-business/arbitration";

const BASE = SEED_CASES[0];

// ─── 15 new public sources (real-world patterns; citation-based, privacy-clean) ────────────────────
export const INDEPENDENT_SOURCES: SourceRecord[] = [
  { id: "SRC-IND-GROWTH-ROUTE", type: "turnaround_story", title: "Independent laundry adds a pickup route once unit economics proven", citation: "SME growth playbook — staged route expansion", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "laundry", reliability: "medium", completeness: "medium", factsUsed: ["route expansion only after per-route contribution proven"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-OWNER-BOTTLENECK", type: "advice_forum", title: "Housekeeping owner is the bottleneck for every approval", citation: "owner advice forum pattern — delegate with proof", accessedDate: "2026-06-30", geography: "IN|metro_premium", businessCategory: "housekeeping", reliability: "medium", completeness: "low", factsUsed: ["owner personally approves all jobs; staff idle waiting"], factsInferred: ["delegation with proof controls relieves the bottleneck"], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-REST-COMPLAINTS", type: "review_complaint_pattern", title: "Restaurant complaint spike while owner wants to spend on ads", citation: "public review-complaint pattern — fix quality before acquisition", accessedDate: "2026-06-30", geography: "IN|tier1", businessCategory: "restaurant", reliability: "medium", completeness: "medium", factsUsed: ["rising complaints and rework", "owner wants to boost ad spend"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-RETAIL-WCTRAP", type: "finance_example", title: "Grocery revenue up but cash falling — working-capital trap", citation: "SME lending literature — AR/AP timing mismatch", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "retail_grocery", reliability: "high", completeness: "medium", factsUsed: ["sales growing, bank balance falling", "long customer terms, short supplier terms"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-PHARMA-LICENSE", type: "regulatory_summary", title: "Pharmacy considers a service in a licensing grey area", citation: "regulatory summary — obtain written professional review", accessedDate: "2026-06-30", geography: "IN|tier1", businessCategory: "pharmacy", reliability: "high", completeness: "medium", factsUsed: ["proposed service may need a licence not yet held"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "not_required", privacyRisk: "low" },
  { id: "SRC-IND-SALON-BELOWCOST", type: "sector_example", title: "Salon package priced below fully-loaded cost", citation: "sector pricing example — re-quote to viable margin", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "salon", reliability: "medium", completeness: "medium", factsUsed: ["package rate below fully-loaded cost per service"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-REPAIR-CAPACITY", type: "staffing_ops", title: "Repair shop demand exceeds reliable bench capacity", citation: "operations example — cap load to reliable throughput", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "repair", reliability: "medium", completeness: "medium", factsUsed: ["incoming jobs exceed reliable daily throughput"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-MFG-FAKEPROOF", type: "failure_postmortem", title: "Manufacturer paid on an unverifiable completion report", citation: "failure post-mortem — require independent verification", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "manufacturing", reliability: "high", completeness: "medium", factsUsed: ["completion report could not be independently verified"], factsInferred: ["unverifiable proof is no proof"], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-LOG-CASHSHOCK", type: "finance_example", title: "Logistics cash crisis after a fuel-cost shock", citation: "finance example — protect runway before commitments", accessedDate: "2026-06-30", geography: "IN|tier2", businessCategory: "logistics", reliability: "medium", completeness: "medium", factsUsed: ["fuel spike drained cash; payroll at risk"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-AGENCY-REMOTE", type: "advice_forum", title: "Agency owner approves every decision remotely", citation: "owner forum pattern — proof-based remote controls", accessedDate: "2026-06-30", geography: "IN|metro_premium", businessCategory: "agency", reliability: "medium", completeness: "low", factsUsed: ["remote owner re-checks every deliverable"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-ECOM-CYBER", type: "cyber_continuity", title: "E-commerce payment-fraud chargeback spike", citation: "cyber/payment example — verify before paying out", accessedDate: "2026-06-30", geography: "global|western", businessCategory: "ecommerce", reliability: "high", completeness: "medium", factsUsed: ["suspicious chargebacks; payout requests unverified"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-ELDER-COMPLIANCE", type: "regulatory_summary", title: "Eldercare staffing-ratio compliance exposure", citation: "regulatory summary — pause and get professional review", accessedDate: "2026-06-30", geography: "global|western", businessCategory: "eldercare", reliability: "high", completeness: "medium", factsUsed: ["staffing ratio may breach a care regulation"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "not_required", privacyRisk: "low" },
  { id: "SRC-IND-FRANCHISE-PRICE", type: "franchise_story", title: "Franchise brand price below local fully-loaded cost", citation: "franchise dispute pattern — escalate unit-economics gap", accessedDate: "2026-06-30", geography: "IN|tier3", businessCategory: "franchise", reliability: "medium", completeness: "medium", factsUsed: ["brand-fixed price below local loaded cost"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-MULTI-ATTENTION", type: "business_blog", title: "Multi-location owner attention stretched past controls", citation: "operations blog pattern — stabilise controls before adding sites", accessedDate: "2026-06-30", geography: "IN|tier1", businessCategory: "multi_location", reliability: "medium", completeness: "low", factsUsed: ["adding a site beyond what controls cover"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
  { id: "SRC-IND-B2B-TERMS", type: "finance_example", title: "B2B contract with back-loaded 60-day terms starves cash", citation: "B2B receivables example — negotiate faster terms or decline", accessedDate: "2026-06-30", geography: "IN|tier1", businessCategory: "b2b_contractor", reliability: "high", completeness: "medium", factsUsed: ["profitable-looking contract with 60-day terms", "cash already tight"], factsInferred: [], factsSyntheticallyVaried: [], anonymizationStatus: "no_personal_data", privacyRisk: "low" },
];

// ─── Independent gold case (hand-authored expectation) ─────────────────────────────────────────────
export interface IndependentGoldCase {
  id: string;
  businessCategory: string;
  goodBadUgly: "good" | "bad" | "ugly";
  sourceRef: string;
  chaosType: string;
  case: BehavioralCase;
  /** HAND-AUTHORED before replay — not copied from arbitrate()/runtime. */
  expected: {
    dominantConstraint: Constraint;
    modules: string[];
    doNotDo: string;
    safeNextAction: string;
    rationale: string;
    realWorldConsequenceIfWrong: string;
    /** Disposition the supervisor SHOULD reach when the case is backed by real data (DB path). */
    dbActionStatus: "blocked" | "owner_decision_required";
  };
}

interface Spec {
  cat: string; archetype: BusinessArchetype; businessType: string; locKey: keyof typeof LOCATIONS;
  decision: DecisionCategory; flags: Partial<BehavioralCase["flags"]>; numbers: Record<string, number>;
  goal: string; root: string; tempting: string; correct: string; messy: string[];
  gbu: "good" | "bad" | "ugly"; chaosType: string; src: string;
  expected: IndependentGoldCase["expected"];
}

function makeCase(s: Spec): BehavioralCase {
  return {
    ...BASE,
    id: `IGOLD-${s.cat}`,
    sourceSeedCaseId: BASE.sourceSeedCaseId,
    title: `Independent gold — ${s.cat}`,
    archetype: s.archetype,
    businessType: s.businessType,
    decisionCategory: s.decision,
    ownerGoal: s.goal,
    location: LOCATIONS[s.locKey],
    numbers: { ...s.numbers },
    messyFacts: s.messy,
    hiddenRootCause: s.root,
    temptingBadDecision: s.tempting,
    correctExpertDecision: s.correct,
    flags: { hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...s.flags },
  };
}

const SPECS: Spec[] = [
  { cat: "laundry", archetype: "laundry_dry_cleaning", businessType: "laundry_dry_cleaning", locKey: "tier2_india", decision: "marketing_opportunity_contract", flags: {}, numbers: { grossSalesNow: 320000, grossSalesPrev: 300000, cash: 90000 }, goal: "grow profitably", root: "healthy shop with a real, fragile route-expansion opportunity", tempting: "open three new routes at once before proving one", correct: "prove one route's contribution, then scale via a capped pilot", messy: ["margins healthy", "one route looks promising", "cash adequate but not unlimited"], gbu: "good", chaosType: "growth_scale_temptation", src: "SRC-IND-GROWTH-ROUTE",
    expected: { dominantConstraint: "profitable_growth", modules: ["Sales", "Pricing", "Finance"], doNotDo: "Do not open all routes before one route's unit economics are proven.", safeNextAction: "Run a capped, proof-gated pilot on the single best route.", rationale: "Unit economics look sound; growth is safe only via a proof-gated pilot.", realWorldConsequenceIfWrong: "Scaling unproven routes multiplies losses instead of profit.", dbActionStatus: "owner_decision_required" } },
  { cat: "housekeeping", archetype: "housekeeping_facility", businessType: "housekeeping_cleaning", locKey: "dense_urban_premium", decision: "remote_owner", flags: { ownerEmotional: true }, numbers: {}, goal: "stop being the bottleneck", root: "owner personally approves every job; nothing moves without them", tempting: "owner keeps approving every job personally", correct: "delegate with proof-based controls and exception review", messy: ["staff wait on owner sign-off", "owner exhausted"], gbu: "bad", chaosType: "owner_pressure_bad_idea", src: "SRC-IND-OWNER-BOTTLENECK",
    expected: { dominantConstraint: "owner_workload", modules: ["Owner workload", "Operations"], doNotDo: "Do not keep routing every routine approval through the owner.", safeNextAction: "Delegate routine approvals to a supervisor with a daily proof report.", rationale: "The owner is the binding bottleneck; proof-based delegation relieves it.", realWorldConsequenceIfWrong: "The owner stays a single point of failure and the business cannot scale.", dbActionStatus: "owner_decision_required" } },
  { cat: "restaurant", archetype: "food_restaurant_cloudkitchen", businessType: "restaurant_cafe_cloudkitchen", locKey: "kolkata", decision: "marketing_opportunity_contract", flags: {}, numbers: { adSpend: 60000 }, goal: "grow covers", root: "rising complaints and rework while owner wants to spend on ads", tempting: "spend on ads to fill more tables", correct: "fix the complaint root cause before acquisition", messy: ["complaints and rework rising", "owner wants to acquire more diners"], gbu: "bad", chaosType: "customer_reputation", src: "SRC-IND-REST-COMPLAINTS",
    expected: { dominantConstraint: "customer_quality", modules: ["Customer service", "Process control", "Reputation/social-media crisis"], doNotDo: "Do not spend on acquisition while complaints/quality are unresolved.", safeNextAction: "Fix the complaint root cause and prove the rework rate falls first.", rationale: "Acquiring onto a broken experience burns cash and reputation.", realWorldConsequenceIfWrong: "Spending on acquisition accelerates reputation loss and churn.", dbActionStatus: "owner_decision_required" } },
  { cat: "retail_grocery", archetype: "retail_pharmacy_grocery_apparel", businessType: "retail_grocery", locKey: "tier2_india", decision: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { grossSalesNow: 2100000, grossSalesPrev: 1800000, cash: 14000 }, goal: "understand the cash gap", root: "revenue grows but cash falls — working-capital timing trap", tempting: "borrow more to keep spending on growth", correct: "build a 13-week cash forecast and fix AR/AP timing", messy: ["sales up 18%", "bank balance falling monthly", "long customer terms"], gbu: "ugly", chaosType: "high_revenue_bad_business", src: "SRC-IND-RETAIL-WCTRAP",
    expected: { dominantConstraint: "cash_survival", modules: ["Finance", "B2B receivables/payment terms", "Working capital"], doNotDo: "Do not borrow to fund growth before the cash-conversion gap is fixed.", safeNextAction: "Build a 13-week cash forecast and recover overdue receivables.", rationale: "Growth is discount/credit-led; cash is trapped in receivables.", realWorldConsequenceIfWrong: "Missed payroll and insolvency despite rising revenue.", dbActionStatus: "owner_decision_required" } },
  { cat: "pharmacy", archetype: "retail_pharmacy_grocery_apparel", businessType: "pharmacy_health_retail", locKey: "kolkata", decision: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, goal: "add a new service", root: "proposed service sits in a licensing grey area", tempting: "launch the service before confirming the licence", correct: "pause and obtain a written professional compliance review", messy: ["new service may need a licence", "rules unclear locally"], gbu: "ugly", chaosType: "compliance_professional_boundary", src: "SRC-IND-PHARMA-LICENSE",
    expected: { dominantConstraint: "compliance_block", modules: ["Compliance review", "Risk management"], doNotDo: "Do not launch the service before a written professional compliance review.", safeNextAction: "Pause and obtain a written professional compliance/licensing review.", rationale: "A licensing breach can shut the pharmacy down — it outranks revenue.", realWorldConsequenceIfWrong: "Fines, licence loss, or forced shutdown.", dbActionStatus: "blocked" } },
  { cat: "salon", archetype: "health_care_fitness", businessType: "salon_spa_beauty", locKey: "tier2_india", decision: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 600, fullyLoadedCost: 780, paymentTermsDays: 0 }, goal: "fill quiet hours", root: "a discount package is priced below fully-loaded cost", tempting: "sell the package to fill chairs", correct: "re-price the package above loaded cost or drop it", messy: ["package popular but loss-making", "owner wants volume"], gbu: "ugly", chaosType: "high_revenue_bad_business", src: "SRC-IND-SALON-BELOWCOST",
    expected: { dominantConstraint: "below_margin", modules: ["Pricing", "Opportunity evaluation"], doNotDo: "Do not sell the package below fully-loaded cost — it loses money per booking.", safeNextAction: "Re-price the package above fully-loaded cost or discontinue it.", rationale: "Negative contribution means more volume loses more money.", realWorldConsequenceIfWrong: "Every booking deepens the loss as volume grows.", dbActionStatus: "owner_decision_required" } },
  { cat: "repair", archetype: "trades_repair_manufacturing", businessType: "repair_maintenance_services", locKey: "tier2_india", decision: "staff_process_equipment", flags: { capacityRisk: true }, numbers: { offeredKgPerDay: 40, reliableKgPerDay: 18 }, goal: "take more jobs", root: "incoming jobs exceed reliable bench throughput", tempting: "accept all jobs and promise fast turnaround", correct: "cap intake to reliable throughput and fix the bottleneck", messy: ["job queue growing", "turnaround slipping"], gbu: "bad", chaosType: "staff_workload", src: "SRC-IND-REPAIR-CAPACITY",
    expected: { dominantConstraint: "capacity_feasibility", modules: ["Operations", "Maintenance/downtime", "Quality control"], doNotDo: "Do not accept jobs beyond proven reliable throughput.", safeNextAction: "Cap intake to reliable capacity and relieve the bottleneck before promising more.", rationale: "Over-committing breaks turnaround and quality, destroying repeat demand.", realWorldConsequenceIfWrong: "Late, low-quality work loses the customer base.", dbActionStatus: "owner_decision_required" } },
  { cat: "manufacturing", archetype: "trades_repair_manufacturing", businessType: "small_manufacturing", locKey: "tier2_india", decision: "staff_process_equipment", flags: { hostile: true }, numbers: {}, goal: "pay the completion bonus", root: "a completion report cannot be independently verified", tempting: "pay the bonus on the supervisor's word", correct: "require independent verification before paying", messy: ["report numbers look off", "no third-party check"], gbu: "ugly", chaosType: "proof_fraud_completion", src: "SRC-IND-MFG-FAKEPROOF",
    expected: { dominantConstraint: "proof_fraud_block", modules: ["Proof/anti-gaming", "Quality control"], doNotDo: "Do not pay on an unverifiable completion report.", safeNextAction: "Require independent third-party verification before any payment.", rationale: "Unverifiable proof is no proof; paying it funds fraud.", realWorldConsequenceIfWrong: "Paying for fraud and corrupting every downstream decision.", dbActionStatus: "blocked" } },
  { cat: "logistics", archetype: "logistics_delivery_fleet", businessType: "logistics_delivery", locKey: "tier2_india", decision: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { cash: 12000, monthlyLoss: 0 }, goal: "survive the fuel spike", root: "a fuel-cost shock has drained cash", tempting: "keep running every route at a loss", correct: "protect cash, re-price or cut loss-making routes", messy: ["fuel up sharply", "payroll at risk"], gbu: "ugly", chaosType: "cash_profit", src: "SRC-IND-LOG-CASHSHOCK",
    expected: { dominantConstraint: "cash_survival", modules: ["Finance", "Risk management"], doNotDo: "Do not keep running loss-making routes during the cash shock.", safeNextAction: "Protect cash first: re-price or suspend loss-making routes and recover receivables.", rationale: "Running out of cash ends the business before anything else matters.", realWorldConsequenceIfWrong: "Missed payroll and insolvency.", dbActionStatus: "owner_decision_required" } },
  { cat: "agency", archetype: "professional_services_agency", businessType: "local_agency_professional_services", locKey: "dense_urban_premium", decision: "remote_owner", flags: { remoteOwner: true }, numbers: {}, goal: "keep quality remotely", root: "a remote owner re-checks every deliverable personally", tempting: "owner keeps personally re-checking everything", correct: "put proof-based remote controls in place", messy: ["owner is the approval queue", "delays mounting"], gbu: "bad", chaosType: "owner_pressure_bad_idea", src: "SRC-IND-AGENCY-REMOTE",
    expected: { dominantConstraint: "owner_workload", modules: ["Remote-owner management", "Owner workload"], doNotDo: "Do not rely on the owner personally re-checking every deliverable.", safeNextAction: "Install proof-based remote controls and delegate routine sign-off.", rationale: "A remote owner cannot personally supervise everything; proof controls scale.", realWorldConsequenceIfWrong: "Delivery delays and an owner single point of failure.", dbActionStatus: "owner_decision_required" } },
  { cat: "ecommerce", archetype: "digital_ecommerce_d2c_saas", businessType: "ecommerce_d2c", locKey: "global_online", decision: "staff_process_equipment", flags: { hostile: true }, numbers: {}, goal: "handle payout requests", root: "suspicious chargebacks and unverified payout requests", tempting: "approve the payouts to keep sellers happy", correct: "freeze and verify before any payout", messy: ["chargeback spike", "payout requests unverified"], gbu: "ugly", chaosType: "cyber_payment_data_loss", src: "SRC-IND-ECOM-CYBER",
    expected: { dominantConstraint: "proof_fraud_block", modules: ["Cybersecurity/data loss/payment fraud", "Proof/anti-gaming"], doNotDo: "Do not approve payouts on unverified requests during a chargeback spike.", safeNextAction: "Freeze payouts and require independent verification before releasing funds.", rationale: "Unverified payouts during a fraud spike fund the fraud directly.", realWorldConsequenceIfWrong: "Direct financial loss and liability from payment fraud.", dbActionStatus: "blocked" } },
  { cat: "eldercare", archetype: "health_care_fitness", businessType: "elderly_home_care", locKey: "uk", decision: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, goal: "take more clients", root: "staffing ratio may breach a care regulation", tempting: "take more clients at the current staffing ratio", correct: "pause and get a professional compliance review", messy: ["ratio near the legal limit", "demand rising"], gbu: "ugly", chaosType: "compliance_professional_boundary", src: "SRC-IND-ELDER-COMPLIANCE",
    expected: { dominantConstraint: "compliance_block", modules: ["Compliance review", "Business continuity/risk management"], doNotDo: "Do not take more clients before confirming the staffing ratio is compliant.", safeNextAction: "Pause intake and obtain a professional compliance review of the staffing ratio.", rationale: "A care-regulation breach risks licence and client safety.", realWorldConsequenceIfWrong: "Regulatory action, licence loss, and client harm.", dbActionStatus: "blocked" } },
  { cat: "franchise", archetype: "multi_location_franchise_portfolio", businessType: "franchise_outlet", locKey: "tier3_india", decision: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 12, fullyLoadedCost: 16, paymentTermsDays: 15 }, goal: "follow brand pricing", root: "brand-fixed price is below local fully-loaded cost", tempting: "follow the brand price at a loss", correct: "escalate the unit-economics gap to the brand", messy: ["brand price below local cost", "owner reluctant to push back"], gbu: "ugly", chaosType: "high_revenue_bad_business", src: "SRC-IND-FRANCHISE-PRICE",
    expected: { dominantConstraint: "below_margin", modules: ["Pricing", "Location/local-market awareness", "Multi-location/portfolio control"], doNotDo: "Do not follow brand pricing below local fully-loaded cost.", safeNextAction: "Escalate the unit-economics gap to the brand before selling at a loss.", rationale: "Selling below loaded cost loses money on every unit.", realWorldConsequenceIfWrong: "Per-unit losses that scale with volume.", dbActionStatus: "owner_decision_required" } },
  { cat: "multi_location", archetype: "multi_location_franchise_portfolio", businessType: "multi_location_portfolio", locKey: "kolkata", decision: "remote_owner", flags: { multiBranch: true, remoteOwner: true }, numbers: {}, goal: "add a site", root: "adding a site stretches owner attention past controls", tempting: "add the new location now", correct: "stabilise per-site controls before adding", messy: ["controls thin per site", "owner stretched"], gbu: "bad", chaosType: "owner_pressure_bad_idea", src: "SRC-IND-MULTI-ATTENTION",
    expected: { dominantConstraint: "owner_workload", modules: ["Multi-location/portfolio control", "Owner workload", "Remote-owner management"], doNotDo: "Do not add another location before per-site controls are proven.", safeNextAction: "Stabilise per-site proof controls before adding a location.", rationale: "Adding sites beyond controllable span makes the owner the bottleneck.", realWorldConsequenceIfWrong: "Quality and control collapse across sites.", dbActionStatus: "owner_decision_required" } },
  { cat: "b2b_contractor", archetype: "professional_services_agency", businessType: "b2b_contractor", locKey: "kolkata", decision: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { consideredRate: 25, fullyLoadedCost: 18, paymentTermsDays: 60, cash: 20000 }, goal: "win the contract", root: "a profitable-looking contract has 60-day terms that starve cash", tempting: "accept the back-loaded 60-day contract", correct: "negotiate faster terms or decline", messy: ["contract margin fine on paper", "60-day terms, cash tight"], gbu: "ugly", chaosType: "cash_profit", src: "SRC-IND-B2B-TERMS",
    expected: { dominantConstraint: "cash_survival", modules: ["Working capital", "Finance", "Contract/quote evaluation"], doNotDo: "Do not accept the back-loaded 60-day contract while cash is tight.", safeNextAction: "Negotiate faster payment terms or decline; protect runway first.", rationale: "Back-loaded terms starve cash even on a profitable-looking contract.", realWorldConsequenceIfWrong: "A profitable contract on paper triggers a cash-out insolvency.", dbActionStatus: "owner_decision_required" } },
];

export const INDEPENDENT_GOLD_CASES: IndependentGoldCase[] = SPECS.map((s) => ({
  id: `IGOLD-${s.cat}`,
  businessCategory: s.cat,
  goodBadUgly: s.gbu,
  sourceRef: s.src,
  chaosType: s.chaosType,
  case: makeCase(s),
  expected: s.expected,
}));

/** Validate the 15 new sources with the production schema + privacy gates (no production register change). */
export function validateIndependentSources(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of INDEPENDENT_SOURCES) {
    const parsed = sourceRecordSchema.safeParse(s);
    if (!parsed.success) errors.push(`${s.id}: ${parsed.error.issues[0]?.message}`);
    if (ids.has(s.id)) errors.push(`duplicate source id ${s.id}`);
    ids.add(s.id);
  }
  return { ok: errors.length === 0, errors };
}

/** Combined registry ids = production register + the independent sources (for source-rule validation). */
export const INDEPENDENT_SOURCE_IDS = new Set(INDEPENDENT_SOURCES.map((s) => s.id));
