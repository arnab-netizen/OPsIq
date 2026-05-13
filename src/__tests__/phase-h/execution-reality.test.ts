import { describe, it, expect } from "vitest";

// H2
import {
  assessReadiness,
  canProceedWithExecution,
  getReadinessSummary,
} from "../../services/execution/readiness-engine";

// H3
import {
  analyzeCompressionNeeds,
  detectExecutionSpam,
  shouldCompress,
} from "../../services/execution/compression-engine";

// H4
import {
  calculateThroughputMetrics,
  detectBurnoutRisk,
  detectExecutionParalysis,
  getOperatorHealthSummary,
} from "../../services/execution/operator-throughput";

// H5
import {
  detectBlocker,
  detectBlockerCascade,
  getBlockerSummary,
} from "../../services/execution/blocker-engine";

// H6
import {
  verifyCompletion,
  detectFakeCompletion,
  getVerificationSummary,
} from "../../services/execution/verification-engine";

// H7
import {
  assessRecoveryNeeds,
  detectWorkflowDeadlock,
  getRecoverySummary,
} from "../../services/execution/recovery-engine";

// H8
import {
  assessTimeline,
  isTimelineImpossible,
  getTimelineSummary,
} from "../../services/execution/timeline-engine";

// H9
import {
  assessPriorityStability,
  dampenPriorityFluctuation,
  shouldBlockReordering,
  getStabilitySummary,
} from "../../services/execution/priority-stabilizer";

// H10
import {
  conductRealityAudit,
  identifyBottlenecks,
  getOperationalHealthSummary,
} from "../../services/execution/reality-audit";

// H1 Contract
import { ExecutionUnit } from "../../domain/execution/execution-unit-contracts";

/**
 * PHASE H EXECUTION REALITY TESTS
 *
 * Comprehensive hostile scenarios for H1-H10 operational systems.
 * Tests verify operational safety and bounded execution.
 */

describe("PHASE H: Operational Execution Reality", () => {
  const testExecution: ExecutionUnit = {
    execution_id: "exec-123",
    recommendation_id: "rec-123",
    workspace_id: "ws-1",
    execution_state: "NOT_STARTED",
    operator_owner: "operator-1",
    created_at: new Date(),
    estimated_duration_minutes: 120,
    execution_complexity: "MODERATE",
    execution_energy_cost: 50,
    required_tools: [],
    required_people: [],
    required_budget: 0,
    dependencies: [],
    blockers: [],
    rollback_cost: 0,
    rollback_time_minutes: 0,
    verification_method: "KPI measurement",
    success_metric: "Revenue +10%",
    evidence_required: [],
    execution_notes: [],
    execution_attempts: 0,
    immutable: true,
  };

  describe("H2: Execution Readiness Engine", () => {
    it("should mark READY when all prerequisites met", () => {
      const assessment = assessReadiness(
        testExecution,
        true, // prerequisites_met
        true, // operator_capacity
        true, // dependencies_available
        true, // evidence_fresh
        true, // scope_valid
        true, // recommendation_fresh
        true, // no_conflicting_executions
        true // rollback_exists
      );

      expect(assessment.readiness_state).toBe("READY");
      expect(assessment.is_ready).toBe(true);
      expect(canProceedWithExecution(assessment)).toBe(true);
    });

    it("should block when prerequisites unmet", () => {
      const assessment = assessReadiness(
        testExecution,
        false, // prerequisites_met
        true,
        true,
        true,
        true,
        true,
        true,
        true
      );

      expect(assessment.readiness_state).toBe("BLOCKED");
      expect(canProceedWithExecution(assessment)).toBe(false);
      expect(assessment.blocking_issues.some((b) => b.includes("Prerequisites"))).toBe(true);
    });

    it("should mark UNSAFE when scope invalid", () => {
      const assessment = assessReadiness(
        testExecution,
        true,
        true,
        true,
        true,
        false, // scope_valid
        true,
        true,
        true
      );

      expect(assessment.readiness_state).toBe("UNSAFE_TO_EXECUTE");
      expect(assessment.is_unsafe).toBe(true);
    });

    it("should require rollback plan for high-risk actions", () => {
      const riskExecution: ExecutionUnit = {
        ...testExecution,
        execution_complexity: "VERY_COMPLEX",
        rollback_cost: 75,
        rollback_plan: undefined,
      };

      const assessment = assessReadiness(
        riskExecution,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false // rollback_exists
      );

      expect(assessment.is_unsafe).toBe(true);
      expect(assessment.safety_issues.some((s) => s.includes("Rollback"))).toBe(true);
    });
  });

  describe("H3: Execution Compression Engine", () => {
    it("should detect execution overload requiring compression", () => {
      const active_executions = Array(25).fill("exec");
      const analysis = analyzeCompressionNeeds(
        active_executions,
        2,
        0.88, // operator_capacity_used
        2 // execution_spam_count
      );

      expect(shouldCompress(0.88, 25)).toBe(true);
      expect(analysis.operator_load_score).toBeLessThan(0.88);
    });

    it("should detect execution spam", () => {
      expect(detectExecutionSpam([], 15, 0.3)).toBe(true); // > 10 created in last hour
      expect(detectExecutionSpam([], 5, 0.6)).toBe(true); // > 50% abandoned rate
      expect(detectExecutionSpam(Array(35).fill("exec"), 2, 0.2)).toBe(true); // > 30 active
    });

    it("should defer low-priority work when overloaded", () => {
      const analysis = analyzeCompressionNeeds(
        Array(20).fill("exec"),
        2,
        0.90,
        0
      );

      expect(analysis.deferred_actions.length).toBeGreaterThan(0);
    });

    it("should merge similar actions", () => {
      const executions = [
        "review-email-1",
        "review-email-2",
        "review-email-3",
        "update-docs",
      ];

      const analysis = analyzeCompressionNeeds(executions, 2, 0.82, 0);

      expect(analysis.merged_actions.length).toBeGreaterThan(0);
      expect(analysis.actions_consolidated).toBeGreaterThan(0);
    });
  });

  describe("H4: Operator Throughput Engine", () => {
    it("should detect normal throughput", () => {
      const metrics = calculateThroughputMetrics(
        8, // completed
        1, // ignored
        0, // delayed
        0, // abandoned
        480, // total_duration_minutes
        10, // execution_count
        5, // context_switches
        5, // backlog_size
        1, // stale_count
        8 // hours_worked
      );

      expect(metrics.operator_health_score).toBeGreaterThan(70);
      expect(metrics.overload_risk).toBe(false);
    });

    it("should detect burnout risk", () => {
      expect(
        detectBurnoutRisk(
          25, // completed_count
          0.3, // ignored_rate
          11, // hours_worked
          12 // backlog_size
        )
      ).toBe(true);
    });

    it("should detect execution paralysis", () => {
      expect(
        detectExecutionParalysis(
          1, // completed_count
          15, // backlog_size
          3 // abandoned_count
        )
      ).toBe(true);
    });

    it("should flag excessive context switching", () => {
      const metrics = calculateThroughputMetrics(
        5,
        2,
        2,
        1,
        240,
        5,
        12, // excessive switches
        8,
        2,
        8
      );

      expect(metrics.excessive_switching).toBe(true);
    });
  });

  describe("H5: Execution Blocker Engine", () => {
    it("should detect CASH blocker", () => {
      const blocker = detectBlocker(
        "exec-123",
        2, // days_blocked
        false, // cash_available
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        false
      );

      expect(blocker?.blocker_class).toBe("CASH");
      expect(blocker?.severity).toBe("LOW");
    });

    it("should escalate CRITICAL blockers", () => {
      const blocker = detectBlocker(
        "exec-123",
        20, // 20 days blocked
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        false
      );

      expect(blocker?.severity).toBe("CRITICAL");
      expect(blocker?.requires_escalation).toBe(true);
    });

    it("should detect blocker cascade", () => {
      const blockers = [
        {
          execution_id: "exec-1",
          blocker_class: "CASH" as const,
          blocker_description: "Cash blocked",
          severity: "CRITICAL" as const,
          days_blocked: 10,
          unblock_path: "...",
          requires_escalation: true,
          escalation_owner: "ops",
          blocking: true,
        },
        {
          execution_id: "exec-2",
          blocker_class: "PEOPLE" as const,
          blocker_description: "People blocked",
          severity: "CRITICAL" as const,
          days_blocked: 10,
          unblock_path: "...",
          requires_escalation: true,
          escalation_owner: "ops",
          blocking: true,
        },
        {
          execution_id: "exec-3",
          blocker_class: "TIME" as const,
          blocker_description: "Time blocked",
          severity: "CRITICAL" as const,
          days_blocked: 10,
          unblock_path: "...",
          requires_escalation: true,
          escalation_owner: "ops",
          blocking: true,
        },
        {
          execution_id: "exec-4",
          blocker_class: "SKILL" as const,
          blocker_description: "Skill blocked",
          severity: "CRITICAL" as const,
          days_blocked: 10,
          unblock_path: "...",
          requires_escalation: true,
          escalation_owner: "ops",
          blocking: true,
        },
      ];

      const cascade = detectBlockerCascade(blockers);

      expect(cascade).toBeGreaterThan(0);
    });
  });

  describe("H6: Execution Verification Engine", () => {
    it("should verify successful execution", () => {
      const assessment = verifyCompletion(
        "exec-123",
        true, // claimed_complete
        true, // evidence_attached
        0.85, // evidence_quality
        100, // kpi_baseline
        115, // kpi_current
        10, // expected_movement
        "Evidence attached, targets met", // notes
        false // rollback_occurred
      );

      expect(assessment.outcome_quality).toBe("VERIFIED_SUCCESS");
      expect(assessment.success).toBe(true);
    });

    it("should detect fake completion (no evidence)", () => {
      expect(
        detectFakeCompletion(
          true, // claimed_complete
          false, // evidence_attached
          false, // kpi_moved
          true // operator_notes_empty
        )
      ).toBe(true);
    });

    it("should classify partial success", () => {
      const assessment = verifyCompletion(
        "exec-123",
        true,
        true,
        0.8,
        100,
        106, // 6 point movement vs 10 expected
        10,
        "Partial evidence",
        false
      );

      expect(assessment.outcome_quality).toBe("PARTIAL_SUCCESS");
      expect(assessment.partial_completion_risk).toBe(true);
    });

    it("should detect negative outcome", () => {
      const assessment = verifyCompletion(
        "exec-123",
        true,
        true,
        0.9,
        100,
        95, // went down
        10,
        "Unexpected negative",
        false
      );

      expect(assessment.outcome_quality).toBe("NEGATIVE_OUTCOME");
      expect(assessment.success).toBe(false);
    });
  });

  describe("H7: Execution Recovery Engine", () => {
    it("should detect abandoned execution", () => {
      const assessment = assessRecoveryNeeds(
        "exec-123",
        "IN_PROGRESS",
        12, // 12 days stalled
        30, // 30% progress
        false, // operator_engaged
        true
      );

      expect(assessment.is_abandoned).toBe(true);
      expect(assessment.recovery_actions.length).toBeGreaterThan(0);
    });

    it("should detect stuck execution", () => {
      const assessment = assessRecoveryNeeds(
        "exec-123",
        "IN_PROGRESS",
        7, // 7 days stalled
        50, // 50% progress
        true, // operator engaged but no progress
        true
      );

      expect(assessment.is_stuck).toBe(true);
    });

    it("should recommend ESCALATE for high-progress abandonment", () => {
      const assessment = assessRecoveryNeeds(
        "exec-123",
        "IN_PROGRESS",
        10,
        85, // 85% progress
        false,
        true
      );

      expect(assessment.recommended_recovery).toBe("ESCALATE");
      expect(assessment.requires_escalation).toBe(true);
    });

    it("should recommend ROLLBACK for mid-progress", () => {
      const assessment = assessRecoveryNeeds(
        "exec-123",
        "IN_PROGRESS",
        8,
        50, // mid-progress
        false,
        true
      );

      expect(assessment.recommended_recovery).toBe("ROLLBACK");
      expect(assessment.low_regret_fallback).toContain("previous");
    });

    it("should detect workflow deadlock", () => {
      const stalled_days = [15, 15, 15]; // all stalled > 10 days
      const deadlock = detectWorkflowDeadlock(
        ["exec-1", "exec-2", "exec-3"],
        stalled_days,
        new Map()
      );

      expect(deadlock).toBe(true);
    });
  });

  describe("H8: Execution Timeline Engine", () => {
    it("should detect feasible timeline", () => {
      const assessment = assessTimeline(
        ["exec-1", "exec-2"],
        [480, 480], // 1 day each
        new Map(),
        10, // 10 days available
        2 // 2 parallel
      );

      expect(assessment.is_feasible).toBe(true);
      expect(assessment.slack_days).toBeGreaterThan(0);
    });

    it("should detect impossible timeline", () => {
      const assessment = assessTimeline(
        ["exec-1", "exec-2", "exec-3"],
        [480, 480, 480], // 3 days needed
        new Map(),
        2, // only 2 days available
        1 // no parallelization
      );

      expect(assessment.impossible_timeline).toBe(true);
      expect(assessment.slack_days).toBeLessThan(0);
    });

    it("should detect bottleneck dependency cascades", () => {
      const dependencies = new Map<string, string[]>([
        ["exec-1", []],
        ["exec-2", ["exec-1"]],
        ["exec-3", ["exec-1", "exec-2"]],
        ["exec-4", ["exec-1", "exec-2", "exec-3"]],
      ]);

      const assessment = assessTimeline(
        ["exec-1", "exec-2", "exec-3", "exec-4"],
        [480, 480, 480, 480],
        dependencies,
        20,
        1
      );

      expect(assessment.delay_amplification_risk).toBe(true);
      expect(assessment.bottleneck_stages.length).toBeGreaterThan(0);
    });
  });

  describe("H9: Execution Priority Stabilizer", () => {
    it("should detect priority oscillation (thrashing)", () => {
      const assessment = assessPriorityStability(
        "exec-123",
        5, // 5 priority changes in 24h
        0.4, // high variance
        false,
        false,
        false,
        10 // high position changes
      );

      expect(assessment.priority_oscillation).toBe(true);
      expect(shouldBlockReordering(assessment, false)).toBe(true);
    });

    it("should allow emergency override for survival risk", () => {
      const assessment = assessPriorityStability(
        "exec-123",
        2,
        0.2,
        true, // survival_risk
        false,
        false,
        5
      );

      expect(assessment.allow_reordering).toBe(true);
      expect(assessment.override_justification).toContain("Survival");
    });

    it("should dampen priority fluctuations", () => {
      const current = 5;
      const new_priority = 1;
      const dampened = dampenPriorityFluctuation(current, new_priority, 0.3);

      expect(dampened).toBeGreaterThan(new_priority);
      expect(dampened).toBeLessThan(current);
    });

    it("should prevent noisy reordering", () => {
      const assessment = assessPriorityStability(
        "exec-123",
        4, // 4 changes
        0.5, // high variance
        false,
        false,
        false,
        8
      );

      expect(assessment.noisy_reordering_detected).toBe(true);
    });
  });

  describe("H10: Execution Reality Audit", () => {
    it("should measure operational reality metrics", () => {
      const metrics = conductRealityAudit(
        100, // total_recommendations
        75, // acted_on
        15, // ignored
        60, // completed
        5, // abandoned
        70, // total_executions
        30, // operators_at_capacity
        20, // blockers
        8, // rollbacks_successful
        2, // rollbacks_failed
        50, // outcomes_verified
        10, // outcomes_unverified
        5, // stale_executions
        7, // escalations
        5 // abandonment_count
      );

      expect(metrics.recommendation_usefulness_rate).toBeGreaterThan(0.7);
      expect(metrics.execution_completion_rate).toBeGreaterThan(0.8);
    });

    it("should identify poor recommendation usefulness", () => {
      const metrics = conductRealityAudit(
        100,
        30, // only 30% acted on
        60,
        20,
        10,
        40,
        50,
        25,
        3,
        5,
        20,
        20,
        10,
        10,
        10
      );

      const bottlenecks = identifyBottlenecks(metrics);

      expect(
        bottlenecks.some((b) => b.includes("Recommendations too irrelevant"))
      ).toBe(true);
    });

    it("should identify operator overload bottleneck", () => {
      const metrics = conductRealityAudit(
        50,
        40,
        5,
        20,
        15, // high abandonment
        50,
        90, // 90% at capacity
        20,
        2,
        8,
        15,
        30,
        15,
        15,
        15
      );

      const bottlenecks = identifyBottlenecks(metrics);

      expect(
        bottlenecks.some((b) => b.includes("Operator overload"))
      ).toBe(true);
    });

    it("should calculate operational health score", () => {
      const healthy = conductRealityAudit(
        100,
        85,
        10,
        80,
        5,
        90,
        20,
        8,
        9,
        1,
        75,
        10,
        3,
        5,
        2
      );

      expect(healthy.operational_health_score).toBeGreaterThan(70);

      const unhealthy = conductRealityAudit(
        100,
        20,
        70,
        30,
        30,
        80,
        80,
        40,
        2,
        8,
        20,
        50,
        30,
        20,
        25
      );

      expect(unhealthy.operational_health_score).toBeLessThan(50);
    });
  });
});
