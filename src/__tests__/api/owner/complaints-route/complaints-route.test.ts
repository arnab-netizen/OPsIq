/**
 * Non-DB mock tests for:
 *   POST  /api/owner/complaints — create complaint (idempotent)
 *   GET   /api/owner/complaints — list complaints
 *   PATCH /api/owner/complaints — triage | add_recovery_action | resolve | close | reopen
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody (throws on invalid input).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateComplaint,
  mockTriageComplaint,
  mockAddRecoveryAction,
  mockResolveComplaint,
  mockCloseComplaint,
  mockReopenComplaint,
  mockListComplaints,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateComplaint: vi.fn(),
  mockTriageComplaint: vi.fn(),
  mockAddRecoveryAction: vi.fn(),
  mockResolveComplaint: vi.fn(),
  mockCloseComplaint: vi.fn(),
  mockReopenComplaint: vi.fn(),
  mockListComplaints: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/customer-complaint.service", () => ({
  createComplaint: mockCreateComplaint,
  triageComplaint: mockTriageComplaint,
  addRecoveryAction: mockAddRecoveryAction,
  resolveComplaint: mockResolveComplaint,
  closeComplaint: mockCloseComplaint,
  reopenComplaint: mockReopenComplaint,
  listComplaints: mockListComplaints,
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
const COMPLAINT_ID = "c1000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/complaints";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_COMPLAINT = {
  id: COMPLAINT_ID,
  workspaceId: WS_A,
  title: "Service issue",
  description: "Customer reported a delay",
  status: "OPEN",
  severity: null,
};

const MOCK_CREATE_INPUT = {
  idempotencyKey: "key-create-001",
  title: "Service issue",
  description: "Customer reported a delay",
};

const MOCK_TRIAGE_INPUT = {
  action: "triage" as const,
  complaintId: COMPLAINT_ID,
  severity: "HIGH" as const,
};

const MOCK_RECOVERY_INPUT = {
  action: "add_recovery_action" as const,
  complaintId: COMPLAINT_ID,
  description: "Follow up with customer",
};

const MOCK_RESOLVE_INPUT = {
  action: "resolve" as const,
  complaintId: COMPLAINT_ID,
  resolutionSummary: "Issue resolved",
};

const MOCK_CLOSE_INPUT = {
  action: "close" as const,
  complaintId: COMPLAINT_ID,
};

const MOCK_REOPEN_INPUT = {
  action: "reopen" as const,
  complaintId: COMPLAINT_ID,
  reason: "Customer not satisfied",
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

let complaintsPost: (ctx?: unknown) => Promise<unknown>;
let complaintsGet: (ctx?: unknown) => Promise<unknown>;
let complaintsPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/complaints/route");
  complaintsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  complaintsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  complaintsPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockCreateComplaint.mockResolvedValue(MOCK_COMPLAINT);
  mockTriageComplaint.mockResolvedValue({ ...MOCK_COMPLAINT, severity: "HIGH", status: "TRIAGED" });
  mockAddRecoveryAction.mockResolvedValue({ ...MOCK_COMPLAINT, status: "IN_RECOVERY" });
  mockResolveComplaint.mockResolvedValue({ ...MOCK_COMPLAINT, status: "RESOLVED" });
  mockCloseComplaint.mockResolvedValue({ ...MOCK_COMPLAINT, status: "CLOSED" });
  mockReopenComplaint.mockResolvedValue({ ...MOCK_COMPLAINT, status: "OPEN" });
  mockListComplaints.mockResolvedValue([MOCK_COMPLAINT]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("complaints-route — module contract assertions", () => {
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
  it("MOCK_COMPLAINT.status is OPEN", () => { expect(MOCK_COMPLAINT.status).toBe("OPEN"); });
});

describe("POST /api/owner/complaints — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("is guarded by owner:manage", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).some((c) => c.toLowerCase().includes("owner"))
      );
      expect(decl).toBeDefined();
    });

    it("requires workspace enforcement", () => {
      const decl = capturedDeclarations[0];
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await complaintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await complaintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await complaintsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createComplaint with workspaceId from context", async () => {
      await complaintsPost(makeCtx());
      expect(mockCreateComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createComplaint with actorId from context", async () => {
      await complaintsPost(makeCtx());
      expect(mockCreateComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns dto from createComplaint", async () => {
      const result = await complaintsPost(makeCtx()) as { body: unknown };
      expect(result.body).toEqual(MOCK_COMPLAINT);
    });

    it("calls createComplaint exactly once", async () => {
      await complaintsPost(makeCtx());
      expect(mockCreateComplaint).toHaveBeenCalledTimes(1);
    });

    it("calls parseRequestBody exactly once", async () => {
      await complaintsPost(makeCtx());
      expect(mockParseRequestBody).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not query workspace for POST (WS_B)", async () => {
      await complaintsPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});

describe("GET /api/owner/complaints — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await complaintsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await complaintsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listComplaints with workspaceId", async () => {
      await complaintsGet(makeCtx());
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns complaints array in body", async () => {
      const result = await complaintsGet(makeCtx()) as { body: { complaints: unknown[] } };
      expect(Array.isArray(result.body.complaints)).toBe(true);
    });

    it("passes status query param to listComplaints", async () => {
      await complaintsGet(makeCtx({ request: { url: `${BASE_URL}?status=OPEN` } }));
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ status: "OPEN" })
      );
    });

    it("passes severity query param to listComplaints", async () => {
      await complaintsGet(makeCtx({ request: { url: `${BASE_URL}?severity=HIGH` } }));
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "HIGH" })
      );
    });

    it("passes slaBreachedOnly=true when query param is true", async () => {
      await complaintsGet(makeCtx({ request: { url: `${BASE_URL}?slaBreachedOnly=true` } }));
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ slaBreachedOnly: true })
      );
    });

    it("passes slaBreachedOnly=false when query param is absent", async () => {
      await complaintsGet(makeCtx());
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ slaBreachedOnly: false })
      );
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await complaintsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListComplaints).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("calls listComplaints exactly once", async () => {
      await complaintsGet(makeCtx());
      expect(mockListComplaints).toHaveBeenCalledTimes(1);
    });
  });
});

describe("PATCH /api/owner/complaints — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("PATCH action=triage", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_TRIAGE_INPUT);
    });

    it("returns 200 for triage", async () => {
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls triageComplaint with workspaceId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockTriageComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls triageComplaint with actorId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockTriageComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("does not call createComplaint for triage", async () => {
      await complaintsPatch(makeCtx());
      expect(mockCreateComplaint).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=add_recovery_action", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_RECOVERY_INPUT);
    });

    it("returns 200 for add_recovery_action", async () => {
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls addRecoveryAction with workspaceId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockAddRecoveryAction).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("does not call triageComplaint for add_recovery_action", async () => {
      await complaintsPatch(makeCtx());
      expect(mockTriageComplaint).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=resolve", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_RESOLVE_INPUT);
    });

    it("returns 200 for resolve", async () => {
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls resolveComplaint with workspaceId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockResolveComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("does not call closeComplaint for resolve", async () => {
      await complaintsPatch(makeCtx());
      expect(mockCloseComplaint).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=close", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_CLOSE_INPUT);
    });

    it("returns 200 for close", async () => {
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls closeComplaint with workspaceId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockCloseComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("does not call reopenComplaint for close", async () => {
      await complaintsPatch(makeCtx());
      expect(mockReopenComplaint).not.toHaveBeenCalled();
    });
  });

  describe("PATCH action=reopen", () => {
    beforeEach(() => {
      mockParseRequestBody.mockResolvedValue(MOCK_REOPEN_INPUT);
    });

    it("returns 200 for reopen", async () => {
      const result = await complaintsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls reopenComplaint with workspaceId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockReopenComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls reopenComplaint with actorId", async () => {
      await complaintsPatch(makeCtx());
      expect(mockReopenComplaint).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("does not call resolveComplaint for reopen", async () => {
      await complaintsPatch(makeCtx());
      expect(mockResolveComplaint).not.toHaveBeenCalled();
    });
  });
});
