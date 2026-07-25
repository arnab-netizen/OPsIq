/**
 * Bundle 7 Slice 2 — Permission Matrix Tests
 *
 * Tests that consulting route correctly declares CONSULTING_READ for GET
 * and CONSULTING_WRITE for POST, and that handlers enforce the workspace-scoped
 * context correctly when caps are satisfied.
 *
 * Strategy:
 *   - Use vi.hoisted() to create a configurable mockWithCanonical vi.fn() that
 *     interceptsevery withCanonicalEnforcement(handler, options) call.
 *   - capturedDeclarations records the {requireCapabilities} options the route
 *     declares per HTTP verb — proving the declarations are correct.
 *   - mockWithCanonical.mockImplementation controls allow/deny per test:
 *       allow  → calls through to handler with injected verified context
 *       deny   → returns { status: 403 } without calling handler
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Actual string values from CAPABILITIES constants
const CONSULTING_READ = "consulting:read";
const CONSULTING_WRITE = "consulting:write";

// Valid UUIDs for Zod schema validation in request bodies
const UUID_ENG = "f5ddef44-4151-4ef8-bb6d-6bb9bd380a55";
const UUID_CLIENT = "e4ccde33-3040-4ef8-bb6d-6bb9bd380a44";

// ─── Hoisted shared mocks ─────────────────────────────────────────────────────

const { mockWithCanonical, capturedDeclarations, mockDb, mockEmitAuditEvent } = vi.hoisted(
  () => {
    // Records what options each HTTP verb's withCanonicalEnforcement call declared
    const capturedDeclarations: Record<string, unknown>[] = [];

    // The function returned by withCanonicalEnforcement(handler, options)
    // This vi.fn() is reconfigured per test via mockImplementation
    const mockWithCanonical = vi.fn();

    const mockDb = {
      engagement: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      finding: { findFirst: vi.fn(), create: vi.fn() },
      recommendation: { findFirst: vi.fn(), create: vi.fn() },
      action: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      evidence: { findFirst: vi.fn() },
    };
    const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);

    return { mockWithCanonical, capturedDeclarations, mockDb, mockEmitAuditEvent };
  }
);

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: Record<string, unknown>) => unknown,
    options: { requireCapabilities?: string[]; requireWorkspace?: boolean } = {}
  ) => {
    // Capture the declared requireCapabilities for assertion
    capturedDeclarations.push({
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    });
    // Return a function that delegates to mockWithCanonical
    return async (testCtx: Record<string, unknown> | undefined) => {
      return mockWithCanonical(handler, options, testCtx);
    };
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({
    json: () => body,
    status: init?.status ?? 200,
  }),
}));

// ─── Route imports (after mocks) ──────────────────────────────────────────────

import { GET, POST } from "@/app/api/consulting/engagements/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WS_ID = "ws-perm-test";
const ACTOR_ID = "actor-perm-test";
const ENG_ID = "eng-perm-001";

function makeCtx(extra: Record<string, unknown> = {}) {
  return {
    verifiedActorId: ACTOR_ID,
    verifiedActorType: "user",
    verifiedActor: { id: ACTOR_ID },
    verifiedWorkspaceId: WS_ID,
    verifiedCapabilities: new Set<string>(),
    verifiedSessionSnapshot: {
      snapshotId: "snap-perm-test",
      snapshotTimestamp: new Date(),
      snapshotHash: "hash",
      actorId: ACTOR_ID,
      workspaceId: WS_ID,
      capabilities: [],
    },
    ...extra,
  };
}

function makeRequest(url: string, body?: Record<string, unknown>): Request {
  return {
    method: body !== undefined ? "POST" : "GET",
    url: `http://localhost/api/consulting/engagements${url}`,
    json: body !== undefined ? () => Promise.resolve(body) : undefined,
    headers: new Headers(),
  } as unknown as Request;
}

function makeEngRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENG_ID,
    workspaceId: WS_ID,
    title: "Perm Test Engagement",
    clientId: "client-perm-001",
    code: "ENG-PERM",
    status: "ACTIVE",
    healthStatus: "HEALTHY",
    engagementMode: "consulting",
    interventionMode: "recovery",
    interventionPhase: "triage",
    serviceTier: "standard",
    consultingPhase: "DISCOVERY",
    consultantNotes: null,
    humanFactors: null,
    assignedConsultantId: null,
    createdBy: ACTOR_ID,
    description: null,
    actualEndDate: null,
    targetEndDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Allow / deny helpers ─────────────────────────────────────────────────────

function allowAll() {
  mockWithCanonical.mockImplementation(
    async (handler: (ctx: unknown) => unknown, _options: unknown, testCtx: unknown) => {
      const req = (testCtx as Record<string, unknown>)?.request as Request | undefined;
      return handler({ ...makeCtx(), request: req });
    }
  );
}

function denyWith(missing: string[]) {
  mockWithCanonical.mockImplementationOnce(async () => ({
    status: 403,
    json: () => ({ error: "forbidden", missing }),
  }));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  // Default: allow (passthrough to handler)
  allowAll();
});

// ─── 1. Capability declarations ───────────────────────────────────────────────

describe("Route capability declarations", () => {
  it("GET handler declares CONSULTING_READ as required capability", () => {
    // capturedDeclarations[0] = GET (first withCanonicalEnforcement call at module load)
    const getDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_READ)
    );
    expect(getDecl).toBeDefined();
    expect(getDecl!.requireCapabilities).toContain(CONSULTING_READ);
  });

  it("POST handler declares CONSULTING_WRITE as required capability", () => {
    const postDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_WRITE)
    );
    expect(postDecl).toBeDefined();
    expect(postDecl!.requireCapabilities).toContain(CONSULTING_WRITE);
  });

  it("GET handler requires workspace (requireWorkspace: true)", () => {
    const getDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_READ)
    );
    expect(getDecl?.requireWorkspace).toBe(true);
  });

  it("POST handler requires workspace (requireWorkspace: true)", () => {
    const postDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_WRITE)
    );
    expect(postDecl?.requireWorkspace).toBe(true);
  });

  it("GET does NOT declare CONSULTING_WRITE", () => {
    const getDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_READ)
    );
    expect(getDecl?.requireCapabilities).not.toContain(CONSULTING_WRITE);
  });

  it("POST does NOT declare CONSULTING_READ", () => {
    const postDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_WRITE)
    );
    expect(postDecl?.requireCapabilities).not.toContain(CONSULTING_READ);
  });
});

// ─── 2. GET — enforcement behavior ───────────────────────────────────────────

describe("GET — enforcement 403/200 behavior", () => {
  it("returns 403 when enforcement denies (no CONSULTING_READ)", async () => {
    denyWith([CONSULTING_READ]);
    const req = makeRequest("");
    const result = await (GET as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
  });

  it("returns 403 when enforcement denies with CONSULTING_WRITE but not READ", async () => {
    denyWith([CONSULTING_READ]);
    const req = makeRequest("");
    const result = await (GET as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
  });

  it("returns 200 list when enforcement allows", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makeEngRow()]);
    const req = makeRequest("");
    const result = await (GET as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(200);
  });

  it("returns 200 single get when enforcement allows", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow());
    const req = makeRequest(`?id=${ENG_ID}`);
    const result = await (GET as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(200);
  });

  it("403 response body includes missing caps", async () => {
    denyWith([CONSULTING_READ]);
    const req = makeRequest("");
    const result = await (GET as (ctx?: unknown) => Promise<{ status: number; json: () => { missing: string[] } }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
    expect(result.json().missing).toContain(CONSULTING_READ);
  });
});

// ─── 3. POST — enforcement behavior ──────────────────────────────────────────

describe("POST — enforcement 403/200 behavior", () => {
  it("returns 403 when enforcement denies (no CONSULTING_WRITE)", async () => {
    denyWith([CONSULTING_WRITE]);
    const req = makeRequest("?action=create", { title: "T", clientId: "c1" });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
  });

  it("returns 403 when enforcement denies for CONSULTING_READ caller trying to POST", async () => {
    denyWith([CONSULTING_WRITE]);
    const req = makeRequest("", { title: "T", clientId: "c1" });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
  });

  it("returns 201 on create when enforcement allows", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    mockDb.engagement.create = vi.fn().mockResolvedValue(makeEngRow());
    const req = makeRequest("?action=create", { title: "New Engagement", clientId: UUID_CLIENT });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(201);
  });

  it("returns 200 on advance_phase when enforcement allows", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ id: UUID_ENG, consultingPhase: "DISCOVERY" }));
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ id: UUID_ENG, consultingPhase: "DIAGNOSIS" }));
    const req = makeRequest("?action=advance_phase", {
      engagementId: UUID_ENG,
      targetPhase: "DIAGNOSIS",
      rationale: "Ready",
    });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(200);
  });

  it("returns 200 on close when enforcement allows", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(makeEngRow({ id: UUID_ENG }));
    mockDb.action.findMany.mockResolvedValue([]);
    mockDb.engagement.update = vi.fn().mockResolvedValue(makeEngRow({ id: UUID_ENG, status: "CLOSED" }));
    const req = makeRequest("?action=close", { engagementId: UUID_ENG, closureRationale: "Done" });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(200);
  });

  it("403 response body includes missing CONSULTING_WRITE", async () => {
    denyWith([CONSULTING_WRITE]);
    const req = makeRequest("", {});
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number; json: () => { missing: string[] } }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
    expect(result.json().missing).toContain(CONSULTING_WRITE);
  });
});

// ─── 4. Cross-capability isolation ───────────────────────────────────────────

describe("Cross-capability isolation", () => {
  it("enforcement checks CONSULTING_READ for GET, not CONSULTING_WRITE", () => {
    const getDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_READ)
    );
    const postDecl = capturedDeclarations.find((d) =>
      (d.requireCapabilities as string[]).includes(CONSULTING_WRITE)
    );
    // GET and POST must be different declarations
    expect(getDecl).not.toBe(postDecl);
    expect(getDecl?.requireCapabilities).not.toContain(CONSULTING_WRITE);
    expect(postDecl?.requireCapabilities).not.toContain(CONSULTING_READ);
  });

  it("GET denied → handler body NEVER runs (db not called)", async () => {
    denyWith([CONSULTING_READ]);
    mockDb.engagement.findMany.mockResolvedValue([]);
    const req = makeRequest("");
    await (GET as (ctx?: unknown) => Promise<{ status: number }>)({ request: req });
    // Handler never reached, db should not have been called
    expect(mockDb.engagement.findMany).not.toHaveBeenCalled();
  });

  it("POST denied → handler body NEVER runs (db not called)", async () => {
    denyWith([CONSULTING_WRITE]);
    const req = makeRequest("?action=create", { title: "T", clientId: "c1" });
    await (POST as (ctx?: unknown) => Promise<{ status: number }>)({ request: req });
    expect(mockDb.engagement.findFirst).not.toHaveBeenCalled();
    expect(mockDb.engagement.create).not.toHaveBeenCalled();
  });
});

// ─── 5. Workspace isolation (ctx.verifiedWorkspaceId always used) ─────────────

describe("Workspace isolation — verifiedWorkspaceId from auth context", () => {
  it("GET list uses verifiedWorkspaceId from context, not query param", async () => {
    mockDb.engagement.findMany.mockResolvedValue([makeEngRow()]);
    // Pass ?workspaceId=injected-ws as query param — should be ignored
    const req = makeRequest("?workspaceId=injected-different-ws");
    await (GET as (ctx?: unknown) => Promise<{ status: number }>)({ request: req });
    // Service called with the verified workspace from ctx, not the injected param
    expect(mockDb.engagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID }),
      })
    );
  });

  it("POST create uses verifiedWorkspaceId from context, not body", async () => {
    mockDb.engagement.findFirst.mockResolvedValue(null);
    mockDb.engagement.create = vi.fn().mockResolvedValue(makeEngRow());
    const req = makeRequest("?action=create", {
      title: "WS Test",
      clientId: UUID_CLIENT,
      workspaceId: "body-injected-different-ws", // body attempt to inject workspace
    });
    await (POST as (ctx?: unknown) => Promise<{ status: number }>)({ request: req });
    // Service idempotency check uses ctx.verifiedWorkspaceId, not body value
    expect(mockDb.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID }),
      })
    );
  });
});

// ─── 6. Input validation ──────────────────────────────────────────────────────

describe("Input validation — runs after capability check", () => {
  it("POST with valid caps but missing title returns 422", async () => {
    // clientId present but title missing (clientId is valid UUID; title absence triggers 422)
    const req = makeRequest("?action=create", { clientId: UUID_CLIENT });
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(422);
  });

  it("POST with valid caps and unknown action returns 400", async () => {
    const req = makeRequest("?action=nonexistent_action", {});
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(400);
  });

  it("POST denied → 403 takes precedence over 422 (enforcement runs first)", async () => {
    denyWith([CONSULTING_WRITE]);
    // Even with invalid body, 403 is returned because handler never runs
    const req = makeRequest("?action=create", {}); // invalid body
    const result = await (POST as (ctx?: unknown) => Promise<{ status: number }>)(
      { request: req }
    );
    expect(result.status).toBe(403);
  });
});
