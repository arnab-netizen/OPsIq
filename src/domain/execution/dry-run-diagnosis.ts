/**
 * Synthetic-realistic owner dry-run diagnosis (pure logic).
 *
 * Turns a (synthetic-realistic) owner scenario into a governed diagnosis: a
 * progression decision (reusing the proven progression engine), process-
 * modernization SOP recommendations, client-retention/recovery workflows, and a
 * stabilization-vs-expansion verdict. Every recommendation is owner-review-
 * required and nothing here writes learning.
 *
 * A hard guard enforces the honesty rule: data labelled NOT_REAL_OWNER_DATA can
 * never enter verified learning.
 */

import {
  GrowthSignals,
  GrowthClassification,
  classifyGrowth,
  evaluateProgressionRecommendation,
  ProgressionMove,
  ProgressionDecision,
} from "@/domain/execution/progression-engine";

export const SYNTHETIC_DATA_MODE = "SYNTHETIC_REALISTIC";
export const NOT_REAL_OWNER_DATA = "NOT_REAL_OWNER_DATA";

export interface DataModeMeta {
  dataMode?: string;
  dataTruthStatus?: string;
}

/** True only for real owner data. Synthetic-realistic data is never real. */
export function isRealOwnerData(meta: DataModeMeta | undefined | null): boolean {
  if (!meta) return false;
  return meta.dataTruthStatus !== NOT_REAL_OWNER_DATA && meta.dataMode !== SYNTHETIC_DATA_MODE;
}

/** Fail-closed: synthetic / not-real data can never be promoted to verified learning. */
export function canEnterVerifiedLearning(meta: DataModeMeta | undefined | null): boolean {
  return isRealOwnerData(meta);
}

export interface DistressFinancials {
  monthlyRevenue: number;
  monthlyDebtRepayment: number;
  monthlyPayroll: number;
  materialCost: number;
  travelCost?: number;
  cashCollected: number;
  invoicesOverdue: number;
  /** 0..1 gross-margin estimate. */
  grossMarginEstimate: number;
  /** Positive number = monthly cash shortfall. */
  netCashShortfall: number;
}

export interface OpsSignals {
  revenueGrowing: boolean;
  repeatCustomersStrong: boolean;
  staffQualityStable: boolean;
  ownerFirefightingDaily: boolean;
  sopManagerLayerWorking: boolean;
  complaintsOrReworkRising: boolean;
  capacityStressed: boolean;
  profitImpactVerified: boolean;
  /** Pricing is not linked to labour/material/travel cost → margin is unclear. */
  marginNotCostLinked?: boolean;
  lostCommercialClients: number;
  atRiskCommercialClients: number;
  unknownSignals?: string[];
}

/** Map a scenario's financials + ops signals into the progression engine's GrowthSignals. */
export function toGrowthSignals(fin: DistressFinancials, ops: OpsSignals): GrowthSignals {
  return {
    cashRunwayWeak: fin.netCashShortfall > 0 || fin.cashCollected < fin.monthlyPayroll + fin.monthlyDebtRepayment,
    grossMarginClear: fin.grossMarginEstimate >= 0.15 && !ops.marginNotCostLinked,
    marginNegative: fin.grossMarginEstimate <= 0,
    repeatCustomersStrong: ops.repeatCustomersStrong,
    staffQualityStable: ops.staffQualityStable,
    ownerFirefightingDaily: ops.ownerFirefightingDaily,
    sopManagerLayerWorking: ops.sopManagerLayerWorking,
    complaintsOrReworkRising: ops.complaintsOrReworkRising,
    capacityStressed: ops.capacityStressed,
    profitImpactVerified: ops.profitImpactVerified,
    revenueGrowing: ops.revenueGrowing,
    unknownSignals: ops.unknownSignals,
  };
}

export enum RecoveryStage {
  STABILIZATION_FIRST = "STABILIZATION_FIRST",
  CONTROLLED_GROWTH_OK = "CONTROLLED_GROWTH_OK",
}

export interface ProgressionDiagnosis {
  stage: RecoveryStage;
  expansionAllowed: boolean;
  classification: GrowthClassification;
  decision: ProgressionDecision;
  /** Always true: a dry-run recommendation can never auto-apply. */
  ownerApprovalRequired: true;
}

/**
 * Diagnose whether the business may progress/expand. Cash shortfall, client
 * loss, weak margin, rework, or owner firefighting force STABILIZATION_FIRST and
 * block expansion (fail-closed via the proven progression engine).
 */
export function diagnoseProgression(
  fin: DistressFinancials,
  ops: OpsSignals,
  move: ProgressionMove = ProgressionMove.SECOND_LOCATION
): ProgressionDiagnosis {
  const signals = toGrowthSignals(fin, ops);
  const decision = evaluateProgressionRecommendation(signals, move);
  const { classification } = classifyGrowth(signals);
  const clientLoss = ops.lostCommercialClients > 0 || ops.atRiskCommercialClients > 0;
  const expansionAllowed = decision.allowed && !clientLoss;
  return {
    stage: expansionAllowed ? RecoveryStage.CONTROLLED_GROWTH_OK : RecoveryStage.STABILIZATION_FIRST,
    expansionAllowed,
    classification,
    decision,
    ownerApprovalRequired: true,
  };
}

/** Known outdated-process defect flags → the SOP/process modernization they trigger. */
export const PROCESS_DEFECT_TO_SOP: Readonly<Record<string, string>> = {
  no_digital_checklist: "Introduce a digital per-task checklist (replace memory/WhatsApp).",
  no_before_after_proof: "Require before/after photo proof for deep-clean and rework jobs.",
  no_site_specific_sop: "Author site-specific SOPs per commercial contract.",
  manual_whatsapp_assignment: "Move assignment to the governed task system (no ad-hoc WhatsApp).",
  no_escalation_sla: "Define escalation SLAs by severity and route to supervisor/owner.",
  no_proof_review_queue: "Stand up a manager proof-review queue for high-risk proof.",
  no_client_risk_score: "Compute a client-risk/at-risk score for retention.",
  no_manager_dashboard: "Provide a manager/owner exception dashboard.",
  no_employee_task_dashboard: "Provide an employee task dashboard scoped to own work.",
  no_payment_follow_up_rhythm: "Establish an invoice/payment follow-up rhythm within authority limits.",
  no_rework_tracking: "Track rework rate per team/site as a quality signal.",
  no_contract_renewal_reminder: "Add recurring-contract renewal reminders ahead of expiry.",
};

export interface SopModernizationRecommendation {
  defect: string;
  recommendation: string;
  ownerApprovalRequired: true;
}

/** Map outdated-process signals to owner-review-required SOP modernization recommendations. */
export function recommendProcessModernization(processDefects: string[]): SopModernizationRecommendation[] {
  return processDefects
    .filter((d) => d in PROCESS_DEFECT_TO_SOP)
    .map((d) => ({ defect: d, recommendation: PROCESS_DEFECT_TO_SOP[d], ownerApprovalRequired: true }));
}

export interface ClientRetentionRecommendation {
  kind: "RECOVERY" | "RETENTION";
  description: string;
  ownerApprovalRequired: true;
}

/**
 * Lost commercial clients trigger a recovery workflow; at-risk clients trigger a
 * retention workflow. Both are owner-review-required.
 */
export function recommendClientRetention(lostCommercialClients: number, atRiskCommercialClients: number): ClientRetentionRecommendation[] {
  const recs: ClientRetentionRecommendation[] = [];
  if (lostCommercialClients > 0) {
    recs.push({ kind: "RECOVERY", description: `Win-back outreach for ${lostCommercialClients} lost commercial client(s) with root-cause review.`, ownerApprovalRequired: true });
  }
  if (atRiskCommercialClients > 0) {
    recs.push({ kind: "RETENTION", description: `Retention plan (quality + SLA + renewal) for ${atRiskCommercialClients} at-risk commercial client(s).`, ownerApprovalRequired: true });
  }
  return recs;
}
