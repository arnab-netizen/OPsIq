import type { DiagnosisDomainKey, Severity } from "@/domain/diagnosis-v2/types";
import type { BusinessStateSnapshot } from "@/services/business-state/business-state.engine";
import type { VariableSnapshot } from "@/services/variables/variable-registry.engine";

export interface TriggerDecision {
  triggerKey: string;
  severity: Severity;
  domainKey: DiagnosisDomainKey;
  action: "silent_recalculate" | "prompt_user" | "reprioritize_plan" | "block_until_review";
  reason: string;
  sourceVariableKeys: string[];
}

function numericValue(variable: VariableSnapshot): number | undefined {
  return typeof variable.value === "number" && Number.isFinite(variable.value) ? variable.value : undefined;
}

function breaches(variable: VariableSnapshot, level: "amber" | "red"): boolean {
  if (!variable.threshold) return false;
  const value = numericValue(variable);
  const threshold = variable.threshold[level];
  if (value === undefined || threshold === undefined) return false;
  if (variable.threshold.direction === "increase_bad") return value >= threshold;
  if (variable.threshold.direction === "decrease_bad") return value <= threshold;
  return Math.abs(value) >= threshold;
}

export function evaluateBusinessTriggers(input: { state: BusinessStateSnapshot; variables: VariableSnapshot[] }): TriggerDecision[] {
  const decisions: TriggerDecision[] = [];
  for (const variable of input.variables) {
    if (breaches(variable, "red")) {
      decisions.push({
        triggerKey: `red_${variable.variableKey}`,
        severity: "critical",
        domainKey: variable.domainKey,
        action: variable.domainKey === "liquidity" || variable.domainKey === "profitability" ? "reprioritize_plan" : "prompt_user",
        reason: `${variable.variableKey} breached red threshold.`,
        sourceVariableKeys: [variable.variableKey],
      });
    } else if (breaches(variable, "amber")) {
      decisions.push({
        triggerKey: `amber_${variable.variableKey}`,
        severity: "medium",
        domainKey: variable.domainKey,
        action: "silent_recalculate",
        reason: `${variable.variableKey} breached amber threshold.`,
        sourceVariableKeys: [variable.variableKey],
      });
    }
  }

  if (input.state.blockingIssueCount > 0) {
    decisions.push({
      triggerKey: "blocking_validation_issue",
      severity: "critical",
      domainKey: "controls_reporting",
      action: "block_until_review",
      reason: "Blocking validation issue exists; high-impact recommendations must not be actioned.",
      sourceVariableKeys: [],
    });
  }

  return decisions;
}
