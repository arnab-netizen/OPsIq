import { DecisionInput, DecisionRule, DecisionOutput } from "@/domain/decision/types";
import { ImpactEstimate } from "@/domain/finance/types";
import { runDecisionEngine } from "@/services/decision/engine";
import { calculateImpact } from "@/services/finance/normalize";
import { AuditRecord } from "@/domain/audit/types";
import { logDecision } from "@/services/audit/log";
import { createBaseline } from "@/services/onboarding/basic";
import { randomUUID } from "crypto";

export function runSystem(inputMetrics: Record<string, number>): {
  decisions: DecisionOutput[];
  impact: ImpactEstimate;
} {
  // 1. Build DecisionInput
  const decisionInput: DecisionInput = {
    metrics: inputMetrics,
    flags: {
      isHighRisk: (inputMetrics["risk"] || 0) > 7,
      hasContext: Object.keys(inputMetrics).length > 0,
    },
  };

  // 2. Define dummy rules
  const rules: DecisionRule[] = [
    {
      id: "rule-1",
      description: "High risk flag set",
      condition: (input) => input.flags.isHighRisk,
      action: "ESCALATE",
      impactMultiplier: 1.5,
    },
    {
      id: "rule-2",
      description: "Context available",
      condition: (input) => input.flags.hasContext,
      action: "PROCEED",
      impactMultiplier: 1.0,
    },
  ];

  // 3. Run decision engine
  const decisions = runDecisionEngine(decisionInput, rules);

  // 4. Create FinancialBaseline (hardcoded test values)
  const baseline = createBaseline(10000, 5000);

  // 5. Run calculateImpact
  const deltaRevenue = inputMetrics["revenueChange"] || 1000;
  const deltaCost = inputMetrics["costChange"] || 500;
  const confidence = Math.max(0.4, Math.min(1, inputMetrics["confidence"] || 0.8));

  const impact = calculateImpact(baseline, deltaRevenue, deltaCost, confidence);

  // 6. Log audit record
  const auditRecord: AuditRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    inputSnapshot: JSON.stringify(decisionInput),
    outputSnapshot: JSON.stringify({ decisions, impact }),
    ruleId: decisions.length > 0 ? decisions[0].ruleId : "none",
  };

  logDecision(auditRecord);

  return {
    decisions,
    impact,
  };
}
