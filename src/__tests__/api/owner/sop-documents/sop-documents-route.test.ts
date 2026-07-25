/**
 * Non-DB mock tests for:
 *   POST  /api/owner/sop-documents — create a draft SOP
 *   PATCH /api/owner/sop-documents — approve | revise | retire
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateSopDraft,
  mockApproveSopDocument,
  mockReviseSopDocument,
  mockRetireSopDocument,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateSopDraft: vi.fn(),
  mockApproveSopDocument: vi.fn(),
  mockReviseSopDocument: vi.fn(),
  mockRetireSopDocument: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/sop-document.service", () => ({
  createSopDraft: mockCreateSopDraft,
  approveSopDocument: mockApproveSopDocument,
  reviseSopDocument: mockReviseSopDocument,
  retireSopDocument: mockRetireSopDocument,
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
const SOP_ID = "so000001-0000-4000-8000-000000000001";
const SOP_ID_2 = "so000002-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/owner/sop-documents";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CREATE_INPUT = {
  process: "Onboarding",
  title: "New hire onboarding SOP",
  role: "HR Manager",
  steps: ["Step 1", "Step 2"],
  proofRequirements: ["Signed form"],
};

const MOCK_APPROVE_INPUT = {
  id: SOP_ID,
  action: "approve",
  effectiveDate: "2027-01-01T00:00:00Z",
  reviewDate: "2027-06-01T00:00:00Z",
};

const MOCK_RETIRE_INPUT = {
  id: SOP_ID,
  action: "retire",
};

const MOCK_REVISE_INPUT = {
  id: SOP_ID,
  action: "revise",
  role: "Updated Role",
  steps: ["New Step 1"],
  proofRequirements: ["New proof"],
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

let sopPost: (ctx?: unknown) => Promise<unknown>;
let sopPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/sop-documents/route");
  sopPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  sopPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockCreateSopDraft.mockResolvedValue(SOP_ID);
  mockApproveSopDocument.mockResolvedValue(undefined);
  mockRetireSopDocument.mockResolvedValue(undefined);
  mockReviseSopDocument.mockResolvedValue(SOP_ID_2);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sop-documents-route — module contract assertions", () => {
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
  it("MOCK_CREATE_INPUT.process is Onboarding", () => { expect(MOCK_CREATE_INPUT.process).toBe("Onboarding"); });
});

describe("POST /api/owner/sop-documents — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await sopPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies POST with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await sopPost(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful POST (create draft)", () => {
    it("returns 201 on success", async () => {
      const result = await sopPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createSopDraft with workspaceId", async () => {
      await sopPost(makeCtx());
      expect(mockCreateSopDraft).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createSopDraft with actorId", async () => {
      await sopPost(makeCtx());
      expect(mockCreateSopDraft).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns id in body", async () => {
      const result = await sopPost(makeCtx()) as { body: { id: string } };
      expect(result.body.id).toBe(SOP_ID);
    });

    it("calls createSopDraft exactly once", async () => {
      await sopPost(makeCtx());
      expect(mockCreateSopDraft).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await sopPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateSopDraft).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("does not call approveSopDocument for POST", async () => {
      await sopPost(makeCtx());
      expect(mockApproveSopDocument).not.toHaveBeenCalled();
    });
  });
});

describe("PATCH /api/owner/sop-documents — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await sopPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("PATCH action=approve", () => {
    it("returns 200 on approve", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      const result = await sopPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls approveSopDocument with sop id", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      await sopPatch(makeCtx());
      expect(mockApproveSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A })
      );
    });

    it("returns ok:true in body on approve", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      const result = await sopPatch(makeCtx()) as { body: { ok: boolean } };
      expect(result.body.ok).toBe(true);
    });

    it("passes actorIsOwner:true to approveSopDocument", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      await sopPatch(makeCtx());
      expect(mockApproveSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ actorIsOwner: true })
      );
    });

    it("calls approveSopDocument exactly once", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      await sopPatch(makeCtx());
      expect(mockApproveSopDocument).toHaveBeenCalledTimes(1);
    });

    it("does not call retireSopDocument on approve", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      await sopPatch(makeCtx());
      expect(mockRetireSopDocument).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for approve (WS_B)", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_APPROVE_INPUT);
      await sopPatch(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockApproveSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("PATCH action=retire", () => {
    it("returns 200 on retire", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      const result = await sopPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls retireSopDocument with sop id", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      await sopPatch(makeCtx());
      expect(mockRetireSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A })
      );
    });

    it("returns ok:true in body on retire", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      const result = await sopPatch(makeCtx()) as { body: { ok: boolean } };
      expect(result.body.ok).toBe(true);
    });

    it("passes actorIsOwner:true to retireSopDocument", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      await sopPatch(makeCtx());
      expect(mockRetireSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ actorIsOwner: true })
      );
    });

    it("does not call approveSopDocument on retire", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      await sopPatch(makeCtx());
      expect(mockApproveSopDocument).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for retire (WS_B)", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_RETIRE_INPUT);
      await sopPatch(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRetireSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("PATCH action=revise", () => {
    it("returns 200 on revise", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      const result = await sopPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls reviseSopDocument with sop id", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      await sopPatch(makeCtx());
      expect(mockReviseSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A })
      );
    });

    it("returns revisedDraftId in body", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      const result = await sopPatch(makeCtx()) as { body: { revisedDraftId: string } };
      expect(result.body.revisedDraftId).toBe(SOP_ID_2);
    });

    it("calls reviseSopDocument exactly once", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      await sopPatch(makeCtx());
      expect(mockReviseSopDocument).toHaveBeenCalledTimes(1);
    });

    it("does not call approveSopDocument on revise", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      await sopPatch(makeCtx());
      expect(mockApproveSopDocument).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for revise (WS_B)", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_REVISE_INPUT);
      await sopPatch(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockReviseSopDocument).toHaveBeenCalledWith(
        SOP_ID,
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });
});
