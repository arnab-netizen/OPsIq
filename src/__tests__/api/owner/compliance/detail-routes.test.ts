/**
 * Bundle 3/4 — Owner Compliance Detail Route tests (non-DB mock-backed).
 *
 * Covers two dynamic route modules:
 *   GET  /api/owner/compliance/[itemId]          — getComplianceItem
 *   POST /api/owner/compliance/[itemId]/review   — updateComplianceStatus
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId (never params/body).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockGetComplianceItem, mockUpdateComplianceStatus, mockWithCanonical } =
  vi.hoisted(() => ({
    mockGetComplianceItem: vi.fn(),
    mockUpdateComplianceStatus: vi.fn(),
    mockWithCanonical: vi.fn(),
  }));

vi.mock("@/services/owner-mode/compliance.service", () => ({
  getComplianceItem: mockGetComplianceItem,
  updateComplianceStatus: mockUpdateComplianceStatus,
  recordComplianceItem: vi.fn(),
  getComplianceReviewItems: vi.fn(),
  getAllComplianceItems: vi.fn(),
  linkTaskToComplianceItem: vi.fn(),
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

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ITEM_ID = "cc000000-0000-4000-8000-000000000001";
const ACTOR_ID = "ac000000-0000-4000-8000-000000000004";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_ID,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}): Request {
  return {
    url: `https://example.com/api/owner/compliance/${ITEM_ID}`,
    json: async () => body,
  } as unknown as Request;
}

const COMPLIANCE_DTO = {
  id: ITEM_ID,
  workspaceId: WS_A,
  name: "GDPR Article 30 Records",
  description: null,
  framework: "GDPR",
  controlRef: "Art-30",
  status: "active",
  dueDate: null,
  complianceNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  ownerId: null,
  assignedTo: null,
  linkedObjectiveId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  taskLinks: [],
  overdueBy: null,
  daysToDue: null,
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

let complianceGet: (ctx?: unknown) => Promise<CanonicalResult>;
let complianceReview: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const itemRoute = await import("@/app/api/owner/compliance/[itemId]/route");
  complianceGet = itemRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  const reviewRoute = await import("@/app/api/owner/compliance/[itemId]/review/route");
  complianceReview = reviewRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Compliance Detail Routes — non-DB mock tests", () => {
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

    it("POST review is guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST review requires workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await complianceGet(makeCtx({ routeParams: { itemId: ITEM_ID } }));
      expect(result.status).toBe(403);
    });

    it("POST review returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await complianceReview(
        makeCtx({ routeParams: { itemId: ITEM_ID }, request: makeRequest({ newStatus: "review_pending" }) })
      );
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/compliance/[itemId] ────────────────────────────────────

  describe("GET /api/owner/compliance/[itemId]", () => {
    it("returns 200 with item when found", async () => {
      mockGetComplianceItem.mockResolvedValueOnce(COMPLIANCE_DTO);
      const result = await complianceGet(makeCtx({ routeParams: { itemId: ITEM_ID } }));
      expect(result.status).toBe(200);
      expect(result.body.item).toBeDefined();
    });

    it("returns item object with id field", async () => {
      mockGetComplianceItem.mockResolvedValueOnce(COMPLIANCE_DTO);
      const result = await complianceGet(makeCtx({ routeParams: { itemId: ITEM_ID } }));
      const item = result.body.item as typeof COMPLIANCE_DTO;
      expect(item.id).toBe(ITEM_ID);
    });

    it("returns 404 when compliance item not found", async () => {
      mockGetComplianceItem.mockRejectedValueOnce(
        new NotFoundError("OwnerComplianceItem", ITEM_ID)
      );
      const result = await complianceGet(makeCtx({ routeParams: { itemId: ITEM_ID } }));
      expect(result.status).toBe(404);
    });

    it("passes workspaceId from ctx (not params) to service", async () => {
      mockGetComplianceItem.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceGet(makeCtx({ verifiedWorkspaceId: WS_A, routeParams: { itemId: ITEM_ID } }));
      expect(mockGetComplianceItem).toHaveBeenCalledWith(WS_A, ITEM_ID);
    });

    it("passes WS_B when ctx has WS_B", async () => {
      mockGetComplianceItem.mockResolvedValueOnce({ ...COMPLIANCE_DTO, workspaceId: WS_B });
      await complianceGet(makeCtx({ verifiedWorkspaceId: WS_B, routeParams: { itemId: ITEM_ID } }));
      expect(mockGetComplianceItem).toHaveBeenCalledWith(WS_B, ITEM_ID);
    });

    it("passes itemId from route params to service", async () => {
      const customId = "cc999999-0000-4000-8000-000000000099";
      mockGetComplianceItem.mockResolvedValueOnce({ ...COMPLIANCE_DTO, id: customId });
      await complianceGet(makeCtx({ routeParams: { itemId: customId } }));
      expect(mockGetComplianceItem).toHaveBeenCalledWith(WS_A, customId);
    });

    it("calls service exactly once per request", async () => {
      mockGetComplianceItem.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceGet(makeCtx({ routeParams: { itemId: ITEM_ID } }));
      expect(mockGetComplianceItem).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 3. POST /api/owner/compliance/[itemId]/review ───────────────────────────

  describe("POST /api/owner/compliance/[itemId]/review", () => {
    it("returns 200 with updated item on valid transition", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce({
        ...COMPLIANCE_DTO,
        status: "review_pending",
      });
      const result = await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(result.status).toBe(200);
      expect(result.body.item).toBeDefined();
    });

    it("passes workspaceId from ctx to service", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("passes itemId from route params to service", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: ITEM_ID })
      );
    });

    it("passes actorId from ctx to service", async () => {
      const customActor = "ac999999-0000-4000-8000-000000000099";
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          verifiedActorId: customActor,
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "evidence_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: customActor })
      );
    });

    it("passes newStatus from body to service", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "compliant" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ newStatus: "compliant" })
      );
    });

    it("passes optional complianceNotes to service", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending", complianceNotes: "All docs submitted" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ complianceNotes: "All docs submitted" })
      );
    });

    it("passes optional reviewedBy UUID to service", async () => {
      const reviewerId = "ab000000-0000-4000-8000-000000000001";
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending", reviewedBy: reviewerId }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ reviewedBy: reviewerId })
      );
    });

    it("accepts all valid newStatus values", async () => {
      const statuses = ["active", "evidence_pending", "review_pending", "compliant", "breached", "waived"] as const;
      for (const status of statuses) {
        vi.resetAllMocks();
        allowAll();
        mockUpdateComplianceStatus.mockResolvedValueOnce({ ...COMPLIANCE_DTO, status });
        const result = await complianceReview(
          makeCtx({
            routeParams: { itemId: ITEM_ID },
            request: makeRequest({ newStatus: status }),
          })
        );
        expect(result.status).toBe(200);
      }
    });

    it("returns 404 when service throws NotFoundError", async () => {
      mockUpdateComplianceStatus.mockRejectedValueOnce(
        new NotFoundError("OwnerComplianceItem", ITEM_ID)
      );
      const result = await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(result.status).toBe(404);
    });

    it("returns 422 when service throws ValidationError (illegal transition)", async () => {
      mockUpdateComplianceStatus.mockRejectedValueOnce(
        new ValidationError("Illegal compliance transition: waived → active. Allowed: none")
      );
      const result = await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "active" }),
        })
      );
      expect(result.status).toBe(422);
    });

    it("uses ctx.verifiedWorkspaceId for service call (WS_A)", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          verifiedWorkspaceId: WS_A,
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("uses WS_B when ctx has WS_B (workspace isolation)", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce({ ...COMPLIANCE_DTO, workspaceId: WS_B });
      await complianceReview(
        makeCtx({
          verifiedWorkspaceId: WS_B,
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("service called exactly once per request", async () => {
      mockUpdateComplianceStatus.mockResolvedValueOnce(COMPLIANCE_DTO);
      await complianceReview(
        makeCtx({
          routeParams: { itemId: ITEM_ID },
          request: makeRequest({ newStatus: "review_pending" }),
        })
      );
      expect(mockUpdateComplianceStatus).toHaveBeenCalledTimes(1);
    });
  });
});
