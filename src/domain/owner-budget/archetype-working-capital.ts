/**
 * Working-Capital × Archetype Cross-Integration (Dynamic Budget). Pure, deterministic.
 *
 * Combines the working-capital ageing assessment (PR #45) with the archetype budget
 * packs (PR #46) so OpsIQ gives business-specific cash-cycle guidance — e.g. a laundry
 * B2B contract that is profitable on paper but cash-negative because receivables are
 * overdue, or a housekeeping recurring contract that is slow to pay. It is NOT a new
 * engine: it reads the two existing assessments and returns combined budget signals /
 * generated actions / restrictions / what-not-to-do that the existing `composeUpdatedPlan`
 * pipeline merges, plus a `growthBlocked` flag the existing allocation flip consumes.
 *
 * If working-capital ageing is absent it returns empty (archetype behaviour unchanged);
 * if the archetype is generic / unknown it returns empty (working-capital behaviour
 * unchanged). It never fabricates archetype assumptions for the generic fallback.
 */
import type { BudgetArchetype, LaundryArchetypeSignals, HousekeepingArchetypeSignals } from "@/domain/owner-budget/archetype-packs";
import type { WorkingCapitalAgeingResult } from "@/domain/owner-budget/working-capital-ageing";
import type { BudgetGeneratedAction, BudgetSignal } from "@/domain/owner-budget/types";

export interface ArchetypeWorkingCapitalInput {
  archetype: BudgetArchetype;
  ageing?: WorkingCapitalAgeingResult | null;
  laundry?: LaundryArchetypeSignals | null;
  housekeeping?: HousekeepingArchetypeSignals | null;
}

export interface ArchetypeWorkingCapitalResult {
  signals: BudgetSignal[];
  actions: BudgetGeneratedAction[];
  spendRestrictions: string[];
  whatNotToDo: string[];
  /** Combined cash-cycle constraint that should defer offensive (growth/scale) candidates. */
  growthBlocked: boolean;
  reasons: string[];
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Combine archetype + working-capital ageing into business-specific cash-cycle guidance.
 * Pure: identical input ⇒ identical output.
 */
export function assessArchetypeWorkingCapital(input: ArchetypeWorkingCapitalInput): ArchetypeWorkingCapitalResult {
  const r: ArchetypeWorkingCapitalResult = {
    signals: [], actions: [], spendRestrictions: [], whatNotToDo: [], growthBlocked: false, reasons: [],
  };
  const ageing = input.ageing;
  if (!ageing) return r; // no working-capital ageing ⇒ nothing combined (archetype pack unchanged)
  const overdue = ageing.receivablesOverdue > 0;

  if (input.archetype === "laundry") {
    const l = input.laundry ?? {};
    if (overdue) {
      // 1) B2B cash conversion: profit on paper, cash trapped in overdue receivables.
      r.signals.push({ type: "laundry_b2b_cash_conversion_risk", severity: "HIGH", message: "Laundry B2B work shows accounting margin but receivables are overdue — cash conversion is unsafe; collect / renegotiate terms before expansion." });
      r.actions.push({
        title: "Collect / renegotiate B2B laundry payment terms before expansion",
        accountableRole: "owner", decisionType: "INVESTIGATE",
        requiredProof: "B2B receivables ageing + contract payment terms + collection commitments",
        reviewInDays: 7,
        expectedFinancialImpact: "Convert trapped B2B receivables to cash before adding capacity/growth",
        killRule: "Do not expand B2B volume while prior B2B invoices are overdue.",
      });
      r.spendRestrictions.push("Do not fund growth/expansion on laundry B2B revenue while B2B receivables are overdue — collect first.");
      r.whatNotToDo.push("Treat profitable B2B laundry contracts as free cash while their invoices are overdue.");
      r.growthBlocked = true;
      r.reasons.push("Laundry B2B overdue receivables — cash conversion unsafe.");

      // 2) Low kg margin AND delayed receivable ⇒ stronger: fix price AND terms, not just collect.
      const b2bMargin = num(l.b2bContributionMarginPct);
      if (b2bMargin !== null && b2bMargin < 10) {
        r.signals.push({ type: "laundry_b2b_payment_terms_risk", severity: "HIGH", message: `Laundry B2B margin ${b2bMargin.toFixed(1)}% AND overdue receivables — fix price AND payment terms, not only collection.` });
        r.actions.push({
          title: "Reprice low-margin B2B laundry contract AND fix payment terms",
          accountableRole: "owner", decisionType: "INCREASE",
          requiredProof: "B2B kg price + cost + payment terms + receivables ageing",
          reviewInDays: 14,
          expectedFinancialImpact: "Restore B2B contribution and shorten the cash cycle, or exit the contract",
          killRule: "Do not renew a low-margin B2B contract on slow payment terms.",
        });
      }
    }

    // 3) Delivery expansion + severe ageing ⇒ defer delivery growth (cash trapped + burn rises).
    const deliveryUneconomic =
      (num(l.deliveryRevenue) !== null && num(l.deliveryCost) !== null && (l.deliveryCost as number) >= (l.deliveryRevenue as number)) ||
      (num(l.lowValueDeliverySharePct) !== null && (l.lowValueDeliverySharePct as number) >= 30);
    if (deliveryUneconomic && (ageing.receivablesSeriouslyOverdue > 0 || ageing.collectionFirstRequired)) {
      r.spendRestrictions.push("Defer delivery expansion: cash is trapped in overdue receivables and delivery growth raises burn/capacity pressure.");
      r.whatNotToDo.push("Expand delivery while receivables are severely overdue — it increases burn while cash is trapped.");
      r.growthBlocked = true;
      r.reasons.push("Laundry delivery expansion deferred due to severe receivables ageing.");
    }

    // 4) Machine downtime + overdue receivables ⇒ protect maintenance reserve.
    if (num(l.machineDowntimeHours) !== null && (l.machineDowntimeHours as number) > 0 && overdue) {
      r.signals.push({ type: "laundry_reserve_protected_by_downtime_and_receivables", severity: "MEDIUM", message: "Machine downtime risk while receivables are overdue — protect the maintenance reserve; do not reallocate it to marketing/growth." });
      r.spendRestrictions.push("Protect the maintenance reserve while machines are down and receivables overdue — do not reallocate it to marketing/growth.");
    }
  }

  if (input.archetype === "housekeeping") {
    const h = input.housekeeping ?? {};
    if (overdue) {
      // 5) Recurring contract cash risk: margin on paper but slow/overdue payment.
      r.signals.push({ type: "housekeeping_recurring_contract_cash_risk", severity: "HIGH", message: "Housekeeping recurring contracts show margin but receivables are overdue/slow — fix collection & payment terms before hiring/expansion." });
      r.actions.push({
        title: "Collect / renegotiate recurring contract payment terms before hiring",
        accountableRole: "owner", decisionType: "INVESTIGATE",
        requiredProof: "Recurring contract payment terms + receivables ageing + collection commitments",
        reviewInDays: 7,
        expectedFinancialImpact: "Make recurring cash inflow reliable before adding staff/sites",
        killRule: "Do not hire/expand while recurring invoices are overdue.",
      });
      r.spendRestrictions.push("Do not hire or expand housekeeping coverage while recurring receivables are overdue — fix collection timing first.");
      r.whatNotToDo.push("Add staff/sites on recurring contracts whose payments are slow or overdue.");
      r.growthBlocked = true;
      r.reasons.push("Housekeeping recurring receivables overdue — cash timing unsafe.");

      // 6) Payroll / collection conflict: labour-heavy payroll while customers pay late.
      if (ageing.cashConversionRisk || ageing.profitableButCashNegative) {
        r.signals.push({ type: "housekeeping_payroll_collection_conflict", severity: "HIGH", message: "Overdue customer payments with labour-heavy payroll — prioritise collection to protect payroll/rent/vendor obligations." });
        r.whatNotToDo.push("Delay payroll/rent/statutory to cover a gap caused by uncollected receivables — collect first.");
      }

      // 8) Underpriced recurring contract + overdue ⇒ reprice AND fix terms.
      const rm = num(h.recurringContractMarginPct);
      if (rm !== null && rm < 10) {
        r.actions.push({
          title: "Reprice underpriced recurring contract AND fix payment terms",
          accountableRole: "owner", decisionType: "INCREASE",
          requiredProof: "Recurring contract price + per-contract margin + payment terms + receivables ageing",
          reviewInDays: 14,
          expectedFinancialImpact: "Restore recurring contribution and shorten the cash cycle",
          killRule: "Do not renew underpriced recurring contracts on slow terms.",
        });
      }
    }

    // 7) Travel inefficiency + slow collection ⇒ route/cash correction outrank growth.
    const travel = num(h.travelTimeSharePct);
    if (travel !== null && travel >= 25 && overdue) {
      r.spendRestrictions.push("Cluster routes AND collect overdue receivables before growth — both outrank broad expansion.");
      r.whatNotToDo.push("Expand coverage while travel time is high and receivables are overdue.");
      r.growthBlocked = true;
      r.reasons.push("Housekeeping travel inefficiency + slow collection — fix both before growth.");
    }
  }

  return r;
}
