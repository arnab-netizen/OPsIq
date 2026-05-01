import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies BEFORE importing the module under test
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/service-auth", () => ({
  requireServiceContext: vi.fn((authContext, workspaceId) => {
    if (!authContext || !authContext.workspace?.id) {
      throw new Error("Auth context required");
    }
    return [authContext.user.id, workspaceId];
  }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// NOW import the module under test
import { db } from "@/lib/db";
import {
  runDecisionLifecycleIntegrityCheck,
  validateDecisionFieldsForState,
  formatIntegrityCheckResult,
  IntegrityFinding,
  IntegrityCheckResult,
} from "../decision-lifecycle-integrity";

describe("Decision Lifecycle Integrity Check Service", () => {
  const mockAuthContext = {
    user: { id: "user-123" },
    workspace: { id: "workspace-123" },
  };

  const createGoodDecision = () => ({
    id: "dec-good-1",
    workspaceId: "workspace-123",
    status: "closed",
    createdBy: "user-123",
    ownerUserId: "user-123",
    startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    completedAt: new Date(),
    actualOutcomeValue: 5000,
    actualOutcome: "Success",
    executionStatus: "completed",
    blockReason: null,
    impactActual: null,
    impactLow: null,
    impactHigh: null,
    auditEvents: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Missing workspace ID check", () => {
    it("should detect decision without workspaceId", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-missing-workspace",
        workspaceId: null,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      expect(result.findingsCount).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.decisionId === "dec-missing-workspace"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("critical");
      expect(finding?.issue).toContain("workspaceId");
    });
  });

  describe("Missing owner check", () => {
    it("should detect decision without ownerUserId and createdBy", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-missing-owner",
        ownerUserId: null,
        createdBy: null,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-missing-owner"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
      expect(finding?.issue).toContain("owner");
    });
  });

  describe("Executed without execution record check", () => {
    it("should detect executed decision without startedAt", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-executed-no-record",
        status: "in_progress",
        startedAt: null,
        executionStatus: null,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-executed-no-record"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
      expect(finding?.issue).toContain("execution record");
    });
  });

  describe("Executed without timely outcome check", () => {
    it("should detect executed decision without outcome after window", async () => {
      const goodDecision = createGoodDecision();
      const oldStartDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const badDecision = {
        ...goodDecision,
        id: "dec-stale-execution",
        status: "in_progress",
        startedAt: oldStartDate,
        actualOutcomeValue: null,
        actualOutcome: null,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-stale-execution"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("medium");
      expect(finding?.issue).toContain("missing outcome");
    });
  });

  describe("Closed without outcome check", () => {
    it("should detect closed decision without actualOutcomeValue", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-closed-no-outcome",
        status: "closed",
        actualOutcomeValue: null,
        actualOutcome: null,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-closed-no-outcome"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("critical");
      expect(finding?.issue).toContain("Closed decision missing outcome");
    });
  });

  describe("Impact on non-executed decisions check", () => {
    it("should detect impact records on non-executed decisions", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-impact-no-execute",
        status: "approved",
        impactActual: 5000,
        impactLow: 4000,
        impactHigh: 6000,
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-impact-no-execute"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("high");
      expect(finding?.issue).toContain("Impact/ROI recorded for non-executed");
    });
  });

  describe("Audit gap detection", () => {
    it("should detect missing audit event for closed decision", async () => {
      const goodDecision = createGoodDecision();
      const badDecision = {
        ...goodDecision,
        id: "dec-audit-gap-closed",
        status: "closed",
        auditEvents: [],
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([badDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-audit-gap-closed"
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("medium");
      expect(finding?.issue).toContain("audit event");
    });

    it("should recognize valid audit events", async () => {
      const goodDecision = createGoodDecision();
      const decisionWithAudit = {
        ...goodDecision,
        id: "dec-audit-valid",
        status: "closed",
        auditEvents: [{ eventName: "DECISION_CLOSED" }],
      };

      vi.mocked(db.operatorItem.findMany).mockResolvedValue([decisionWithAudit] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      const finding = result.findings.find(
        (f) => f.decisionId === "dec-audit-valid"
      );
      expect(finding).toBeUndefined();
    });
  });

  describe("Result aggregation", () => {
    it("should include total counts in result", async () => {
      const goodDecision = createGoodDecision();
      vi.mocked(db.operatorItem.findMany).mockResolvedValue([goodDecision] as any);

      const result = await runDecisionLifecycleIntegrityCheck(mockAuthContext);

      expect(result.totalDecisionsChecked).toBe(1);
      expect(result.timestamp).toBeDefined();
      expect(result.workspaceId).toBe("workspace-123");
    });
  });

  describe("Field validation by state", () => {
    it("should validate DRAFT state has createdBy", () => {
      const draft = {
        id: "dec-1",
        workspaceId: "ws-1",
        status: "draft",
        createdBy: null,
      };

      const errors = validateDecisionFieldsForState(draft, "DRAFT");

      expect(errors.some((e) => e.includes("createdBy"))).toBe(true);
    });

    it("should validate CLOSED state has outcome", () => {
      const closed = {
        id: "dec-1",
        workspaceId: "ws-1",
        status: "closed",
        createdBy: "user-1",
        completedAt: new Date(),
        actualOutcomeValue: null,
        actualOutcome: null,
      };

      const errors = validateDecisionFieldsForState(closed, "CLOSED");

      expect(errors.some((e) => e.includes("outcome"))).toBe(true);
    });

    it("should validate terminal states have blockReason", () => {
      const rejected = {
        id: "dec-1",
        workspaceId: "ws-1",
        status: "blocked",
        createdBy: "user-1",
        blockReason: null,
      };

      const errors = validateDecisionFieldsForState(rejected, "REJECTED");

      expect(errors.some((e) => e.includes("blockReason"))).toBe(true);
    });
  });

  describe("Result formatting", () => {
    it("should format integrity check result as readable report", () => {
      const result: IntegrityCheckResult = {
        timestamp: new Date("2026-05-01T12:00:00Z"),
        workspaceId: "workspace-123",
        totalDecisionsChecked: 100,
        findingsCount: 5,
        findingsBySeverity: {
          critical: 1,
          high: 2,
          medium: 2,
          low: 0,
        },
        findings: [
          {
            severity: "critical",
            decisionId: "dec-1",
            workspaceId: "workspace-123",
            currentState: "CLOSED",
            currentStatus: "closed",
            issue: "Missing outcome",
            requiredFix: "Add outcome data",
          } as IntegrityFinding,
        ],
      };

      const report = formatIntegrityCheckResult(result);

      expect(report).toContain("Integrity Check Report");
      expect(report).toContain("workspace-123");
      expect(report).toContain("100");
      expect(report).toContain("Critical: 1");
      expect(report).toContain("dec-1");
    });

    it("should format result with no findings", () => {
      const result: IntegrityCheckResult = {
        timestamp: new Date(),
        workspaceId: "workspace-123",
        totalDecisionsChecked: 50,
        findingsCount: 0,
        findingsBySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
        findings: [],
      };

      const report = formatIntegrityCheckResult(result);

      expect(report).toContain("✅ No integrity issues found!");
    });
  });
});
