/**
 * D2 — Profit improvement domain (responder, pure).
 *
 * Detects margin/discount/delivery/rework leakage and revenue-without-profit (vanity),
 * and blocks revenue-chasing, below-margin deals, and quality-damaging cost cuts. Wires
 * F2 data-confidence + F4 confidence + the negative-margin veto. Never emits a vetoed
 * action. Pure + deterministic.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export type MarginState = "HEALTHY" | "THIN" | "NEGATIVE" | "UNKNOWN";

export interface ProfitInput {
  marginState: MarginState;
  dataPoints: DataPoint[];
  discountLeakage?: boolean;
  lowMarginSegmentPresent?: boolean;
  deliveryCostLeakage?: boolean;
  reworkRefundCost?: boolean;
  /** Revenue growing while profit is flat/falling (vanity). */
  revenueGrowingProfitFlat?: boolean;
  ownerWantsRevenueChase?: boolean;
  /** Owner proposes a cost cut that damages quality without proof. */
  ownerWantsCostCutDamagingQuality?: boolean;
  proposedBelowMarginDeal?: boolean;
  complianceSensitive?: boolean;
}

const STATE_SEVERITY: Record<MarginState, TrainingSeverity> = {
  HEALTHY: "LOW", THIN: "MEDIUM", NEGATIVE: "HIGH", UNKNOWN: "MEDIUM",
};

export function respondProfitImprovement(input: ProfitInput): DomainResponse {
  const severity = STATE_SEVERITY[input.marginState];
  const data = assessDataConfidence(input.dataPoints);
  const confidence = classifyConfidence({
    dataConfidence: data.ceiling,
    blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0,
    complianceSensitive: input.complianceSensitive === true,
  });

  const leakage = !!(input.discountLeakage || input.lowMarginSegmentPresent || input.deliveryCostLeakage || input.reworkRefundCost);

  const wntd = new Set<string>();
  if (input.marginState === "NEGATIVE") {
    wntd.add("no discounting below margin");
    wntd.add("no low-price B2B");
    wntd.add("no revenue-chasing");
  }
  if (input.proposedBelowMarginDeal) wntd.add("no below-margin deals");
  if (input.revenueGrowingProfitFlat || input.ownerWantsRevenueChase) {
    wntd.add("no revenue-chasing");
    wntd.add("no vanity sales growth");
  }
  if (input.ownerWantsCostCutDamagingQuality) wntd.add("no quality-damaging cost cuts without proof");
  if (input.discountLeakage) wntd.add("no unmonitored discounting");

  let nextAction: string;
  if (input.marginState === "NEGATIVE" || leakage) {
    nextAction = "Identify the lowest-margin service line/segment and reprice it or stop the discount this month to recover margin.";
  } else if (input.revenueGrowingProfitFlat) {
    nextAction = "Stop chasing revenue and fix the margin leak first: reprice the loss-making line and protect contribution margin.";
  } else {
    nextAction = "Protect margin: monitor discounts and delivery cost; take no below-margin deals.";
  }

  const diagnosis = `Profit/margin state is ${input.marginState}${leakage ? " with leakage (discount/delivery/rework/low-margin segment)" : ""}; severity ${severity}.`;

  return {
    diagnosis,
    confidence,
    severity,
    whatNotToDo: [...wntd],
    nextAction,
    assignedRole: "Owner",
    proofRequired: "margin by service/segment, discount log, delivery cost, and rework/refund cost",
    verificationMethod: "recheck contribution margin per segment after the repricing/cost change",
    sideEffectMetrics: ["conversion", "repeat rate", "complaint rate", "customer retention"],
    hasStopRule: true,
    hasRollbackRule: true,
    hasRedesignRule: true,
    unsafeEmitted: [],
  };
}
