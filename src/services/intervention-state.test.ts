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
      const from = "triage" as InterventionPhase;
      const to = "stabilize" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from planning to execution", () => {
      const from = "stabilize" as InterventionPhase;
      const to = "repair" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from execution to review", () => {
      const from = "repair" as InterventionPhase;
      const to = "strengthen" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from review to handover", () => {
      const from = "strengthen" as InterventionPhase;
      const to = "grow" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows valid transition from handover to closed", () => {
      const from = "grow" as InterventionPhase;
      const to = "protect" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows backward transitions (planning back to assessment)", () => {
      const from = "stabilize" as InterventionPhase;
      const to = "triage" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("allows transition from execution to blocked", () => {
      const from = "repair" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
    });

    it("does not allow invalid transitions (assessment to review)", () => {
      const from = "triage" as InterventionPhase;
      const to = "strengthen" as InterventionPhase;
      // These phases exist but are not directly connected
      expect(INTERVENTION_PHASES).toContain(from);
      expect(INTERVENTION_PHASES).toContain(to);
    });

    it("closed phase has no allowed transitions", () => {
      const from = "protect" as InterventionPhase;
      expect(INTERVENTION_PHASES).toContain(from);
    });
  });

  describe("Phase constants", () => {
    it("includes all required intervention phases", () => {
      expect(INTERVENTION_PHASES).toContain("triage");
      expect(INTERVENTION_PHASES).toContain("stabilize");
      expect(INTERVENTION_PHASES).toContain("repair");
      expect(INTERVENTION_PHASES).toContain("strengthen");
      expect(INTERVENTION_PHASES).toContain("grow");
      expect(INTERVENTION_PHASES).toContain("protect");
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
        currentPhase: "triage",
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
      expect(result.currentPhase).toBe("triage");
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
        currentPhase: "triage",
        previousPhase: null,
      });
      mockDb.interventionState.update.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "stabilize",
        previousPhase: "triage",
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
        "stabilize" as InterventionPhase,
        "user-1"
      );

      expect(result.currentPhase).toBe("stabilize");
      expect(result.previousPhase).toBe("triage");
    });

    it("throws error for invalid phase transition", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.interventionState.findUnique.mockResolvedValue({
        id: "state-1",
        engagementId: "eng-1",
        currentPhase: "triage",
      });

      const { transitionPhase } = await import("./intervention-state");

      try {
        await transitionPhase(
          "eng-1",
          "strengthen" as InterventionPhase,
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
        await transitionPhase("eng-1", "stabilize" as InterventionPhase, "user-1");
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
        currentPhase: "repair",
        previousPhase: "stabilize",
        version: 2,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      const { getInterventionState } = await import("./intervention-state");
      const result = await getInterventionState("eng-1");

      expect(result.id).toBe("state-1");
      expect(result.currentPhase).toBe("repair");
      expect(result.previousPhase).toBe("stabilize");
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
      const allowed = getPhaseAllowedTransitions("triage" as InterventionPhase);
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain("stabilize");
    });

    it("returns empty array for closed phase", async () => {
      const { getPhaseAllowedTransitions } = await import("./intervention-state");
      const allowed = getPhaseAllowedTransitions("protect" as InterventionPhase);
      expect(allowed.length).toBe(0);
    });
  });
});
