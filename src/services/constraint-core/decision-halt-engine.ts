/**
 * Decision Halt Engine - Phase C: Constraint Layer (Engine 14)
 *
 * Evaluates whether decision should be halted due to:
 * - Financial insufficiency (cash, negative impact, unachievable ROI)
 * - Capacity constraints (owner overload, team exhaustion)
 * - Compliance requirements (missing approvals, policy violations)
 * - Risk thresholds (execution probability, single points of failure)
 *
 * FAIL-CLOSED: Blocks by default if data insufficient or ambiguous
 */

import { logger } from "@/infra/logger";
import {
  DecisionHaltInput,
  DecisionHaltResult,
  HaltCondition,
} from "@/domain/constraint/decision-halt";

export class DecisionHaltEngine {
  /**
   * Evaluate whether decision should be halted
   * Fail-closed: returns halted=true on any insufficient data
   */
  evaluateHalt(input: DecisionHaltInput): DecisionHaltResult {
    // Validate input
    if (!input || !input.decision_id || !input.workspace_id) {
      logger.warn("DecisionHaltEngine: Invalid input", {
        decision_id: input?.decision_id,
        workspace_id: input?.workspace_id,
      });
      return this.haltResult(
        true,
        "Invalid decision halt input",
        {},
        "INVALID_INPUT"
      );
    }

    const halt_conditions: HaltCondition = {};
    const reason_codes: string[] = [];

    // CHECK 1: Financial Halt
    const financialHalt = this.checkFinancialConstraints(input);
    if (financialHalt) {
      halt_conditions.financial_halt = financialHalt;
      reason_codes.push(...this.getFinancialReasons(financialHalt));
    }

    // CHECK 2: Capacity Halt
    const capacityHalt = this.checkCapacityConstraints(input);
    if (capacityHalt) {
      halt_conditions.capacity_halt = capacityHalt;
      reason_codes.push(...this.getCapacityReasons(capacityHalt));
    }

    // CHECK 3: Compliance Halt
    const complianceHalt = this.checkComplianceConstraints(input);
    if (complianceHalt) {
      halt_conditions.compliance_halt = complianceHalt;
      reason_codes.push(...this.getComplianceReasons(complianceHalt));
    }

    // CHECK 4: Risk Halt
    const riskHalt = this.checkRiskConstraints(input);
    if (riskHalt) {
      halt_conditions.risk_halt = riskHalt;
      reason_codes.push(...this.getRiskReasons(riskHalt));
    }

    // Determine if halted
    const halted = reason_codes.length > 0;
    const halt_reason = reason_codes.length > 0
      ? `Decision halted: ${reason_codes.join("; ")}`
      : undefined;

    const result = this.haltResult(
      halted,
      halt_reason,
      halt_conditions,
      reason_codes[0] || "NO_CONSTRAINTS"
    );

    logger.info("Decision halt evaluation", {
      decision_id: input.decision_id,
      halted,
      reason_count: reason_codes.length,
      reason_codes,
    });

    return result;
  }

  private checkFinancialConstraints(
    input: DecisionHaltInput
  ): HaltCondition["financial_halt"] | null {
    // Fail-closed: block if data missing
    if (input.current_cash === undefined || input.monthly_burn === undefined) {
      return {
        reason: "negative_impact",
        threshold: 0,
        actual: input.current_cash || 0,
        days_to_insolvency: -1,
      };
    }

    // Check 1: Insufficient cash for decision
    if (input.decision_capital_required > input.current_cash) {
      const days_to_insolvency = input.monthly_burn > 0
        ? Math.floor((input.current_cash - input.decision_capital_required) / (input.monthly_burn / 30))
        : 999;
      return {
        reason: "insufficient_cash",
        threshold: input.current_cash,
        actual: input.decision_capital_required,
        days_to_insolvency,
      };
    }

    // Check 2: Negative or zero impact
    if (input.expected_impact !== undefined && input.expected_impact <= 0) {
      return {
        reason: "negative_impact",
        threshold: 0,
        actual: input.expected_impact,
        days_to_insolvency: input.monthly_burn > 0
          ? Math.floor(input.current_cash / (input.monthly_burn / 30))
          : 999,
      };
    }

    // Check 3: ROI timeline exceeds survival window
    if (input.roi_months !== undefined && input.monthly_burn > 0) {
      const survival_months = input.current_cash / input.monthly_burn;
      if (input.roi_months > survival_months + 3) {
        // 3-month buffer
        return {
          reason: "roi_unachievable",
          threshold: survival_months,
          actual: input.roi_months,
          days_to_insolvency: Math.floor(survival_months * 30),
        };
      }
    }

    return null;
  }

  private checkCapacityConstraints(
    input: DecisionHaltInput
  ): HaltCondition["capacity_halt"] | null {
    // Fail-closed: block if data missing
    if (
      input.owner_available_hours_per_week === undefined ||
      input.decision_effort_hours === undefined
    ) {
      return {
        reason: "owner_overloaded",
        available_hours: 0,
        required_hours: input.decision_effort_hours || 0,
        owner_utilization_pct: 999,
      };
    }

    // Check 1: Owner overloaded with active decisions
    const total_active_hours =
      (input.active_decisions_count || 0) * 10 + input.decision_effort_hours; // Assume 10h per active decision
    if (
      total_active_hours > input.owner_available_hours_per_week * 1.5
    ) {
      return {
        reason: "owner_overloaded",
        available_hours: input.owner_available_hours_per_week,
        required_hours: total_active_hours,
        owner_utilization_pct: Math.min(
          100,
          Math.floor((total_active_hours / input.owner_available_hours_per_week) * 100)
        ),
      };
    }

    // Check 2: Team exhaustion
    if (input.team_utilization_pct >= 85) {
      return {
        reason: "team_exhausted",
        available_hours: input.owner_available_hours_per_week,
        required_hours: input.decision_effort_hours,
        owner_utilization_pct: input.team_utilization_pct,
      };
    }

    return null;
  }

  private checkComplianceConstraints(
    input: DecisionHaltInput
  ): HaltCondition["compliance_halt"] | null {
    const missing_approvals = (input.required_approvals || []).filter(
      (approval) => !(input.approvals_received || []).includes(approval)
    );

    const violated_policies = input.policy_violations || [];

    // Block if missing required approvals or policy violations
    if (missing_approvals.length > 0 || violated_policies.length > 0) {
      return {
        reason: missing_approvals.length > 0 ? "missing_approval" : "policy_violation",
        missing_approvals,
        violated_policies,
      };
    }

    return null;
  }

  private checkRiskConstraints(
    input: DecisionHaltInput
  ): HaltCondition["risk_halt"] | null {
    // Check 1: Execution probability too low
    if (input.execution_probability !== undefined && input.execution_probability < 0.4) {
      return {
        reason: "execution_probability_too_low",
        execution_probability: input.execution_probability,
        dependent_actions: input.critical_dependencies || [],
      };
    }

    // Check 2: Critical dependency risk
    if ((input.critical_dependencies || []).length > 3) {
      return {
        reason: "critical_dependency_risk",
        execution_probability: input.execution_probability || 0.5,
        dependent_actions: input.critical_dependencies || [],
      };
    }

    return null;
  }

  private getFinancialReasons(condition: HaltCondition["financial_halt"]): string[] {
    if (!condition) return [];
    const reason = condition.reason;
    switch (reason) {
      case "insufficient_cash":
        return ["INSUFFICIENT_CASH"];
      case "negative_impact":
        return ["NEGATIVE_IMPACT"];
      case "roi_unachievable":
        return ["ROI_UNACHIEVABLE"];
      default:
        return ["FINANCIAL_CONSTRAINT"];
    }
  }

  private getCapacityReasons(condition: HaltCondition["capacity_halt"]): string[] {
    if (!condition) return [];
    const reason = condition.reason;
    switch (reason) {
      case "owner_overloaded":
        return ["OWNER_OVERLOADED"];
      case "team_exhausted":
        return ["TEAM_EXHAUSTED"];
      default:
        return ["CAPACITY_CONSTRAINT"];
    }
  }

  private getComplianceReasons(condition: HaltCondition["compliance_halt"]): string[] {
    if (!condition) return [];
    const reason = condition.reason;
    switch (reason) {
      case "missing_approval":
        return ["MISSING_APPROVAL"];
      case "policy_violation":
        return ["POLICY_VIOLATION"];
      default:
        return ["COMPLIANCE_CONSTRAINT"];
    }
  }

  private getRiskReasons(condition: HaltCondition["risk_halt"]): string[] {
    if (!condition) return [];
    const reason = condition.reason;
    switch (reason) {
      case "execution_probability_too_low":
        return ["EXECUTION_PROBABILITY_TOO_LOW"];
      case "critical_dependency_risk":
        return ["CRITICAL_DEPENDENCY_RISK"];
      default:
        return ["RISK_CONSTRAINT"];
    }
  }

  private haltResult(
    halted: boolean,
    halt_reason: string | undefined,
    halt_conditions: HaltCondition,
    category: string
  ): DecisionHaltResult {
    const reason_codes = [
      ...(halt_conditions.financial_halt ? this.getFinancialReasons(halt_conditions.financial_halt) : []),
      ...(halt_conditions.capacity_halt ? this.getCapacityReasons(halt_conditions.capacity_halt) : []),
      ...(halt_conditions.compliance_halt ? this.getComplianceReasons(halt_conditions.compliance_halt) : []),
      ...(halt_conditions.risk_halt ? this.getRiskReasons(halt_conditions.risk_halt) : []),
    ];

    const final_reason_codes = reason_codes.length > 0 ? reason_codes : ["NO_CONSTRAINTS"];

    let halt_category: "financial" | "capacity" | "compliance" | "risk" | undefined = undefined;
    if (halted && halt_conditions.financial_halt) {
      halt_category = "financial";
    } else if (halted && halt_conditions.capacity_halt) {
      halt_category = "capacity";
    } else if (halted && halt_conditions.compliance_halt) {
      halt_category = "compliance";
    } else if (halted && halt_conditions.risk_halt) {
      halt_category = "risk";
    }

    return {
      halted,
      halt_reason,
      halt_conditions,
      halt_category,
      overridable: false, // Conservative: not overridable by default
      override_required_approvers: halted
        ? ["executive_sponsor", "finance_director"]
        : [],
      audit_event: {
        event_type: "decision_halt_check",
        halted,
        reason_codes: final_reason_codes,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export const decisionHaltEngine = new DecisionHaltEngine();
