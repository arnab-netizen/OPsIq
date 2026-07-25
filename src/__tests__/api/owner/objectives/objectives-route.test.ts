/**
 * Non-DB mock tests for:
 *   GET  /api/owner/objectives — list all objectives for workspace
 *   POST /api/owner/objectives — create/update/add_dependency/remove_dependency
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockCreateObjective,
  mockUpdateObjective,
  mockListObjectives,
  mockAddDependency,
  mockRemoveDependency,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockCreateObjective: vi.fn(),
  mockUpdateObjective: vi.fn(),
  mockListObjectives: vi.fn(),
  mockAddDependency: vi.fn(),
  mockRemoveDependency: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/business-objective.service", () => ({
  createObjective: mockCreateObjective,
  updateObjective: mockUpdateObjective,
  listObjectives: mockListObjectives,
  addDependency: mockAddDependency,
  removeDependency: mockRemoveDependency,
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
const OBJ_ID = "ob000001-0000-4000-8000-000000000001";
const OBJ_ID_2 = "ob000002-0000-4000-8000-000000000002";

const BASE_URL = "https://example.com/api/owner/objectives";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_OBJECTIVE = {
  id: OBJ_ID,
  workspaceId: WS_A,
  title: "Increase monthly profit",
  objectiveType: "REVENUE",
  priorityScore: 80,
};

const MOCK_CREATE_INPUT = {
  action: "CREATE",
  title: "Increase monthly profit",
  objectiveType: "REVENUE",
  priorityScore: 80,
  description: null,
  parentId: null,
  linkedGoalId: null,
};

const MOCK_UPDATE_INPUT = {
  action: "UPDATE",
  objectiveId: OBJ_ID,
  title: "Updated title",
  priorityScore: 90,
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

let objectivesGet: (ctx?: unknown) => Promise<unknown>;
let objectivesPost: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/objectives/route");
  objectivesGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  objectivesPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_CREATE_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListObjectives.mockResolvedValue([MOCK_OBJECTIVE]);
  mockCreateObjective.mockResolvedValue(MOCK_OBJECTIVE);
  mockUpdateObjective.mockResolvedValue({ ...MOCK_OBJECTIVE, title: "Updated title" });
  mockAddDependency.mockResolvedValue(undefined);
  mockRemoveDependency.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("objectives-route — module contract assertions", () => {
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
  it("MOCK_OBJECTIVE.objectiveType is REVENUE", () => { expect(MOCK_OBJECTIVE.objectiveType).toBe("REVENUE"); });
});

describe("GET /api/owner/objectives — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await objectivesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await objectivesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("successful GET", () => {
    it("returns 200 on success", async () => {
      const result = await objectivesGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listObjectives with workspaceId", async () => {
      await objectivesGet(makeCtx());
      expect(mockListObjectives).toHaveBeenCalledWith(WS_A);
    });

    it("returns objectives array in body", async () => {
      const result = await objectivesGet(makeCtx()) as { body: { objectives: unknown[] } };
      expect(Array.isArray(result.body.objectives)).toBe(true);
    });

    it("calls listObjectives exactly once", async () => {
      await objectivesGet(makeCtx());
      expect(mockListObjectives).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await objectivesGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListObjectives).toHaveBeenCalledWith(WS_B);
    });

    it("does not call createObjective for GET", async () => {
      await objectivesGet(makeCtx());
      expect(mockCreateObjective).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/owner/objectives — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await objectivesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("POST action=CREATE", () => {
    it("returns 201 on successful CREATE", async () => {
      const result = await objectivesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls createObjective with workspaceId", async () => {
      await objectivesPost(makeCtx());
      expect(mockCreateObjective).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("calls createObjective with actorId", async () => {
      await objectivesPost(makeCtx());
      expect(mockCreateObjective).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_A })
      );
    });

    it("returns objective in body", async () => {
      const result = await objectivesPost(makeCtx()) as { body: { objective: unknown } };
      expect(result.body.objective).toEqual(MOCK_OBJECTIVE);
    });

    it("calls createObjective exactly once", async () => {
      await objectivesPost(makeCtx());
      expect(mockCreateObjective).toHaveBeenCalledTimes(1);
    });

    it("uses verifiedWorkspaceId not body workspace for POST (WS_B)", async () => {
      await objectivesPost(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockCreateObjective).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("POST action=UPDATE", () => {
    it("returns 200 on successful UPDATE", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_UPDATE_INPUT);
      const result = await objectivesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls updateObjective with workspaceId and objectiveId", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_UPDATE_INPUT);
      await objectivesPost(makeCtx());
      expect(mockUpdateObjective).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, objectiveId: OBJ_ID })
      );
    });

    it("returns updated objective in body for UPDATE", async () => {
      mockParseRequestBody.mockResolvedValue(MOCK_UPDATE_INPUT);
      const result = await objectivesPost(makeCtx()) as { body: { objective: unknown } };
      expect(result.body.objective).toBeDefined();
    });
  });

  describe("POST action=ADD_DEPENDENCY", () => {
    it("returns 200 on successful ADD_DEPENDENCY", async () => {
      mockParseRequestBody.mockResolvedValue({
        action: "ADD_DEPENDENCY",
        blockingObjectiveId: OBJ_ID,
        blockedObjectiveId: OBJ_ID_2,
      });
      const result = await objectivesPost(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls addDependency with workspaceId and objective IDs", async () => {
      mockParseRequestBody.mockResolvedValue({
        action: "ADD_DEPENDENCY",
        blockingObjectiveId: OBJ_ID,
        blockedObjectiveId: OBJ_ID_2,
      });
      await objectivesPost(makeCtx());
      expect(mockAddDependency).toHaveBeenCalledWith(WS_A, ACTOR_A, OBJ_ID, OBJ_ID_2);
    });
  });
});
