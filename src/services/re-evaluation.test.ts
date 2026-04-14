import { describe, it, expect, vi } from "vitest";
import {
  SIGNIFICANT_CHANGE_TYPES,
  type SignificantChangeEvent,
} from "./re-evaluation";

// Mock the db and audit modules since they require database connectivity
vi.mock("@/lib/db", () => ({
  db: {
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  },
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Re-evaluation trigger", () => {
  it("SIGNIFICANT_CHANGE_TYPES covers all required types", () => {
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("new_critical_evidence");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("kpi_deterioration");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("unresolved_critical_blocker");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("failed_implementation");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("shock_event");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("scope_change");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("owner_non_compliance");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("major_client_loss");
    expect(SIGNIFICANT_CHANGE_TYPES).toContain("key_employee_loss");
  });

  it("triggerReEvaluation returns targets and audit ID", async () => {
    // Import after mocks are set up
    const { triggerReEvaluation } = await import("./re-evaluation");

    const event: SignificantChangeEvent = {
      changeType: "shock_event",
      entityType: "engagement",
      entityId: "eng-1",
      severity: "critical",
      description: "Major market disruption",
      triggeredBy: "user-1",
    };

    const result = await triggerReEvaluation(event);

    expect(result.auditEventId).toBe("audit-1");
    // shock_event triggers full re-evaluation
    expect(result.targets.businessConditionProfile).toBe(true);
    expect(result.targets.interventionMode).toBe(true);
    expect(result.targets.interventionPhase).toBe(true);
    expect(result.targets.recommendationPriority).toBe(true);
    expect(result.targets.actionPriority).toBe(true);
    expect(result.targets.reviewCadence).toBe(true);
    expect(result.targets.healthStatus).toBe(true);
  });

  it("scope_change does not re-evaluate business condition", async () => {
    const { triggerReEvaluation } = await import("./re-evaluation");

    const event: SignificantChangeEvent = {
      changeType: "scope_change",
      entityType: "engagement",
      entityId: "eng-2",
      severity: "medium",
      description: "Scope expanded",
      triggeredBy: "user-1",
    };

    const result = await triggerReEvaluation(event);
    expect(result.targets.businessConditionProfile).toBe(false);
    expect(result.targets.interventionMode).toBe(true);
  });

  it("new_critical_evidence triggers targeted re-evaluation", async () => {
    const { triggerReEvaluation } = await import("./re-evaluation");

    const event: SignificantChangeEvent = {
      changeType: "new_critical_evidence",
      entityType: "finding",
      entityId: "find-1",
      severity: "high",
      description: "New evidence changes finding",
      triggeredBy: "user-1",
    };

    const result = await triggerReEvaluation(event);
    expect(result.targets.businessConditionProfile).toBe(true);
    expect(result.targets.interventionMode).toBe(false);
    expect(result.targets.recommendationPriority).toBe(true);
  });
});
