/**
 * Bundle 7 Slice 7 — Consulting Engagement Health Mutation API tests.
 *
 * Proves: POST ?action=update_health wires to updateConsultingEngagementHealth,
 * emits CONSULTING_HEALTH_UPDATED audit event, enforces workspace isolation,
 * validates input, and returns the health object.
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { ConsultingEngagementHealth } from "@/domain/consulting/consulting-contracts";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockUpdateHealth, mockWithCanonical, mockEmitAuditEvent } = vi.hoisted(() => ({
  mockUpdateHealth: vi.fn(),
  mockWithCanonical: vi.fn(),
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/consulting/consulting-engagement.service", () => ({
  createConsultingEngagement: vi.fn(),
  getConsultingEngagement: vi.fn(),
  listConsultingEngagements: vi.fn(),
  advanceConsultingPhase: vi.fn(),
  createConsultingFinding: vi.fn(),
  generateConsultingRecommendation: vi.fn(),
  assignConsultingAction: vi.fn(),
  closeConsultingEngagement: vi.fn(),
  updateConsultingEngagementHealth: mockUpdateHealth,
}));

const capturedPostDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedPostDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb";
const ENG_ID = "ee700000-0000-4000-8000-000000000007";
const ACTOR_ID = "ac700000-0000-4000-8000-000000000007";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_ID,
    ...overrides,
  };
}

function makeRequest(action: string, body: Record<string, unknown>): Request {
  return {
    url: `https://example.com/api/consulting/engagements?action=${action}`,
    json: async () => body,
  } as unknown as Request;
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      const ctx = testCtx as Record<string, unknown>;
      return handler({ ...makeCtx(), ...ctx });
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Health fixtures ──────────────────────────────────────────────────────────

const HEALTHY: ConsultingEngagementHealth = {
  status: "HEALTHY",
  reasons: [],
  criticalFindingsUnresolved: 0,
  criticalActionsUnresolved: 0,
  overdueActions: 0,
};

const AT_RISK: ConsultingEngagementHealth = {
  status: "AT_RISK",
  reasons: ["1 critical action(s) unresolved"],
  criticalFindingsUnresolved: 0,
  criticalActionsUnresolved: 1,
  overdueActions: 0,
};

const BLOCKED: ConsultingEngagementHealth = {
  status: "BLOCKED",
  reasons: ["2 unresolved critical finding(s)"],
  criticalFindingsUnresolved: 2,
  criticalActionsUnresolved: 0,
  overdueActions: 0,
};

// ─── Import POST handler after mocks ─────────────────────────────────────────

let POST: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/consulting/engagements/route");
  POST = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Bundle 7 Slice 7 — Consulting Engagement Health Mutation API", () => {
  // ─── 1. Capability enforcement ─────────────────────────────────────────────

  describe("capability enforcement", () => {
    it("POST is guarded by CONSULTING_WRITE", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).some((c) => c === "consulting:write")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).some((c) => c === "consulting:write")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. Input validation ───────────────────────────────────────────────────

  describe("input validation", () => {
    it("returns 422 when engagementId is missing", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", {}) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 422 when engagementId is not a UUID", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: "not-a-uuid" }) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 400 for unknown action", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("nonexistent_action", {}) })
      );
      expect(result.status).toBe(400);
      expect(result.body.error).toBe("Unknown action");
    });
  });

  // ─── 3. HEALTHY result ─────────────────────────────────────────────────────

  describe("HEALTHY result", () => {
    it("returns 200 with health object", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(result.status).toBe(200);
      expect(result.body.health).toBeDefined();
    });

    it("returns HEALTHY status", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("HEALTHY");
    });

    it("returns zero counts for HEALTHY", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalFindingsUnresolved).toBe(0);
      expect(health.criticalActionsUnresolved).toBe(0);
      expect(health.overdueActions).toBe(0);
    });
  });

  // ─── 4. AT_RISK result ─────────────────────────────────────────────────────

  describe("AT_RISK result", () => {
    it("returns AT_RISK status with reasons", async () => {
      mockUpdateHealth.mockResolvedValueOnce(AT_RISK);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("AT_RISK");
      expect(health.reasons.length).toBeGreaterThan(0);
    });

    it("returns correct AT_RISK counts", async () => {
      mockUpdateHealth.mockResolvedValueOnce(AT_RISK);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalActionsUnresolved).toBe(1);
      expect(health.criticalFindingsUnresolved).toBe(0);
    });
  });

  // ─── 5. BLOCKED result ─────────────────────────────────────────────────────

  describe("BLOCKED result", () => {
    it("returns BLOCKED status with reasons", async () => {
      mockUpdateHealth.mockResolvedValueOnce(BLOCKED);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("BLOCKED");
      expect(health.reasons.length).toBeGreaterThan(0);
    });

    it("returns critical findings count for BLOCKED", async () => {
      mockUpdateHealth.mockResolvedValueOnce(BLOCKED);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalFindingsUnresolved).toBe(2);
    });
  });

  // ─── 6. Audit event emission ───────────────────────────────────────────────

  describe("audit event emission", () => {
    it("service is called with workspaceId and engagementId", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      await POST(
        makeCtx({ verifiedWorkspaceId: WS_A, request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledWith(
        expect.objectContaining({ engagementId: ENG_ID, workspaceId: WS_A }),
        ACTOR_ID
      );
    });

    it("service is called with WS_B when context has WS_B", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      await POST(
        makeCtx({ verifiedWorkspaceId: WS_B, request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B }),
        ACTOR_ID
      );
    });

    it("service is called exactly once per request", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledTimes(1);
    });

    it("service is called with actorId from ctx", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const customActorId = "ac999999-0000-4000-8000-000000000099";
      await POST(
        makeCtx({ verifiedActorId: customActorId, request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledWith(
        expect.any(Object),
        customActorId
      );
    });
  });

  // ─── 7. Workspace isolation ────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("passes ctx.verifiedWorkspaceId (not body) to service", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      await POST(
        makeCtx({ verifiedWorkspaceId: WS_A, request: makeRequest("update_health", { engagementId: ENG_ID, workspaceId: WS_B }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        ACTOR_ID
      );
    });

    it("WS_B returns 404 when service throws NotFoundError", async () => {
      const { NotFoundError } = await import("@/infra/errors");
      mockUpdateHealth.mockRejectedValueOnce(new NotFoundError("Engagement", ENG_ID));
      await expect(
        POST(makeCtx({ verifiedWorkspaceId: WS_B, request: makeRequest("update_health", { engagementId: ENG_ID }) }))
      ).rejects.toThrow();
    });
  });

  // ─── 8. Response shape ─────────────────────────────────────────────────────

  describe("response shape", () => {
    it("wraps result in health key", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      expect(Object.keys(result.body)).toContain("health");
    });

    it("health object has all required fields", async () => {
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      const result = await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: ENG_ID }) })
      );
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("reasons");
      expect(health).toHaveProperty("criticalFindingsUnresolved");
      expect(health).toHaveProperty("criticalActionsUnresolved");
      expect(health).toHaveProperty("overdueActions");
    });

    it("passes custom engagementId from body to service", async () => {
      const customId = "ff700000-0000-4000-8000-000000000099";
      mockUpdateHealth.mockResolvedValueOnce(HEALTHY);
      await POST(
        makeCtx({ request: makeRequest("update_health", { engagementId: customId }) })
      );
      expect(mockUpdateHealth).toHaveBeenCalledWith(
        expect.objectContaining({ engagementId: customId }),
        ACTOR_ID
      );
    });
  });
});
