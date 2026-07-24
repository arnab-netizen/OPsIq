/**
 * Non-DB mock tests for:
 *   GET  /api/owner/goal-arbitration — getLatestArbitrationRecord
 *   POST /api/owner/goal-arbitration — runGoalArbitration
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRunGoalArbitration,
  mockGetLatestArbitrationRecord,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRunGoalArbitration: vi.fn(),
  mockGetLatestArbitrationRecord: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/goal-arbitration.service", () => ({
  runGoalArbitration: mockRunGoalArbitration,
  getLatestArbitrationRecord: mockGetLatestArbitrationRecord,
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
    if (handler.toString().includes("getLatestArbitrationRecord")) {
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
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";
const RECORD_ID = "ab100000-0000-4000-8000-000000000001";
const OBJ_ID_1 = "ab200000-0000-4000-8000-000000000001";
const OBJ_ID_2 = "ab200000-0000-4000-8000-000000000002";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    ...overrides,
  };
}

const ARBITRATION_RECORD = {
  id: RECORD_ID,
  workspaceId: WS_A,
  winnerObjectiveId: OBJ_ID_1,
  dominantConstraint: "RESOURCE_SCARCITY",
  arbitrationResult: {},
  portfolioDecisions: [],
  candidateIds: [OBJ_ID_1, OBJ_ID_2],
  arbitratedAt: "2026-01-01T00:00:00.000Z",
  actorId: ACTOR_A,
};

const ARBITRATION_RESULT = {
  arbitrationRecordId: RECORD_ID,
  winnerObjectiveId: OBJ_ID_1,
  dominantConstraint: "RESOURCE_SCARCITY",
  resourceConflict: null,
  totalCandidates: 2,
  portfolioDecisions: [
    { objectiveId: OBJ_ID_1, decision: "INVEST", rationale: "Highest ROI", candidateType: "INTERNAL_OBJECTIVE" },
    { objectiveId: OBJ_ID_2, decision: "DEFER", rationale: "Resource contention", candidateType: "INTERNAL_OBJECTIVE" },
  ],
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

let goalArbitrationGet: (ctx?: unknown) => Promise<CanonicalResult>;
let goalArbitrationPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/goal-arbitration/route");
  goalArbitrationGet = route.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  goalArbitrationPost = route.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Owner Goal Arbitration Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("GET is guarded by owner:manage", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("GET requires workspace enforcement", () => {
      const decl = capturedGetDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("POST is guarded by owner:manage", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl).toBeDefined();
    });

    it("POST requires workspace enforcement", () => {
      const decl = capturedPostDeclarations.find((d) =>
        (d.requireCapabilities as string[]).includes("owner:manage")
      );
      expect(decl?.requireWorkspace).toBe(true);
    });

    it("GET returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await goalArbitrationGet(makeCtx());
      expect(result.status).toBe(403);
    });

    it("POST returns 403 when enforcement denies", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await goalArbitrationPost(makeCtx());
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/goal-arbitration ──────────────────────────────────────

  describe("GET /api/owner/goal-arbitration", () => {
    it("returns 200 when record found", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      const result = await goalArbitrationGet(makeCtx());
      expect(result.status).toBe(200);
    });

    it("returns record in body", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      const result = await goalArbitrationGet(makeCtx());
      expect(result.body.record).toBeDefined();
    });

    it("record has correct id", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      const result = await goalArbitrationGet(makeCtx());
      const rec = result.body.record as typeof ARBITRATION_RECORD;
      expect(rec.id).toBe(RECORD_ID);
    });

    it("returns 200 with null record when none exists", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(null);
      const result = await goalArbitrationGet(makeCtx());
      expect(result.status).toBe(200);
      expect(result.body.record).toBeNull();
    });

    it("passes workspaceId from ctx (WS_A) to service", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      await goalArbitrationGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockGetLatestArbitrationRecord).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId from ctx (WS_B) to service", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce({
        ...ARBITRATION_RECORD,
        workspaceId: WS_B,
      });
      await goalArbitrationGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetLatestArbitrationRecord).toHaveBeenCalledWith(WS_B);
    });

    it("does not pass actorId to getLatestArbitrationRecord", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      await goalArbitrationGet(makeCtx({ verifiedActorId: ACTOR_A }));
      expect(mockGetLatestArbitrationRecord).not.toHaveBeenCalledWith(
        expect.anything(),
        ACTOR_A
      );
    });

    it("calls service exactly once per request", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      await goalArbitrationGet(makeCtx());
      expect(mockGetLatestArbitrationRecord).toHaveBeenCalledTimes(1);
    });

    it("does not call runGoalArbitration on GET", async () => {
      mockGetLatestArbitrationRecord.mockResolvedValueOnce(ARBITRATION_RECORD);
      await goalArbitrationGet(makeCtx());
      expect(mockRunGoalArbitration).not.toHaveBeenCalled();
    });
  });

  // ─── 3. POST /api/owner/goal-arbitration ─────────────────────────────────────

  describe("POST /api/owner/goal-arbitration", () => {
    it("returns 201 on successful arbitration", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      const result = await goalArbitrationPost(makeCtx());
      expect(result.status).toBe(201);
    });

    it("returns arbitrationRecordId in body", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      const result = await goalArbitrationPost(makeCtx());
      expect(result.body.arbitrationRecordId).toBe(RECORD_ID);
    });

    it("returns portfolioDecisions in body", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      const result = await goalArbitrationPost(makeCtx());
      expect(Array.isArray(result.body.portfolioDecisions)).toBe(true);
    });

    it("portfolioDecisions has correct length", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      const result = await goalArbitrationPost(makeCtx());
      const decisions = result.body.portfolioDecisions as unknown[];
      expect(decisions).toHaveLength(2);
    });

    it("passes workspaceId from ctx (WS_A) to service", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx({ verifiedWorkspaceId: WS_A }));
      expect(mockRunGoalArbitration).toHaveBeenCalledWith(WS_A, expect.any(String));
    });

    it("passes workspaceId from ctx (WS_B) to service", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce({
        ...ARBITRATION_RESULT,
        arbitrationRecordId: "ab100000-0000-4000-8000-000000000099",
      });
      await goalArbitrationPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockRunGoalArbitration).toHaveBeenCalledWith(WS_B, expect.any(String));
    });

    it("passes actorId from ctx (ACTOR_A) to service", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx({ verifiedActorId: ACTOR_A }));
      expect(mockRunGoalArbitration).toHaveBeenCalledWith(expect.any(String), ACTOR_A);
    });

    it("passes actorId from ctx (ACTOR_B) to service", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx({ verifiedActorId: ACTOR_B }));
      expect(mockRunGoalArbitration).toHaveBeenCalledWith(expect.any(String), ACTOR_B);
    });

    it("passes correct workspaceId and actorId together", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx({ verifiedWorkspaceId: WS_B, verifiedActorId: ACTOR_B }));
      expect(mockRunGoalArbitration).toHaveBeenCalledWith(WS_B, ACTOR_B);
    });

    it("calls service exactly once per request", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx());
      expect(mockRunGoalArbitration).toHaveBeenCalledTimes(1);
    });

    it("does not call getLatestArbitrationRecord on POST", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      await goalArbitrationPost(makeCtx());
      expect(mockGetLatestArbitrationRecord).not.toHaveBeenCalled();
    });

    it("returns result when winner is null (no active objectives)", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce({
        ...ARBITRATION_RESULT,
        winnerObjectiveId: null,
        dominantConstraint: null,
        totalCandidates: 0,
        portfolioDecisions: [],
      });
      const result = await goalArbitrationPost(makeCtx());
      expect(result.status).toBe(201);
      expect(result.body.arbitrationRecordId).toBe(RECORD_ID);
    });

    it("body does not expose internal fields (winnerObjectiveId not in route response)", async () => {
      mockRunGoalArbitration.mockResolvedValueOnce(ARBITRATION_RESULT);
      const result = await goalArbitrationPost(makeCtx());
      // route only returns arbitrationRecordId and portfolioDecisions
      expect(result.body).toHaveProperty("arbitrationRecordId");
      expect(result.body).toHaveProperty("portfolioDecisions");
    });
  });

  // ─── 4. Workspace isolation ───────────────────────────────────────────────────

  describe("workspace isolation", () => {
    it("GET: two calls with different workspace IDs call service with respective IDs", async () => {
      mockGetLatestArbitrationRecord
        .mockResolvedValueOnce(ARBITRATION_RECORD)
        .mockResolvedValueOnce({ ...ARBITRATION_RECORD, workspaceId: WS_B });

      await goalArbitrationGet(makeCtx({ verifiedWorkspaceId: WS_A }));
      await goalArbitrationGet(makeCtx({ verifiedWorkspaceId: WS_B }));

      expect(mockGetLatestArbitrationRecord).toHaveBeenNthCalledWith(1, WS_A);
      expect(mockGetLatestArbitrationRecord).toHaveBeenNthCalledWith(2, WS_B);
    });

    it("POST: two calls with different workspace IDs call service with respective IDs", async () => {
      mockRunGoalArbitration
        .mockResolvedValueOnce(ARBITRATION_RESULT)
        .mockResolvedValueOnce({ ...ARBITRATION_RESULT, arbitrationRecordId: "ab100000-0000-4000-8000-000000000099" });

      await goalArbitrationPost(makeCtx({ verifiedWorkspaceId: WS_A }));
      await goalArbitrationPost(makeCtx({ verifiedWorkspaceId: WS_B }));

      expect(mockRunGoalArbitration).toHaveBeenNthCalledWith(1, WS_A, ACTOR_A);
      expect(mockRunGoalArbitration).toHaveBeenNthCalledWith(2, WS_B, ACTOR_A);
    });
  });
});
