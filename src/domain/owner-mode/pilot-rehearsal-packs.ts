/**
 * PILOT REHEARSAL PACKS — five realistic owner-pilot scenarios that rehearse the full owner journey
 * end-to-end through the REAL runtime, not generic training:
 *   onboarding → minimum data → missing-data guidance → more-data improvement → diagnosis (whole-
 *   business runtime) → command-center plan → action assignment → proof requirement → reassessment →
 *   learning/provenance → mobile shape.
 *
 * Each pack carries a production `OwnerBusinessContext` (so it runs through `runOwnerAdvice`, the same
 * runtime the command center uses) AND the owner-pilot inputs (profile/role/supplied categories at the
 * minimal and improved stages, so it runs through onboarding/guidance/readiness/action-assignment).
 *
 * This module only DEFINES the packs + a pure context builder. The runner that executes them through
 * the runtime lives in the test (it needs the learning store + advice runtime), keeping this module
 * free of DB/async. Pure. No Date.now, no AI.
 */
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import type { BusinessProfileType, OwnerRole } from "@/domain/owner-mode/owner-onboarding";
import type { BusinessArchetype, DecisionCategory, LocationContext, CaseFlags } from "@/behavioral-validation/schema";

export interface PilotPackContext {
  businessType: string;
  archetype: BusinessArchetype;
  decisionCategory: DecisionCategory;
  location: LocationContext;
  ownerGoal: string;
  numbers: Record<string, number | string>;
  riskFlags: Partial<CaseFlags>;
  messyFacts: string[];
}

export interface PilotPack {
  id: string;
  label: string;
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  /** The minimal owner-supplied data at first use (deliberately incomplete). */
  minimalSupplied: OwnerInputCategory[];
  /** The improved supplied set after the owner follows the missing-data guidance. */
  improvedSupplied: OwnerInputCategory[];
  /** Production context that drives the whole-business runtime. */
  context: PilotPackContext;
}

function loc(over: Partial<LocationContext> & Pick<LocationContext, "cityRegion">): LocationContext {
  return {
    country: "India",
    currency: "INR",
    marketTier: "tier2",
    localCustomerBehavior: "price-sensitive, word-of-mouth led",
    localLabourReality: "informal labour, attendance varies",
    localPaymentBehavior: "mix of cash and UPI; some credit",
    localCostPressure: "rising rent and power costs",
    localMarketingChannel: "local referrals and WhatsApp",
    complianceUncertainty: "GST treatment and local licensing vary — professional review where unsure",
    sourceConfidence: "medium",
    locationSensitivity: "medium",
    ...over,
  };
}

export const PILOT_PACKS: PilotPack[] = [
  {
    id: "laundry",
    label: "Laundry / dry cleaning (owner-operated)",
    profileType: "laundry_drycleaning",
    ownerRole: "owner_operated",
    minimalSupplied: ["revenue_sales", "expenses", "cash_debt"],
    improvedSupplied: ["revenue_sales", "expenses", "cash_debt", "fixed_costs", "equipment_logs", "proof_completion", "customer_count"],
    context: {
      businessType: "Laundry & dry cleaning",
      archetype: "laundry_dry_cleaning",
      decisionCategory: "cash_margin_working_capital",
      location: loc({ cityRegion: "Pune" }),
      ownerGoal: "Stop losing money on each load and stabilise cash.",
      numbers: { revenue: 280000, costOfGoods: 150000, fixedCosts: 90000, cashOnHand: 40000, debtPayments: 20000, bottleneckUtilization: 0.7 },
      riskFlags: { cashRisk: true },
      messyFacts: ["Two machines, one breaks weekly", "owner does pickup and billing themselves"],
    },
  },
  {
    id: "housekeeping",
    label: "Housekeeping / cleaning (owner-operated, staff-heavy)",
    profileType: "housekeeping_cleaning",
    ownerRole: "owner_operated",
    minimalSupplied: ["revenue_sales", "expenses", "cash_debt"],
    improvedSupplied: ["revenue_sales", "expenses", "cash_debt", "payroll", "staff_attendance", "complaints_reviews", "proof_completion"],
    context: {
      businessType: "Housekeeping & cleaning services",
      archetype: "housekeeping_facility",
      decisionCategory: "staff_process_equipment",
      location: loc({ cityRegion: "Bengaluru", marketTier: "tier1" }),
      ownerGoal: "Keep clients happy without burning out on staffing chaos.",
      numbers: { revenue: 450000, costOfGoods: 120000, payroll: 220000, fixedCosts: 40000, cashOnHand: 60000, bottleneckUtilization: 0.9 },
      riskFlags: { capacityRisk: true },
      messyFacts: ["Staff no-shows twice a week", "two clients threatened to cancel over quality"],
    },
  },
  {
    id: "remote_service",
    label: "Remote-owner staff-managed service business",
    profileType: "remote_owner_service",
    ownerRole: "remote_owner",
    minimalSupplied: ["revenue_sales", "expenses", "cash_debt"],
    improvedSupplied: ["revenue_sales", "expenses", "cash_debt", "payroll", "proof_completion", "sops_checklists", "staff_attendance"],
    context: {
      businessType: "Pest-control service (owner abroad)",
      archetype: "professional_services_agency",
      decisionCategory: "remote_owner",
      location: loc({ cityRegion: "Hyderabad" }),
      ownerGoal: "Run the business from abroad without it drifting.",
      numbers: { revenue: 600000, costOfGoods: 200000, payroll: 250000, fixedCosts: 50000, cashOnHand: 120000, bottleneckUtilization: 0.6 },
      riskFlags: { remoteOwner: true },
      messyFacts: ["Owner lives overseas", "manager runs day-to-day", "no proof of jobs done"],
    },
  },
  {
    id: "b2b_contract",
    label: "B2B contract-heavy local service business",
    profileType: "b2b_contract_service",
    ownerRole: "owner_operated",
    minimalSupplied: ["revenue_sales", "expenses", "cash_debt"],
    improvedSupplied: ["revenue_sales", "expenses", "cash_debt", "b2b_contracts", "fixed_costs", "delivery_records", "proof_completion"],
    context: {
      businessType: "Commercial facility maintenance (B2B contracts)",
      archetype: "professional_services_agency",
      decisionCategory: "marketing_opportunity_contract",
      location: loc({ cityRegion: "Chennai", marketTier: "tier1" }),
      ownerGoal: "Win contracts that actually make margin, not just revenue.",
      numbers: { revenue: 900000, costOfGoods: 520000, fixedCosts: 120000, cashOnHand: 90000, receivablesOverdue: 180000, bottleneckUtilization: 0.75 },
      riskFlags: { cashRisk: true },
      messyFacts: ["Two big clients pay 60+ days late", "tempted to sign a low-price contract to fill capacity"],
    },
  },
  {
    id: "multi_location",
    label: "Multi-location / branch-style small business",
    profileType: "multi_location_smb",
    ownerRole: "multi_location",
    minimalSupplied: ["revenue_sales", "expenses", "cash_debt"],
    improvedSupplied: ["revenue_sales", "expenses", "cash_debt", "branch_records", "fixed_costs", "payroll", "proof_completion", "customer_count"],
    context: {
      businessType: "Three-branch tiffin & catering",
      archetype: "multi_location_franchise_portfolio",
      decisionCategory: "multi_branch_portfolio",
      location: loc({ cityRegion: "Ahmedabad" }),
      ownerGoal: "Find which branch is bleeding and fix it before it drags the others.",
      numbers: { revenue: 1200000, costOfGoods: 700000, fixedCosts: 260000, cashOnHand: 110000, debtPayments: 40000, bottleneckUtilization: 0.8 },
      riskFlags: { multiBranch: true },
      messyFacts: ["Branch 2 looks weak", "no per-branch P&L", "owner splits time across all three"],
    },
  },
];
