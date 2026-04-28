import { PolicyRule } from "@/domain/policy/types";

export function evaluatePolicy(
  impact: number,
  rules: PolicyRule[]
): { requiresApproval: boolean } {
  const requiresApproval = rules.some((rule) => rule.condition(impact));
  return { requiresApproval };
}
