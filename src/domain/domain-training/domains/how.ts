/**
 * D21 — How (responder, pure). Execution method quality.
 * Requires concrete, owned, reversible-where-possible, verifiable steps; blocks
 * irreversible action without proof/rollback, missing rollback, and vague method. Pure.
 */
import { assessDataConfidence, type DataPoint } from "@/domain/domain-training/data-confidence";
import { classifyConfidence } from "@/domain/domain-training/confidence-protocol";
import type { TrainingSeverity, RecommendationConfidence } from "@/domain/domain-training/training-types";
import type { DomainResponse } from "@/domain/domain-training/harness/scoring";

export interface HowInput {
  vagueMethod?: boolean;
  noRollbackPlan?: boolean;
  irreversibleWithoutProof?: boolean;
  noVerificationStep?: boolean;
  dataPoints: DataPoint[];
  complianceSensitive?: boolean;
}

export function respondHow(input: HowInput): DomainResponse {
  const critical = !!(input.irreversibleWithoutProof || input.noRollbackPlan);
  const severity: TrainingSeverity = critical ? "HIGH"
    : (input.vagueMethod || input.noVerificationStep) ? "MEDIUM" : "LOW";

  const wntd: string[] = [];
  if (input.irreversibleWithoutProof) wntd.push("no irreversible action without proof and a rollback plan");
  if (input.noRollbackPlan) wntd.push("no execution without a rollback plan");
  if (input.vagueMethod) wntd.push("no vague method; steps must be concrete and owned");

  const data = assessDataConfidence(input.dataPoints);
  let confidence: RecommendationConfidence = classifyConfidence({
    dataConfidence: data.ceiling, blockedByContradiction: data.blockedByContradiction,
    missingCritical: data.missingCritical.length > 0, complianceSensitive: input.complianceSensitive === true,
  });
  if (input.complianceSensitive) confidence = "ESCALATE";

  let nextAction: string;
  if (input.irreversibleWithoutProof) nextAction = "Require proof and a rollback plan before the irreversible step; otherwise do the reversible version first.";
  else if (input.noRollbackPlan) nextAction = "Add a rollback plan and a stop condition before executing.";
  else if (input.vagueMethod) nextAction = "Rewrite the method as concrete, owned, dated steps before starting.";
  else if (input.noVerificationStep) nextAction = "Add a verification step so you can confirm the method worked.";
  else nextAction = "The method is concrete, reversible, and verifiable; execute it.";

  return {
    diagnosis: `Execution method: ${critical ? "UNSAFE" : severity === "MEDIUM" ? "WEAK" : "sound"}; severity ${severity}.`,
    confidence, severity, whatNotToDo: wntd, nextAction, assignedRole: "Operations Lead",
    proofRequired: "the concrete step list, rollback plan, stop condition, and verification step",
    verificationMethod: "verify the method ran as written and the verification step passed",
    sideEffectMetrics: ["method completion rate", "rollback readiness", "rework rate"],
    hasStopRule: true, hasRollbackRule: true, hasRedesignRule: true, unsafeEmitted: [],
  };
}
