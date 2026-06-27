/**
 * Dynamic Budget, Capital Allocation & Profit Governance — shared types (pure).
 *
 * No DB/IO. Monetary values are in the business currency (never assumed USD).
 * Missing numbers are treated as `null`/absent and NEVER invented. This module
 * REUSES the owner-finance metric engine (margins, runway, break-even) and the
 * collective decision engine; it does not re-derive financial math here.
 */

import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";
import type { WorkingCapitalInput } from "@/domain/owner-budget/working-capital";
import type { WorkingCapitalAgeingResult } from "@/domain/owner-budget/working-capital-ageing";
import type { RevenueAssuranceInput } from "@/domain/owner-budget/revenue-assurance";
import type { VendorControlInput } from "@/domain/owner-budget/vendor-control";
import type { UnderinvestmentInput } from "@/domain/owner-budget/underinvestment";
import type { CollusionInput } from "@/domain/owner-budget/collusion";

/** Business budget mode (Section 5). Multiple may be active → HYBRID. */
export type BudgetMode =
  | "EMERGENCY" | "STABILIZE" | "GROW" | "SCALE" | "PROFIT_INCREASE" | "HYBRID" | "DATA_INSUFFICIENT";

/** Evidence/data confidence for budget planning (Section 10), ordered weakest→strongest. */
export type BudgetConfidenceLevel = "UNVERIFIED" | "PARTIAL" | "OPERATIONAL" | "VERIFIED" | "AUDITED";

export const CONFIDENCE_ORDER: readonly BudgetConfidenceLevel[] = [
  "UNVERIFIED", "PARTIAL", "OPERATIONAL", "VERIFIED", "AUDITED",
];

/** Provenance of a budget/spend input (Section 10). */
export type SpendSourceType = "MANUAL" | "UPLOAD" | "SYSTEM" | "IMPORT" | "RECONCILED" | "ESTIMATED";

/** A dated cash obligation that constrains free cash (Section 11). */
export interface CashObligation {
  label: string;
  amount: number;
  dueInDays: number;
  kind: "payroll" | "tax" | "rent" | "emi" | "vendor" | "statutory" | "other";
}

/** Owner goal the plan should reference (Section 31). */
export type OwnerGoal =
  | "stabilize" | "profit" | "revenue" | "cash_reserve" | "growth" | "scale" | "debt_repayment";

/**
 * The decision-relevant business state handed to the budget engine. `finance` is
 * the reused owner-finance snapshot input (margins/runway/break-even are derived
 * from it). Everything else is a budget-specific signal that gates mode/allocation.
 */
export interface BudgetAssessmentInput {
  finance: FinancialSnapshotInput;
  /** Owner-set minimum cash reserve to hold. */
  cashReserveTarget?: number | null;
  /** Statutory/payroll/tax reserve that must remain untouched. */
  statutoryReserveRequired?: number | null;
  /** Upcoming dated obligations within the planning horizon. */
  obligations?: CashObligation[];
  /** Explicit unit-economics signal if known (else derived from finance contribution margin). */
  unitEconomicsPositive?: boolean | null;
  /** Operational capacity utilization (0..100). */
  capacityUtilizationPct?: number | null;
  workloadOverloaded?: boolean;
  qualityDeteriorating?: boolean;
  /** Demand proven repeatable (scale gate). */
  demandRepeatable?: boolean;
  /** Owner-dependency high (scale gate fails when true). */
  ownerDependencyHigh?: boolean;
  /** Active fraud/collusion/critical-control breach (forces EMERGENCY). */
  controlBreach?: boolean;
  /** Overall data confidence; if omitted it is derived from finance data completeness. */
  dataConfidence?: BudgetConfidenceLevel;
  ownerGoal?: OwnerGoal;
  /** Critical inputs the owner has not provided (forces DATA_INSUFFICIENT when present + low confidence). */
  criticalMissingInputs?: string[];
  /** Planning horizon in days for obligation/free-cash math (default 30). */
  horizonDays?: number;
  /** Working-capital terms (collection gap, pending receipt) beyond finance aggregates.
   *  `ageing` carries a precomputed ageing assessment (the composer stays pure — it
   *  consumes the assessment, it does not load DB). */
  workingCapital?: Pick<WorkingCapitalInput, "collectionGapDays" | "pendingReceiptValue"> & {
    ageing?: WorkingCapitalAgeingResult;
  };
  /** Revenue-assurance counts (orders/invoices/deposits) beyond finance aggregates. */
  revenueAssurance?: RevenueAssuranceInput;
  /** Aggregated vendor/procurement control signal for the period's spend. */
  vendorControl?: VendorControlInput;
  /** Underinvestment signals (underfunded areas + adverse trends). */
  underinvestment?: Omit<UnderinvestmentInput, "cashSafe"> & { cashSafe?: boolean };
  /** Collusion/fraud pattern counts for the period. */
  collusion?: CollusionInput;
  /** Count of unreconciled/disputed/mismatched spends in the period. */
  reconciliationExceptionCount?: number;
  /** Archetype-specific operational metrics (manual / import-ready) for the budget
   *  pack (laundry / housekeeping). The archetype identity is resolved from
   *  `finance.industryTemplate`; this carries the per-load/per-job operational inputs. */
  archetypeSignals?: {
    laundry?: import("@/domain/owner-budget/archetype-packs").LaundryArchetypeSignals | null;
    housekeeping?: import("@/domain/owner-budget/archetype-packs").HousekeepingArchetypeSignals | null;
  };
}

export interface CashPosture {
  cashOnHand: number | null;
  runwayDays: number | null;
  cashDaysOfCosts: number | null;
  statutoryReserveRequired: number;
  obligationsDueInHorizon: number;
  freeCashAfterObligations: number | null;
  reserveBreached: boolean;
  nextCriticalDueInDays: number | null;
}

export interface BudgetModeResult {
  primaryMode: BudgetMode;
  /** All independently-active modes (transparency). */
  activeModes: BudgetMode[];
  reasons: string[];
  confidence: BudgetConfidenceLevel;
  cash: CashPosture;
  missingCriticalData: string[];
  /** Net margin pct derived from finance (null = not computable). */
  netMarginPct: number | null;
}

/** Capital allocation hierarchy (Section 6), strongest priority first. */
export type AllocationCategory =
  | "statutory_payroll_tax"
  | "cash_survival"
  | "critical_fixed_obligations"
  | "service_continuity_safety"
  | "fraud_control_containment"
  | "essential_operations"
  | "profit_protection"
  | "customer_retention_quality"
  | "growth_roi"
  | "scale_after_readiness"
  | "strategic_experiment"
  | "discretionary";

export const ALLOCATION_HIERARCHY: readonly AllocationCategory[] = [
  "statutory_payroll_tax",
  "cash_survival",
  "critical_fixed_obligations",
  "service_continuity_safety",
  "fraud_control_containment",
  "essential_operations",
  "profit_protection",
  "customer_retention_quality",
  "growth_roi",
  "scale_after_readiness",
  "strategic_experiment",
  "discretionary",
];

export interface AllocationCandidate {
  id: string;
  label: string;
  category: AllocationCategory;
  amount: number;
  reversible: boolean;
  expectedReturnPct?: number | null;
  paybackMonths?: number | null;
  evidenceConfidence?: BudgetConfidenceLevel;
  accountableRole?: string;
  proofRequired?: string;
}

export type AllocationDecision =
  | "FUND" | "PARTIAL_FUND" | "DEFER" | "BLOCK" | "INVESTIGATE";

export interface RankedAllocation {
  candidate: AllocationCandidate;
  rank: number;
  decision: AllocationDecision;
  fundedAmount: number;
  reason: string;
  confidence: BudgetConfidenceLevel;
  reviewInDays: number;
  killRule: string;
}

export interface AvailableBudget {
  approved: number | null;
  committed: number | null;
  paid: number | null;
  accrued: number | null;
  reserveRequired: number;
  obligationsDueSoon: number;
  freeToAllocate: number | null;
}

export interface CapitalAllocationResult {
  available: AvailableBudget;
  ranked: RankedAllocation[];
  blockedCount: number;
  fundedTotal: number;
}

/** Spend lifecycle state (Section 18). */
export type SpendState =
  | "planned" | "requested" | "approved" | "rejected" | "deferred" | "committed"
  | "paid" | "proof_uploaded" | "proof_matched" | "operationally_validated"
  | "payment_matched" | "reconciled" | "verified" | "disputed" | "voided";

export type SpendRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SpendGovernanceInput {
  amount: number;
  category: string;
  requestedByUserId: string;
  approvedByUserId?: string | null;
  /** Approval threshold above which owner approval is required. */
  ownerApprovalThreshold: number;
  isNewVendor?: boolean;
  vendorBankChanged?: boolean;
  /** Amounts of recent same-category spends by same actor in the window (split-spend detection). */
  recentSameCategoryAmounts?: number[];
  /** Sum just below threshold heuristic window. */
  proofStatus?: "missing" | "uploaded" | "matched" | "disputed" | "reconciled";
  emergency?: boolean;
  dataConfidence?: BudgetConfidenceLevel;
}

export type SpendDecisionType =
  | "AUTO_LOG" | "REQUIRE_PROOF" | "REQUIRE_OWNER_APPROVAL" | "HOLD" | "BLOCK" | "INVESTIGATE";

export interface SpendGovernanceResult {
  riskLevel: SpendRiskLevel;
  decision: SpendDecisionType;
  /** Control-violation flags (never criminal accusations; "requires review" language). */
  flags: string[];
  requiredProof: boolean;
  requiresOwnerApproval: boolean;
  reasons: string[];
}

/** Updated owner plan (Section 7). */
export type PlanDecisionType =
  | "APPROVE" | "BLOCK" | "PAUSE" | "REDUCE" | "INCREASE" | "REALLOCATE"
  | "INVESTIGATE" | "DEFER" | "ESCALATE" | "COLLECT_EVIDENCE";

export interface BudgetGeneratedAction {
  title: string;
  accountableRole: string;
  decisionType: PlanDecisionType;
  requiredProof: string;
  reviewInDays: number;
  expectedFinancialImpact: string;
  killRule: string;
}

/** Budget signals emitted for cross-module consumption (Section 30). */
export type BudgetSignalType =
  | "cash_runway_risk" | "statutory_reserve_breach" | "profit_guardrail_breach"
  | "budget_variance_critical" | "underinvestment_detected" | "growth_budget_available"
  | "growth_budget_blocked" | "scale_budget_ready" | "scale_budget_blocked"
  | "spend_proof_missing" | "reconciliation_exception" | "revenue_leakage_risk"
  | "unit_economics_negative" | "manager_budget_violation" | "approval_bypass_risk"
  | "vendor_control_risk" | "owner_override_recorded" | "reassessment_required"
  | "working_capital_risk" | "updated_plan_ready"
  // Working-capital ageing (Dynamic Budget ageing slice)
  | "receivables_ageing_risk" | "payables_ageing_risk" | "collection_first_required"
  | "vendor_pressure_risk" | "cash_conversion_risk" | "profitable_but_cash_negative"
  | "growth_blocked_by_working_capital" | "working_capital_data_stale"
  | "working_capital_data_insufficient"
  // Archetype-specific budget packs (laundry / housekeeping)
  | "laundry_consumable_leakage" | "laundry_delivery_uneconomic" | "laundry_b2b_margin_risk"
  | "laundry_machine_downtime_risk" | "laundry_discount_contribution_risk"
  | "housekeeping_travel_inefficiency" | "housekeeping_overtime_without_output"
  | "housekeeping_contract_underpriced" | "housekeeping_supplies_variance"
  | "archetype_data_insufficient"
  // Working-capital × archetype cross-integration
  | "laundry_b2b_cash_conversion_risk" | "laundry_b2b_payment_terms_risk"
  | "laundry_reserve_protected_by_downtime_and_receivables"
  | "housekeeping_recurring_contract_cash_risk" | "housekeeping_payroll_collection_conflict";

export interface BudgetSignal {
  type: BudgetSignalType;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
}

export interface ChangeDescriptor {
  field: string;
  previousValue?: string | number | null;
  newValue?: string | number | null;
  domain?: string;
}

export interface UpdatedOwnerPlan {
  mode: BudgetMode;
  topConstraint: string;
  nextBestAction: string;
  decisionType: PlanDecisionType;
  whatChanged: ChangeDescriptor | null;
  affectedBudgetLines: string[];
  affectedFunctions: string[];
  fundAllocationChanges: string[];
  spendRestrictions: string[];
  accountableRoles: string[];
  generatedActions: BudgetGeneratedAction[];
  requiredProof: string[];
  cashImpact: string;
  profitImpact: string;
  runwayImpact: string;
  confidence: BudgetConfidenceLevel;
  reviewInDays: number;
  killRule: string;
  signals: BudgetSignal[];
  /** Cross-domain "what not to do" sourced from the reused collective engine. */
  whatNotToDo: string[];
  /** Cautious flag set when mode is DATA_INSUFFICIENT — blocks high-risk recommendations. */
  highRiskBlocked: boolean;
}
