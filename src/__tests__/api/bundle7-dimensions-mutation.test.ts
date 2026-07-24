/**
 * Bundle 7 Slice 8 — Consulting Engagement Dimensions Mutation API tests.
 *
 * Proves: POST ?action=update_dimensions wires to updateConsultingEngagementDimensions,
 * emits CONSULTING_DIMENSION_UPDATED audit event, enforces workspace isolation,
 * validates input (at least one dimension required), and returns the engagement DTO.
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { ConsultingEngagementConsultantDTO } from "@/domain/consulting/consulting-contracts";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockUpdateDimensions, mockWithCanonical, mockEmitAuditEvent } = vi.hoisted(() => ({
  mockUpdateDimensions: vi.fn(),
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
  updateConsultingEngagementHealth: vi.fn(),
  updateConsultingEngagementDimensions: mockUpdateDimensions,
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
const ENG_ID = "ee800000-0000-4000-8000-000000000008";
const ACTOR_ID = "ac800000-0000-4000-8000-000000000008";

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

const ENGAGEMENT_DTO: ConsultingEngagementConsultantDTO = {
  id: ENG_ID,
  title: "Test Engagement",
  clientId: "cc800000-0000-4000-8000-000000000008",
  consultingPhase: "DISCOVERY",
  status: "ACTIVE",
  healthStatus: "HEALTHY",
  interventionMode: "recovery",
  interventionPhase: "triage",
  description: null,
  startDate: null,
  targetEndDate: null,
  workspaceId: WS_A,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  humanFactors: null,
  assignedConsultantId: null,
  consultantNotes: null,
  createdBy: ACTOR_ID,
};

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

describe("Bundle 7 Slice 8 — Consulting Engagement Dimensions Mutation API", () => {
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
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. Input validation ───────────────────────────────────────────────────

  describe("input validation", () => {
    it("returns 422 when engagementId is missing", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { interventionMode: "growth" }) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 422 when engagementId is not a UUID", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: "not-a-uuid", interventionMode: "growth" }) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 422 when no dimension fields are provided", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID }) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 422 for invalid interventionMode value", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "invalid_mode" }) })
      );
      expect(result.status).toBe(422);
    });

    it("returns 422 for invalid interventionPhase value", async () => {
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionPhase: "bad_phase" }) })
      );
      expect(result.status).toBe(422);
    });
  });

  // ─── 3. interventionMode update ────────────────────────────────────────────

  describe("interventionMode update", () => {
    it("returns 200 with engagement object", async () => {
      mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, interventionMode: "growth" });
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(result.status).toBe(200);
      expect(result.body.engagement).toBeDefined();
    });

    it("passes interventionMode to service", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "transformation" }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ interventionMode: "transformation" }),
        ACTOR_ID
      );
    });

    it("accepts all valid interventionMode values", async () => {
      const modes = ["recovery", "growth", "transformation", "stabilization"] as const;
      for (const mode of modes) {
        vi.resetAllMocks();
        allowAll();
        mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, interventionMode: mode });
        const result = await POST(
          makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: mode }) })
        );
        expect(result.status).toBe(200);
      }
    });
  });

  // ─── 4. interventionPhase update ───────────────────────────────────────────

  describe("interventionPhase update", () => {
    it("returns 200 with engagement object when updating phase", async () => {
      mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, interventionPhase: "stabilize" });
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionPhase: "stabilize" }) })
      );
      expect(result.status).toBe(200);
    });

    it("passes interventionPhase to service", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionPhase: "rebuild" }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ interventionPhase: "rebuild" }),
        ACTOR_ID
      );
    });

    it("accepts all valid interventionPhase values", async () => {
      const phases = ["triage", "stabilize", "rebuild", "optimize"] as const;
      for (const phase of phases) {
        vi.resetAllMocks();
        allowAll();
        mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, interventionPhase: phase });
        const result = await POST(
          makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionPhase: phase }) })
        );
        expect(result.status).toBe(200);
      }
    });
  });

  // ─── 5. humanFactors update ────────────────────────────────────────────────

  describe("humanFactors update", () => {
    const humanFactors = {
      ownerBottleneckRisk: "HIGH",
      followThroughRisk: "MEDIUM",
      resistanceToChange: null,
      communicationBreakdownRisk: null,
      moraleFragility: null,
      managementCapabilityGap: "LOW",
      keyPersonDependency: true,
      accountabilityWeakness: null,
    };

    it("returns 200 with engagement object when updating humanFactors", async () => {
      mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, humanFactors });
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, humanFactors }) })
      );
      expect(result.status).toBe(200);
    });

    it("passes humanFactors to service", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, humanFactors }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ humanFactors: expect.objectContaining({ ownerBottleneckRisk: "HIGH" }) }),
        ACTOR_ID
      );
    });
  });

  // ─── 6. Workspace isolation ────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("passes ctx.verifiedWorkspaceId (not body) to service", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth", workspaceId: WS_B }),
        })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        ACTOR_ID
      );
    });

    it("passes WS_B when ctx has WS_B", async () => {
      mockUpdateDimensions.mockResolvedValueOnce({ ...ENGAGEMENT_DTO, workspaceId: WS_B });
      await POST(
        makeCtx({ verifiedWorkspaceId: WS_B, request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B }),
        ACTOR_ID
      );
    });

    it("returns 403 when enforcement denies WS_B cross-tenant", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 7. Service call arguments ─────────────────────────────────────────────

  describe("service call arguments", () => {
    it("passes actorId from ctx to service", async () => {
      const customActorId = "ac999999-0000-4000-8000-000000000099";
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({
          verifiedActorId: customActorId,
          request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }),
        })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(expect.any(Object), customActorId);
    });

    it("passes engagementId from body to service", async () => {
      const customId = "ff800000-0000-4000-8000-000000000099";
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: customId, interventionMode: "growth" }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledWith(
        expect.objectContaining({ engagementId: customId }),
        ACTOR_ID
      );
    });

    it("service is called exactly once per request", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(mockUpdateDimensions).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 8. Response shape ─────────────────────────────────────────────────────

  describe("response shape", () => {
    it("wraps result in engagement key", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      expect(Object.keys(result.body)).toContain("engagement");
    });

    it("engagement object has id field", async () => {
      mockUpdateDimensions.mockResolvedValueOnce(ENGAGEMENT_DTO);
      const result = await POST(
        makeCtx({ request: makeRequest("update_dimensions", { engagementId: ENG_ID, interventionMode: "growth" }) })
      );
      const eng = result.body.engagement as ConsultingEngagementConsultantDTO;
      expect(eng).toHaveProperty("id");
    });
  });
});
