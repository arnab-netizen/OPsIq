import { describe, it, expect, beforeEach } from "vitest";
import { DecisionHaltEngine } from "@/services/constraint-core/decision-halt-engine";
import type { DecisionHaltInput } from "@/domain/constraint/decision-halt";

describe("DecisionHaltEngine", () => {
  let engine: DecisionHaltEngine;

  beforeEach(() => {
    engine = new DecisionHaltEngine();
  });

  describe("Input validation", () => {
    it("should halt on missing decision_id", () => {
      const input = {
        workspace_id: "ws-1",
        decision_id: "",
      } as DecisionHaltInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_reason).toContain("Invalid");
    });

    it("should halt on missing workspace_id", () => {
      const input = {
        decision_id: "d-1",
        workspace_id: "",
      } as DecisionHaltInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_reason).toContain("Invalid");
    });
  });

  describe("Financial constraints", () => {
    const baseInput: DecisionHaltInput = {
      decision_id: "d-1",
      workspace_id: "ws-1",
      engagement_id: "eng-1",
      owner_id: "owner-1",
      current_cash: 100000,
      monthly_burn: 10000,
      decision_capital_required: 50000,
      expected_impact: 20000,
      roi_months: 6,
      owner_available_hours_per_week: 40,
      decision_effort_hours: 10,
      active_decisions_count: 1,
      team_utilization_pct: 50,
      required_approvals: [],
      approvals_received: [],
      policy_violations: [],
      execution_probability: 0.8,
      dependency_count: 1,
      critical_dependencies: [],
    };

    it("should halt on insufficient cash", () => {
      const input = {
        ...baseInput,
        current_cash: 30000,
        decision_capital_required: 50000,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt?.reason).toBe(
        "insufficient_cash"
      );
    });

    it("should halt on negative impact", () => {
      const input = {
        ...baseInput,
        expected_impact: -5000,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt?.reason).toBe(
        "negative_impact"
      );
    });

    it("should halt on zero impact", () => {
      const input = {
        ...baseInput,
        expected_impact: 0,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt?.reason).toBe(
        "negative_impact"
      );
    });

    it("should halt on unachievable ROI", () => {
      const input = {
        ...baseInput,
        current_cash: 100000,
        monthly_burn: 10000,
        roi_months: 15, // Survival window is 10 months (100k / 10k), exceed with 3-month buffer
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt?.reason).toBe(
        "roi_unachievable"
      );
    });

    it("should not halt on healthy financial state", () => {
      const input = baseInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(false);
      expect(result.halt_conditions.financial_halt).toBeUndefined();
    });

    it("should halt when missing financial data (fail-closed)", () => {
      const input = {
        ...baseInput,
        current_cash: undefined,
      } as DecisionHaltInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt?.reason).toBe(
        "negative_impact"
      );
    });
  });

  describe("Capacity constraints", () => {
    const baseInput: DecisionHaltInput = {
      decision_id: "d-1",
      workspace_id: "ws-1",
      engagement_id: "eng-1",
      owner_id: "owner-1",
      current_cash: 100000,
      monthly_burn: 10000,
      decision_capital_required: 50000,
      expected_impact: 20000,
      roi_months: 6,
      owner_available_hours_per_week: 40,
      decision_effort_hours: 10,
      active_decisions_count: 1,
      team_utilization_pct: 50,
      required_approvals: [],
      approvals_received: [],
      policy_violations: [],
      execution_probability: 0.8,
      dependency_count: 1,
      critical_dependencies: [],
    };

    it("should halt on owner overload", () => {
      const input = {
        ...baseInput,
        active_decisions_count: 6, // 6 * 10 + 10 = 70 hours > 40 * 1.5 = 60 hours
        owner_available_hours_per_week: 40,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.capacity_halt?.reason).toBe(
        "owner_overloaded"
      );
    });

    it("should halt on team exhaustion", () => {
      const input = {
        ...baseInput,
        team_utilization_pct: 85,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.capacity_halt?.reason).toBe("team_exhausted");
    });

    it("should halt when missing capacity data (fail-closed)", () => {
      const input = {
        ...baseInput,
        owner_available_hours_per_week: undefined,
      } as DecisionHaltInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.capacity_halt?.reason).toBe(
        "owner_overloaded"
      );
    });

    it("should not halt on healthy capacity", () => {
      const result = engine.evaluateHalt(baseInput);

      expect(result.halted).toBe(false);
      expect(result.halt_conditions.capacity_halt).toBeUndefined();
    });
  });

  describe("Compliance constraints", () => {
    const baseInput: DecisionHaltInput = {
      decision_id: "d-1",
      workspace_id: "ws-1",
      engagement_id: "eng-1",
      owner_id: "owner-1",
      current_cash: 100000,
      monthly_burn: 10000,
      decision_capital_required: 50000,
      expected_impact: 20000,
      roi_months: 6,
      owner_available_hours_per_week: 40,
      decision_effort_hours: 10,
      active_decisions_count: 1,
      team_utilization_pct: 50,
      required_approvals: ["cfo", "ceo"],
      approvals_received: [],
      policy_violations: [],
      execution_probability: 0.8,
      dependency_count: 1,
      critical_dependencies: [],
    };

    it("should halt on missing approvals", () => {
      const input = {
        ...baseInput,
        required_approvals: ["cfo", "ceo"],
        approvals_received: ["cfo"],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.compliance_halt?.reason).toBe(
        "missing_approval"
      );
      expect(
        result.halt_conditions.compliance_halt?.missing_approvals
      ).toContain("ceo");
    });

    it("should halt on policy violations", () => {
      const input = {
        ...baseInput,
        required_approvals: ["cfo"],
        approvals_received: ["cfo"],
        policy_violations: ["data_residency"],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.compliance_halt?.reason).toBe(
        "policy_violation"
      );
    });

    it("should not halt with all approvals and no violations", () => {
      const input = {
        ...baseInput,
        approvals_received: ["cfo", "ceo"],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(false);
      expect(result.halt_conditions.compliance_halt).toBeUndefined();
    });
  });

  describe("Risk constraints", () => {
    const baseInput: DecisionHaltInput = {
      decision_id: "d-1",
      workspace_id: "ws-1",
      engagement_id: "eng-1",
      owner_id: "owner-1",
      current_cash: 100000,
      monthly_burn: 10000,
      decision_capital_required: 50000,
      expected_impact: 20000,
      roi_months: 6,
      owner_available_hours_per_week: 40,
      decision_effort_hours: 10,
      active_decisions_count: 1,
      team_utilization_pct: 50,
      required_approvals: [],
      approvals_received: [],
      policy_violations: [],
      execution_probability: 0.8,
      dependency_count: 1,
      critical_dependencies: [],
    };

    it("should halt on low execution probability", () => {
      const input = {
        ...baseInput,
        execution_probability: 0.3,
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.risk_halt?.reason).toBe(
        "execution_probability_too_low"
      );
    });

    it("should halt on critical dependency risk", () => {
      const input = {
        ...baseInput,
        critical_dependencies: ["dep1", "dep2", "dep3", "dep4"],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.risk_halt?.reason).toBe(
        "critical_dependency_risk"
      );
    });

    it("should not halt on acceptable risk profile", () => {
      const result = engine.evaluateHalt(baseInput);

      expect(result.halted).toBe(false);
      expect(result.halt_conditions.risk_halt).toBeUndefined();
    });
  });

  describe("Multiple halt conditions", () => {
    it("should aggregate multiple constraint violations", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 30000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: -5000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 80,
        active_decisions_count: 5,
        team_utilization_pct: 90,
        required_approvals: ["cfo"],
        approvals_received: [],
        policy_violations: ["compliance_rule_1"],
        execution_probability: 0.2,
        dependency_count: 5,
        critical_dependencies: ["dep1", "dep2", "dep3", "dep4"],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_conditions.financial_halt).toBeDefined();
      expect(result.halt_conditions.capacity_halt).toBeDefined();
      expect(result.halt_conditions.compliance_halt).toBeDefined();
      expect(result.halt_conditions.risk_halt).toBeDefined();
      expect(result.audit_event.reason_codes.length).toBeGreaterThan(1);
    });
  });

  describe("Audit event generation", () => {
    it("should generate audit event on halt", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 20000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: 10000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 10,
        active_decisions_count: 1,
        team_utilization_pct: 50,
        required_approvals: [],
        approvals_received: [],
        policy_violations: [],
        execution_probability: 0.8,
        dependency_count: 1,
        critical_dependencies: [],
      };

      const result = engine.evaluateHalt(input);

      expect(result.audit_event.event_type).toBe("decision_halt_check");
      expect(result.audit_event.halted).toBe(true);
      expect(result.audit_event.reason_codes).toContain("INSUFFICIENT_CASH");
      expect(result.audit_event.timestamp).toBeDefined();
    });

    it("should generate audit event on pass-through", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 100000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: 20000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 10,
        active_decisions_count: 1,
        team_utilization_pct: 50,
        required_approvals: [],
        approvals_received: [],
        policy_violations: [],
        execution_probability: 0.8,
        dependency_count: 1,
        critical_dependencies: [],
      };

      const result = engine.evaluateHalt(input);

      expect(result.audit_event.event_type).toBe("decision_halt_check");
      expect(result.audit_event.halted).toBe(false);
      expect(result.audit_event.reason_codes).toEqual(["NO_CONSTRAINTS"]);
    });
  });

  describe("Fail-closed behavior", () => {
    it("should block decision when critical financial data missing", () => {
      const input = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        monthly_burn: undefined,
      } as DecisionHaltInput;

      const result = engine.evaluateHalt(input);

      expect(result.halted).toBe(true);
      expect(result.halt_reason).toBeDefined();
    });

    it("should be non-overridable by default", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 20000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: 10000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 10,
        active_decisions_count: 1,
        team_utilization_pct: 50,
        required_approvals: [],
        approvals_received: [],
        policy_violations: [],
        execution_probability: 0.8,
        dependency_count: 1,
        critical_dependencies: [],
      };

      const result = engine.evaluateHalt(input);

      expect(result.overridable).toBe(false);
      expect(result.override_required_approvers).toContain("executive_sponsor");
      expect(result.override_required_approvers).toContain("finance_director");
    });
  });

  describe("Halt category determination", () => {
    it("should categorize halt as financial", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 20000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: 10000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 10,
        active_decisions_count: 1,
        team_utilization_pct: 50,
        required_approvals: [],
        approvals_received: [],
        policy_violations: [],
        execution_probability: 0.8,
        dependency_count: 1,
        critical_dependencies: [],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halt_category).toBe("financial");
    });

    it("should categorize halt as capacity", () => {
      const input: DecisionHaltInput = {
        decision_id: "d-1",
        workspace_id: "ws-1",
        engagement_id: "eng-1",
        owner_id: "owner-1",
        current_cash: 100000,
        monthly_burn: 10000,
        decision_capital_required: 50000,
        expected_impact: 20000,
        roi_months: 6,
        owner_available_hours_per_week: 40,
        decision_effort_hours: 10,
        active_decisions_count: 1,
        team_utilization_pct: 85,
        required_approvals: [],
        approvals_received: [],
        policy_violations: [],
        execution_probability: 0.8,
        dependency_count: 1,
        critical_dependencies: [],
      };

      const result = engine.evaluateHalt(input);

      expect(result.halt_category).toBe("capacity");
    });
  });
});
