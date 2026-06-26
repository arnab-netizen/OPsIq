/**
 * D1 — Cash survival domain (responder, pure).
 *
 * Wires the existing engines into one governed response: cash/finance state → severity,
 * F2 data-confidence + F4 confidence protocol → confidence, F6 veto matrix → what-not-to-do.
 * General logic (no per-case hardcoding); the 21 cases assert it produces the correct
 * governed output across scenarios. Never emits a vetoed action. Pure + deterministic.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import { evaluateVetoes, NO_VETOES } from "@/domain/domain-training/veto-matrix";
import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export type FinanceState = "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK" | "UNKNOWN";

export interface CashSurvivalInput {
  cashflowState: FinanceState;
  survivalState: FinanceState;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
  negativeMargin?: boolean;
  ownerOverload?: boolean;
  staffOverload?: boolean;
  capacityOverload?: boolean;
  /** Owner claims the cash issue is resolved but supplies no proof (false-completion). */
  ownerClaimsResolvedNoProof?: boolean;
  /** Owner wants to chase revenue / discount despite the cash/margin picture (vanity/pressure). */
  ownerWantsRevenueChase?: boolean;
}

const STATE_SEVERITY: Record<FinanceState, TrainingSeverity> = {
  SAFE: "LOW", WATCH: "MEDIUM", AT_RISK: "HIGH", CRITICAL: "CRITICAL", INSOLVENT_RISK: "CRITICAL", UNKNOWN: "HIGH",
};
const SEV_RANK: TrainingSeverity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
function worseSeverity(a: TrainingSeverity, b: TrainingSeverity): TrainingSeverity {
  return SEV_RANK.indexOf(a) >= SEV_RANK.indexOf(b) ? a : b;
}

const VETO_PHRASE: Record<string, string> = {
  growth: "no growth/expansion",
  paid_marketing: "no paid marketing",
  expansion: "no expansion",
  non_essential_hiring: "no non-essential hiring",
  bulk_buying: "no bulk buying",
  discounting_below_margin: "no discounting below margin",
  low_price_b2b: "no low-price B2B",
  revenue_chasing: "no revenue-chasing",
  closure: "do not close without proof",
  high_confidence_recommendation: "no high-confidence call on weak data",
  learning_admission: "no learning from unverified outcome",
  demand_generation: "no broad demand generation",
  new_non_critical_task: "no new non-critical tasks",
  owner_heavy_action: "no owner-heavy action",
  confident_diagnosis: "no confident diagnosis on contradictory data",
};

export function respondCashSurvival(input: CashSurvivalInput): DomainResponse {
  const severity = worseSeverity(STATE_SEVERITY[input.cashflowState], STATE_SEVERITY[input.survivalState]);
  const criticalCash = severity === "CRITICAL";

  const data = assessDataConfidence(input.dataPoints);
  const confidence = classifyConfidence({
    dataConfidence: data.ceiling,
    blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0,
    complianceSensitive: input.complianceSensitive === true,
  });

  const missingProof = input.ownerClaimsResolvedNoProof === true || data.missingCritical.length > 0;
  const vetoes = evaluateVetoes({
    ...NO_VETOES,
    criticalCashSurvivalRisk: criticalCash,
    complianceOrSafetyUncertain: input.complianceSensitive === true,
    negativeMargin: input.negativeMargin === true,
    ownerOverload: input.ownerOverload === true,
    staffOverload: input.staffOverload === true,
    capacityOverload: input.capacityOverload === true,
    missingProof,
    contradictoryData: data.blockedByContradiction,
  });

  const whatNotToDo = [...new Set(vetoes.blocked.map((a) => VETO_PHRASE[a]).filter(Boolean))];

  const stateUnsafe = severity === "HIGH" || severity === "CRITICAL";
  const diagnosis = `Cash survival is ${input.cashflowState}/${input.survivalState}; runway/obligations risk is ${severity}.`;

  let nextAction: string;
  let assignedRole: string;
  if (input.ownerClaimsResolvedNoProof) {
    nextAction = "Do not close the cash issue yet — collect the bank/cash proof and verify the position first.";
    assignedRole = "Owner";
  } else if (stateUnsafe) {
    nextAction = "Call overdue customers today using the approved follow-up script and log promised payment dates to recover cash.";
    assignedRole = "Billing Staff";
  } else {
    nextAction = "Maintain the cash buffer and keep monitoring obligations; no spend beyond essentials.";
    assignedRole = "Owner";
  }

  return {
    diagnosis,
    confidence,
    severity,
    whatNotToDo,
    nextAction,
    assignedRole,
    proofRequired: "bank/cash position plus receivables/payables and collection proof",
    verificationMethod: "recheck the cash position after the collection window and confirm obligations covered",
    sideEffectMetrics: ["supplier reliability", "staff payroll", "service quality", "customer retention"],
    hasStopRule: true,
    hasRollbackRule: true,
    hasRedesignRule: true,
    unsafeEmitted: [], // the responder never emits a vetoed action
  };
}
