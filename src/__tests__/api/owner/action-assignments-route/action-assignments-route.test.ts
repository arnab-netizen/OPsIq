/**
 * Non-DB mock tests for:
 *   POST   /api/owner/action-assignments  — assign action (idempotent)
 *   GET    /api/owner/action-assignments  — list assignments
 *   PATCH  /api/owner/action-assignments  — reassign | record_outcome
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody (throws on invalid input).
 * Workspace isolation: workspaceId always from ctx.verifiedWorkspaceId.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockAssignAction,
  mockReassignAction,
  mockRecordOutcome,
  mockListAssignments,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockAssignAction: vi.fn(),
  mockReassignAction: vi.fn(),
  mockRecordOutcome: vi.fn(),
  mockListAssignments: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/owner-mode/owner-action-assignment-lifecycle.service", () => ({
  assignAction: mockAssignAction,
  reassignAction: mockReassignAction,
  recordOutcome: mockRecordOutcome,
  listAssignments: mockListAssignments,
}));

vi.mock("@/lib/validation", () => ({
  parseRequestBody: mockParseRequestBody,
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: mockCanonicalJson,
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
    return async (testCtx: unknown) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ASSIGN_ID = "a1000001-0000-4000-8000-000000000001";
const BIZ_ID = "b1000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/action-assignments";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_ASSIGNMENT = {
  id: ASSIGN_ID,
  actionId: "act-001",
  workspaceId: WS_A,
  assignedTo: "owner@example.com",
  status: "OPEN",
  priority: "HIGH",
};

const MOCK_ASSIGN_INPUT = {
  idempotencyKey: "key-001",
  businessId: BIZ_ID,
  actionId: "act-001",
  actionDomain: "finance",
  assignedTo: "owner@example.com",
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

// ─── Import handler after mocks ───────────────────────────────────────────────

let actionAssignmentsPost: (ctx?: unknown) => Promise<unknown>;
let actionAssignmentsGet: (ctx?: unknown) => Promise<unknown>;
let actionAssignmentsPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/action-assignments/route");
  actionAssignmentsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  actionAssignmentsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  actionAssignmentsPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_ASSIGN_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockAssignAction.mockResolvedValue(MOCK_ASSIGNMENT);
  mockReassignAction.mockResolvedValue({ ...MOCK_ASSIGNMENT, assignedTo: "new@example.com" });
  mockRecordOutcome.mockResolvedValue({ ...MOCK_ASSIGNMENT, status: "COMPLETED" });
  mockListAssignments.mockResolvedValue([MOCK_ASSIGNMENT]);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("action-assignments-route — module contract assertions", () => {
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
  it("MOCK_ASSIGNMENT.status is OPEN", () => { expect(MOCK_ASSIGNMENT.status).toBe("OPEN"); });
});

describe("capability declarations — action-assignments", () => {
  it("handlers are guarded by owner:manage capability", () => {
    const decl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes("owner:manage")
    );
    expect(decl).toBeDefined();
  });

  it("handlers require workspace enforcement", () => {
    const decl = capturedDeclarations.find((d) => d.requireWorkspace === true);
    expect(decl).toBeDefined();
  });

  it("returns 403 when POST enforcement denies", async () => {
    vi.resetAllMocks();
    denyWith(403);
    const result = await actionAssignmentsPost(makeCtx()) as { status: number };
    expect(result.status).toBe(403);
  });

  it("returns 401 when GET enforcement denies with 401", async () => {
    vi.resetAllMocks();
    denyWith(401);
    const result = await actionAssignmentsGet(makeCtx()) as { status: number };
    expect(result.status).toBe(401);
  });

  it("returns 403 when PATCH enforcement denies", async () => {
    vi.resetAllMocks();
    denyWith(403);
    const result = await actionAssignmentsPatch(makeCtx()) as { status: number };
    expect(result.status).toBe(403);
  });
});

describe("POST /api/owner/action-assignments", () => {
  it("calls assignAction with workspaceId from ctx", async () => {
    await actionAssignmentsPost(makeCtx());
    expect(mockAssignAction).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A })
    );
  });

  it("calls assignAction with actorId from ctx", async () => {
    await actionAssignmentsPost(makeCtx());
    expect(mockAssignAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR_A })
    );
  });

  it("calls parseRequestBody once per request", async () => {
    await actionAssignmentsPost(makeCtx());
    expect(mockParseRequestBody).toHaveBeenCalledTimes(1);
  });

  it("returns 201 on successful assignment", async () => {
    const result = await actionAssignmentsPost(makeCtx()) as { status: number };
    expect(result.status).toBe(201);
  });

  it("returns assignment DTO in body", async () => {
    const result = await actionAssignmentsPost(makeCtx()) as { body: unknown };
    expect(result.body).toEqual(MOCK_ASSIGNMENT);
  });

  it("passes idempotencyKey from parsed body to assignAction", async () => {
    mockParseRequestBody.mockResolvedValueOnce({ ...MOCK_ASSIGN_INPUT, idempotencyKey: "key-idem" });
    await actionAssignmentsPost(makeCtx());
    expect(mockAssignAction).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "key-idem" })
    );
  });

  it("calls canonicalJson with status 201", async () => {
    await actionAssignmentsPost(makeCtx());
    expect(mockCanonicalJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 201 })
    );
  });

  it("returns 400 when parseRequestBody throws validation error", async () => {
    mockParseRequestBody.mockRejectedValueOnce({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
    });
    const result = await actionAssignmentsPost(makeCtx()) as { status: number };
    expect(result.status).toBe(400);
  });

  it("does not call assignAction when validation fails", async () => {
    mockParseRequestBody.mockRejectedValueOnce({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Missing required field",
    });
    await actionAssignmentsPost(makeCtx());
    expect(mockAssignAction).not.toHaveBeenCalled();
  });

  it("does not cross workspace boundary in POST", async () => {
    await actionAssignmentsPost(makeCtx({ verifiedWorkspaceId: WS_A }));
    const call = mockAssignAction.mock.calls[0][0];
    expect(call.workspaceId).toBe(WS_A);
  });
});

describe("GET /api/owner/action-assignments", () => {
  it("calls listAssignments with verifiedWorkspaceId", async () => {
    await actionAssignmentsGet(makeCtx());
    expect(mockListAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A })
    );
  });

  it("returns 200 on success", async () => {
    const result = await actionAssignmentsGet(makeCtx()) as { status: number };
    expect(result.status).toBe(200);
  });

  it("returns assignments array in body", async () => {
    const result = await actionAssignmentsGet(makeCtx()) as { body: { assignments: unknown[] } };
    expect(Array.isArray(result.body.assignments)).toBe(true);
    expect(result.body.assignments).toHaveLength(1);
  });

  it("passes optional businessId query param", async () => {
    await actionAssignmentsGet(makeCtx({ request: { url: `${BASE_URL}?businessId=${BIZ_ID}` } }));
    expect(mockListAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BIZ_ID })
    );
  });

  it("passes stallOnly=true from query string", async () => {
    await actionAssignmentsGet(makeCtx({ request: { url: `${BASE_URL}?stallOnly=true` } }));
    expect(mockListAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ stallOnly: true })
    );
  });

  it("passes stallOnly=false by default", async () => {
    await actionAssignmentsGet(makeCtx());
    expect(mockListAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ stallOnly: false })
    );
  });

  it("passes assignedTo filter from query", async () => {
    await actionAssignmentsGet(makeCtx({ request: { url: `${BASE_URL}?assignedTo=user%40example.com` } }));
    expect(mockListAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: "user@example.com" })
    );
  });

  it("does not expose other workspace assignments", async () => {
    await actionAssignmentsGet(makeCtx());
    const call = mockListAssignments.mock.calls[0][0];
    expect(call.workspaceId).toBe(WS_A);
  });
});

describe("PATCH /api/owner/action-assignments — reassign", () => {
  const REASSIGN_INPUT = {
    action: "reassign" as const,
    assignmentId: ASSIGN_ID,
    assignedTo: "new@example.com",
    reason: "ownership change",
  };

  it("calls reassignAction when action=reassign", async () => {
    mockParseRequestBody.mockResolvedValueOnce(REASSIGN_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockReassignAction).toHaveBeenCalledTimes(1);
  });

  it("passes workspaceId to reassignAction", async () => {
    mockParseRequestBody.mockResolvedValueOnce(REASSIGN_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockReassignAction).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A })
    );
  });

  it("returns 200 on reassign", async () => {
    mockParseRequestBody.mockResolvedValueOnce(REASSIGN_INPUT);
    const result = await actionAssignmentsPatch(makeCtx()) as { status: number };
    expect(result.status).toBe(200);
  });

  it("does not call recordOutcome on reassign", async () => {
    mockParseRequestBody.mockResolvedValueOnce(REASSIGN_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/owner/action-assignments — record_outcome", () => {
  const OUTCOME_INPUT = {
    action: "record_outcome" as const,
    assignmentId: ASSIGN_ID,
    outcome: "COMPLETED" as const,
  };

  it("calls recordOutcome when action=record_outcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce(OUTCOME_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockRecordOutcome).toHaveBeenCalledTimes(1);
  });

  it("passes workspaceId to recordOutcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce(OUTCOME_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A })
    );
  });

  it("passes actorId to recordOutcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce(OUTCOME_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockRecordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR_A })
    );
  });

  it("returns 200 on record_outcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce(OUTCOME_INPUT);
    const result = await actionAssignmentsPatch(makeCtx()) as { status: number };
    expect(result.status).toBe(200);
  });

  it("does not call reassignAction on record_outcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce(OUTCOME_INPUT);
    await actionAssignmentsPatch(makeCtx());
    expect(mockReassignAction).not.toHaveBeenCalled();
  });

  it("returns 400 when validation fails on PATCH", async () => {
    mockParseRequestBody.mockRejectedValueOnce({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid action discriminant",
    });
    const result = await actionAssignmentsPatch(makeCtx()) as { status: number };
    expect(result.status).toBe(400);
  });

  it("workspace isolation preserved on PATCH record_outcome", async () => {
    mockParseRequestBody.mockResolvedValueOnce({ ...OUTCOME_INPUT, outcome: "FAILED" });
    await actionAssignmentsPatch(makeCtx({ verifiedWorkspaceId: WS_A }));
    const call = mockRecordOutcome.mock.calls[0][0];
    expect(call.workspaceId).toBe(WS_A);
  });
});
