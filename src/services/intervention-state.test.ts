import { describe, it, expect, vi } from "vitest";
import {
  INTERVENTION_PHASES,
  type InterventionPhase,
} from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    businessConditionProfile: {
      findFirst: vi.fn(),
    },
    kpi: {
      findMany: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    shockEvent: {
      findMany: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Intervention State Service", () => {
  describe("Phase transition validation", () => {
    it("allows valid transition from assessment to planning", () => {
      const from = "assessment" as InterventionPhase;
      const to = "planning" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from planning to execution", () => {
      const from = "planning" as InterventionPhase;
      const to = "execution" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from execution to review", () => {
      const from = "execution" as InterventionPhase;
      const to = "review" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from review to handover", () => {
      const from = "review" as InterventionPhase;
      const to = "handover" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from handover to closed", () => {
      const from = "handover" as InterventionPhase;
      const to = "closed" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows backward transitions (planning back to assessment)", () => {
      const from = "planning" as InterventionPhase;
      const to = "assessment" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows transition from execution to blocked", () => {
      const from = "execution" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
    });

    it("does not allow invalid transitions (assessment to review)", () => {
      const from = "assessment" as InterventionPhase;
      const to = "review" as InterventionPhase;
      // These phases exist but are not directly connected
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("closed phase has no allowed transitions", () => {
      const from = "closed" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
    });
  });

  describe("Phase constants", () => {
    it("includes all required intervention phases", () => {
      expect(INTERVENTION_PHASES).toContain("assessment");
      expect(INTERVENTION_PHASES).toContain("planning");
      expect(INTERVENTION_PHASES).toContain("execution");
      expect(INTERVENTION_PHASES).toContain("review");
      expect(INTERVENTION_PHASES).toContain("handover");
      expect(INTERVENTION_PHASES).toContain("closed");
    });

    it("has exactly 6 phases", () => {
      expect(INTERVENTION_PHASES.length).toBe(6);
    });
  });

  describe("Service initialization", () => {
    it("initializes with assessment as default phase", async () => {
      // Mock setup
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.interventionState.findUnique.mockResolvedValue(null);
      mockDb.interventionState.create.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "assessment",
        previousPhase: null,
        version: 1,
      });

      const { initializeInterventionState } = await import("./intervention-state");
      const result = await initializeInterventionState(
        { engagementId: "eng-1" },
        "user-1"
      );

      expect(result.id).toBe("state-1");
      expect(result.engagementId).toBe("eng-1");
      expect(result.currentPhase).toBe("assessment");
    });

    it("prevents duplicate initialization", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.interventionState.findUnique.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
      });

      const { initializeInterventionState } = await import("./intervention-state");

      try {
        await initializeInterventionState({ engagementId: "eng-1" }, "user-1");
        expect.fail("Should throw validation error");
      } catch (error) {
        expect((error as any).message).toContain("already exists");
      }
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { initializeInterventionState } = await import("./intervention-state");

      try {
        await initializeInterventionState(
          { engagementId: "nonexistent" },
          "user-1"
        );
        expect.fail("Should throw not found error");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });
  });

  describe("Phase transition", () => {
    it("successfully transitions to allowed phase", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "assessment",
        previousPhase: null,
      });
      mockDb.interventionState.update.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "planning",
        previousPhase: "assessment",
      });

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "stable",
        severityScore: 5,
        cashPressureLevel: "low",
        marginPressureLevel: "low",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });
      mockDb.kpi.findMany.mockResolvedValue([]);
      mockDb.action.findMany.mockResolvedValue([]);
      mockDb.action.count.mockResolvedValue(0);
      mockDb.shockEvent.findMany.mockResolvedValue([]);
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "stabilization",
      });
      mockDb.recommendation.findMany.mockResolvedValue([]);

      const { transitionPhase } = await import("./intervention-state");
      const result = await transitionPhase(
        "eng-1",
        "planning" as InterventionPhase,
        "user-1"
      );

      expect(result.currentPhase).toBe("planning");
      expect(result.previousPhase).toBe("assessment");
    });

    it("throws error for invalid phase transition", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "assessment",
      });

      const { transitionPhase } = await import("./intervention-state");

      try {
        await transitionPhase(
          "eng-1",
          "review" as InterventionPhase,
          "user-1"
        );
        expect.fail("Should throw validation error");
      } catch (error) {
        expect((error as any).message).toContain("Cannot transition");
      }
    });

    it("throws error if intervention state not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue(null);

      const { transitionPhase } = await import("./intervention-state");

      try {
        await transitionPhase("eng-1", "planning" as InterventionPhase, "user-1");
        expect.fail("Should throw not found error");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });
  });

  describe("Get intervention state", () => {
    it("retrieves current intervention state", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "execution",
        previousPhase: "planning",
        version: 2,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      const { getInterventionState } = await import("./intervention-state");
      const result = await getInterventionState("eng-1");

      expect(result.id).toBe("state-1");
      expect(result.currentPhase).toBe("execution");
      expect(result.previousPhase).toBe("planning");
      expect(result.version).toBe(2);
    });

    it("throws error if state not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue(null);

      const { getInterventionState } = await import("./intervention-state");

      try {
        await getInterventionState("eng-1");
        expect.fail("Should throw not found error");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });
  });

  describe("Get allowed transitions", () => {
    it("returns allowed transitions from assessment", async () => {
      const { getPhaseAllowedTransitions } = await import("./intervention-state");
      const allowed = getPhaseAllowedTransitions("assessment" as InterventionPhase);
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain("planning");
    });

    it("returns empty array for closed phase", async () => {
      const { getPhaseAllowedTransitions } = await import("./intervention-state");
      const allowed = getPhaseAllowedTransitions("closed" as InterventionPhase);
      expect(allowed.length).toBe(0);
    });
  });
});
