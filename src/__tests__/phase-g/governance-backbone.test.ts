import { describe, it, expect } from "vitest";
import {
  transitionRecommendationState,
  getAllowedTransitions,
  isLegalTransition,
} from "../../services/governance/state-machine";
import {
  evaluatePreconditions,
  canExecute,
  getExecutionBlockReason,
} from "../../services/governance/precondition-engine";
import {
  validateScope,
  shouldBlockForScopeMismatch,
  OperationalContext,
} from "../../services/governance/scope-enforcement";
import {
  arbitrateConstraintConflict,
  isSuppressed,
  getSuppressionReason,
} from "../../services/governance/constraint-precedence";
import {
  createChangeEvent,
  appendEvent,
  preventMutation,
  replayLedger,
  generateExplainabilityTimeline,
} from "../../services/governance/change-ledger";
import { Precondition, Scope } from "../../domain/governance/governance-contracts";

/**
 * PHASE G GOVERNANCE BACKBONE TESTS
 *
 * Deterministic recommendation governance without adaptive optimization.
 * Tests cover state machine, preconditions, scope, constraint precedence, change ledger.
 */

describe("PHASE G: Deterministic Governance Backbone", () => {
  describe("G-B1: Lifecycle State Machine", () => {
    it("should allow legal transitions", async () => {
      const result = transitionRecommendationState("DRAFT", "NEEDS_EVIDENCE", "Initial review", "reviewer-1");
      expect(result.success).toBe(true);
      expect(result.new_state).toBe("NEEDS_EVIDENCE");
    });

    it("should block STALE → EXECUTING", async () => {
      const result = transitionRecommendationState("STALE", "EXECUTING", "Force execute", "operator");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Illegal transition");
    });

    it("should block INVALIDATED → ACTIVE", async () => {
      const result = transitionRecommendationState("INVALIDATED", "ACTIVE", "Reactivate", "admin");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Illegal transition");
    });

    it("should block ABSTAINED → EXECUTING", async () => {
      const result = transitionRecommendationState("ABSTAINED", "EXECUTING", "Force exec", "operator");
      expect(result.success).toBe(false);
    });

    it("should require transition reason", async () => {
      const result = transitionRecommendationState("DRAFT", "NEEDS_EVIDENCE", "", "reviewer");
      expect(result.success).toBe(false);
      expect(result.error).toContain("reason required");
    });

    it("should require actor", async () => {
      const result = transitionRecommendationState("DRAFT", "NEEDS_EVIDENCE", "Initial review", "");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Actor");
    });

    it("should list allowed transitions", async () => {
      const allowed = getAllowedTransitions("DRAFT");
      expect(allowed).toContain("NEEDS_EVIDENCE");
      expect(allowed).toContain("REJECTED");
      expect(allowed).not.toContain("EXECUTING");
    });

    it("should check legal transitions", async () => {
      expect(isLegalTransition("APPROVED", "ACTIVE")).toBe(true);
      expect(isLegalTransition("STALE", "EXECUTING")).toBe(false);
    });
  });

  describe("G-B2: Precondition Engine", () => {
    it("should pass when all preconditions satisfied", async () => {
      const preconditions: Precondition[] = [
        {
          id: "p1",
          type: "EVIDENCE_REQUIRED",
          description: "Customer data available",
          is_satisfied: true,
          checked_at: new Date(),
          blocking: true,
        },
        {
          id: "p2",
          type: "EXECUTION_PREREQUISITE",
          description: "Budget allocated",
          is_satisfied: true,
          checked_at: new Date(),
          blocking: true,
        },
      ];

      const result = evaluatePreconditions(preconditions);
      expect(result.all_satisfied).toBe(true);
      expect(result.blocking_failures.length).toBe(0);
      expect(canExecute(preconditions)).toBe(true);
    });

    it("should block when blocking precondition fails", async () => {
      const preconditions: Precondition[] = [
        {
          id: "p1",
          type: "EVIDENCE_REQUIRED",
          description: "Evidence required",
          is_satisfied: false,
          checked_at: new Date(),
          check_result: "No evidence found",
          blocking: true,
        },
      ];

      const result = evaluatePreconditions(preconditions);
      expect(result.all_satisfied).toBe(false);
      expect(result.blocking_failures.length).toBe(1);
      expect(canExecute(preconditions)).toBe(false);
    });

    it("should block on expired evidence", async () => {
      const preconditions: Precondition[] = [
        {
          id: "p1",
          type: "EVIDENCE_REQUIRED",
          description: "Fresh evidence",
          is_satisfied: false,
          checked_at: new Date(),
          check_result: "Evidence expired",
          blocking: true,
        },
      ];

      expect(canExecute(preconditions)).toBe(false);
      const reason = getExecutionBlockReason(preconditions);
      expect(reason).toContain("Execution blocked");
    });

    it("should block on contradictory assumptions", async () => {
      const preconditions: Precondition[] = [
        {
          id: "p1",
          type: "ASSUMPTION_VALID",
          description: "Assumption validity",
          is_satisfied: false,
          checked_at: new Date(),
          check_result: "Contradictory evidence found",
          blocking: true,
        },
      ];

      expect(canExecute(preconditions)).toBe(false);
    });

    it("should separate blocking vs warning conditions", async () => {
      const preconditions: Precondition[] = [
        {
          id: "p1",
          type: "EVIDENCE_REQUIRED",
          description: "Critical evidence",
          is_satisfied: false,
          checked_at: new Date(),
          blocking: true,
        },
        {
          id: "p2",
          type: "ENVIRONMENT_CONSTRAINT",
          description: "Non-blocking condition",
          is_satisfied: false,
          checked_at: new Date(),
          blocking: false,
        },
      ];

      const result = evaluatePreconditions(preconditions);
      expect(result.blocking_failures.length).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.all_satisfied).toBe(false);
    });
  });

  describe("G-B3: Scope Enforcement", () => {
    const validScope: Scope = {
      geography: ["US", "CANADA"],
      business_types: ["SAAS", "ECOMMERCE"],
      customer_segments: ["SMB", "MID_MARKET"],
      maturity_levels: ["SCALING", "MATURE"],
      operational_scales: ["MEDIUM", "LARGE"],
    };

    it("should validate matching scope", async () => {
      const context: OperationalContext = {
        geography: "US",
        business_type: "SAAS",
        customer_segment: "MID_MARKET",
        maturity_level: "SCALING",
        operational_scale: "MEDIUM",
      };

      const result = validateScope(validScope, context);
      expect(result.is_valid).toBe(true);
      expect(result.out_of_scope_reasons.length).toBe(0);
    });

    it("should reject SaaS guidance applied to restaurant", async () => {
      const saasScope: Scope = {
        geography: ["US"],
        business_types: ["SAAS"],
        customer_segments: ["ENTERPRISE"],
        maturity_levels: ["SCALING"],
        operational_scales: ["LARGE"],
      };

      const restaurantContext: OperationalContext = {
        geography: "US",
        business_type: "SERVICES",
        customer_segment: "SMB",
        maturity_level: "MATURE",
        operational_scale: "SMALL",
      };

      const result = validateScope(saasScope, restaurantContext);
      expect(result.is_valid).toBe(false);
      expect(result.out_of_scope_reasons.length).toBeGreaterThan(0);
    });

    it("should reject enterprise guidance applied to startup", async () => {
      const enterpriseScope: Scope = {
        geography: ["US"],
        business_types: ["SAAS"],
        customer_segments: ["ENTERPRISE"],
        maturity_levels: ["MATURE"],
        operational_scales: ["LARGE"],
      };

      const startupContext: OperationalContext = {
        geography: "US",
        business_type: "SAAS",
        customer_segment: "STARTUP",
        maturity_level: "EARLY_STAGE",
        operational_scale: "SMALL",
      };

      const result = validateScope(enterpriseScope, startupContext);
      expect(result.is_valid).toBe(false);
      expect(shouldBlockForScopeMismatch(result)).toBe(true);
    });

    it("should flag geography mismatch", async () => {
      const scope: Scope = {
        geography: ["US"],
        business_types: [],
        customer_segments: [],
        maturity_levels: [],
        operational_scales: [],
      };

      const context: OperationalContext = {
        geography: "UK",
        business_type: "SAAS",
        customer_segment: "SMB",
        maturity_level: "SCALING",
        operational_scale: "MEDIUM",
      };

      const result = validateScope(scope, context);
      expect(result.is_valid).toBe(false);
      expect(result.out_of_scope_reasons.some((r) => r.includes("Geography"))).toBe(true);
    });
  });

  describe("G-B4: Constraint Precedence", () => {
    it("should suppress lower-priority recommendation", async () => {
      const rec_survival = {
        recommendation_id: "rec-survival",
        primary_priority: "SURVIVAL" as const,
        active: true,
      };
      const rec_growth = {
        recommendation_id: "rec-growth",
        primary_priority: "GROWTH" as const,
        active: true,
      };

      const conflict = arbitrateConstraintConflict(rec_survival, rec_growth);
      expect(conflict.suppressed_recommendation_id).toBe("rec-growth");
    });

    it("should suppress growth when cashflow is prioritized", async () => {
      const rec_cashflow = {
        recommendation_id: "rec-cashflow",
        primary_priority: "CASHFLOW" as const,
        active: true,
      };
      const rec_growth = {
        recommendation_id: "rec-growth",
        primary_priority: "GROWTH" as const,
        active: true,
      };

      const conflict = arbitrateConstraintConflict(rec_cashflow, rec_growth);
      expect(conflict.suppressed_recommendation_id).toBe("rec-growth");
    });

    it("should suppress compliance over growth", async () => {
      const rec_compliance = {
        recommendation_id: "rec-compliance",
        primary_priority: "COMPLIANCE" as const,
        active: true,
      };
      const rec_growth = {
        recommendation_id: "rec-growth",
        primary_priority: "GROWTH" as const,
        active: true,
      };

      const conflict = arbitrateConstraintConflict(rec_compliance, rec_growth);
      expect(conflict.suppressed_recommendation_id).toBe("rec-growth");
    });

    it("should deterministically break ties", async () => {
      const rec_a = {
        recommendation_id: "rec-aaa",
        primary_priority: "GROWTH" as const,
        active: true,
      };
      const rec_b = {
        recommendation_id: "rec-bbb",
        primary_priority: "GROWTH" as const,
        active: true,
      };

      const conflict = arbitrateConstraintConflict(rec_a, rec_b);
      expect(conflict.suppressed_recommendation_id).toBe("rec-bbb");
    });

    it("should track suppression reasons", async () => {
      const conflicts = [
        {
          recommendation_id_a: "rec-a",
          recommendation_id_b: "rec-b",
          constraint_priority_a: "SURVIVAL" as const,
          constraint_priority_b: "GROWTH" as const,
          conflict_type: "TENSION" as const,
          resolution: "SUPPRESS_LOWER" as const,
          suppressed_recommendation_id: "rec-b",
        },
      ];

      const reason = getSuppressionReason("rec-b", conflicts);
      expect(reason).toContain("Suppressed");
      expect(isSuppressed("rec-b", conflicts)).toBe(true);
      expect(isSuppressed("rec-a", conflicts)).toBe(false);
    });
  });

  describe("G-B5: Recommendation Change Ledger", () => {
    it("should create immutable change events", async () => {
      const event = createChangeEvent(
        "rec-123",
        "STATE_TRANSITION",
        "reviewer-1",
        { from: "DRAFT", to: "NEEDS_EVIDENCE" }
      );

      expect(event.recommendation_id).toBe("rec-123");
      expect(event.immutable).toBe(true);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it("should append events to ledger", async () => {
      const event1 = createChangeEvent("rec-123", "STATE_TRANSITION", "reviewer-1", {
        to: "NEEDS_EVIDENCE",
      });
      const event2 = createChangeEvent("rec-123", "CONFIDENCE_CHANGE", "system", {
        new_value: 75,
      });

      let ledger: typeof event1[] = [];
      ledger = appendEvent(ledger, event1);
      ledger = appendEvent(ledger, event2);

      expect(ledger.length).toBe(2);
      expect(ledger[0].event_type).toBe("STATE_TRANSITION");
      expect(ledger[1].event_type).toBe("CONFIDENCE_CHANGE");
    });

    it("should prevent mutation of historical events", async () => {
      const event = createChangeEvent("rec-123", "STATE_TRANSITION", "reviewer", { to: "APPROVED" });
      const ledger = [event];

      const canMutate = preventMutation(ledger, event.event_id);
      expect(canMutate).toBe(false);
    });

    it("should replay ledger to reconstruct state", async () => {
      const events = [
        createChangeEvent("rec-123", "STATE_TRANSITION", "reviewer", { to_state: "NEEDS_EVIDENCE" }),
        createChangeEvent("rec-123", "CONFIDENCE_CHANGE", "system", { new_value: 80 }),
        createChangeEvent("rec-123", "OPERATOR_OVERRIDE", "operator", { action: "reject" }),
      ];

      const reconstruction = replayLedger(events);
      expect(reconstruction.change_count).toBe(3);
      expect(reconstruction.current_state.confidence).toBe(80);
      expect(reconstruction.current_state.last_override).toBeInstanceOf(Date);
    });

    it("should generate explainability timeline", async () => {
      const events = [
        createChangeEvent("rec-123", "STATE_TRANSITION", "reviewer", { to: "APPROVED" }),
        createChangeEvent("rec-123", "RECOMMENDATION_WITHDRAWAL", "operator", { reason: "outdated" }),
      ];

      const timeline = generateExplainabilityTimeline(events);
      expect(timeline.length).toBe(2);
      expect(timeline[0]).toContain("STATE_TRANSITION");
      expect(timeline[1]).toContain("RECOMMENDATION_WITHDRAWAL");
    });
  });
});
