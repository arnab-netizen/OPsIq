/**
 * Non-DB mock tests for:
 *   POST /api/owner/arbitrate — decision arbitration
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * arbitrate() is a pure domain function; mocked here to verify the route forwards
 * the parsed candidates array correctly.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockArbitrate, mockWithCanonical } = vi.hoisted(() => ({
  mockArbitrate: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/domain/owner-mode/decision-arbitration", () => ({
  arbitrate: mockArbitrate,
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
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const BASE_URL = "https://example.com/api/owner/arbitrate";

const CAND_A = { id: "cand-alpha" };
const CAND_B = { id: "cand-beta", ownerGoalAligned: true, confidence: 0.9 };
const CAND_C = { id: "cand-gamma", blockedBy: ["cash"], reversible: false };

const ARBITRATION_RESULT = {
  recommended: "cand-alpha",
  rejected: ["cand-beta"],
  deferred: [],
  reasons: { "cand-alpha": "highest net outcome" },
};

function makeCtx(body: Record<string, unknown>): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL, json: async () => body },
  };
}

// ─── Passthrough helpers ──────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => Promise<unknown>, _opts: unknown, testCtx: unknown) =>
      handler(testCtx)
  );
}

function denyWith(status: number) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status,
    body: { error: "Insufficient capabilities" },
  }));
}

// ─── Import handler after mocks ───────────────────────────────────────────────

let arbitratePost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/arbitrate/route");
  arbitratePost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Arbitrate Route — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("POST is guarded by owner:view", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      const decl = capturedDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:view")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. Successful arbitration ────────────────────────────────────────────────

  describe("POST success path", () => {
    it("returns 200 on success", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(result.status).toBe(200);
    });

    it("returns arbitrate() output verbatim as response body", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(result.body.recommended).toBe("cand-alpha");
    });

    it("calls arbitrate exactly once per request", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(mockArbitrate).toHaveBeenCalledTimes(1);
    });

    it("passes candidates array to arbitrate", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(mockArbitrate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "cand-alpha" })])
      );
    });

    it("passes multiple candidates to arbitrate", async () => {
      mockArbitrate.mockReturnValueOnce({ ...ARBITRATION_RESULT, rejected: ["cand-beta", "cand-gamma"] });
      await arbitratePost(makeCtx({ candidates: [CAND_A, CAND_B, CAND_C] }));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates).toHaveLength(3);
    });

    it("passes ownerGoalAligned=true from candidate body", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const body = { candidates: [{ id: "cand-x", ownerGoalAligned: true }] };
      await arbitratePost(makeCtx(body));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].ownerGoalAligned).toBe(true);
    });

    it("passes blockedBy array from candidate body", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const body = { candidates: [{ id: "cand-x", blockedBy: ["legal_security", "cash"] }] };
      await arbitratePost(makeCtx(body));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].blockedBy).toEqual(["legal_security", "cash"]);
    });

    it("passes confidence value from candidate body", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const body = { candidates: [{ id: "cand-x", confidence: 0.95 }] };
      await arbitratePost(makeCtx(body));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].confidence).toBe(0.95);
    });

    it("passes reversible=false from candidate body", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const body = { candidates: [{ id: "cand-x", reversible: false }] };
      await arbitratePost(makeCtx(body));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].reversible).toBe(false);
    });

    it("returns different result when arbitrate returns different output", async () => {
      const altResult = { recommended: "cand-beta", rejected: ["cand-alpha"], deferred: [] };
      mockArbitrate.mockReturnValueOnce(altResult);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A, CAND_B] }));
      expect(result.body.recommended).toBe("cand-beta");
    });

    it("applies default values: blockedBy=[] when not specified", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      await arbitratePost(makeCtx({ candidates: [{ id: "cand-minimal" }] }));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].blockedBy).toEqual([]);
    });

    it("applies default values: riskOfAction=0.2 when not specified", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      await arbitratePost(makeCtx({ candidates: [{ id: "cand-minimal" }] }));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates[0].riskOfAction).toBe(0.2);
    });

    it("result body rejected field is an array", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(Array.isArray(result.body.rejected)).toBe(true);
    });

    it("result body deferred field is an array", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(Array.isArray(result.body.deferred)).toBe(true);
    });

    it("result body reasons object is defined", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      const result = await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      expect(result.body.reasons).toBeDefined();
    });

    it("single candidate: arbitrate receives array of length 1", async () => {
      mockArbitrate.mockReturnValueOnce(ARBITRATION_RESULT);
      await arbitratePost(makeCtx({ candidates: [CAND_A] }));
      const [calledCandidates] = mockArbitrate.mock.calls[0];
      expect(calledCandidates).toHaveLength(1);
    });

    it("empty candidates array: route rejects with validation error", async () => {
      await expect(arbitratePost(makeCtx({ candidates: [] }))).rejects.toThrow();
    });
  });
});
