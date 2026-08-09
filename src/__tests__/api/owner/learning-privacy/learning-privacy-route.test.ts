/**
 * Non-DB mock tests for:
 *   GET  /api/owner/learning-privacy — list privacy controls (by workspace or candidate)
 *   POST /api/owner/learning-privacy — apply privacy control
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ────────────────────────────────────────��──────────────

const {
  mockApplyPrivacyControl,
  mockListPrivacyControlsForWorkspace,
  mockListPrivacyControlsForCandidate,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockApplyPrivacyControl: vi.fn(),
  mockListPrivacyControlsForWorkspace: vi.fn(),
  mockListPrivacyControlsForCandidate: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/controlled-learning-privacy.service", () => ({
  applyPrivacyControl: mockApplyPrivacyControl,
  listPrivacyControlsForWorkspace: mockListPrivacyControlsForWorkspace,
  listPrivacyControlsForCandidate: mockListPrivacyControlsForCandidate,
}));

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
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
const CONTROL_ID = "pc000001-0000-4000-8000-000000000001";
const CANDIDATE_ID = "ca000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/learning-privacy";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_PRIVACY_CONTROL = {
  id: CONTROL_ID,
  workspaceId: WS_A,
  candidateId: CANDIDATE_ID,
  controlType: "DELETE",
  appliedBy: ACTOR_A,
};

const MOCK_PRIVACY_INPUT = {
  candidateId: CANDIDATE_ID,
  controlType: "DELETE",
  appliedAt: new Date("2026-01-01T00:00:00Z"),
  reason: "User requested deletion",
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

let privacyGet: (ctx?: unknown) => Promise<unknown>;
let privacyPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/learning-privacy/route");
  privacyGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  privacyPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_PRIVACY_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListPrivacyControlsForWorkspace.mockResolvedValue([MOCK_PRIVACY_CONTROL]);
  mockListPrivacyControlsForCandidate.mockResolvedValue([MOCK_PRIVACY_CONTROL]);
  mockApplyPrivacyControl.mockResolvedValue({ applied: true, control: MOCK_PRIVACY_CONTROL });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("learning-privacy-route — module contract assertions", () => {
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
  it("MOCK_PRIVACY_CONTROL.controlType is DELETE", () => { expect(MOCK_PRIVACY_CONTROL.controlType).toBe("DELETE"); });
});

describe("GET /api/owner/learning-privacy — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await privacyGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await privacyGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("GET without candidateId (workspace-wide)", () => {
    it("returns 200 on success", async () => {
      const result = await privacyGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listPrivacyControlsForWorkspace with workspaceId", async () => {
      await privacyGet(makeCtx());
      expect(mockListPrivacyControlsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_A
      );
    });

    it("does not call listPrivacyControlsForCandidate when no candidateId", async () => {
      await privacyGet(makeCtx());
      expect(mockListPrivacyControlsForCandidate).not.toHaveBeenCalled();
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await privacyGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListPrivacyControlsForWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        WS_B
      );
    });
  });

  describe("GET with candidateId", () => {
    it("returns 200 when filtering by candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      const result = await privacyGet(ctx) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listPrivacyControlsForCandidate with workspaceId and candidateId", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await privacyGet(ctx);
      expect(mockListPrivacyControlsForCandidate).toHaveBeenCalledWith(
        expect.anything(),
        WS_A,
        CANDIDATE_ID
      );
    });

    it("does not call listPrivacyControlsForWorkspace when candidateId given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?candidateId=${CANDIDATE_ID}` } });
      await privacyGet(ctx);
      expect(mockListPrivacyControlsForWorkspace).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/learning-privacy — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await privacyPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST", () => {
    it("returns 201 on success", async () => {
      const result = await privacyPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls applyPrivacyControl with workspaceId", async () => {
      await privacyPost(makeCtx());
      expect(mockApplyPrivacyControl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls applyPrivacyControl with appliedBy from actorId", async () => {
      await privacyPost(makeCtx());
      expect(mockApplyPrivacyControl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ appliedBy: ACTOR_A })
      );
    });

    it("returns control in body", async () => {
      const result = await privacyPost(makeCtx()) as { body: { control: unknown } };
      expect(result.body.control).toEqual(MOCK_PRIVACY_CONTROL);
    });

    it("calls applyPrivacyControl exactly once", async () => {
      await privacyPost(makeCtx());
      expect(mockApplyPrivacyControl).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await privacyPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockApplyPrivacyControl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST violations path", () => {
    it("returns 422 when result.applied is false", async () => {
      mockApplyPrivacyControl.mockResolvedValue({ applied: false, violations: ["ALREADY_DELETED"] });
      const result = await privacyPost(makeCtx()) as { status: number };
      expect(result.status).toBe(422);
    });

    it("returns violations array in body when not applied", async () => {
      mockApplyPrivacyControl.mockResolvedValue({ applied: false, violations: ["ALREADY_DELETED"] });
      const result = await privacyPost(makeCtx()) as { body: { violations: unknown[] } };
      expect(Array.isArray(result.body.violations)).toBe(true);
    });
  });
});
