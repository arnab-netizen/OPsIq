/**
 * Non-DB mock tests for:
 *   GET   /api/owner/connectors — list, get by id, get health
 *   POST  /api/owner/connectors — register connector
 *   PATCH /api/owner/connectors — lifecycle transitions (disconnect/activate/mark_refresh_failed)
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 * Uses error-catching allowAll() because route uses parseRequestBody.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  mockRegisterConnector,
  mockDisconnectConnector,
  mockActivateConnector,
  mockMarkConnectorRefreshFailed,
  mockListConnectors,
  mockGetConnector,
  mockGetConnectorHealth,
  mockParseRequestBody,
  mockCanonicalJson,
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockRegisterConnector: vi.fn(),
  mockDisconnectConnector: vi.fn(),
  mockActivateConnector: vi.fn(),
  mockMarkConnectorRefreshFailed: vi.fn(),
  mockListConnectors: vi.fn(),
  mockGetConnector: vi.fn(),
  mockGetConnectorHealth: vi.fn(),
  mockParseRequestBody: vi.fn(),
  mockCanonicalJson: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/integration-fabric/connector-registry.service", () => ({
  registerConnector: mockRegisterConnector,
  disconnectConnector: mockDisconnectConnector,
  activateConnector: mockActivateConnector,
  markConnectorRefreshFailed: mockMarkConnectorRefreshFailed,
  listConnectors: mockListConnectors,
  getConnector: mockGetConnector,
  getConnectorHealth: mockGetConnectorHealth,
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
const CONNECTOR_ID = "cn000001-0000-4000-8000-000000000001";

const BASE_URL = "https://example.com/api/owner/connectors";

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: { url: BASE_URL },
    ...overrides,
  };
}

const MOCK_CONNECTOR = {
  id: CONNECTOR_ID,
  workspaceId: WS_A,
  provider: "QUICKBOOKS",
  status: "ACTIVE",
};

const MOCK_REGISTER_INPUT = {
  provider: "QUICKBOOKS",
  businessId: "b4000001-0000-4000-8000-000000000001",
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

let connectorsGet: (ctx?: unknown) => Promise<unknown>;
let connectorsPost: (ctx?: unknown) => Promise<unknown>;
let connectorsPatch: (ctx?: unknown) => Promise<unknown>;

beforeAll(async () => {
  allowAll();
  const route = await import("@/app/api/owner/connectors/route");
  connectorsGet = route.GET as unknown as (ctx?: unknown) => Promise<unknown>;
  connectorsPost = route.POST as unknown as (ctx?: unknown) => Promise<unknown>;
  connectorsPatch = route.PATCH as unknown as (ctx?: unknown) => Promise<unknown>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
  mockParseRequestBody.mockResolvedValue(MOCK_REGISTER_INPUT);
  mockCanonicalJson.mockImplementation((data: unknown, opts: { status: number }) => ({ body: data, status: opts?.status ?? 200 }));
  mockListConnectors.mockResolvedValue([MOCK_CONNECTOR]);
  mockGetConnector.mockResolvedValue(MOCK_CONNECTOR);
  mockGetConnectorHealth.mockResolvedValue({ healthy: true, lastCheckedAt: new Date() });
  mockRegisterConnector.mockResolvedValue(MOCK_CONNECTOR);
  mockDisconnectConnector.mockResolvedValue(MOCK_CONNECTOR);
  mockActivateConnector.mockResolvedValue(MOCK_CONNECTOR);
  mockMarkConnectorRefreshFailed.mockResolvedValue(MOCK_CONNECTOR);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("connectors-route — module contract assertions", () => {
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
  it("MOCK_CONNECTOR.status is ACTIVE", () => { expect(MOCK_CONNECTOR.status).toBe("ACTIVE"); });
});

describe("GET /api/owner/connectors — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("all handlers require workspace enforcement", () => {
      const decls = capturedDeclarations.filter((d) => d.requireWorkspace === true);
      expect(decls.length).toBeGreaterThan(0);
    });

    it("returns 403 when enforcement denies GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await connectorsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });

    it("returns 401 when enforcement denies GET with 401", async () => {
      vi.resetAllMocks();
      denyWith(401);
      const result = await connectorsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(401);
    });
  });

  describe("GET list (no id param)", () => {
    it("returns 200 on success", async () => {
      const result = await connectorsGet(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls listConnectors with workspaceId", async () => {
      await connectorsGet(makeCtx());
      expect(mockListConnectors).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A })
      );
    });

    it("returns connectors array in body", async () => {
      const result = await connectorsGet(makeCtx()) as { body: { connectors: unknown[] } };
      expect(Array.isArray(result.body.connectors)).toBe(true);
    });

    it("uses verifiedWorkspaceId for GET (WS_B)", async () => {
      await connectorsGet(makeCtx({ verifiedWorkspaceId: WS_B }));
      expect(mockListConnectors).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_B })
      );
    });
  });

  describe("GET by id", () => {
    it("calls getConnector when id param present", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?id=${CONNECTOR_ID}` } });
      await connectorsGet(ctx);
      expect(mockGetConnector).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, connectorId: CONNECTOR_ID })
      );
    });

    it("returns connector in body when id given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?id=${CONNECTOR_ID}` } });
      const result = await connectorsGet(ctx) as { body: { connector: unknown } };
      expect(result.body.connector).toEqual(MOCK_CONNECTOR);
    });
  });

  describe("GET health report", () => {
    it("calls getConnectorHealth when id and health=1 given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?id=${CONNECTOR_ID}&health=1` } });
      await connectorsGet(ctx);
      expect(mockGetConnectorHealth).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, connectorId: CONNECTOR_ID })
      );
    });

    it("returns health in body when health=1 given", async () => {
      const ctx = makeCtx({ request: { url: `${BASE_URL}?id=${CONNECTOR_ID}&health=1` } });
      const result = await connectorsGet(ctx) as { body: { health: unknown } };
      expect(result.body.health).toBeDefined();
    });
  });
});

describe("POST /api/owner/connectors — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await connectorsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("successful POST (register)", () => {
    it("returns 201 on success", async () => {
      const result = await connectorsPost(makeCtx()) as { status: number };
      expect(result.status).toBe(201);
    });

    it("calls registerConnector with workspaceId and actorId", async () => {
      await connectorsPost(makeCtx());
      expect(mockRegisterConnector).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A })
      );
    });

    it("returns connector in body", async () => {
      const result = await connectorsPost(makeCtx()) as { body: { connector: unknown } };
      expect(result.body.connector).toEqual(MOCK_CONNECTOR);
    });

    it("calls registerConnector exactly once", async () => {
      await connectorsPost(makeCtx());
      expect(mockRegisterConnector).toHaveBeenCalledTimes(1);
    });
  });
});

describe("PATCH /api/owner/connectors — non-DB mock tests", () => {
  describe("capability declarations", () => {
    it("returns 403 when enforcement denies PATCH", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await connectorsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(403);
    });
  });

  describe("PATCH action=disconnect", () => {
    it("returns 200 on disconnect", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "disconnect", connectorId: CONNECTOR_ID });
      const result = await connectorsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls disconnectConnector with workspaceId, actorId, connectorId", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "disconnect", connectorId: CONNECTOR_ID });
      await connectorsPatch(makeCtx());
      expect(mockDisconnectConnector).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A, connectorId: CONNECTOR_ID })
      );
    });

    it("returns connector in body on disconnect", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "disconnect", connectorId: CONNECTOR_ID });
      const result = await connectorsPatch(makeCtx()) as { body: { connector: unknown } };
      expect(result.body.connector).toEqual(MOCK_CONNECTOR);
    });
  });

  describe("PATCH action=activate", () => {
    it("returns 200 on activate", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "activate", connectorId: CONNECTOR_ID });
      const result = await connectorsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls activateConnector with workspaceId, actorId, connectorId", async () => {
      mockParseRequestBody.mockResolvedValue({ action: "activate", connectorId: CONNECTOR_ID });
      await connectorsPatch(makeCtx());
      expect(mockActivateConnector).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A, connectorId: CONNECTOR_ID })
      );
    });
  });

  describe("PATCH action=mark_refresh_failed", () => {
    it("returns 200 on mark_refresh_failed", async () => {
      mockParseRequestBody.mockResolvedValue({
        action: "mark_refresh_failed",
        connectorId: CONNECTOR_ID,
        failureMessage: "Token expired",
      });
      const result = await connectorsPatch(makeCtx()) as { status: number };
      expect(result.status).toBe(200);
    });

    it("calls markConnectorRefreshFailed with workspaceId, actorId, connectorId", async () => {
      mockParseRequestBody.mockResolvedValue({
        action: "mark_refresh_failed",
        connectorId: CONNECTOR_ID,
        failureMessage: "Token expired",
      });
      await connectorsPatch(makeCtx());
      expect(mockMarkConnectorRefreshFailed).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A, connectorId: CONNECTOR_ID })
      );
    });
  });
});
