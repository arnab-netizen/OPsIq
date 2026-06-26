/**
 * D3 — Pricing decisions domain (responder, pure).
 *
 * Grounds pricing in floor price + target margin + segment + retention, and blocks
 * blind competitor matching, below-margin discounting, broad untested price changes
 * under risk, and B2B discounts without contribution proof. Wires F2/F4 confidence.
 * Never emits a vetoed action. Pure + deterministic.
 */

import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface PricingInput {
  belowFloor?: boolean;
  targetMarginMet?: boolean;
  competitorMatchingBlind?: boolean;
  broadPriceChangeHighRisk?: boolean;
  b2bDiscountNoContributionProof?: boolean;
  segmentPricingNeeded?: boolean;
  retentionRiskHigh?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondPricingDecisions(input: PricingInput): DomainResponse {
  const targetMarginMet = input.targetMarginMet !== false;
  let severity: TrainingSeverity = "LOW";
  if (!targetMarginMet || input.b2bDiscountNoContributionProof) severity = "MEDIUM";
  if (input.belowFloor || input.broadPriceChangeHighRisk) severity = "HIGH";

  const data = assessDataConfidence(input.dataPoints);
  const confidence = classifyConfidence({
    dataConfidence: data.ceiling,
    blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0,
    complianceSensitive: input.complianceSensitive === true,
  });

  const wntd = new Set<string>();
  if (input.belowFloor) { wntd.add("no below-floor pricing"); wntd.add("no discounting below margin"); }
  if (input.competitorMatchingBlind) wntd.add("no blind competitor matching");
  if (input.broadPriceChangeHighRisk) wntd.add("no broad price change without a test");
  if (input.b2bDiscountNoContributionProof) wntd.add("no B2B discount without contribution proof");
  if (input.retentionRiskHigh) wntd.add("no price change risking key-customer retention without review");

  let nextAction: string;
  if (input.belowFloor || !targetMarginMet || input.b2bDiscountNoContributionProof) {
    nextAction = "Reprice at or above the contribution floor to meet the target margin; pilot the change on one segment before any broad rollout.";
  } else if (input.segmentPricingNeeded) {
    nextAction = "Introduce segment pricing: protect high-value segments and test a small increase on low-margin ones.";
  } else {
    nextAction = "Hold price; monitor competitor context and value perception; test on one segment before any broad change.";
  }

  const diagnosis = `Pricing decision: floor/target-margin ${targetMarginMet ? "met" : "not met"}; severity ${severity}.`;

  return {
    diagnosis,
    confidence,
    severity,
    whatNotToDo: [...wntd],
    nextAction,
    assignedRole: "Owner",
    proofRequired: "contribution floor, target margin, segment margins, and competitor context",
    verificationMethod: "recheck margin, conversion and retention after the price test on one segment",
    sideEffectMetrics: ["conversion", "repeat rate", "complaint rate", "customer retention"],
    hasStopRule: true,
    hasRollbackRule: true,
    hasRedesignRule: true,
    unsafeEmitted: [],
  };
}
