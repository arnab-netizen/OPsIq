/**
 * Bundle 3/4 — Owner Risk Detail Route tests (non-DB mock-backed).
 *
 * Covers three dynamic route modules:
 *   GET  /api/owner/risks/[riskId]           — getBusinessRisk
 *   POST /api/owner/risks/[riskId]/review    — reviewRisk (lifecycle transition)
 *   POST /api/owner/risks/[riskId]/tasks     — linkTaskToRisk
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId (never params/body).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockGetBusinessRisk, mockReviewRisk, mockLinkTaskToRisk, mockWithCanonical } =
  vi.hoisted(() => ({
    mockGetBusinessRisk: vi.fn(),
    mockReviewRisk: vi.fn(),
    mockLinkTaskToRisk: vi.fn(),
    mockWithCanonical: vi.fn(),
  }));

vi.mock("@/services/owner-mode/business-risk.service", () => ({
  getBusinessRisk: mockGetBusinessRisk,
  reviewRisk: mockReviewRisk,
  linkTaskToRisk: mockLinkTaskToRisk,
  createBusinessRisk: vi.fn(),
  updateBusinessRisk: vi.fn(),
  listBusinessRisks: vi.fn(),
  deleteBusinessRisk: vi.fn(),
  archiveBusinessRisk: vi.fn(),
}));

const capturedGetDeclarations: Record<string, unknown>[] = [];
const capturedPostDeclarations: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    if ((options?.requireCapabilities as string[])?.includes("owner:view")) {
      capturedGetDeclarations.push(decl);
    } else {
      capturedPostDeclarations.push(decl);
    }
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb";
const RISK_ID = "aa000000-0000-4000-8000-000000000001";
const TASK_ID = "aa000000-0000-4000-8000-000000000002";
const ACTOR_ID = "ac000000-0000-4000-8000-000000000003";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_ID,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return {
    url: `https://example.com/api/owner/risks/${RISK_ID}`,
    json: async () => body,
  } as unknown as Request;
}

const RISK_DTO = {
  id: RISK_ID,
  workspaceId: WS_A,
  riskCode: "RISK-0001",
  title: "Supply chain disruption",
  description: null,
  category: "OPERATIONAL",
  likelihood: 70,
  impact: 80,
  severity: 56,
  status: "IDENTIFIED",
  mitigationAction: null,
  residualRisk: null,
  acceptanceRationale: null,
  reviewNotes: null,
  reviewedAt: null,
  reviewDueDate: null,
  linkedObjectiveId: null,
  identifiedBy: ACTOR_ID,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  taskLinks: [],
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (
      handler: (ctx: unknown, params: Record<string, string>) => Promise<unknown>,
      _options: unknown,
      testCtx: unknown
    ) => {
      const ctx = testCtx as Record<string, unknown>;
      const params = (ctx.routeParams ?? {}) as Record<string, string>;
      return handler({ ...makeCtx(), ...ctx }, params);
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ──────────────────────────────────────────────

let riskGet: (ctx?: unknown) => Promise<CanonicalResult>;
let riskReview: (ctx?: unknown) => Promise<CanonicalResult>;
let riskTasks: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const riskRoute = await import("@/app/api/owner/risks/[riskId]/route");
  riskGet = riskRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  const reviewRoute = await import("@/app/api/owner/risks/[riskId]/review/route");
  riskReview = reviewRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  const tasksRoute = await import("@/app/api/owner/risks/[riskId]/tasks/route");
  riskTasks = tasksRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Risk Detail Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by owner:view", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("GET requires workspace enforcement", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("POST review/tasks are guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST review/tasks require workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await riskGet(makeCtx({ routeParams: { riskId: RISK_ID } }));
      expect(result.status).toBe(403);
    });

    it("POST review returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await riskReview(
        makeCtx({ routeParams: { riskId: RISK_ID }, request: makeRequest({ newStatus: "ASSESSED" }) })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/risks/[riskId] ────────────────────────────────────────

  describe("GET /api/owner/risks/[riskId]", () => {
    it("returns 200 with risk when found", async () => {
      mockGetBusinessRisk.mockResolvedValueOnce(RISK_DTO);
      const result = await riskGet(makeCtx({ routeParams: { riskId: RISK_ID } }));
      expect(result.status).toBe(200);
      expect(result.body.risk).toBeDefined();
    });

    it("returns risk object with id field", async () => {
      mockGetBusinessRisk.mockResolvedValueOnce(RISK_DTO);
      const result = await riskGet(makeCtx({ routeParams: { riskId: RISK_ID } }));
      const risk = result.body.risk as typeof RISK_DTO;
      expect(risk.id).toBe(RISK_ID);
    });

    it("returns 404 when risk not found", async () => {
      mockGetBusinessRisk.mockRejectedValueOnce(
        new NotFoundError("BusinessRiskEntry", RISK_ID)
      );
      const result = await riskGet(makeCtx({ routeParams: { riskId: RISK_ID } }));
      expect(result.status).toBe(404);
    });

    it("passes workspaceId from ctx (not params) to service", async () => {
      mockGetBusinessRisk.mockResolvedValueOnce(RISK_DTO);
      await riskGet(makeCtx({ verifiedWorkspaceId: WS_A, routeParams: { riskId: RISK_ID } }));
      expect(mockGetBusinessRisk).toHaveBeenCalledWith(WS_A, RISK_ID);
    });

    it("passes WS_B when ctx has WS_B", async () => {
      mockGetBusinessRisk.mockResolvedValueOnce({ ...RISK_DTO, workspaceId: WS_B });
      await riskGet(makeCtx({ verifiedWorkspaceId: WS_B, routeParams: { riskId: RISK_ID } }));
      expect(mockGetBusinessRisk).toHaveBeenCalledWith(WS_B, RISK_ID);
    });

    it("passes riskId from route params to service", async () => {
      const customId = "rr999999-0000-4000-8000-000000000099";
      mockGetBusinessRisk.mockResolvedValueOnce({ ...RISK_DTO, id: customId });
      await riskGet(makeCtx({ routeParams: { riskId: customId } }));
      expect(mockGetBusinessRisk).toHaveBeenCalledWith(WS_A, customId);
    });

    it("calls service exactly once per request", async () => {
      mockGetBusinessRisk.mockResolvedValueOnce(RISK_DTO);
      await riskGet(makeCtx({ routeParams: { riskId: RISK_ID } }));
      expect(mockGetBusinessRisk).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 3. POST /api/owner/risks/[riskId]/review ─────────────────────────────────

  describe("POST /api/owner/risks/[riskId]/review", () => {
    it("returns 200 with updated risk on valid transition", async () => {
      mockReviewRisk.mockResolvedValueOnce({ ...RISK_DTO, status: "ASSESSED" });
      const result = await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(result.status).toBe(200);
      expect(result.body.risk).toBeDefined();
    });

    it("passes workspaceId from ctx to service", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes riskId from route params to service", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ riskId: RISK_ID })
      );
    });

    it("passes actorId from ctx to service", async () => {
      const customActor = "ac999999-0000-4000-8000-000000000099";
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          verifiedActorId: customActor,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: customActor })
      );
    });

    it("passes newStatus from body to service", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "MITIGATING" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ newStatus: "MITIGATING" })
      );
    });

    it("passes optional reviewNotes to service", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED", reviewNotes: "Checked OK" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ reviewNotes: "Checked OK" })
      );
    });

    it("returns 404 when service throws NotFoundError", async () => {
      mockReviewRisk.mockRejectedValueOnce(
        new NotFoundError("BusinessRiskEntry", RISK_ID)
      );
      const result = await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(result.status).toBe(404);
    });

    it("returns 422 when service throws ValidationError (illegal transition)", async () => {
      mockReviewRisk.mockRejectedValueOnce(
        new ValidationError("Illegal risk transition: CLOSED → ASSESSED. Allowed: none")
      );
      const result = await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(result.status).toBe(422);
    });

    it("uses ctx.verifiedWorkspaceId for service call (WS_A)", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("service called exactly once per request", async () => {
      mockReviewRisk.mockResolvedValueOnce(RISK_DTO);
      await riskReview(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ newStatus: "ASSESSED" }),
        })
      );
      expect(mockReviewRisk).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 4. POST /api/owner/risks/[riskId]/tasks ──────────────────────────────────

  describe("POST /api/owner/risks/[riskId]/tasks", () => {
    const TASK_LINK_DTO = {
      id: "link-0001-0000-4000-8000-000000000001",
      workspaceId: WS_A,
      riskId: RISK_ID,
      taskId: TASK_ID,
      linkType: "MITIGATION",
      linkedBy: ACTOR_ID,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("returns 201 with link on success", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      const result = await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(result.status).toBe(201);
      expect(result.body.link).toBeDefined();
    });

    it("passes workspaceId from ctx to service", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes riskId from route params to service", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ riskId: RISK_ID })
      );
    });

    it("passes taskId from body to service", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: TASK_ID })
      );
    });

    it("passes actorId from ctx to service", async () => {
      const customActor = "ac999999-0000-4000-8000-000000000099";
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          verifiedActorId: customActor,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: customActor })
      );
    });

    it("passes optional linkType MITIGATION to service", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID, linkType: "MITIGATION" }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ linkType: "MITIGATION" })
      );
    });

    it("passes optional linkType EVIDENCE to service", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce({ ...TASK_LINK_DTO, linkType: "EVIDENCE" });
      await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID, linkType: "EVIDENCE" }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ linkType: "EVIDENCE" })
      );
    });

    it("returns 404 when service throws NotFoundError (risk or task)", async () => {
      mockLinkTaskToRisk.mockRejectedValueOnce(
        new NotFoundError("BusinessRiskEntry", RISK_ID)
      );
      const result = await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(result.status).toBe(404);
    });

    it("uses WS_B when ctx has WS_B (workspace isolation)", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce({ ...TASK_LINK_DTO, workspaceId: WS_B });
      await riskTasks(
        makeCtx({
          verifiedWorkspaceId: WS_B,
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("service called exactly once per request", async () => {
      mockLinkTaskToRisk.mockResolvedValueOnce(TASK_LINK_DTO);
      await riskTasks(
        makeCtx({
          routeParams: { riskId: RISK_ID },
          request: makeRequest({ taskId: TASK_ID }),
        })
      );
      expect(mockLinkTaskToRisk).toHaveBeenCalledTimes(1);
    });
  });
});
