import type { PolicyRule, PolicyEvaluation, CompletionPolicy } from "@/domain/policy/types";
import type { OperatorItem } from "@/domain/operator/types";

export function evaluatePolicy(
  impact: number,
  rules: PolicyRule[]
): PolicyEvaluation {
  const violations: string[] = [];
  let requiresApproval = false;

  for (const rule of rules) {
    if (rule.condition(impact)) {
      if (rule.requiresApproval) {
        requiresApproval = true;
        violations.push(`Policy rule '${rule.id}' triggered: impact ${impact} exceeds threshold`);
      }
    }
  }

  return {
    allowed: violations.length === 0,
    requiresApproval,
    violations,
  };
}

export function validateCompletion(
  item: OperatorItem,
  approvalRequired?: boolean
): CompletionPolicy {
  // Rule 1: actualOutcome must be provided
  if (!item.actualOutcome && !item.actualOutcomeValue) {
    return {
      allowed: false,
      reason: "Cannot complete without actualOutcome",
    };
  }

  // Rule 2: Check impact threshold - block if impact > 100000 without approval
  const threshold = 100000;
  if (item.impactExpected > threshold && !approvalRequired) {
    return {
      allowed: false,
      reason: `High-impact action (${item.impactExpected}) requires approval flag before completion`,
    };
  }

  return {
    allowed: true,
  };
}
