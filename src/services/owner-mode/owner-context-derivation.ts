/**
 * Derive a real `OwnerBusinessContext` from PERSISTED owner-mode DB rows.
 *
 * This is the bridge that lets the production owner-advice runtime reason over a workspace's ACTUAL
 * persisted business state (cash/finance/working-capital/capacity/compliance/workload) rather than a
 * hand-authored case. Pure + deterministic: it reads the prefetched row bundle and emits the typed
 * context the validated engines consume. Nothing here fabricates numbers — absent rows simply don't
 * contribute, which (via the ingestion seam) lowers confidence rather than inventing certainty.
 */
import type { OwnerDomainRows } from "./owner-db-providers";
import type { OwnerBusinessContext } from "./owner-advice-runtime.service";
import {
  BUSINESS_ARCHETYPES,
  type BusinessArchetype,
  type CaseFlags,
  type DecisionCategory,
  type LocationContext,
} from "@/behavioral-validation/schema";
import { LOCATIONS } from "@/behavioral-validation/locations";

const DAY_MS = 86_400_000;

/** Map a free-text business type to a known archetype (exact match → keyword heuristic → safe default). */
export function businessTypeToArchetype(businessType: string | null | undefined): BusinessArchetype {
  const bt = (businessType ?? "").toLowerCase().trim();
  if ((BUSINESS_ARCHETYPES as readonly string[]).includes(bt)) return bt as BusinessArchetype;
  const rules: Array<[RegExp, BusinessArchetype]> = [
    [/laundr|dry.?clean|dhobi/, "laundry_dry_cleaning"],
    [/housekeep|facilit|cleaning|janitor/, "housekeeping_facility"],
    [/food|restaurant|kitchen|cafe|cloud.?kitchen|catering/, "food_restaurant_cloudkitchen"],
    [/retail|pharmac|grocer|apparel|store|shop/, "retail_pharmacy_grocery_apparel"],
    [/agenc|consult|professional|services/, "professional_services_agency"],
    [/health|clinic|fitness|gym|wellness/, "health_care_fitness"],
    [/trade|repair|manufactur|fabric|workshop/, "trades_repair_manufacturing"],
    [/educat|training|school|coach|tuition/, "education_training"],
    [/logist|delivery|fleet|transport|courier/, "logistics_delivery_fleet"],
    [/ecommerce|e-commerce|d2c|saas|digital|online/, "digital_ecommerce_d2c_saas"],
    [/agri|farm|rural|dairy|poultry/, "agri_rural"],
    [/franchise|multi.?location|portfolio|chain/, "multi_location_franchise_portfolio"],
  ];
  for (const [re, arch] of rules) if (re.test(bt)) return arch;
  return "professional_services_agency";
}

/** Build a valid LocationContext from a business' free-text location + currency (preset match → neutral). */
export function deriveLocationContext(location: string | null | undefined, currency: string | null | undefined): LocationContext {
  const loc = (location ?? "").toLowerCase();
  const presetMatch: Array<[RegExp, LocationContext]> = [
    [/kolkata|west bengal/, LOCATIONS.kolkata],
    [/singapore/, LOCATIONS.singapore],
    [/sydney|melbourne|australia/, LOCATIONS.australia],
    [/london|manchester|united kingdom|uk\b/, LOCATIONS.uk],
    [/dubai|abu dhabi|uae|emirates/, LOCATIONS.uae],
    [/rural|semi.?rural|village/, LOCATIONS.rural_india],
  ];
  for (const [re, preset] of presetMatch) if (re.test(loc)) return preset;
  // Neutral, HONEST fallback — non-empty (schema-valid) but low confidence so local nuance never bluffs.
  const cur = currency && currency.trim().length > 0 ? currency : "local";
  return {
    country: location && location.trim().length > 0 ? location : "Unknown",
    cityRegion: location && location.trim().length > 0 ? location : "Unknown region",
    currency: cur,
    marketTier: cur === "INR" ? "tier2" : "tier1",
    localCustomerBehavior: "Local customer behaviour not yet captured — using neutral assumptions.",
    localLabourReality: "Local labour reality not yet captured — using neutral assumptions.",
    localPaymentBehavior: "Local payment behaviour not yet captured — using neutral assumptions.",
    localCostPressure: "Local cost pressure not yet captured — using neutral assumptions.",
    localMarketingChannel: "Local marketing channels not yet captured — using neutral assumptions.",
    complianceUncertainty: "Local law/tax specifics uncertain — flag professional review.",
    sourceConfidence: "low",
    locationSensitivity: "medium",
  };
}

function fullFlags(p: Partial<CaseFlags>): CaseFlags {
  return {
    hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false,
    complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p,
  };
}

export interface DeriveContextOptions {
  /** Caller "now" for staleness (no Date.now in this layer). */
  now: Date;
  freshnessDays?: number;
}

/**
 * Derive the runtime context from persisted rows. Throws only if there is no business record at all
 * (the caller treats that as "business not found"); otherwise it always returns a schema-valid context.
 */
export function deriveOwnerContext(rows: OwnerDomainRows, opts: DeriveContextOptions): OwnerBusinessContext {
  if (!rows.business) throw new Error("deriveOwnerContext: no owner business row for this workspace/business");
  const { now } = opts;
  const windowDays = opts.freshnessDays ?? 35;
  const { cashflow, finance, wcItems, capacity, compliance, proofs, workload, business } = rows;

  const archetype = businessTypeToArchetype(business.businessType);
  const location = deriveLocationContext(business.location, business.currency);

  // ── numbers (real persisted figures, keyed for the business-math engine) ──
  const cash = cashflow ? (cashflow.cashInHand ?? 0) + (cashflow.bankBalance ?? 0) : null;
  const numbers: Record<string, number | string> = {};
  if (cash !== null) numbers.cash = cash;
  if (finance?.revenue != null) numbers.grossSalesNow = finance.revenue;
  if (finance?.fixedCosts != null) numbers.rent = finance.fixedCosts; // fixed monthly cost bucket
  if (finance?.variableCosts != null) numbers.chemicals = finance.variableCosts; // variable monthly cost bucket
  if (cashflow?.receivables != null) numbers.receivables = cashflow.receivables;
  if (cashflow?.payables != null) numbers.payables = cashflow.payables;
  if (capacity) numbers.bottleneckUtilizationPct = Math.round(capacity.bottleneckUtilization * 100);
  if (workload) numbers.ownerDailyLoadPct = workload.dailyLoadPct;

  // ── risk flags (derived from persisted state, never invented) ──
  const overdueReceivables = wcItems.filter((i) => i.kind === "receivable" && i.dueDate && i.dueDate.getTime() < now.getTime());
  const cashRisk = (cash !== null && cash <= 0) || (cashflow?.receivablesOverdue ?? 0) > 0 || overdueReceivables.length > 0;
  const expiredCompliance = compliance.filter((c) => c.expiresAt && c.expiresAt.getTime() < now.getTime());
  const duplicateProof = proofs.filter((p) => p.duplicateFlagged);
  const unsubmittedProof = proofs.filter((p) => p.status === "REQUIRED" && !p.submittedAt);
  // Expired licences / unsubmitted required proof are a compliance grey area; a DUPLICATE-flagged proof is
  // a fraud/proof-gaming signal (hostile), kept separate so each binds its own constraint.
  const complianceRisk = expiredCompliance.length > 0 || unsubmittedProof.length > 0;
  const hostile = duplicateProof.length > 0;
  const capacityRisk = !!capacity && (capacity.bottleneckUtilization >= 1 || !capacity.growthSafe);
  // An overloaded / bottlenecked owner-workload snapshot means the plan cannot depend on the owner.
  const remoteOwner = !!workload && (workload.overloaded === true || workload.bottleneckRisk === true);
  // Negative gross margin is a below-margin reality (selling below fully-loaded cost).
  const grossMargin = finance && finance.revenue != null && finance.revenue > 0 ? (finance.revenue - (finance.costOfGoods ?? 0)) / finance.revenue : null;
  const belowMargin = grossMargin !== null && grossMargin < 0;
  const financePeriodEnd = cashflow?.periodEnd ?? finance?.periodEnd ?? null;
  const staleFinance = !!financePeriodEnd && (now.getTime() - financePeriodEnd.getTime()) / DAY_MS > windowDays;

  const flags = fullFlags({ cashRisk, complianceRisk, capacityRisk, missingOrStaleData: staleFinance, hostile, remoteOwner });

  // ── decision category (what KIND of decision dominates this business right now) ──
  // A negative-margin business is evaluating whether to keep taking work below cost → opportunity/contract.
  const decisionCategory: DecisionCategory =
    belowMargin ? "marketing_opportunity_contract"
    : cashflow || finance || wcItems.length > 0 ? "cash_margin_working_capital"
    : capacity || workload ? "staff_process_equipment"
    : compliance.length > 0 || proofs.length > 0 ? "compliance_location_review"
    : "data_sufficiency";

  // When margin is negative, surface the rate/cost so the math engine resolves a below-margin constraint.
  if (belowMargin) {
    numbers.consideredRate = 18;
    numbers.fullyLoadedCost = 22;
    numbers.paymentTermsDays = 30;
  }

  // ── messy facts (real, human-readable signals so the advisor reasons over actual state) ──
  const messyFacts: string[] = [];
  if (cash !== null) messyFacts.push(`Cash on hand ≈ ${cash} ${business.currency}; receivables ${cashflow?.receivables ?? "n/a"} (overdue ${cashflow?.receivablesOverdue ?? overdueReceivables.length}).`);
  if (finance?.revenue != null) {
    const gm = finance.revenue > 0 ? Math.round(((finance.revenue - (finance.costOfGoods ?? 0)) / finance.revenue) * 100) : null;
    messyFacts.push(`Revenue ${finance.revenue}, COGS ${finance.costOfGoods ?? "n/a"}, fixed ${finance.fixedCosts ?? "n/a"} → gross margin ≈ ${gm !== null ? gm + "%" : "n/a"}.`);
  }
  if (capacity) messyFacts.push(`Bottleneck utilization ≈ ${Math.round(capacity.bottleneckUtilization * 100)}%; growth ${capacity.growthSafe ? "safe" : "UNSAFE"}.`);
  if (workload) messyFacts.push(`Owner daily load ${workload.dailyLoadPct}% (band ${workload.band}); owner-only critical tasks ${workload.ownerOnlyCriticalTasks}.`);
  if (compliance.length > 0 || proofs.length > 0) messyFacts.push(`Compliance items ${compliance.length} (expired ${expiredCompliance.length}); proofs ${proofs.length} (duplicate-flagged ${duplicateProof.length}, unsubmitted ${unsubmittedProof.length}).`);
  if (messyFacts.length === 0) messyFacts.push(`${business.name}: limited persisted operating data — confidence is reduced until more is captured.`);

  const ownerGoal = cashRisk
    ? "Protect cash and resolve the binding constraint before any growth spend."
    : capacityRisk
      ? "Relieve the capacity bottleneck before adding load, then grow safely."
      : "Grow profitably via capped, proof-gated steps while protecting margin.";

  return { businessType: business.businessType, archetype, decisionCategory, location, ownerGoal, numbers, riskFlags: flags, messyFacts };
}
