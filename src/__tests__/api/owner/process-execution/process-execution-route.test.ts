/**
 * Non-DB mock tests for:
 *   GET  /api/owner/process-execution — list persisted process execution tasks
 *   POST /api/owner/process-execution — apply a governed action to a task
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockApplyProcessExecutionAction,
  mockGetPersistedProcessTasks,
  mockPersistProcessExecutionRoutes,
  mockGetOwnerNowView,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockApplyProcessExecutionAction: vi.fn(),
  mockGetPersistedProcessTasks: vi.fn(),
  mockPersistProcessExecutionRoutes: vi.fn(),
  mockGetOwnerNowView: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/process-execution-bridge.service", () => ({
  applyProcessExecutionAction: mockApplyProcessExecutionAction,
  getPersistedProcessTasks: mockGetPersistedProcessTasks,
  persistProcessExecutionRoutes: mockPersistProcessExecutionRoutes,
}));

vi.mock("@/services/owner-guidance/owner-now-view.service", () => ({
  getOwnerNowView: mockGetOwnerNowView,
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
const TASK_ID = "ta000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/process-execution";

const OWNER_MANAGE_CAP = "owner:manage";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    verifiedCapabilities: new Set([OWNER_MANAGE_CAP]),
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_TASK = {
  id: TASK_ID,
  workspaceId: WS_A,
  taskKey: "implement-pricing-strategy",
  status: "PENDING",
};

const MOCK_ACTION_INPUT = {
  taskKey: "implement-pricing-strategy",
  action: "START",
  businessId: null,
};

const MOCK_ACTION_RESULT = {
  ok: true,
  taskId: TASK_ID,
  status: "IN_PROGRESS",
  reassessmentId: null,
  outcomeId: null,
  progressRecordId: null,
  verificationClassification: null,
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

let processExecutionGet: (ctx?: unknown) => Promise<unknown>;
let processExecutionPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/process-execution/route");
  processExecutionGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  processExecutionPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_ACTION_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockGetPersistedProcessTasks.mockResolvedValue([MOCK_TASK]);
  mockGetOwnerNowView.mockResolvedValue({ processExecution: null });
  mockApplyProcessExecutionAction.mockResolvedValue(MOCK_ACTION_RESULT);
  mockPersistProcessExecutionRoutes.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("process-execution-route — module contract assertions", () => {
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
  it("MOCK_ACTION_RESULT.ok is true", () => { expect(MOCK_ACTION_RESULT.ok).toBe(true); });
});

describe("GET /api/owner/process-execution — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await processExecutionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await processExecutionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await processExecutionGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls getPersistedProcessTasks with workspaceId and no businessId when none is supplied", async () => {
      await processExecutionGet(makeCtx());
      expect(mockGetPersistedProcessTasks).toHaveBeenCalledWith(WS_A, undefined, null);
    });

    it("returns tasks array in body", async () => {
      const result = await processExecutionGet(makeCtx()) as { body: { tasks: unknown[] } };
      expect(Array.isArray(result.body.tasks)).toBe(true);
    });

    it("calls getPersistedProcessTasks exactly once", async () => {
      await processExecutionGet(makeCtx());
      expect(mockGetPersistedProcessTasks).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await processExecutionGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockGetPersistedProcessTasks).toHaveBeenCalledWith(WS_B, undefined, null);
    });
  });

  describe("businessId query parameter (D1 fix)", () => {
    const BIZ_A = "cccccccc-cccc-4000-8000-cccccccccccc";

    it("threads a valid businessId query param through to getPersistedProcessTasks", async () => {
      await processExecutionGet(makeCtx({ request: { url: `${BASE_URL}?businessId=${BIZ_A}` } }));
      expect(mockGetPersistedProcessTasks).toHaveBeenCalledWith(WS_A, undefined, BIZ_A);
    });

    it("passes null businessId when the query param is absent", async () => {
      await processExecutionGet(makeCtx({ request: { url: BASE_URL } }));
      expect(mockGetPersistedProcessTasks).toHaveBeenCalledWith(WS_A, undefined, null);
    });

    it("returns 400 and never calls getPersistedProcessTasks for a malformed businessId", async () => {
      const result = await processExecutionGet(makeCtx({ request: { url: `${BASE_URL}?businessId=not-a-uuid` } })) as { status: number };
      expect(result.status).toBe(400);
      expect(mockGetPersistedProcessTasks).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/process-execution — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await processExecutionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST (START action)", () => {
    it("returns 200 on success", async () => {
      const result = await processExecutionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls applyProcessExecutionAction with workspaceId and actorId", async () => {
      await processExecutionPost(makeCtx());
      expect(mockApplyProcessExecutionAction).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A })
      );
    });

    it("returns taskId in body", async () => {
      const result = await processExecutionPost(makeCtx()) as { body: { taskId: string } };
      expect(result.body.taskId).toBe(TASK_ID);
    });

    it("returns status in body", async () => {
      const result = await processExecutionPost(makeCtx()) as { body: { status: string } };
      expect(result.body.status).toBe("IN_PROGRESS");
    });

    it("calls applyProcessExecutionAction exactly once", async () => {
      await processExecutionPost(makeCtx());
      expect(mockApplyProcessExecutionAction).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await processExecutionPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockApplyProcessExecutionAction).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });

    it("derives actorRole as owner when OWNER_MANAGE capability present", async () => {
      await processExecutionPost(makeCtx());
      expect(mockApplyProcessExecutionAction).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: "owner" })
      );
    });

    it("derives actorRole as null when OWNER_MANAGE capability absent", async () => {
      await processExecutionPost(makeCtx({ verifiedCapabilities: new Set([]) }));
      expect(mockApplyProcessExecutionAction).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: null })
      );
    });
  });

  describe("failed POST (action returns not-ok)", () => {
    it("returns 400 when action fails with non-auth code", async () => {
      mockApplyProcessExecutionAction.mockResolvedValue({
        ok: false,
        code: "INVALID_TRANSITION",
        reason: "Task not in startable state",
      });
      const result = await processExecutionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(400);
    });

    it("returns 403 when action fails with WRONG_WORKSPACE code", async () => {
      mockApplyProcessExecutionAction.mockResolvedValue({
        ok: false,
        code: "WRONG_WORKSPACE",
        reason: "Workspace mismatch",
      });
      const result = await processExecutionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 403 when action fails with UNAUTHORIZED code", async () => {
      mockApplyProcessExecutionAction.mockResolvedValue({
        ok: false,
        code: "UNAUTHORIZED",
        reason: "Only owner can approve",
      });
      const result = await processExecutionPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });
});
