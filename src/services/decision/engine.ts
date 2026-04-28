import {
  DecisionInput,
  DecisionRule,
  DecisionOutput,
} from "@/domain/decision/types";

export function runDecisionEngine(
  input: DecisionInput,
  rules: DecisionRule[]
): DecisionOutput[] {
  const outputs: DecisionOutput[] = [];

  for (const rule of rules) {
    if (rule.condition(input)) {
      outputs.push({
        problem: rule.description,
        action: rule.action,
        impactMultiplier: rule.impactMultiplier,
        confidence: 0.8,
        ruleId: rule.id,
      });
    }
  }

  if (outputs.length === 0) {
    throw new Error("NO_DECISION");
  }

  return outputs;
}
