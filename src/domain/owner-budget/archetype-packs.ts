/**
 * Archetype-Specific Budget Packs (Dynamic Budget). Pure, deterministic.
 *
 * Makes budget advice reason with the cost structure, leakage risks, growth levers
 * and scale constraints of the business TYPE instead of giving generic advice
 * ("increase marketing", "reduce costs"). Three packs: laundry / dry-cleaning,
 * housekeeping / facilities, and a generic-service fallback.
 *
 * This is NOT a second budget engine — it returns archetype-specific budget signals,
 * generated actions, spend restrictions, "what not to do", scale-gate blocks and
 * profit levers that the existing `composeUpdatedPlan` merges into the owner plan via
 * its existing extra-actions/extra-restrictions pipeline. Operational metrics are
 * manual / import-ready (NOT a live feed); when they are absent for a specific
 * archetype the pack falls back SAFELY and downgrades confidence (no overclaim).
 */
import { archetypeFromBusinessType } from "@/domain/owner-guidance/archetype-guidance";
import type { BudgetGeneratedAction, BudgetSignal } from "@/domain/owner-budget/types";

export type BudgetArchetype = "laundry" | "housekeeping" | "generic";

/** Resolve the budget archetype from the finance industry template / business type.
 *  Reuses the shared archetype vocabulary; home-services has no dedicated budget pack
 *  yet, so it uses the generic fallback. */
export function resolveBudgetArchetype(industryTemplate?: string | null): BudgetArchetype {
  const a = archetypeFromBusinessType(industryTemplate);
  return a === "laundry" || a === "housekeeping" ? a : "generic";
}

/** Laundry / dry-cleaning operational metrics (manual / import-ready). */
export interface LaundryArchetypeSignals {
  chemicalCost?: number | null;
  orderVolume?: number | null;
  /** Expected chemical cost per order/load at healthy usage. */
  chemicalCostBaselinePerOrder?: number | null;
  deliveryCost?: number | null;
  deliveryRevenue?: number | null;
  deliveryCount?: number | null;
  rewashRatePct?: number | null;
  refundRatePct?: number | null;
  /** Contribution margin % on B2B kg/linen contracts. */
  b2bContributionMarginPct?: number | null;
  machineDowntimeHours?: number | null;
  /** Owner is reallocating the maintenance reserve to discretionary/marketing. */
  maintenanceReserveAtRisk?: boolean | null;
  discountRatePct?: number | null;
  /** Net contribution % AFTER discounts (can be negative). */
  contributionAfterDiscountPct?: number | null;
  /** Share of delivery orders below the economic minimum. */
  lowValueDeliverySharePct?: number | null;
}

/** Housekeeping / facilities operational metrics (manual / import-ready). */
export interface HousekeepingArchetypeSignals {
  labourHours?: number | null;
  jobsCompleted?: number | null;
  /** Expected labour hours per job at healthy productivity. */
  labourHoursBaselinePerJob?: number | null;
  travelTimeSharePct?: number | null;
  reworkRatePct?: number | null;
  noShowRatePct?: number | null;
  overtimeCost?: number | null;
  /** Output gain % attributable to the overtime spend. */
  overtimeOutputGainPct?: number | null;
  /** Contribution margin % on recurring contracts. */
  recurringContractMarginPct?: number | null;
  suppliesUsage?: number | null;
  suppliesExpectedPerJob?: number | null;
}

export interface ArchetypePackInput {
  archetype: BudgetArchetype;
  laundry?: LaundryArchetypeSignals | null;
  housekeeping?: HousekeepingArchetypeSignals | null;
}

export interface ArchetypePackResult {
  archetype: BudgetArchetype;
  /** True only when an archetype pack produced archetype-specific guidance. */
  applied: boolean;
  signals: BudgetSignal[];
  actions: BudgetGeneratedAction[];
  spendRestrictions: string[];
  whatNotToDo: string[];
  scaleBlocks: string[];
  profitLevers: string[];
  /** Hard block on growth/scale allocation driven by an archetype constraint. */
  growthBlocked: boolean;
  /** Set when the archetype is specific but its operational metrics are missing. */
  dataInsufficient: boolean;
  reasons: string[];
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function empty(archetype: BudgetArchetype): ArchetypePackResult {
  return {
    archetype, applied: false, signals: [], actions: [], spendRestrictions: [],
    whatNotToDo: [], scaleBlocks: [], profitLevers: [], growthBlocked: false,
    dataInsufficient: false, reasons: [],
  };
}

function assessLaundry(s: LaundryArchetypeSignals): ArchetypePackResult {
  const r = empty("laundry");
  const chemicalCost = num(s.chemicalCost);
  const orderVolume = num(s.orderVolume);
  const baselinePerOrder = num(s.chemicalCostBaselinePerOrder);
  const deliveryCost = num(s.deliveryCost);
  const deliveryRevenue = num(s.deliveryRevenue);
  const rewash = num(s.rewashRatePct);
  const refund = num(s.refundRatePct);
  const b2bMargin = num(s.b2bContributionMarginPct);
  const downtime = num(s.machineDowntimeHours);
  const contributionAfterDiscount = num(s.contributionAfterDiscountPct);
  const lowValueDeliveryShare = num(s.lowValueDeliverySharePct);

  // 1) Consumable (chemical) leakage — fix BEFORE broad marketing/growth.
  const perOrder = chemicalCost !== null && orderVolume && orderVolume > 0 ? chemicalCost / orderVolume : null;
  const consumableLeak =
    (perOrder !== null && baselinePerOrder !== null && perOrder > baselinePerOrder * 1.2) ||
    (rewash !== null && rewash >= 8);
  if (consumableLeak) {
    r.signals.push({ type: "laundry_consumable_leakage", severity: "HIGH", message: "Chemical/consumable cost is rising faster than order volume (or rewash is high) — usage leakage before any growth spend." });
    r.actions.push({
      title: "Control laundry chemical/consumable usage leakage",
      accountableRole: "owner",
      decisionType: "INVESTIGATE",
      requiredProof: "Chemical purchase bills + stock issue/usage logs reconciled to load/order counts",
      reviewInDays: 7,
      expectedFinancialImpact: "Recover margin lost to chemical over-usage/rewash before spending on growth",
      killRule: "Escalate if cost-per-load stays above baseline after one stock cycle.",
    });
    r.spendRestrictions.push("Fix chemical/consumable usage leakage before adding marketing or growth spend.");
    r.whatNotToDo.push("Increase marketing while chemical cost-per-load is above baseline — you would scale the leak.");
    r.profitLevers.push("Reduce chemical wastage / rewash to restore contribution.");
  }

  // 2) Delivery economics — block low-value delivery growth.
  const deliveryUneconomic =
    (deliveryRevenue !== null && deliveryCost !== null && deliveryCost >= deliveryRevenue) ||
    (lowValueDeliveryShare !== null && lowValueDeliveryShare >= 30);
  if (deliveryUneconomic) {
    r.signals.push({ type: "laundry_delivery_uneconomic", severity: "HIGH", message: "Delivery cost is not covered by delivery revenue (or too many low-value delivery orders) — delivery growth is uneconomic." });
    r.actions.push({
      title: "Fix laundry delivery economics before expanding delivery",
      accountableRole: "owner",
      decisionType: "BLOCK",
      requiredProof: "Delivery logs/fuel proof + per-order delivery contribution by route/radius",
      reviewInDays: 7,
      expectedFinancialImpact: "Stop margin bleed from below-cost delivery orders",
      killRule: "Do not expand delivery radius while per-order delivery contribution is negative.",
    });
    r.spendRestrictions.push("Block low-value / below-cost delivery growth until per-order delivery contribution is positive.");
    r.whatNotToDo.push("Expand delivery radius or push low-value delivery orders while delivery runs below cost.");
    r.scaleBlocks.push("Delivery economics negative — scale gate not met.");
    r.growthBlocked = true;
    r.profitLevers.push("Route optimisation / delivery zone discipline / minimum order value.");
  }

  // 3) B2B kg/linen contract margin — reprice or collect-first.
  if (b2bMargin !== null && b2bMargin < 10) {
    r.signals.push({ type: "laundry_b2b_margin_risk", severity: "HIGH", message: `B2B contribution margin ${b2bMargin.toFixed(1)}% is below a safe threshold — reprice or tighten collection before taking more B2B volume.` });
    r.actions.push({
      title: "Reprice / renegotiate low-margin B2B laundry contracts",
      accountableRole: "owner",
      decisionType: "INCREASE",
      requiredProof: "B2B contract price + kg/linen cost + payment terms",
      reviewInDays: 14,
      expectedFinancialImpact: "Restore B2B contribution above threshold or exit the contract",
      killRule: "Do not add B2B volume on a contract priced below contribution.",
    });
    r.spendRestrictions.push("Do not chase more B2B volume on contracts priced below contribution margin.");
    r.profitLevers.push("Reprice B2B kg contracts; enforce payment terms.");
  }

  // 4) Machine downtime — protect the maintenance reserve.
  if ((downtime !== null && downtime > 0) || s.maintenanceReserveAtRisk === true) {
    r.signals.push({ type: "laundry_machine_downtime_risk", severity: "MEDIUM", message: "Machine downtime is creating hidden lost revenue — protect the maintenance reserve." });
    r.actions.push({
      title: "Protect laundry maintenance reserve; address machine downtime root cause",
      accountableRole: "owner",
      decisionType: "INVESTIGATE",
      requiredProof: "Machine maintenance/repair logs + downtime hours vs lost loads",
      reviewInDays: 10,
      expectedFinancialImpact: "Avoid lost revenue and emergency repair spikes",
      killRule: "Do not reallocate the maintenance reserve to marketing while downtime is unresolved.",
    });
    r.spendRestrictions.push("Do not reallocate the maintenance reserve to marketing/growth while machine downtime is unresolved.");
    r.whatNotToDo.push("Spend the maintenance reserve on marketing while machines are going down.");
    r.profitLevers.push("Fund maintenance reserve to reduce downtime and emergency repairs.");
  }

  // 5) Discounts increasing revenue but killing contribution.
  if (contributionAfterDiscount !== null && contributionAfterDiscount < 0) {
    r.signals.push({ type: "laundry_discount_contribution_risk", severity: "HIGH", message: "Discounts are lifting revenue but contribution after discount is negative — discounting is destroying margin." });
    r.actions.push({
      title: "Reduce blanket discounts that make contribution negative",
      accountableRole: "owner",
      decisionType: "REDUCE",
      requiredProof: "Campaign/discount proof + contribution after discount by order",
      reviewInDays: 7,
      expectedFinancialImpact: "Restore positive contribution; protect profit over vanity revenue",
      killRule: "Do not extend a discount whose post-discount contribution is negative.",
    });
    r.spendRestrictions.push("Stop blanket discounting where post-discount contribution is negative.");
    r.whatNotToDo.push("Chase revenue with discounts that make per-order contribution negative.");
    r.profitLevers.push("Increase minimum order value; reduce blanket discounts; shift to higher-margin services.");
  }

  if (refund !== null && refund >= 8) {
    r.profitLevers.push("Reduce rework/damage/refunds to protect contribution.");
  }

  r.applied = r.signals.length > 0;
  return r;
}

function assessHousekeeping(s: HousekeepingArchetypeSignals): ArchetypePackResult {
  const r = empty("housekeeping");
  const labourHours = num(s.labourHours);
  const jobs = num(s.jobsCompleted);
  const baselinePerJob = num(s.labourHoursBaselinePerJob);
  const travelShare = num(s.travelTimeSharePct);
  const overtimeCost = num(s.overtimeCost);
  const overtimeGain = num(s.overtimeOutputGainPct);
  const recurringMargin = num(s.recurringContractMarginPct);
  const suppliesUsage = num(s.suppliesUsage);
  const suppliesExpectedPerJob = num(s.suppliesExpectedPerJob);

  // 1) Travel inefficiency — block expansion until route clustering improves.
  if (travelShare !== null && travelShare >= 25) {
    r.signals.push({ type: "housekeeping_travel_inefficiency", severity: "HIGH", message: `Travel time is ${travelShare.toFixed(0)}% of capacity — expansion is uneconomic until routes are clustered.` });
    r.actions.push({
      title: "Improve job clustering before expanding housekeeping coverage",
      accountableRole: "owner",
      decisionType: "BLOCK",
      requiredProof: "Travel logs + route/cluster density by area",
      reviewInDays: 7,
      expectedFinancialImpact: "Recover billable hours lost to travel before adding sites",
      killRule: "Do not expand to new areas while travel time exceeds the clustering threshold.",
    });
    r.spendRestrictions.push("Block area expansion until route clustering reduces travel time.");
    r.whatNotToDo.push("Add distant one-off sites that worsen travel inefficiency.");
    r.scaleBlocks.push("Route density too low (travel time too high) — scale gate not met.");
    r.growthBlocked = true;
    r.profitLevers.push("Improve job clustering / route density to recover billable hours.");
  }

  // 2) Overtime without output gain — schedule/productivity, NOT blind hiring.
  if (overtimeCost !== null && overtimeCost > 0 && overtimeGain !== null && overtimeGain < 5) {
    r.signals.push({ type: "housekeeping_overtime_without_output", severity: "HIGH", message: "Overtime cost is rising without a matching output gain — fix scheduling/productivity before hiring." });
    r.actions.push({
      title: "Fix housekeeping scheduling/productivity before hiring",
      accountableRole: "owner",
      decisionType: "INVESTIGATE",
      requiredProof: "Staff schedule + payroll/overtime records vs completed jobs",
      reviewInDays: 7,
      expectedFinancialImpact: "Recover output from existing staff instead of adding headcount cost",
      killRule: "Do not hire to cover overtime that is not producing extra completed jobs.",
    });
    r.spendRestrictions.push("Do not fund new hiring to cover overtime that produces no extra output — correct scheduling first.");
    r.whatNotToDo.push("Hire more staff to mask an overtime/scheduling inefficiency.");
    r.profitLevers.push("Improve staff scheduling; reduce non-productive overtime.");
  }

  // 3) Underpriced recurring contracts — reprice.
  if (recurringMargin !== null && recurringMargin < 10) {
    r.signals.push({ type: "housekeeping_contract_underpriced", severity: "HIGH", message: `Recurring contract margin ${recurringMargin.toFixed(1)}% is below a safe threshold — reprice before taking more contracts.` });
    r.actions.push({
      title: "Reprice underpriced recurring housekeeping contracts",
      accountableRole: "owner",
      decisionType: "INCREASE",
      requiredProof: "Contract pricing/payment terms + per-contract margin",
      reviewInDays: 14,
      expectedFinancialImpact: "Restore recurring contribution above threshold",
      killRule: "Do not sign more recurring contracts below contribution margin.",
    });
    r.spendRestrictions.push("Do not chase recurring contracts priced below contribution margin.");
    r.profitLevers.push("Reprice underpriced recurring contracts; shift mix to profitable contracts.");
  }

  // 4) Supplies usage variance.
  const expectedSupplies = suppliesExpectedPerJob !== null && jobs && jobs > 0 ? suppliesExpectedPerJob * jobs : null;
  if (suppliesUsage !== null && expectedSupplies !== null && suppliesUsage > expectedSupplies * 1.2) {
    r.signals.push({ type: "housekeeping_supplies_variance", severity: "MEDIUM", message: "Supplies usage exceeds expected usage for the job count — supply leakage." });
    r.actions.push({
      title: "Control housekeeping supplies usage variance",
      accountableRole: "owner",
      decisionType: "INVESTIGATE",
      requiredProof: "Supply issue logs reconciled to job count",
      reviewInDays: 7,
      expectedFinancialImpact: "Recover margin lost to supply over-usage",
      killRule: "Escalate if usage stays above expected after one supply cycle.",
    });
    r.spendRestrictions.push("Reconcile supplies usage to job count before increasing supply budget.");
    r.profitLevers.push("Manage supply usage per job.");
  }

  // 5) Labour productivity variance (hours per job above baseline).
  const perJob = labourHours !== null && jobs && jobs > 0 ? labourHours / jobs : null;
  if (perJob !== null && baselinePerJob !== null && perJob > baselinePerJob * 1.2) {
    r.profitLevers.push("Correct labour hours-per-job back toward baseline productivity.");
  }

  r.applied = r.signals.length > 0;
  return r;
}

/**
 * Assess the archetype budget pack. Generic (or unknown) archetype ⇒ safe fallback
 * (no archetype-specific guidance, never overriding more specific rules). A specific
 * archetype with no operational metrics ⇒ dataInsufficient (confidence downgrade).
 */
export function assessArchetypePack(input: ArchetypePackInput): ArchetypePackResult {
  if (input.archetype === "laundry") {
    if (!input.laundry || Object.values(input.laundry).every((v) => v === null || v === undefined)) {
      const r = empty("laundry");
      r.dataInsufficient = true;
      r.signals.push({ type: "archetype_data_insufficient", severity: "LOW", message: "Laundry archetype detected but no operational metrics (chemical/load/delivery/B2B) provided — provide them for laundry-specific budget guidance." });
      return r;
    }
    return assessLaundry(input.laundry);
  }
  if (input.archetype === "housekeeping") {
    if (!input.housekeeping || Object.values(input.housekeeping).every((v) => v === null || v === undefined)) {
      const r = empty("housekeeping");
      r.dataInsufficient = true;
      r.signals.push({ type: "archetype_data_insufficient", severity: "LOW", message: "Housekeeping archetype detected but no operational metrics (labour/travel/contract/supplies) provided — provide them for housekeeping-specific budget guidance." });
      return r;
    }
    return assessHousekeeping(input.housekeeping);
  }
  // Generic fallback: safe, non-overclaiming, never overrides specific packs.
  return empty("generic");
}
