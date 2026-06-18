import { describe, it, expect } from "vitest";
import {
  HealthStatus,
  ActionQueuePriority,
  validateActionQueueItem,
  validateActionQueueSummary,
  validateWorkspaceHealth,
  validateOwnerDashboardConfig,
  validateOwnerDashboardView,
  buildOwnerLoopDashboard,
  loopDashboardRequiresOwnerAttention,
  type OwnerLoopDashboardInput,
} from "@/domain/owner-mode/owner-dashboard";

describe("Owner Dashboard Domain", () => {
  describe("validateActionQueueItem", () => {
    it("should accept valid action item", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid action ID", () => {
      const item = {
        id: "invalid-id",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("Invalid action ID format");
    });

    it("should reject missing action name", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: 0,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("Action name required");
    });

    it("should reject negative blocker count", () => {
      const item = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test Action",
        priority: ActionQueuePriority.HIGH,
        status: "in_progress" as const,
        blockerCount: -1,
      };
      const errors = validateActionQueueItem(item);
      expect(errors).toContain("blocker count must be non-negative");
    });
  });

  describe("validateActionQueueSummary", () => {
    it("should accept valid summary", () => {
      const summary = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        totalCount: 10,
        byStatus: { in_progress: 5, pending: 5 },
        byPriority: { high: 3, medium: 7 },
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid workspace ID", () => {
      const summary = {
        workspaceId: "invalid",
        totalCount: 10,
        byStatus: {},
        byPriority: {},
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toContain("Invalid workspace ID format");
    });

    it("should reject negative total count", () => {
      const summary = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        totalCount: -1,
        byStatus: {},
        byPriority: {},
        overdueCount: 2,
        blockedCount: 1,
        completedThisWeek: 3,
        averageCompletionDays: 5,
        criticalActions: [],
        dueThisWeek: [],
      };
      const errors = validateActionQueueSummary(summary);
      expect(errors).toContain("Total count must be non-negative");
    });
  });

  describe("validateWorkspaceHealth", () => {
    it("should accept valid workspace health", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 5,
        healthyEngagements: 4,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toHaveLength(0);
    });

    it("should reject execution certainty > 100", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 5,
        healthyEngagements: 4,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 150,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toContain("Execution certainty must be 0-100");
    });

    it("should reject health snapshot count overflow", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: HealthStatus.HEALTHY,
        engagementCount: 2,
        healthyEngagements: 3,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        activeKPICount: 20,
        onTrackKPICount: 18,
        actionQueueSize: 15,
        overdueActionCount: 0,
        averageExecutionCertainty: 75,
        engagementHealthSnapshots: [],
        topRisks: [],
        recommendedActions: [],
      };
      const errors = validateWorkspaceHealth(health);
      expect(errors).toContain("Health snapshot counts exceed total engagement count");
    });
  });

  describe("validateOwnerDashboardConfig", () => {
    it("should accept valid config", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 30,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toHaveLength(0);
    });

    it("should reject zero daysOfHistoryVisible", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 0,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toContain("Days of history visible must be positive");
    });

    it("should reject invalid owner ID", () => {
      const config = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        ownerId: "not-a-uuid",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        showCompletedActions: true,
        daysOfHistoryVisible: 30,
        actionPriorityThreshold: ActionQueuePriority.MEDIUM,
        healthStatusThreshold: HealthStatus.AT_RISK,
        enableBulkActions: true,
        enableAdvancedFiltering: true,
      };
      const errors = validateOwnerDashboardConfig(config);
      expect(errors).toContain("Invalid owner ID format");
    });
  });

  describe("validateOwnerDashboardView", () => {
    it("should accept valid complete view", () => {
      const view = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        config: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          ownerId: "550e8400-e29b-41d4-a716-446655440001",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          showCompletedActions: true,
          daysOfHistoryVisible: 30,
          actionPriorityThreshold: ActionQueuePriority.MEDIUM,
          healthStatusThreshold: HealthStatus.AT_RISK,
          enableBulkActions: true,
          enableAdvancedFiltering: true,
        },
        health: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          assessedAt: new Date().toISOString(),
          overallStatus: HealthStatus.HEALTHY,
          engagementCount: 5,
          healthyEngagements: 4,
          atRiskEngagements: 1,
          criticalEngagements: 0,
          activeKPICount: 20,
          onTrackKPICount: 18,
          actionQueueSize: 15,
          overdueActionCount: 0,
          averageExecutionCertainty: 75,
          engagementHealthSnapshots: [],
          topRisks: [],
          recommendedActions: [],
        },
        actionQueue: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          totalCount: 10,
          byStatus: { in_progress: 5, pending: 5 },
          byPriority: { high: 3, medium: 7 },
          overdueCount: 2,
          blockedCount: 1,
          completedThisWeek: 3,
          averageCompletionDays: 5,
          criticalActions: [],
          dueThisWeek: [],
        },
        recentKPIs: [],
      };
      const errors = validateOwnerDashboardView(view);
      expect(errors).toHaveLength(0);
    });

    it("should accumulate errors from all sub-validators", () => {
      const view = {
        workspaceId: "invalid",
        config: {
          workspaceId: "also-invalid",
          ownerId: "not-uuid",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          showCompletedActions: true,
          daysOfHistoryVisible: 0,
          actionPriorityThreshold: ActionQueuePriority.MEDIUM,
          healthStatusThreshold: HealthStatus.AT_RISK,
          enableBulkActions: true,
          enableAdvancedFiltering: true,
        },
        health: {
          workspaceId: "also-invalid",
          assessedAt: new Date().toISOString(),
          overallStatus: HealthStatus.HEALTHY,
          engagementCount: 2,
          healthyEngagements: 3,
          atRiskEngagements: 1,
          criticalEngagements: 0,
          activeKPICount: 20,
          onTrackKPICount: 18,
          actionQueueSize: 15,
          overdueActionCount: 0,
          averageExecutionCertainty: 150,
          engagementHealthSnapshots: [],
          topRisks: [],
          recommendedActions: [],
        },
        actionQueue: {
          workspaceId: "also-invalid",
          totalCount: -1,
          byStatus: {},
          byPriority: {},
          overdueCount: 2,
          blockedCount: 1,
          completedThisWeek: 3,
          averageCompletionDays: 5,
          criticalActions: [],
          dueThisWeek: [],
        },
        recentKPIs: [],
      };
      const errors = validateOwnerDashboardView(view);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain("Days of history visible must be positive");
      expect(errors).toContain("Execution certainty must be 0-100");
      expect(errors).toContain("Total count must be non-negative");
    });
  });
});

// ─── Phase 23: Owner Loop Dashboard Proof ────────────────────────────────────

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function baseLoopInput(overrides: Partial<OwnerLoopDashboardInput> = {}): OwnerLoopDashboardInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    periodLabel: "2025-Q3",
    inputQuality: "complete",
    diagnosis: "complete",
    recommendation: "complete",
    ownerDecision: "complete",
    action: "in_progress",
    evidence: "pending",
    outcomeStatus: "not_applicable",
    adjudication: "not_applicable",
    reassessment: "not_applicable",
    learningEligibility: "not_applicable",
    reassessmentRequired: false,
    ownerDecisionPending: false,
    harmFlagged: false,
    ...overrides,
  };
}

describe("Phase 23 — Owner Loop Dashboard: dashboard loads", () => {
  it("returns valid view for well-formed input", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput());
    expect(view.valid).toBe(true);
    expect(view.violations).toHaveLength(0);
    expect(view.workspaceId).toBe(WS);
    expect(view.businessId).toBe(BIZ);
    expect(view.periodLabel).toBe("2025-Q3");
  });

  it("exposes all 10 loop stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput());
    const stageLabels = view.stages.map((s) => s.stage);
    expect(stageLabels).toContain("Input Quality");
    expect(stageLabels).toContain("Diagnosis");
    expect(stageLabels).toContain("Recommendation");
    expect(stageLabels).toContain("Owner Decision");
    expect(stageLabels).toContain("Action");
    expect(stageLabels).toContain("Evidence");
    expect(stageLabels).toContain("Outcome");
    expect(stageLabels).toContain("Adjudication");
    expect(stageLabels).toContain("Reassessment");
    expect(stageLabels).toContain("Learning Eligibility");
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows active recommendation", () => {
  it("surfaces recommendation summary when provided", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ activeRecommendationSummary: "Renegotiate supplier contract to reduce COGS by 8%." })
    );
    expect(view.activeRecommendationSummary).toBe("Renegotiate supplier contract to reduce COGS by 8%.");
  });

  it("recommendation stage shows complete when done", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ recommendation: "complete" }));
    const stage = view.stages.find((s) => s.stage === "Recommendation")!;
    expect(stage.status).toBe("complete");
  });

  it("recommendation stage shows pending when not ready", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ recommendation: "pending" }));
    const stage = view.stages.find((s) => s.stage === "Recommendation")!;
    expect(stage.status).toBe("pending");
  });

  it("null when no summary provided", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ activeRecommendationSummary: undefined }));
    expect(view.activeRecommendationSummary).toBeNull();
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows missing data", () => {
  it("identifies missing_data stages in missingDataStages list", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ evidence: "missing_data", learningEligibility: "missing_data" })
    );
    expect(view.missingDataStages).toContain("Evidence");
    expect(view.missingDataStages).toContain("Learning Eligibility");
  });

  it("not_applicable stages appear in missingDataStages", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ adjudication: "not_applicable", reassessment: "not_applicable" })
    );
    expect(view.missingDataStages).toContain("Adjudication");
    expect(view.missingDataStages).toContain("Reassessment");
  });

  it("complete stages are NOT in missingDataStages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ inputQuality: "complete" }));
    expect(view.missingDataStages).not.toContain("Input Quality");
  });

  it("DASHBOARD-RULE-2: periodLabel required", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ periodLabel: "" }));
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-2"))).toBe(true);
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows action status", () => {
  it("action in_progress shown in stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ action: "in_progress" }));
    const stage = view.stages.find((s) => s.stage === "Action")!;
    expect(stage.status).toBe("in_progress");
  });

  it("action blocked triggers requiresOwnerAction=true on stage", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ action: "requires_owner_action" })
    );
    const stage = view.stages.find((s) => s.stage === "Action")!;
    expect(stage.requiresOwnerAction).toBe(true);
  });

  it("action blocked contributes to requiresOwnerAttention", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ action: "requires_owner_action" })
    );
    expect(view.requiresOwnerAttention).toBe(true);
  });

  it("action complete does not require owner action", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ action: "complete" }));
    const stage = view.stages.find((s) => s.stage === "Action")!;
    expect(stage.requiresOwnerAction).toBe(false);
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows evidence verification", () => {
  it("evidence pending shown in stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ evidence: "pending" }));
    const stage = view.stages.find((s) => s.stage === "Evidence")!;
    expect(stage.status).toBe("pending");
  });

  it("evidence complete shown in stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ evidence: "complete" }));
    const stage = view.stages.find((s) => s.stage === "Evidence")!;
    expect(stage.status).toBe("complete");
  });

  it("evidence requires_owner_action triggers stage flag", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ evidence: "requires_owner_action" }));
    const stage = view.stages.find((s) => s.stage === "Evidence")!;
    expect(stage.requiresOwnerAction).toBe(true);
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows outcome", () => {
  it("outcome complete shown in stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ outcomeStatus: "complete" }));
    const stage = view.stages.find((s) => s.stage === "Outcome")!;
    expect(stage.status).toBe("complete");
  });

  it("outcome pending shown in stages", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ outcomeStatus: "pending" }));
    const stage = view.stages.find((s) => s.stage === "Outcome")!;
    expect(stage.status).toBe("pending");
  });

  it("lastOutcomeSummary exposed when provided", () => {
    // No lastOutcomeSummary in the loop input — openBlockers carries context
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ outcomeStatus: "complete", openBlockers: ["Revenue target missed by 12%."] })
    );
    expect(view.openBlockers).toContain("Revenue target missed by 12%.");
  });
});

describe("Phase 23 — Owner Loop Dashboard: shows reassessment required", () => {
  it("reassessmentRequired=true sets flag on view", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        reassessmentRequired: true,
        ownerAttentionItems: ["Reassessment triggered by failed outcome — review required."],
      })
    );
    expect(view.reassessmentRequired).toBe(true);
    expect(view.requiresOwnerAttention).toBe(true);
  });

  it("reassessment stage in_progress shown correctly", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        reassessment: "in_progress",
        reassessmentRequired: true,
        ownerAttentionItems: ["Reassessment in progress — owner input needed."],
      })
    );
    const stage = view.stages.find((s) => s.stage === "Reassessment")!;
    expect(stage.status).toBe("in_progress");
  });

  it("DASHBOARD-RULE-4: ownerAttentionItems required when reassessmentRequired", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ reassessmentRequired: true, ownerAttentionItems: undefined })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-4"))).toBe(true);
  });

  it("DASHBOARD-RULE-4: ownerAttentionItems required when ownerDecisionPending", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ ownerDecisionPending: true, ownerAttentionItems: undefined })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-4"))).toBe(true);
  });

  it("ownerDecisionPending=true sets requiresOwnerAttention", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        ownerDecisionPending: true,
        ownerAttentionItems: ["Recommendation ready — owner decision required."],
      })
    );
    expect(view.ownerDecisionPending).toBe(true);
    expect(view.requiresOwnerAttention).toBe(true);
  });

  it("harmFlagged=true sets requiresOwnerAttention", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ harmFlagged: true }));
    expect(view.harmFlagged).toBe(true);
    expect(view.requiresOwnerAttention).toBe(true);
  });
});

describe("Phase 23 — Owner Loop Dashboard: does not expose hidden learning internals", () => {
  it("DASHBOARD-RULE-3: rejects adjudication_verdict in recommendation summary", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ activeRecommendationSummary: "Check adjudication_verdict field for details." })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("DASHBOARD-RULE-3: rejects attribution_class in trend warnings", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ businessTrendWarnings: ["attribution_class shows external_event."] })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("DASHBOARD-RULE-3: rejects learning_confidence in attention items", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        ownerDecisionPending: true,
        ownerAttentionItems: ["learning_confidence score is 0.85."],
      })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("DASHBOARD-RULE-3: rejects model_hint in blocker text", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ openBlockers: ["model_hint: retry with higher temperature."] })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("DASHBOARD-RULE-3: rejects eligibility_score in any text", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({ openBlockers: ["eligibility_score = 0.4, below threshold."] })
    );
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("DASHBOARD-RULE-3: clean owner-facing text passes", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        activeRecommendationSummary: "Renegotiate supplier contract to reduce costs by 8%.",
        businessTrendWarnings: ["Revenue rising but gross profit declining — review pricing."],
        ownerDecisionPending: true,
        ownerAttentionItems: ["Recommendation ready — your decision is required to proceed."],
      })
    );
    expect(view.valid).toBe(true);
    expect(view.violations).toHaveLength(0);
  });
});

describe("Phase 23 — Owner Loop Dashboard: workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => buildOwnerLoopDashboard(baseLoopInput({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => buildOwnerLoopDashboard(baseLoopInput({ workspaceId: "   " }))).toThrow();
  });
});

describe("Phase 23 — loopDashboardRequiresOwnerAttention helper", () => {
  it("returns true when reassessmentRequired", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        reassessmentRequired: true,
        ownerAttentionItems: ["Reassessment triggered."],
      })
    );
    expect(loopDashboardRequiresOwnerAttention(view)).toBe(true);
  });

  it("returns false when nothing pending", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput());
    expect(loopDashboardRequiresOwnerAttention(view)).toBe(false);
  });
});

describe("Phase 23 — business trend warnings surfaced", () => {
  it("trend warnings exposed on view", () => {
    const view = buildOwnerLoopDashboard(
      baseLoopInput({
        businessTrendWarnings: [
          "Revenue rising but gross profit falling — margin compression detected.",
          "Debt growing faster than cash — solvency risk increasing.",
        ],
      })
    );
    expect(view.businessTrendWarnings).toHaveLength(2);
    expect(view.businessTrendWarnings[0]).toContain("margin compression");
  });

  it("empty when no warnings", () => {
    const view = buildOwnerLoopDashboard(baseLoopInput({ businessTrendWarnings: [] }));
    expect(view.businessTrendWarnings).toHaveLength(0);
  });
});
