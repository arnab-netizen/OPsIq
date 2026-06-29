/**
 * Slice E — collective (cross-domain) case library.
 *
 * ≥100 deterministic cases where multiple domains are active and at least two recommendations
 * conflict, with one expert-correct top priority and one tempting wrong priority. Each case wraps a
 * BehavioralCase (flags/numbers chosen to create the conflict) so it flows through the advisor,
 * arbitration and whole-business plan. The encoded correctTopPriority is independently re-derived by
 * the arbitration engine (validated in tests), not trusted blindly.
 */
import { LOCATIONS, type LocationKey } from "../locations";
import { SEED_CASES } from "../seed-cases";
import type { ActionType, Constraint, DomainCandidate } from "./arbitration";
import type { DomainId } from "./domains";
import type { BehavioralCase, CaseFlags, DecisionCategory } from "../schema";

const BASE = SEED_CASES[0];

interface Recipe {
  key: string;
  conflict: string;
  decisionCategory: DecisionCategory;
  flags: Partial<CaseFlags>;
  numbers: Record<string, number>;
  hiddenRootCause: string;
  correctTopPriority: Constraint;
  temptingWrongPriority: string;
  candidates: Array<{ domain: string; action: string; type: ActionType }>;
  activeDomains: DomainId[];
}

const C = (domain: string, action: string, type: ActionType): DomainCandidate => ({ domain, action, type });

const RECIPES: Recipe[] = [
  { key: "cash_vs_marketing", conflict: "cash vs marketing", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { grossSalesNow: 320000, grossSalesPrev: 180000, cash: 25000 }, hiddenRootCause: "growth is discount-led; cash is trapped while the owner wants to spend on ads", correctTopPriority: "cash_survival", temptingWrongPriority: "spend on marketing to grow revenue", candidates: [C("marketing", "Spend on a hoarding", "spend_marketing"), C("finance", "Protect cash and recover receivables", "proceed")], activeDomains: ["cash_flow", "marketing", "pricing_margin", "working_capital"] },
  { key: "sales_vs_margin", conflict: "sales vs margin", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 15, fullyLoadedCost: 20, paymentTermsDays: 30 }, hiddenRootCause: "a big contract is below fully-loaded cost but sales wants the volume", correctTopPriority: "below_margin", temptingWrongPriority: "accept the contract for revenue", candidates: [C("sales", "Accept the contract", "accept_contract"), C("pricing", "Re-quote to a viable margin", "proceed")], activeDomains: ["sales", "pricing_margin", "opportunity_eval", "working_capital"] },
  { key: "growth_vs_capacity", conflict: "growth vs capacity", decisionCategory: "marketing_opportunity_contract", flags: { capacityRisk: true }, numbers: { offeredKgPerDay: 200, reliableKgPerDay: 70 }, hiddenRootCause: "demand exceeds reliable capacity; accepting more will break delivery", correctTopPriority: "capacity_feasibility", temptingWrongPriority: "accept all the volume", candidates: [C("strategy", "Expand to take the volume", "expand"), C("operations", "Cap load to reliable capacity", "proceed")], activeDomains: ["scaling_expansion", "equipment_capacity", "operations", "quality_control"] },
  { key: "quality_vs_acquisition", conflict: "customer quality vs acquisition", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { adSpend: 50000 }, hiddenRootCause: "rising complaints and rework are breaking reputation while marketing wants to acquire", correctTopPriority: "customer_quality", temptingWrongPriority: "spend to acquire more customers", candidates: [C("marketing", "Spend to acquire", "spend_marketing"), C("operations", "Fix quality first", "proceed")], activeDomains: ["reputation_complaints", "customer_acquisition", "marketing", "quality_control"] },
  { key: "staff_vs_profit", conflict: "staff workload vs profit", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, hiddenRootCause: "staff are overloaded; finance wants to cut cost but quality will break", correctTopPriority: "capacity_feasibility", temptingWrongPriority: "cut staff to save cost", candidates: [C("finance", "Cut staff", "cut_staff"), C("operations", "Rebalance shifts and prove the need", "proceed")], activeDomains: ["staff_management", "operations", "quality_control", "process_improvement"] },
  { key: "owner_vs_control", conflict: "owner workload vs control", decisionCategory: "staff_process_equipment", flags: { remoteOwner: true }, numbers: {}, hiddenRootCause: "the owner is the bottleneck and wants to control everything remotely", correctTopPriority: "owner_workload", temptingWrongPriority: "owner personally supervises everything", candidates: [C("ops", "Owner supervises all", "proceed"), C("ops", "Delegate with proof-based controls", "proceed")], activeDomains: ["owner_workload", "remote_owner", "approval_memory", "operations"] },
  { key: "contract_vs_working_capital", conflict: "contract vs working capital", decisionCategory: "marketing_opportunity_contract", flags: { cashRisk: true }, numbers: { consideredRate: 25, fullyLoadedCost: 18, paymentTermsDays: 60, cash: 20000 }, hiddenRootCause: "a profitable-looking contract has 60-day terms that will starve cash", correctTopPriority: "cash_survival", temptingWrongPriority: "accept the back-loaded contract", candidates: [C("sales", "Accept the 60-day contract", "accept_contract"), C("finance", "Negotiate faster terms or decline", "proceed")], activeDomains: ["working_capital", "cash_flow", "opportunity_eval", "contract_quote"] },
  { key: "expansion_vs_unit_economics", conflict: "branch expansion vs unit economics", decisionCategory: "multi_branch_portfolio", flags: { multiBranch: true, cashRisk: true }, numbers: { branchProfit: -40000, cash: 15000 }, hiddenRootCause: "a second branch is tempting but the first subsidises it and cash is tight", correctTopPriority: "cash_survival", temptingWrongPriority: "open the new branch now", candidates: [C("strategy", "Open a new branch", "expand"), C("finance", "Prove per-branch P&L first", "proceed")], activeDomains: ["scaling_expansion", "multi_location_portfolio", "cash_flow", "budgeting_capital"] },
  { key: "equipment_vs_runway", conflict: "equipment purchase vs cash runway", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { cash: 30000, equipmentCost: 120000 }, hiddenRootCause: "a machine upgrade is tempting but cash runway is short", correctTopPriority: "cash_survival", temptingWrongPriority: "buy the equipment now", candidates: [C("ops", "Buy the equipment", "buy_equipment"), C("finance", "Defer until runway is proven", "proceed")], activeDomains: ["equipment_capacity", "cash_flow", "budgeting_capital", "risk_management"] },
  { key: "discount_vs_retention", conflict: "discounting vs retention", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { discountPct: 30, cash: 22000 }, hiddenRootCause: "deep discounts lift revenue but destroy margin and do not retain customers", correctTopPriority: "cash_survival", temptingWrongPriority: "discount harder to drive sales", candidates: [C("sales", "Increase discounts", "discount"), C("finance", "Stop blanket discounts, fix retention", "proceed")], activeDomains: ["pricing_margin", "customer_retention", "cash_flow", "marketing"] },
  { key: "compliance_vs_revenue", conflict: "compliance vs revenue", decisionCategory: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, hiddenRootCause: "a licensing/tax grey area blocks a revenue move the owner wants now", correctTopPriority: "compliance_block", temptingWrongPriority: "proceed past the grey area for revenue", candidates: [C("strategy", "Proceed past the grey area", "proceed_compliance"), C("compliance", "Get professional review first", "proceed")], activeDomains: ["compliance_review", "risk_management", "strategy", "business_continuity"] },
  { key: "vendor_savings_vs_reliability", conflict: "vendor savings vs reliability", decisionCategory: "staff_process_equipment", flags: {}, numbers: {}, hiddenRootCause: "a cheaper vendor risks quality and reliability that would cause rework and complaints", correctTopPriority: "customer_quality", temptingWrongPriority: "switch to the cheapest vendor", candidates: [C("procurement", "Switch to cheapest vendor", "proceed"), C("ops", "Qualify reliability before switching", "proceed")], activeDomains: ["vendor_supplier", "quality_control", "reputation_complaints", "operations"] },
  { key: "inventory_vs_dead_stock", conflict: "inventory expansion vs dead stock", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { cash: 28000, deadStock: 90000 }, hiddenRootCause: "buying more inventory on a scheme will trap cash in dead stock", correctTopPriority: "cash_survival", temptingWrongPriority: "buy the discounted inventory scheme", candidates: [C("procurement", "Buy the scheme stock", "buy_equipment"), C("finance", "Clear dead stock, protect cash", "proceed")], activeDomains: ["inventory_stock", "working_capital", "cash_flow", "vendor_supplier"] },
  { key: "remote_owner_vs_proof", conflict: "remote owner vs proof/control", decisionCategory: "staff_process_equipment", flags: { hostile: true, remoteOwner: true }, numbers: {}, hiddenRootCause: "a remote owner is being given unverifiable reports by staff", correctTopPriority: "proof_fraud_block", temptingWrongPriority: "act on the staff report", candidates: [C("ops", "Act on the report", "act_on_report"), C("ops", "Require independent verification", "proceed")], activeDomains: ["proof_anti_gaming", "fraud_collusion", "remote_owner", "owner_workload"] },
  { key: "multi_location_vs_attention", conflict: "multi-location growth vs owner attention", decisionCategory: "multi_branch_portfolio", flags: { multiBranch: true, remoteOwner: true }, numbers: {}, hiddenRootCause: "adding locations stretches the owner's attention beyond what controls allow", correctTopPriority: "owner_workload", temptingWrongPriority: "keep adding locations", candidates: [C("strategy", "Add another location", "expand"), C("ops", "Stabilise control before adding", "proceed")], activeDomains: ["multi_location_portfolio", "owner_workload", "remote_owner", "scaling_expansion"] },
  { key: "shutdown_vs_sunk_cost", conflict: "shutdown/pivot vs sunk cost", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { cash: 8000, monthlyLoss: 50000 }, hiddenRootCause: "a line keeps losing money but the owner won't stop due to sunk cost", correctTopPriority: "cash_survival", temptingWrongPriority: "keep funding the losing line", candidates: [C("owner", "Keep funding it", "proceed"), C("finance", "Set a stop-loss and cut losses", "proceed")], activeDomains: ["shutdown_pivot_stoploss", "cash_flow", "risk_management", "strategy"] },
  { key: "hiring_vs_process", conflict: "hiring vs process failure", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, hiddenRootCause: "hiring is tempting but the real problem is a broken process, not headcount", correctTopPriority: "capacity_feasibility", temptingWrongPriority: "hire more people", candidates: [C("ops", "Hire more staff", "hire"), C("ops", "Fix the process bottleneck first", "proceed")], activeDomains: ["staff_management", "process_improvement", "operations", "equipment_capacity"] },
  { key: "automation_vs_discipline", conflict: "automation vs operational discipline", decisionCategory: "staff_process_equipment", flags: { capacityRisk: true }, numbers: {}, hiddenRootCause: "buying tooling won't fix a process that lacks basic discipline and SOPs", correctTopPriority: "capacity_feasibility", temptingWrongPriority: "buy automation tooling", candidates: [C("ops", "Buy automation tooling", "buy_equipment"), C("ops", "Establish SOP discipline first", "proceed")], activeDomains: ["process_improvement", "sop_checklist", "equipment_capacity", "operations"] },
  { key: "franchise_rules_vs_local", conflict: "franchise brand rules vs local economics", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 12, fullyLoadedCost: 16, paymentTermsDays: 15 }, hiddenRootCause: "brand-fixed pricing is below local fully-loaded cost in this market", correctTopPriority: "below_margin", temptingWrongPriority: "follow brand pricing at a loss", candidates: [C("sales", "Follow brand pricing", "accept_contract"), C("pricing", "Escalate the unit-economics gap to brand", "proceed")], activeDomains: ["pricing_margin", "location_market", "multi_location_portfolio", "strategy"] },
  { key: "survival_vs_long_term", conflict: "short-term survival vs long-term growth", decisionCategory: "cash_margin_working_capital", flags: { cashRisk: true }, numbers: { cash: 14000 }, hiddenRootCause: "a long-term growth bet competes with this month's survival cash", correctTopPriority: "cash_survival", temptingWrongPriority: "invest in the long-term bet now", candidates: [C("strategy", "Invest in the growth bet", "spend_marketing"), C("finance", "Secure survival cash first", "proceed")], activeDomains: ["cash_flow", "strategy", "budgeting_capital", "risk_management"] },
];

const LOCATION_KEYS = Object.keys(LOCATIONS) as LocationKey[];

export interface CollectiveCase {
  id: string;
  conflictArchetype: string;
  base: BehavioralCase;
  activeDomains: DomainId[];
  conflictingRecommendations: DomainCandidate[];
  correctTopPriority: Constraint;
  temptingWrongPriority: string;
  cashProfitImpact: string;
  operationalConstraint: string;
  ownerWorkloadImplication: string;
  proofRequirement: string;
  reassessmentTrigger: string;
  expectedWholeBusinessAnswer: string;
}

function fullFlags(p: Partial<CaseFlags>): CaseFlags {
  return { hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p };
}

export function buildCollectiveCases(): CollectiveCase[] {
  const out: CollectiveCase[] = [];
  RECIPES.forEach((r, ri) => {
    for (let v = 0; v < 6; v++) {
      const locKey = LOCATION_KEYS[(ri * 6 + v) % LOCATION_KEYS.length];
      const base: BehavioralCase = {
        ...BASE,
        id: `collective_${r.key}_${locKey}_${v}`,
        sourceSeedCaseId: BASE.sourceSeedCaseId,
        title: `${r.conflict} — ${LOCATIONS[locKey].cityRegion}`,
        decisionCategory: r.decisionCategory,
        location: LOCATIONS[locKey],
        numbers: { ...r.numbers },
        // Clean, conflict-specific facts (do not inherit the seed's unrelated quality complaints).
        messyFacts: [`Conflict: ${r.conflict}.`, r.hiddenRootCause, `Tempting wrong move: ${r.temptingWrongPriority}.`],
        hiddenRootCause: r.hiddenRootCause,
        flags: fullFlags(r.flags),
      };
      out.push({
        id: base.id,
        conflictArchetype: r.key,
        base,
        activeDomains: r.activeDomains,
        conflictingRecommendations: r.candidates,
        correctTopPriority: r.correctTopPriority,
        temptingWrongPriority: r.temptingWrongPriority,
        cashProfitImpact: `Resolving ${r.correctTopPriority} protects cash/profit; the tempting move (${r.temptingWrongPriority}) would worsen it.`,
        operationalConstraint: r.hiddenRootCause,
        ownerWorkloadImplication: r.activeDomains.includes("owner_workload") ? "Owner attention is a binding constraint; delegate with proof." : "Delegate routine checks so the owner is not the bottleneck.",
        proofRequirement: "Independent, current proof of the numbers/constraint before any irreversible action.",
        reassessmentTrigger: "Reassess in 7 days against the dominant constraint.",
        expectedWholeBusinessAnswer: `Top priority: resolve ${r.correctTopPriority}; reject ${r.temptingWrongPriority}; proceed only via a capped, proof-gated step.`,
      });
    }
  });
  return out;
}

export const COLLECTIVE_CASES = buildCollectiveCases();
