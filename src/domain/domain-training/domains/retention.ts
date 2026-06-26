/**
 * D13 — Customer retention (responder, pure).
 * Detects churn / weak repeat rate / missing retention tracking; blocks acquisition
 * spend and scaling on top of a leaky bucket. Wires F2/F4 confidence. Pure + deterministic.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface RetentionInput {
  churnRate: number;
  repeatPurchaseRate?: number;
  noRetentionTracking?: boolean;
  ownerWantsAcquisitionSpend?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondRetention(input: RetentionInput): DomainResponse {
  const churn = input.churnRate;
  const red = churn >= 0.2;
  const amber = !red && (churn >= 0.1 || input.noRetentionTracking === true);
  const severity: TrainingSeverity = red ? "HIGH" : amber ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (red || amber) { wntd.push("no acquisition spend while retention is leaking"); wntd.push("no scaling on top of a leaky bucket"); }

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (red) nextAction = "Fix the retention leak (find why customers churn) before any acquisition spend; recheck churn and repeat rate.";
  else if (input.noRetentionTracking) nextAction = "Set up retention tracking (churn and repeat rate) before judging acquisition, then re-evaluate.";
  else if (amber) nextAction = "Tighten retention on the at-risk segment and monitor churn and repeat rate.";
  else nextAction = "Retention is stable; protect it and keep tracking churn and repeat rate.";

  return {
    diagnosis: `Retention: churn ${Math.round(churn * 100)}% (${red ? "LEAKING" : amber ? "AT_RISK" : "STABLE"}); severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Owner",
    proofRequired: "churn rate, repeat purchase rate, retention cohort, and reason-for-leaving log",
    verificationMethod: "recheck churn and repeat rate after the fix",
    sideEffectMetrics: ["churn rate", "repeat purchase rate", "customer lifetime value"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
