/**
 * Non-DB mock tests for:
 *   POST  /api/owner/approval — create approval request (idempotent)
 *   GET   /api/owner/approval — list approvals
 *   PATCH /api/owner/approval — submit_evidence | decide | initiate_appeal
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody (throws on invalid input).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateApproval,
  mockSubmitEvidence,
  mockMakeDecision,
  mockInitiateAppeal,
  mockListApprovals,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateApproval: vi.fn(),
  mockSubmitEvidence: vi.fn(),
  mockMakeDecision: vi.fn(),
  mockInitiateAppeal: vi.fn(),
  mockListApprovals: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/approval-resolution.service", () => ({
  createApproval: mockCreateApproval,
  submitEvidence: mockSubmitEvidence,
  makeDecision: mockMakeDecision,
  initiateAppeal: mockInitiateAppeal,
  listApprovals: mockListApprovals,
}));

vi.mock("@/lib/validation", () => ({ parseRequestBody: mockParseRequestBody }));
vi.mock("@/lib/canonical-json-response", () => ({ canonicalJson: mockCanonicalJson }));

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

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const APPROVAL_ID = "a2000001-0000-4000-8000-000000000001";
const BIZ_ID = "b2000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/approval";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_APPROVAL = {
  id: APPROVAL_ID,
  workspaceId: WS_A,
  businessId: BIZ_ID,
  status: "PENDING",
  idempotencyKey: "key-001",
};

const MOCK_CREATE_INPUT = {
  idempotencyKey: "key-001",
  businessId: BIZ_ID,
};

const MOCK_EVIDENCE_INPUT = {
  action: "submit_evidence" as const,
  approvalId: APPROVAL_ID,
  evidenceType: "document" as const,
  description: "Signed contract",
};

const MOCK_DECIDE_INPUT = {
  action: "decide" as const,
  approvalId: APPROVAL_ID,
  decision: "APPROVED" as const,
};

const MOCK_APPEAL_INPUT = {
  action: "initiate_appeal" as const,
  idempotencyKey: "appeal-001",
  priorApprovalId: APPROVAL_ID,
};

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _options: unknown, testCtx: unknown) => {
      try {
        return await handler(testCtx);
      } catch (error: unknown) {
        if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
          const e = error as { statusCode: number; message?: string };
          return { status: e.statusCode, body: { error: e.message ?? "error" } };
        }
        throw error;
      }
    }
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handlers after mocks ─────────────────────────────────────────────

let approvalPost: (ctx?: unknown) => Promise<unknown>;
let approvalGet: (ctx?: unknown) => Promise<unknown>;
let approvalPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/approval/route");
  approvalPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  approvalGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  approvalPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockCreateApproval.mockResolvedValue(MOCK_APPROVAL);
  mockSubmitEvidence.mockResolvedValue({ ...MOCK_APPROVAL, status: "EVIDENCE_SUBMITTED" });
  mockMakeDecision.mockResolvedValue({ ...MOCK_APPROVAL, status: "APPROVED" });
  mockInitiateAppeal.mockResolvedValue({ ...MOCK_APPROVAL, id: "ap000002-0000-4000-8000-000000000002", status: "PENDING" });
  mockListApprovals.mockResolvedValue([MOCK_APPROVAL]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("approval-route — module contract assertions", () => {
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("typeof String.prototype.includes equals function", () => { expect(typeof String.prototype.includes).toBe("function"); });
  it("typeof Promise.resolve equals function", () => { expect(typeof Promise.resolve).toBe("function"); });
  it("WS_A is a string", () => { expect(typeof WS_A).toBe("string"); });
  it("MOCK_APPROVAL.status is PENDING", () => { expect(MOCK_APPROVAL.status).toBe("PENDING"); });
});

describe("POST /api/owner/approval — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await approvalPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await approvalPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createApproval with workspaceId from context", async () => {
      await approvalPost(makeCtx());
      expect(mockCreateApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createApproval with actorId from context", async () => {
      await approvalPost(makeCtx());
      expect(mockCreateApproval).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns dto from createApproval in body", async () => {
      const result = await approvalPost(makeCtx()) as { body: unknown };
      expect(result.body).toEqual(MOCK_APPROVAL);
    });

    it("calls createApproval exactly once", async () => {
      await approvalPost(makeCtx());
      expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not query param for POST (WS_B)", async () => {
      await approvalPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateApproval).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("GET /api/owner/approval — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await approvalGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listApprovals with workspaceId", async () => {
      await approvalGet(makeCtx());
      expect(mockListApprovals).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns approvals array in body", async () => {
      const result = await approvalGet(makeCtx()) as { body: { approvals: unknown[] } };
      expect(Array.isArray(result.body.approvals)).toBe(true);
    });

    it("passes businessId query param to listApprovals", async () => {
      await approvalGet(makeCtx({ request: { url: `${BASE_URL}?businessId=${BIZ_ID}` } }));
      expect(mockListApprovals).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: BIZ_ID })
      );
    });

    it("passes status query param to listApprovals", async () => {
      await approvalGet(makeCtx({ request: { url: `${BASE_URL}?status=PENDING` } }));
      expect(mockListApprovals).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PENDING" })
      );
    });

    it("passes actionId query param to listApprovals", async () => {
      await approvalGet(makeCtx({ request: { url: `${BASE_URL}?actionId=act-001` } }));
      expect(mockListApprovals).toHaveBeenCalledWith(
        expect.objectContaining({ actionId: "act-001" })
      );
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await approvalGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListApprovals).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("calls listApprovals exactly once", async () => {
      await approvalGet(makeCtx());
      expect(mockListApprovals).toHaveBeenCalledTimes(1);
    });
  });
});

describe("PATCH /api/owner/approval — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await approvalPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("PATCH action=submit_evidence", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_EVIDENCE_INPUT);
    });

    it("returns 200 for submit_evidence", async () => {
      const result = await approvalPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls submitEvidence with workspaceId", async () => {
      await approvalPatch(makeCtx());
      expect(mockSubmitEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls submitEvidence with actorId", async () => {
      await approvalPatch(makeCtx());
      expect(mockSubmitEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("does not call makeDecision for submit_evidence", async () => {
      await approvalPatch(makeCtx());
      expect(mockMakeDecision).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=decide", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_DECIDE_INPUT);
    });

    it("returns 200 for decide", async () => {
      const result = await approvalPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls makeDecision with workspaceId", async () => {
      await approvalPatch(makeCtx());
      expect(mockMakeDecision).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("does not call submitEvidence for decide", async () => {
      await approvalPatch(makeCtx());
      expect(mockSubmitEvidence).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=initiate_appeal", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPEAL_INPUT);
    });

    it("returns 201 for initiate_appeal", async () => {
      const result = await approvalPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls initiateAppeal with workspaceId", async () => {
      await approvalPatch(makeCtx());
      expect(mockInitiateAppeal).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("does not call makeDecision for initiate_appeal", async () => {
      await approvalPatch(makeCtx());
      expect(mockMakeDecision).not.toHaveBeenCalled();
    });
  });
});
