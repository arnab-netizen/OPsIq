/**
 * Non-DB mock tests for:
 *   GET/POST/PATCH /api/owner/connectors          — connector registry (3 GET modes, 3 PATCH actions)
 *   GET/POST       /api/owner/constraints          — constraint resolution
 *   POST           /api/owner/integration-events   — integration event ingestion
 *
 * Pattern: vi.hoisted() + wrapper mock + vi.resetAllMocks() per canonical Bundle 7.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const {
  // connectors
  mockListConnectors,
  mockGetConnector,
  mockGetConnectorHealth,
  mockRegisterConnector,
  mockDisconnectConnector,
  mockActivateConnector,
  mockMarkConnectorRefreshFailed,
  // constraints
  mockListActiveConstraints,
  mockCreateConstraintRecord,
  mockUpdateConstraintStatus,
  // integration-events
  mockIngestIntegrationEvent,
  // canonical
  mockWithCanonical,
} = vi.hoisted(() => ({
  mockListConnectors: vi.fn(),
  mockGetConnector: vi.fn(),
  mockGetConnectorHealth: vi.fn(),
  mockRegisterConnector: vi.fn(),
  mockDisconnectConnector: vi.fn(),
  mockActivateConnector: vi.fn(),
  mockMarkConnectorRefreshFailed: vi.fn(),
  mockListActiveConstraints: vi.fn(),
  mockCreateConstraintRecord: vi.fn(),
  mockUpdateConstraintStatus: vi.fn(),
  mockIngestIntegrationEvent: vi.fn(),
  mockWithCanonical: vi.fn(),
}));

vi.mock("@/services/integration-fabric/connector-registry.service", () => ({
  listConnectors: mockListConnectors,
  getConnector: mockGetConnector,
  getConnectorHealth: mockGetConnectorHealth,
  registerConnector: mockRegisterConnector,
  disconnectConnector: mockDisconnectConnector,
  activateConnector: mockActivateConnector,
  markConnectorRefreshFailed: mockMarkConnectorRefreshFailed,
}));

vi.mock("@/services/owner-mode/constraint-resolution.service", () => ({
  listActiveConstraints: mockListActiveConstraints,
  createConstraintRecord: mockCreateConstraintRecord,
  updateConstraintStatus: mockUpdateConstraintStatus,
}));

vi.mock("@/services/integration-fabric/integration-event.service", () => ({
  ingestIntegrationEvent: mockIngestIntegrationEvent,
}));

// ─── Capture capability declarations ─────────────────────────────────────────

const capturedConnectorsGetDecl: Record<string, unknown>[] = [];
const capturedConnectorsPostDecl: Record<string, unknown>[] = [];
const capturedConnectorsPatchDecl: Record<string, unknown>[] = [];
const capturedConstraintsGetDecl: Record<string, unknown>[] = [];
const capturedConstraintsPostDecl: Record<string, unknown>[] = [];
const capturedEventsPostDecl: Record<string, unknown>[] = [];

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => Promise<unknown>,
    options: Record<string, unknown>
  ) => {
    const decl = {
      requireCapabilities: options?.requireCapabilities ?? [],
      requireWorkspace: options?.requireWorkspace ?? false,
    };
    const src = handler.toString();
    if (src.includes("ingestIntegrationEvent")) {
      capturedEventsPostDecl.push(decl);
    } else if (src.includes("listActiveConstraints")) {
      capturedConstraintsGetDecl.push(decl);
    } else if (src.includes("createConstraintRecord") || src.includes("updateConstraintStatus")) {
      capturedConstraintsPostDecl.push(decl);
    } else if (src.includes("listConnectors") || src.includes("getConnector") || src.includes("getConnectorHealth")) {
      capturedConnectorsGetDecl.push(decl);
    } else if (src.includes("registerConnector")) {
      capturedConnectorsPostDecl.push(decl);
    } else {
      capturedConnectorsPatchDecl.push(decl);
    }
    return async (testCtx: unknown) => mockWithCanonical(handler, options, testCtx);
  },
}));

// ─── Types and constants ──────────────────────────────────────────────────────

type CanonicalResult = { body: Record<string, unknown>; status: number };

const WS_A = "aaaaaaaa-aaaa-4000-8000-cccccccccccc";
const WS_B = "bbbbbbbb-bbbb-4000-8000-cccccccccccc";
const ACTOR_A = "ac000001-0000-4000-8000-000000000001";
const ACTOR_B = "ac000002-0000-4000-8000-000000000002";

const BASE_CONNECTORS = "https://example.com/api/owner/connectors";
const BASE_CONSTRAINTS = "https://example.com/api/owner/constraints";
const BASE_EVENTS = "https://example.com/api/owner/integration-events";

const CONNECTOR_ID = "c0000001-0000-4000-8000-000000000001";
const RECORD_ID = "ab000001-0000-4000-8000-000000000001";

const CONNECTOR_DTO = { id: CONNECTOR_ID, provider: "HUBSPOT", status: "ACTIVE", workspaceId: WS_A };
const HEALTH_REPORT = { connectorId: CONNECTOR_ID, status: "ACTIVE", lastChecked: "2026-01-01T00:00:00.000Z" };
const CONNECTOR_LIST = [CONNECTOR_DTO];
const CONSTRAINT_RECORD = { id: RECORD_ID, constraintType: "CASH", status: "ACTIVE", workspaceId: WS_A };
const CONSTRAINT_LIST = [CONSTRAINT_RECORD];
const INGEST_RESULT = { eventId: "ev-001", processed: true };

function makeCtx(
  baseUrl: string,
  queryParams: Record<string, string> = {},
  body?: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return {
    verifiedWorkspaceId: WS_A,
    verifiedActorId: ACTOR_A,
    request: {
      url: url.toString(),
      json: async () => body ?? {},
      headers: { get: (_k: string) => null },
    },
    ...overrides,
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

// ─── Import handlers after mocks ──────────────────────────────────────────────

let connectorsGet: (ctx?: unknown) => Promise<CanonicalResult>;
let connectorsPost: (ctx?: unknown) => Promise<CanonicalResult>;
let connectorsPatch: (ctx?: unknown) => Promise<CanonicalResult>;
let constraintsGet: (ctx?: unknown) => Promise<CanonicalResult>;
let constraintsPost: (ctx?: unknown) => Promise<CanonicalResult>;
let eventsPost: (ctx?: unknown) => Promise<CanonicalResult>;

beforeAll(async () => {
  allowAll();
  const [connectorsRoute, constraintsRoute, eventsRoute] = await Promise.all([
    import("@/app/api/owner/connectors/route"),
    import("@/app/api/owner/constraints/route"),
    import("@/app/api/owner/integration-events/route"),
  ]);
  connectorsGet = connectorsRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  connectorsPost = connectorsRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  connectorsPatch = connectorsRoute.PATCH as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  constraintsGet = constraintsRoute.GET as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  constraintsPost = constraintsRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
  eventsPost = eventsRoute.POST as unknown as (ctx?: unknown) => Promise<CanonicalResult>;
});

beforeEach(() => {
  vi.resetAllMocks();
  allowAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Connectors / Constraints / Integration Events Routes — non-DB mock tests", () => {
  // ─── 1. Capability declarations ──────────────────────────────────────────────

  describe("capability declarations", () => {
    it("connectors GET is guarded by integration:manage with workspace", () => {
      expect(capturedConnectorsGetDecl[0]?.requireCapabilities).toContain("integration:manage");
      expect(capturedConnectorsGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("connectors POST is guarded by integration:manage with workspace", () => {
      expect(capturedConnectorsPostDecl[0]?.requireCapabilities).toContain("integration:manage");
      expect(capturedConnectorsPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("connectors PATCH is guarded by integration:manage with workspace", () => {
      expect(capturedConnectorsPatchDecl[0]?.requireCapabilities).toContain("integration:manage");
      expect(capturedConnectorsPatchDecl[0]?.requireWorkspace).toBe(true);
    });

    it("constraints GET is guarded by owner:manage with workspace", () => {
      expect(capturedConstraintsGetDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(capturedConstraintsGetDecl[0]?.requireWorkspace).toBe(true);
    });

    it("constraints POST is guarded by owner:manage with workspace", () => {
      expect(capturedConstraintsPostDecl[0]?.requireCapabilities).toContain("owner:manage");
      expect(capturedConstraintsPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("integration-events POST is guarded by integration:manage with workspace", () => {
      expect(capturedEventsPostDecl[0]?.requireCapabilities).toContain("integration:manage");
      expect(capturedEventsPostDecl[0]?.requireWorkspace).toBe(true);
    });

    it("returns 403 when enforcement denies connectors GET", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await connectorsGet(makeCtx(BASE_CONNECTORS));
      expect(result.status).toBe(403);
    });

    it("returns 403 when enforcement denies constraints POST", async () => {
      vi.resetAllMocks();
      denyWith(403);
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, { action: "CREATE" }));
      expect(result.status).toBe(403);
    });
  });

  // ─── 2. GET /api/owner/connectors — list mode ─────────────────────────────────

  describe("GET /api/owner/connectors — list mode", () => {
    it("returns 200 with connectors list", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      const result = await connectorsGet(makeCtx(BASE_CONNECTORS));
      expect(result.status).toBe(200);
      expect(result.body.connectors).toEqual(CONNECTOR_LIST);
    });

    it("passes workspaceId to listConnectors", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      await connectorsGet(makeCtx(BASE_CONNECTORS, {}, undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockListConnectors).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_A }));
    });

    it("passes workspaceId WS_B to listConnectors", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      await connectorsGet(makeCtx(BASE_CONNECTORS, {}, undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListConnectors).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_B }));
    });

    it("passes status filter when provided", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      await connectorsGet(makeCtx(BASE_CONNECTORS, { status: "ACTIVE" }));
      expect(mockListConnectors).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE" }));
    });

    it("passes undefined status when status not in valid enum", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      await connectorsGet(makeCtx(BASE_CONNECTORS, { status: "INVALID_STATUS" }));
      expect(mockListConnectors).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
    });

    it("does not call getConnector or getConnectorHealth for list mode", async () => {
      mockListConnectors.mockResolvedValueOnce(CONNECTOR_LIST);
      await connectorsGet(makeCtx(BASE_CONNECTORS));
      expect(mockGetConnector).not.toHaveBeenCalled();
      expect(mockGetConnectorHealth).not.toHaveBeenCalled();
    });
  });

  // ─── 3. GET /api/owner/connectors?id=... — get by id ────────────────────────

  describe("GET /api/owner/connectors — get by id mode", () => {
    it("returns 200 with connector", async () => {
      mockGetConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      const result = await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID }));
      expect(result.status).toBe(200);
      expect(result.body.connector).toEqual(CONNECTOR_DTO);
    });

    it("passes workspaceId and connectorId to getConnector", async () => {
      mockGetConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID }, undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockGetConnector).toHaveBeenCalledWith({ workspaceId: WS_A, connectorId: CONNECTOR_ID });
    });

    it("does not call listConnectors for id mode", async () => {
      mockGetConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID }));
      expect(mockListConnectors).not.toHaveBeenCalled();
      expect(mockGetConnectorHealth).not.toHaveBeenCalled();
    });
  });

  // ─── 4. GET /api/owner/connectors?id=...&health=1 — health mode ─────────────

  describe("GET /api/owner/connectors — health report mode", () => {
    it("returns 200 with health report", async () => {
      mockGetConnectorHealth.mockResolvedValueOnce(HEALTH_REPORT);
      const result = await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID, health: "1" }));
      expect(result.status).toBe(200);
      expect(result.body.health).toEqual(HEALTH_REPORT);
    });

    it("passes workspaceId and connectorId to getConnectorHealth", async () => {
      mockGetConnectorHealth.mockResolvedValueOnce(HEALTH_REPORT);
      await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID, health: "1" }, undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockGetConnectorHealth).toHaveBeenCalledWith({ workspaceId: WS_A, connectorId: CONNECTOR_ID });
    });

    it("also triggers health mode with health=true", async () => {
      mockGetConnectorHealth.mockResolvedValueOnce(HEALTH_REPORT);
      const result = await connectorsGet(makeCtx(BASE_CONNECTORS, { id: CONNECTOR_ID, health: "true" }));
      expect(result.body.health).toEqual(HEALTH_REPORT);
    });
  });

  // ─── 5. POST /api/owner/connectors — register ────────────────────────────────

  describe("POST /api/owner/connectors — register connector", () => {
    const REGISTER_BODY = { provider: "HUBSPOT" };

    it("returns 201 on success", async () => {
      mockRegisterConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      const result = await connectorsPost(makeCtx(BASE_CONNECTORS, {}, REGISTER_BODY));
      expect(result.status).toBe(201);
    });

    it("returns registered connector in body", async () => {
      mockRegisterConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      const result = await connectorsPost(makeCtx(BASE_CONNECTORS, {}, REGISTER_BODY));
      expect(result.body.connector).toEqual(CONNECTOR_DTO);
    });

    it("passes workspaceId and actorId to registerConnector", async () => {
      mockRegisterConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPost(makeCtx(BASE_CONNECTORS, {}, REGISTER_BODY, { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A }));
      expect(mockRegisterConnector).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A }));
    });

    it("passes provider to registerConnector", async () => {
      mockRegisterConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPost(makeCtx(BASE_CONNECTORS, {}, { provider: "QUICKBOOKS" }));
      expect(mockRegisterConnector).toHaveBeenCalledWith(expect.objectContaining({ provider: "QUICKBOOKS" }));
    });

    it("calls registerConnector exactly once", async () => {
      mockRegisterConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPost(makeCtx(BASE_CONNECTORS, {}, REGISTER_BODY));
      expect(mockRegisterConnector).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 6. PATCH /api/owner/connectors — disconnect ─────────────────────────────

  describe("PATCH /api/owner/connectors — disconnect action", () => {
    const DISCONNECT_BODY = { action: "disconnect", connectorId: CONNECTOR_ID };

    it("returns 200 on disconnect", async () => {
      mockDisconnectConnector.mockResolvedValueOnce({ ...CONNECTOR_DTO, status: "DISCONNECTED" });
      const result = await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, DISCONNECT_BODY));
      expect(result.status).toBe(200);
    });

    it("passes workspaceId, actorId, and connectorId to disconnectConnector", async () => {
      mockDisconnectConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, DISCONNECT_BODY, { verifiedWorkspaceId: WS_B, verifiedActorId: ACTOR_B }));
      expect(mockDisconnectConnector).toHaveBeenCalledWith({ workspaceId: WS_B, actorId: ACTOR_B, connectorId: CONNECTOR_ID });
    });

    it("does not call activate or markRefreshFailed for disconnect", async () => {
      mockDisconnectConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, DISCONNECT_BODY));
      expect(mockActivateConnector).not.toHaveBeenCalled();
      expect(mockMarkConnectorRefreshFailed).not.toHaveBeenCalled();
    });
  });

  // ─── 7. PATCH /api/owner/connectors — activate ───────────────────────────────

  describe("PATCH /api/owner/connectors — activate action", () => {
    const ACTIVATE_BODY = { action: "activate", connectorId: CONNECTOR_ID };

    it("returns 200 on activate", async () => {
      mockActivateConnector.mockResolvedValueOnce({ ...CONNECTOR_DTO, status: "ACTIVE" });
      const result = await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, ACTIVATE_BODY));
      expect(result.status).toBe(200);
    });

    it("passes workspaceId, actorId, and connectorId to activateConnector", async () => {
      mockActivateConnector.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, ACTIVATE_BODY, { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A }));
      expect(mockActivateConnector).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_A, actorId: ACTOR_A, connectorId: CONNECTOR_ID }));
    });
  });

  // ─── 8. PATCH /api/owner/connectors — mark_refresh_failed ───────────────────

  describe("PATCH /api/owner/connectors — mark_refresh_failed action", () => {
    const FAIL_BODY = { action: "mark_refresh_failed", connectorId: CONNECTOR_ID, failureMessage: "Token expired" };

    it("returns 200 on mark_refresh_failed", async () => {
      mockMarkConnectorRefreshFailed.mockResolvedValueOnce({ ...CONNECTOR_DTO, status: "REFRESH_FAILED" });
      const result = await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, FAIL_BODY));
      expect(result.status).toBe(200);
    });

    it("passes workspaceId, actorId, connectorId, and failureMessage", async () => {
      mockMarkConnectorRefreshFailed.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, FAIL_BODY, { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A }));
      expect(mockMarkConnectorRefreshFailed).toHaveBeenCalledWith({
        workspaceId: WS_A,
        actorId: ACTOR_A,
        connectorId: CONNECTOR_ID,
        failureMessage: "Token expired",
      });
    });

    it("does not call disconnect or activate for mark_refresh_failed", async () => {
      mockMarkConnectorRefreshFailed.mockResolvedValueOnce(CONNECTOR_DTO);
      await connectorsPatch(makeCtx(BASE_CONNECTORS, {}, FAIL_BODY));
      expect(mockDisconnectConnector).not.toHaveBeenCalled();
      expect(mockActivateConnector).not.toHaveBeenCalled();
    });
  });

  // ─── 9. GET /api/owner/constraints ───────────────────────────────────────────

  describe("GET /api/owner/constraints", () => {
    it("returns 200 with constraints list", async () => {
      mockListActiveConstraints.mockResolvedValueOnce(CONSTRAINT_LIST);
      const result = await constraintsGet(makeCtx(BASE_CONSTRAINTS));
      expect(result.status).toBe(200);
      expect(result.body.constraints).toEqual(CONSTRAINT_LIST);
    });

    it("passes workspaceId to listActiveConstraints", async () => {
      mockListActiveConstraints.mockResolvedValueOnce(CONSTRAINT_LIST);
      await constraintsGet(makeCtx(BASE_CONSTRAINTS, {}, undefined, { verifiedWorkspaceId: WS_A }));
      expect(mockListActiveConstraints).toHaveBeenCalledWith(WS_A);
    });

    it("passes workspaceId WS_B to listActiveConstraints", async () => {
      mockListActiveConstraints.mockResolvedValueOnce(CONSTRAINT_LIST);
      await constraintsGet(makeCtx(BASE_CONSTRAINTS, {}, undefined, { verifiedWorkspaceId: WS_B }));
      expect(mockListActiveConstraints).toHaveBeenCalledWith(WS_B);
    });

    it("calls listActiveConstraints exactly once", async () => {
      mockListActiveConstraints.mockResolvedValueOnce(CONSTRAINT_LIST);
      await constraintsGet(makeCtx(BASE_CONSTRAINTS));
      expect(mockListActiveConstraints).toHaveBeenCalledTimes(1);
    });

    it("does not call createConstraintRecord for GET", async () => {
      mockListActiveConstraints.mockResolvedValueOnce(CONSTRAINT_LIST);
      await constraintsGet(makeCtx(BASE_CONSTRAINTS));
      expect(mockCreateConstraintRecord).not.toHaveBeenCalled();
      expect(mockUpdateConstraintStatus).not.toHaveBeenCalled();
    });
  });

  // ─── 10. POST /api/owner/constraints — CREATE ────────────────────────────────

  describe("POST /api/owner/constraints — CREATE action", () => {
    const CREATE_BODY = {
      action: "CREATE",
      constraintType: "CASH",
      constraintSource: "INTERNAL",
      title: "Cash runway below 60 days",
      bindingScore: 0.9,
    };

    it("returns 201 on CREATE success", async () => {
      mockCreateConstraintRecord.mockResolvedValueOnce(CONSTRAINT_RECORD);
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, CREATE_BODY));
      expect(result.status).toBe(201);
    });

    it("returns created constraint in body", async () => {
      mockCreateConstraintRecord.mockResolvedValueOnce(CONSTRAINT_RECORD);
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, CREATE_BODY));
      expect(result.body.constraint).toEqual(CONSTRAINT_RECORD);
    });

    it("passes workspaceId and actorId to createConstraintRecord", async () => {
      mockCreateConstraintRecord.mockResolvedValueOnce(CONSTRAINT_RECORD);
      await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, CREATE_BODY, { verifiedWorkspaceId: WS_B, verifiedActorId: ACTOR_B }));
      expect(mockCreateConstraintRecord).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS_B, actorId: ACTOR_B }));
    });

    it("passes constraintType, constraintSource, title, bindingScore", async () => {
      mockCreateConstraintRecord.mockResolvedValueOnce(CONSTRAINT_RECORD);
      await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, CREATE_BODY));
      expect(mockCreateConstraintRecord).toHaveBeenCalledWith(expect.objectContaining({
        constraintType: "CASH",
        constraintSource: "INTERNAL",
        title: "Cash runway below 60 days",
        bindingScore: 0.9,
      }));
    });

    it("returns 400 if constraintType missing on CREATE", async () => {
      const body = { action: "CREATE", constraintSource: "INTERNAL", title: "Missing type", bindingScore: 0.5 };
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, body));
      expect(result.status).toBe(400);
    });

    it("returns 400 if bindingScore missing on CREATE", async () => {
      const body = { action: "CREATE", constraintType: "CASH", constraintSource: "INTERNAL", title: "Missing score" };
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, body));
      expect(result.status).toBe(400);
    });
  });

  // ─── 11. POST /api/owner/constraints — ACCEPT ────────────────────────────────

  describe("POST /api/owner/constraints — ACCEPT action", () => {
    const ACCEPT_BODY = { action: "ACCEPT", recordId: RECORD_ID };

    it("returns 200 on ACCEPT success", async () => {
      mockUpdateConstraintStatus.mockResolvedValueOnce({ ...CONSTRAINT_RECORD, status: "ACCEPTED" });
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, ACCEPT_BODY));
      expect(result.status).toBe(200);
    });

    it("passes ACCEPTED status to updateConstraintStatus", async () => {
      mockUpdateConstraintStatus.mockResolvedValueOnce(CONSTRAINT_RECORD);
      await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, ACCEPT_BODY, { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A }));
      expect(mockUpdateConstraintStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "ACCEPTED", recordId: RECORD_ID }));
    });

    it("returns 400 when recordId missing on ACCEPT", async () => {
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, { action: "ACCEPT" }));
      expect(result.status).toBe(400);
    });
  });

  // ─── 12. POST /api/owner/constraints — RESOLVE ───────────────────────────────

  describe("POST /api/owner/constraints — RESOLVE action", () => {
    const RESOLVE_BODY = { action: "RESOLVE", recordId: RECORD_ID, remediationAction: "Secured bridge financing" };

    it("returns 200 on RESOLVE success", async () => {
      mockUpdateConstraintStatus.mockResolvedValueOnce({ ...CONSTRAINT_RECORD, status: "RESOLVED" });
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, RESOLVE_BODY));
      expect(result.status).toBe(200);
    });

    it("passes RESOLVED status to updateConstraintStatus", async () => {
      mockUpdateConstraintStatus.mockResolvedValueOnce(CONSTRAINT_RECORD);
      await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, RESOLVE_BODY, { verifiedWorkspaceId: WS_A, verifiedActorId: ACTOR_A }));
      expect(mockUpdateConstraintStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "RESOLVED", recordId: RECORD_ID }));
    });

    it("passes remediationAction to updateConstraintStatus", async () => {
      mockUpdateConstraintStatus.mockResolvedValueOnce(CONSTRAINT_RECORD);
      await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, RESOLVE_BODY));
      expect(mockUpdateConstraintStatus).toHaveBeenCalledWith(expect.objectContaining({ remediationAction: "Secured bridge financing" }));
    });

    it("returns 400 when recordId missing on RESOLVE", async () => {
      const result = await constraintsPost(makeCtx(BASE_CONSTRAINTS, {}, { action: "RESOLVE" }));
      expect(result.status).toBe(400);
    });
  });

  // ─── 13. POST /api/owner/integration-events ──────────────────────────────────

  describe("POST /api/owner/integration-events", () => {
    const EVENT_BODY = {
      provider: "HUBSPOT",
      kind: "CRM_DEAL_UPDATED",
      payload: { dealId: "d-001", stage: "closed_won" },
      occurredAt: "2026-01-01T00:00:00.000Z",
    };

    it("returns 202 on success", async () => {
      mockIngestIntegrationEvent.mockResolvedValueOnce(INGEST_RESULT);
      const result = await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY));
      expect(result.status).toBe(202);
    });

    it("returns result in body", async () => {
      mockIngestIntegrationEvent.mockResolvedValueOnce(INGEST_RESULT);
      const result = await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY));
      expect(result.body.result).toEqual(INGEST_RESULT);
    });

    it("overrides workspaceId in event body with verified workspaceId", async () => {
      mockIngestIntegrationEvent.mockResolvedValueOnce(INGEST_RESULT);
      await eventsPost(makeCtx(BASE_EVENTS, {}, { ...EVENT_BODY, workspaceId: "attacker-ws" }, { verifiedWorkspaceId: WS_A }));
      expect(mockIngestIntegrationEvent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_A }),
        expect.anything()
      );
    });

    it("workspace isolation: WS_A vs WS_B both use server-derived workspaceId", async () => {
      mockIngestIntegrationEvent.mockResolvedValue(INGEST_RESULT);
      await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY, { verifiedWorkspaceId: WS_A }));
      await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY, { verifiedWorkspaceId: WS_B }));
      expect(mockIngestIntegrationEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspaceId: WS_A }), expect.anything());
      expect(mockIngestIntegrationEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspaceId: WS_B }), expect.anything());
    });

    it("passes actorId to ingestIntegrationEvent", async () => {
      mockIngestIntegrationEvent.mockResolvedValueOnce(INGEST_RESULT);
      await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY, { verifiedActorId: ACTOR_B }));
      expect(mockIngestIntegrationEvent).toHaveBeenCalledWith(expect.anything(), ACTOR_B);
    });

    it("calls ingestIntegrationEvent exactly once per request", async () => {
      mockIngestIntegrationEvent.mockResolvedValueOnce(INGEST_RESULT);
      await eventsPost(makeCtx(BASE_EVENTS, {}, EVENT_BODY));
      expect(mockIngestIntegrationEvent).toHaveBeenCalledTimes(1);
    });
  });
});
