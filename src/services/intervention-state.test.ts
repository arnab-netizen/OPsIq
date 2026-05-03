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
      findFirst: vi.fn(),
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

const mockAuthContext = {
  session: {
    user: { id: "user-1", email: "test@test.com", name: "Test", isActive: true },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: { userId: "user-1", roles: [] },
};

describe("Intervention State Service", () => {
  describe("Phase transition validation", () => {
    // NOTE: Tests for the old phase model (stabilize, repair, strengthen, grow, protect)
    // that was never implemented have been removed.
    // Current phases: triage, stabilization, recovery, growth
    // See: src/domain/constants/statuses.ts INTERVENTION_PHASES constant

    it("placeholder - old phase tests removed", () => {
      expect(true).toBe(true);
    });
  });

  describe("Phase constants", () => {
    it("includes all required intervention phases", () => {
      expect(INTERVENTION_PHASES).toContain("triage");
      expect(INTERVENTION_PHASES).toContain("stabilization");
      expect(INTERVENTION_PHASES).toContain("recovery");
      expect(INTERVENTION_PHASES).toContain("growth");
    });

    it("has exactly 4 phases", () => {
      expect(INTERVENTION_PHASES.length).toBe(4);
    });
  });

  describe("Service initialization", () => {
    it("initializes with assessment as default phase", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1", interventionMode: null });
      mockDb.engagement.update.mockResolvedValue({
        id: "eng-1",
        engagementId: "eng-1",
        interventionMode: "recovery",
        interventionPhase: "triage",
        version: 1,
      });

      const { initializeInterventionState } = await import("./intervention-state");
      const result = await initializeInterventionState(
        "eng-1",
        "recovery",
        mockAuthContext as any,
        "550e8400-e29b-41d4-a716-446655440000"
      );

      expect(result.id).toBe("eng-1");
      expect(result.interventionPhase).toBe("triage");
    });

    it("prevents duplicate initialization", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "recovery",
      });

      const { initializeInterventionState } = await import("./intervention-state");

      try {
        await initializeInterventionState("eng-1", "recovery", mockAuthContext as any, "550e8400-e29b-41d4-a716-446655440000");
        expect.fail("Should throw validation error");
      } catch (error) {
        expect((error as any).message).toContain("already initialized");
      }
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { initializeInterventionState } = await import("./intervention-state");

      try {
        await initializeInterventionState("nonexistent", "recovery", mockAuthContext as any, "550e8400-e29b-41d4-a716-446655440000");
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
      mockDb.engagement.findFirst.mockResolvedValue({
        id: "eng-1",
        workspaceId: "workspace-1",
        interventionPhase: "triage",
      });
      mockDb.engagement.update.mockResolvedValue({
        id: "eng-1",
        interventionPhase: "stabilization",
      });

      const { transitionPhase } = await import("./intervention-state");
      const result = await transitionPhase(
        "eng-1",
        "stabilization" as InterventionPhase,
        mockAuthContext as any,
        "workspace-1"
      );

      expect(result.interventionPhase).toBe("stabilization");
    });

    it("throws error for invalid phase transition", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionPhase: "triage",
      });

      const { transitionPhase } = await import("./intervention-state");

      try {
        await transitionPhase(
          "eng-1",
          "triage" as InterventionPhase,
          mockAuthContext as any,
          "workspace-1"
        );
        expect.fail("Should throw validation error");
      } catch (error) {
        expect((error as any).message).toContain("Cannot transition");
      }
    });

    it("throws error if intervention state not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findFirst.mockResolvedValue(null);

      const { transitionPhase } = await import("./intervention-state");

      try {
        await transitionPhase("eng-1", "stabilization" as InterventionPhase, mockAuthContext as any, "workspace-1");
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
      mockDb.engagement.findFirst.mockResolvedValue({
        id: "eng-1",
        workspaceId: "workspace-1",
        interventionMode: "stabilization",
        version: 2,
      });

      const { getInterventionState } = await import("./intervention-state");
      const result = await getInterventionState("eng-1", "workspace-1");

      expect(result.engagementId).toBe("eng-1");
      expect(result.interventionMode).toBe("stabilization");
      expect(result.version).toBe(2);
    });

    it("throws error if state not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findFirst.mockResolvedValue(null);

      const { getInterventionState } = await import("./intervention-state");

      try {
        await getInterventionState("eng-1", "workspace-1");
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
      expect(allowed).toContain("stabilization");
    });

    it("returns empty array for closed phase", async () => {
      const { getPhaseAllowedTransitions } = await import("./intervention-state");
      const allowed = getPhaseAllowedTransitions("growth" as InterventionPhase);
      expect(allowed.length).toBe(0);
    });
  });
});
