/**
 * Slice 2 — dedicated vendor/supplier and delivery/logistics case coverage.
 *
 * The seed corpus barely exercised these two domains. This generates ≥25 vendor and ≥25 delivery
 * cases spanning the required scenarios (price/quality/terms/reliability/lock-in/collusion/dead-stock
 * for vendor; failed-delivery/RTO/route/fuel/incentive-gaming/proof for delivery) with adversarial,
 * location-sensitive, cash/working-capital and multi-location/remote subsets, so the domain matrix
 * can score them honestly.
 */
import { LOCATIONS, type LocationKey } from "../locations";
import { SEED_CASES } from "../seed-cases";
import type { BehavioralCase, CaseFlags, DecisionCategory } from "../schema";

const BASE = SEED_CASES[0];

interface Recipe {
  key: string;
  businessType: string;
  decisionCategory: DecisionCategory;
  flags: Partial<CaseFlags>;
  numbers: Record<string, number>;
  facts: string[];
  root: string;
  locationKey: LocationKey;
}

function fullFlags(p: Partial<CaseFlags>): CaseFlags {
  return { hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p };
}

function mk(prefix: string, r: Recipe, i: number): BehavioralCase {
  return {
    ...BASE,
    id: `${prefix}_${r.key}_${i}`,
    sourceSeedCaseId: BASE.sourceSeedCaseId,
    title: `${r.businessType} — ${r.key.replace(/_/g, " ")} (${LOCATIONS[r.locationKey].cityRegion})`,
    businessType: r.businessType,
    decisionCategory: r.decisionCategory,
    location: LOCATIONS[r.locationKey],
    ownerGoal: `Decide on the ${r.key.replace(/_/g, " ")} situation without hurting cash, quality or compliance`,
    numbers: { ...r.numbers },
    messyFacts: r.facts,
    hiddenRootCause: r.root,
    flags: fullFlags(r.flags),
  };
}

// ─── Vendor / supplier (≥25) ─────────────────────────────────────────────────────────────────────
const VENDOR_RECIPES: Recipe[] = [
  { key: "supplier_price_increase", businessType: "Retail grocery with key supplier", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { priceIncreasePct: 18, cash: 40000 }, facts: ["Main supplier raised prices 18%", "Owner wants to switch to a cheaper supplier immediately"], root: "supplier price increase squeezes margin; switching on price alone risks quality/reliability", locationKey: "kolkata" },
  { key: "supplier_quality_drop", businessType: "Cloud kitchen with food supplier", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, facts: ["Supplier quality dropped causing rework and complaints", "Owner considers staying for the low price"], root: "supplier quality drop drives rework and customer complaints", locationKey: "tier2_india" },
  { key: "supplier_payment_term_change", businessType: "Apparel store with vendor", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { paymentTermsDays: 7, cash: 25000 }, facts: ["Supplier cut credit from 30 days to 7 days", "Cash is tight this month"], root: "supplier payment-term change starves working capital", locationKey: "tier3_india" },
  { key: "unreliable_delivery", businessType: "Restaurant with ingredient supplier", decisionCategory: "staff_process_equipment", flags: {}, numbers: {}, facts: ["Supplier delivery is unreliable, causing stockouts", "A cheaper but unproven vendor is available"], root: "unreliable supplier delivery threatens SLA and customer experience", locationKey: "singapore" },
  { key: "vendor_lock_in", businessType: "Manufacturer with single vendor", decisionCategory: "staff_process_equipment", flags: {}, numbers: {}, facts: ["Single vendor lock-in; vendor is raising terms", "No second source qualified"], root: "single-vendor lock-in creates dependency and pricing power risk", locationKey: "us" },
  { key: "cheap_supplier_rework", businessType: "Laundry with chemical supplier", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: { reworkRatePct: 22 }, facts: ["Cheaper chemicals raised rework to 22% and complaints", "Owner likes the lower invoice"], root: "cheap supplier causes rework/complaints that exceed the price saving", locationKey: "kolkata" },
  { key: "bulk_discount_dead_stock", businessType: "Pharmacy with distributor scheme", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { bulkSpend: 200000, cash: 30000, deadStock: 80000 }, facts: ["Distributor offers a bulk discount scheme", "Cash is low and dead stock is already high"], root: "bulk discount scheme would trap cash in dead/expiring stock", locationKey: "tier2_india" },
  { key: "single_vendor_dependency", businessType: "Fitness studio with equipment vendor", decisionCategory: "staff_process_equipment", flags: {}, numbers: {}, facts: ["All maintenance depends on one vendor", "Vendor response time is slipping"], root: "single-vendor dependency is a continuity risk", locationKey: "uae" },
  { key: "weak_sla_contract", businessType: "Housekeeping with supply contract", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 18, fullyLoadedCost: 17 }, facts: ["Proposed supply contract has weak SLA and penalties", "Volume looks attractive"], root: "weak SLA/contract terms expose the business to reliability risk", locationKey: "uk" },
  { key: "compliance_safety_risk", businessType: "Food business with input supplier", decisionCategory: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, facts: ["A cheaper supplier may not meet food-safety norms", "Owner wants to proceed"], root: "supplier safety/compliance is uncertain and needs professional review", locationKey: "australia" },
  { key: "import_cost_volatility", businessType: "D2C brand with imported inputs", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { fxSwingPct: 15 }, facts: ["Imported input cost swings 15% with FX", "Owner wants to lock a big forward order"], root: "imported input-cost volatility threatens margin and cash", locationKey: "global_online" },
  { key: "credit_terms_vs_cash", businessType: "Grocery with wholesaler", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { paymentTermsDays: 45, cash: 20000 }, facts: ["Wholesaler offers a discount for upfront cash", "Cash is tight"], root: "upfront-discount vs credit-terms tradeoff under tight cash", locationKey: "low_income_urban" },
  { key: "staff_vendor_collusion", businessType: "Restaurant with produce vendor", decisionCategory: "staff_process_equipment", flags: { hostile: true }, numbers: {}, facts: ["A staff member always favours one vendor and resists checks", "Quantities on invoices do not match stock"], root: "possible staff-vendor collusion; invoices may be inflated", locationKey: "kolkata" },
  { key: "fake_inflated_invoice", businessType: "Salon with product supplier", decisionCategory: "staff_process_equipment", flags: { hostile: true }, numbers: {}, facts: ["Purchase invoices look inflated vs usage", "Manager self-reports the reconciliation"], root: "fake/inflated invoice risk; self-reported reconciliation cannot be trusted", locationKey: "dense_urban_premium" },
  { key: "local_vs_premium_supplier", businessType: "Cafe choosing suppliers", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 12, fullyLoadedCost: 13 }, facts: ["A local supplier is cheaper; a premium one is more reliable", "Margin is thin either way"], root: "local vs premium supplier tradeoff on reliability vs price", locationKey: "sea" },
];

// Adversarial (hostile) + multi-location amplifiers to reach the required subset counts.
const VENDOR_AMPLIFIERS: Recipe[] = [
  { key: "collusion_multibranch", businessType: "Multi-branch restaurant group", decisionCategory: "staff_process_equipment", flags: { hostile: true, multiBranch: true }, numbers: {}, facts: ["The same vendor is favoured across branches with mismatched invoices", "Branch managers resist central reconciliation"], root: "cross-branch staff-vendor collusion risk", locationKey: "tier2_india" },
  { key: "bulk_scheme_multibranch", businessType: "Multi-branch pharmacy", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true, multiBranch: true }, numbers: { bulkSpend: 300000, cash: 50000 }, facts: ["A group-wide bulk scheme is offered", "One branch already carries dead stock"], root: "group bulk scheme risks cash and dead stock across branches", locationKey: "tier3_india" },
  { key: "fake_invoice_remote", businessType: "Remote-owned retail chain", decisionCategory: "staff_process_equipment", flags: { hostile: true, remoteOwner: true }, numbers: {}, facts: ["Remote owner relies on staff-reported purchase numbers", "Invoices may be inflated"], root: "remote owner cannot verify supplier invoices without independent reconciliation", locationKey: "us" },
  { key: "price_switch_premium_market", businessType: "Premium grocer", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { priceIncreasePct: 12 }, facts: ["Supplier raised price 12%", "Premium customers expect consistent quality"], root: "price-driven switch would risk the quality premium customers pay for", locationKey: "dense_urban_premium" },
];

// ─── Delivery / logistics (≥25) ──────────────────────────────────────────────────────────────────
const DELIVERY_RECIPES: Recipe[] = [
  { key: "failed_deliveries", businessType: "Cloud kitchen with own riders", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: { failedRatePct: 18 }, facts: ["18% of deliveries fail or are late", "Owner wants to hire more riders"], root: "failed deliveries are a process/incentive problem, not a headcount problem", locationKey: "kolkata" },
  { key: "fuel_cost_rise", businessType: "Delivery fleet business", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { fuelRisePct: 20 }, facts: ["Fuel costs rose 20%", "Per-order delivery margin is now thin"], root: "fuel cost rise erodes delivery unit economics", locationKey: "tier2_india" },
  { key: "route_inefficiency", businessType: "Courier startup", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, facts: ["Routes are planned manually and overlap", "Riders idle between drops"], root: "route/batching inefficiency raises cost per successful order", locationKey: "sea" },
  { key: "rider_incentive_gaming", businessType: "Grocery delivery", decisionCategory: "staff_process_equipment", flags: { hostile: true }, numbers: {}, facts: ["Riders mark deliveries complete without delivering", "Incentives pay on attempts, not proof"], root: "rider incentives are gamed because they reward attempts, not verified delivery", locationKey: "tier3_india" },
  { key: "no_show_complaints", businessType: "Restaurant delivery", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: { complaintRatePct: 15 }, facts: ["No-call/no-show delivery complaints rising", "Retention is dropping"], root: "delivery no-shows hurt customer experience and retention", locationKey: "uk" },
  { key: "late_delivery_retention", businessType: "D2C food brand", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: {}, facts: ["Late delivery is hurting repeat orders", "Owner wants to scale ads"], root: "late delivery breaks retention; scaling acquisition wastes spend", locationKey: "global_online" },
  { key: "cod_rto_losses", businessType: "E-commerce with COD", decisionCategory: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { adRevenue: 100000, adSpend: 25000, rtoRatePct: 45, returnRatePct: 10, grossMarginPct: 35 }, facts: ["COD/RTO losses are high", "Owner wants to scale ad spend"], root: "COD/RTO losses make scaled ad spend loss-making after returns", locationKey: "tier2_india" },
  { key: "expand_before_unit_economics", businessType: "Delivery-led restaurant", decisionCategory: "multi_branch_portfolio", flags: { multiBranch: true, cashRisk: true }, numbers: { branchProfit: -20000 }, facts: ["Owner wants to expand delivery radius/area", "Per-order economics are unproven"], root: "delivery expansion before unit economics are proven", locationKey: "uae" },
  { key: "fleet_maintenance_ignored", businessType: "Logistics fleet", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { breakdownRatePct: 12 }, facts: ["Maintenance is deferred; breakdowns rising", "Owner wants to add vehicles"], root: "ignored fleet maintenance will worsen with more vehicles", locationKey: "us" },
  { key: "weak_proof_of_delivery", businessType: "Parcel delivery", decisionCategory: "staff_process_equipment", flags: { hostile: true }, numbers: {}, facts: ["Proof of delivery is weak/self-reported", "Disputes are rising"], root: "weak proof-of-delivery enables disputes and gaming", locationKey: "kolkata" },
  { key: "fake_completion", businessType: "Remote-owned delivery service", decisionCategory: "staff_process_equipment", flags: { hostile: true, remoteOwner: true }, numbers: {}, facts: ["Delivery staff fake completion in the app", "Remote owner cannot verify"], root: "delivery staff fake completion; remote owner needs independent proof", locationKey: "tier2_india" },
  { key: "poor_batching", businessType: "Tiffin delivery", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, facts: ["Orders are not batched by area/time", "Cost per drop is high"], root: "poor batching/route planning inflates delivery cost", locationKey: "low_income_urban" },
  { key: "peak_overload", businessType: "Festival-season delivery", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, facts: ["Peak demand overloads riders", "Quality and timeliness drop"], root: "peak-demand overload breaks delivery quality without slot control", locationKey: "dense_urban_premium" },
  { key: "radius_too_wide", businessType: "Bakery delivery", decisionCategory: "staff_process_equipment", flags: {}, numbers: {}, facts: ["Delivery radius is too wide; long trips lose money", "Owner wants to widen it further"], root: "an over-wide delivery radius destroys per-order economics", locationKey: "australia" },
  { key: "local_constraints", businessType: "City courier", decisionCategory: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, facts: ["Local traffic/weather/event rules constrain delivery", "Owner ignores permit requirements"], root: "local traffic/permit constraints need professional review before scaling", locationKey: "singapore" },
];

const DELIVERY_AMPLIFIERS: Recipe[] = [
  { key: "rto_premium_market", businessType: "Premium D2C delivery", decisionCategory: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { adRevenue: 120000, adSpend: 30000, rtoRatePct: 30, grossMarginPct: 45 }, facts: ["RTO is high even in a premium market", "Owner wants to scale ads"], root: "RTO losses make scaled spend unprofitable even at premium margins", locationKey: "dense_urban_premium" },
  { key: "fleet_expand_remote", businessType: "Remote-owned fleet", decisionCategory: "multi_branch_portfolio", flags: { remoteOwner: true, multiBranch: true }, numbers: {}, facts: ["Remote owner wants to expand the fleet across cities", "Per-city delivery economics unproven"], root: "remote multi-city fleet expansion before proven per-city economics", locationKey: "us" },
  { key: "incentive_gaming_multibranch", businessType: "Multi-branch grocery delivery", decisionCategory: "staff_process_equipment", flags: { hostile: true, multiBranch: true }, numbers: {}, facts: ["Riders across branches game completion incentives", "No verified proof of delivery"], root: "cross-branch rider incentive gaming without delivery proof", locationKey: "tier2_india" },
];

const LOC3: LocationKey[] = ["kolkata", "us", "singapore"];

/** Spread chosen recipes across 3 locations to top up a required subset (adversarial/multi/remote/cash). */
function spread(prefix: string, recipes: Recipe[], baseId: number): BehavioralCase[] {
  return recipes.flatMap((r, ri) => LOC3.map((loc, li) => mk(prefix, { ...r, locationKey: loc }, baseId + ri * 3 + li)));
}

const VENDOR_ADVERSARIAL = VENDOR_RECIPES.filter((r) => r.flags.hostile).concat(VENDOR_AMPLIFIERS.filter((r) => r.flags.hostile));
const VENDOR_MULTIBRANCH = VENDOR_AMPLIFIERS.filter((r) => r.flags.multiBranch);
const DELIVERY_ADVERSARIAL = DELIVERY_RECIPES.filter((r) => r.flags.hostile).concat(DELIVERY_AMPLIFIERS.filter((r) => r.flags.hostile));
const DELIVERY_CASHY = DELIVERY_RECIPES.filter((r) => r.flags.cashRisk);
const DELIVERY_REMOTE = DELIVERY_RECIPES.filter((r) => r.flags.remoteOwner).concat(DELIVERY_AMPLIFIERS.filter((r) => r.flags.remoteOwner));

export const VENDOR_CASES: BehavioralCase[] = [
  ...VENDOR_RECIPES.map((r, i) => mk("vendor", r, i)),
  ...VENDOR_AMPLIFIERS.map((r, i) => mk("vendor", r, 100 + i)),
  ...VENDOR_RECIPES.slice(0, 8).map((r, i) => mk("vendor", { ...r, locationKey: (["singapore", "australia", "uk", "us", "uae", "sea", "global_online", "tier3_india"] as LocationKey[])[i] }, 200 + i)),
  ...spread("vendor", VENDOR_ADVERSARIAL, 300), // +12 adversarial
  ...spread("vendor", VENDOR_MULTIBRANCH, 400), // +6 multi-location
];

export const DELIVERY_CASES: BehavioralCase[] = [
  ...DELIVERY_RECIPES.map((r, i) => mk("delivery", r, i)),
  ...DELIVERY_AMPLIFIERS.map((r, i) => mk("delivery", r, 100 + i)),
  ...DELIVERY_RECIPES.slice(0, 8).map((r, i) => mk("delivery", { ...r, locationKey: (["kolkata", "tier2_india", "uk", "us", "uae", "sea", "singapore", "australia"] as LocationKey[])[i] }, 200 + i)),
  ...spread("delivery", DELIVERY_ADVERSARIAL, 300), // +12 adversarial
  ...spread("delivery", DELIVERY_CASHY, 400), // +cash
  ...spread("delivery", DELIVERY_REMOTE, 500), // +remote
];

export const DOMAIN_EXTRA_CASES: BehavioralCase[] = [...VENDOR_CASES, ...DELIVERY_CASES];
