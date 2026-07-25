/**
 * Bundle 7 Slice 6 — Consulting Engagement Health API tests.
 *
 * Proves: capability declaration, input validation, health computation wiring,
 * workspace isolation, 404 handling, and no audit event emission.
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { ConsultingEngagementHealth } from "@/domain/consulting/consulting-contracts";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockComputeHealth, mockWithCanonical, mockEmitAuditEvent } = vi.hoisted(() => ({
  mockComputeHealth: vi.fn(),
  mockWithCanonical: vi.fn(),
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/consulting/consulting-engagement.service", () => ({
  computeConsultingEngagementHealth: mockComputeHealth,
}));

const capturedDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    capturedDeclarations.push({
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
const ENG_ID = "ee100000-0000-4000-8000-000000000006";
const ACTOR_ID = "ac100000-0000-4000-8000-000000000006";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_ID,
    ...overrides,
  };
}

function makeUrl(id?: string | null): string {
  if (id === undefined) return `https://example.com/api/consulting/engagements/health?id=${ENG_ID}`;
  if (id === null || id === "") return "https://example.com/api/consulting/engagements/health";
  return `https://example.com/api/consulting/engagements/health?id=${id}`;
}

// ─── Passthrough / deny helpers ───────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      const req = (testCtx as Record<string, unknown>)?.request as Request | undefined;
      const ctx = testCtx as Record<string, unknown> | undefined;
      return handler({ ...makeCtx(), ...ctx, request: req });
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

// ─── Import handler after mocks ───────────────────────────────────────────────

let GET: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/consulting/engagements/health/route");
  GET = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Bundle 7 Slice 6 — Consulting Engagement Health API", () => {
  // ─── 1. Capability declaration ─────────────────────────────────────────────

  describe("capability declaration", () => {
    it("declares CONSULTING_READ capability on GET", () => {
      expect(capturedDeclarations.length).toBeGreaterThan(0);
      const decl = capturedDeclarations[0];
      expect(decl.requireCapabilities).toContain("consulting:read");
    });

    it("requires workspace enforcement", () => {
      expect(capturedDeclarations.length).toBeGreaterThan(0);
      expect(capturedDeclarations[0].requireWorkspace).toBe(true);
    });
  });

  // ─── 2. Input validation ───────────────────────────────────────────────────

  describe("input validation", () => {
    it("returns 400 when id query param is missing", async () => {
      const result = await GET(makeCtx({ request: { url: makeUrl(null) } as unknown as Request }));
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/Missing required/);
    });

    it("returns 400 when id is empty string", async () => {
      const result = await GET(makeCtx({ request: { url: makeUrl("") } as unknown as Request }));
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/Missing required/);
    });

    it("returns 404 when engagement not found", async () => {
      const { NotFoundError } = await import("@/infra/errors");
      mockComputeHealth.mockRejectedValueOnce(new NotFoundError("Engagement", ENG_ID));
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(result.status).toBe(404);
      expect(result.body.error).toBeDefined();
    });

    it("rethrows non-NotFoundError errors", async () => {
      mockComputeHealth.mockRejectedValueOnce(new Error("unexpected db failure"));
      await expect(
        GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }))
      ).rejects.toThrow("unexpected db failure");
    });
  });

  // ─── 3. HEALTHY status ─────────────────────────────────────────────────────

  describe("HEALTHY status", () => {
    it("returns 200 with health object", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(result.status).toBe(200);
      expect(result.body.health).toBeDefined();
    });

    it("returns HEALTHY status with empty reasons", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("HEALTHY");
      expect(health.reasons).toHaveLength(0);
    });

    it("returns zero counts for HEALTHY engagement", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalFindingsUnresolved).toBe(0);
      expect(health.criticalActionsUnresolved).toBe(0);
      expect(health.overdueActions).toBe(0);
    });
  });

  // ─── 4. AT_RISK status ─────────────────────────────────────────────────────

  describe("AT_RISK status", () => {
    it("returns AT_RISK status with reasons", async () => {
      mockComputeHealth.mockResolvedValueOnce(AT_RISK);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("AT_RISK");
      expect(health.reasons.length).toBeGreaterThan(0);
    });

    it("returns correct counts for AT_RISK", async () => {
      mockComputeHealth.mockResolvedValueOnce(AT_RISK);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalActionsUnresolved).toBe(1);
      expect(health.criticalFindingsUnresolved).toBe(0);
    });

    it("includes reason text for AT_RISK", async () => {
      mockComputeHealth.mockResolvedValueOnce(AT_RISK);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.reasons[0]).toContain("critical action");
    });
  });

  // ─── 5. BLOCKED status ─────────────────────────────────────────────────────

  describe("BLOCKED status", () => {
    it("returns BLOCKED status with reasons", async () => {
      mockComputeHealth.mockResolvedValueOnce(BLOCKED);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.status).toBe("BLOCKED");
      expect(health.reasons.length).toBeGreaterThan(0);
    });

    it("returns critical findings count for BLOCKED", async () => {
      mockComputeHealth.mockResolvedValueOnce(BLOCKED);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.criticalFindingsUnresolved).toBe(2);
    });

    it("includes reason text for BLOCKED", async () => {
      mockComputeHealth.mockResolvedValueOnce(BLOCKED);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health.reasons[0]).toContain("critical finding");
    });
  });

  // ─── 6. Workspace isolation ────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("passes ctx.verifiedWorkspaceId WS_A to compute call", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      await GET(makeCtx({ verifiedWorkspaceId: WS_A, request: { url: makeUrl() } as unknown as Request }));
      expect(mockComputeHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes ctx.verifiedWorkspaceId WS_B to compute call", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      await GET(makeCtx({ verifiedWorkspaceId: WS_B, request: { url: makeUrl() } as unknown as Request }));
      expect(mockComputeHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(result.status).toBe(403);
    });

    it("WS_B gets 404 when cross-tenant access blocked by service", async () => {
      const { NotFoundError } = await import("@/infra/errors");
      mockComputeHealth.mockRejectedValueOnce(new NotFoundError("Engagement", ENG_ID));
      const result = await GET(makeCtx({ verifiedWorkspaceId: WS_B, request: { url: makeUrl() } as unknown as Request }));
      expect(result.status).toBe(404);
      expect(result.body.health).toBeUndefined();
    });
  });

  // ─── 7. No audit event on read ─────────────────────────────────────────────

  describe("no audit event on read", () => {
    it("does not emit audit event on HEALTHY result", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });

    it("does not emit audit event on AT_RISK result", async () => {
      mockComputeHealth.mockResolvedValueOnce(AT_RISK);
      await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });

    it("does not emit audit event on BLOCKED result", async () => {
      mockComputeHealth.mockResolvedValueOnce(BLOCKED);
      await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });

    it("does not emit audit event on 404", async () => {
      const { NotFoundError } = await import("@/infra/errors");
      mockComputeHealth.mockRejectedValueOnce(new NotFoundError("Engagement", ENG_ID));
      await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });

    it("does not emit audit event on 400 (missing id)", async () => {
      await GET(makeCtx({ request: { url: makeUrl(null) } as unknown as Request }));
      expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    });
  });

  // ─── 8. Response shape ─────────────────────────────────────────────────────

  describe("response shape", () => {
    it("wraps result in health key", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      expect(Object.keys(result.body)).toContain("health");
    });

    it("health object has all required fields", async () => {
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      const result = await GET(makeCtx({ request: { url: makeUrl() } as unknown as Request }));
      const health = result.body.health as ConsultingEngagementHealth;
      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("reasons");
      expect(health).toHaveProperty("criticalFindingsUnresolved");
      expect(health).toHaveProperty("criticalActionsUnresolved");
      expect(health).toHaveProperty("overdueActions");
    });

    it("passes engagementId from query param to service", async () => {
      const customId = "ff200000-0000-4000-8000-000000000099";
      mockComputeHealth.mockResolvedValueOnce(HEALTHY);
      await GET(makeCtx({ request: { url: makeUrl(customId) } as unknown as Request }));
      expect(mockComputeHealth).toHaveBeenCalledWith(
        expect.objectContaining({ engagementId: customId })
      );
    });
  });
});
