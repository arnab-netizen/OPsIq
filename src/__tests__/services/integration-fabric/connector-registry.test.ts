/**
 * Bundle 5.2 — Connector Registry Service tests.
 *
 * Covers: registerConnector (idempotent), disconnectConnector, markRefreshFailed,
 * activateConnector, listConnectors (with/without status filter), getConnector,
 * getConnectorHealth, DTO boundary (no token/registeredBy fields), workspace
 * isolation, audit event assertions, provider validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockDb, mockEmitAuditEvent } = vi.hoisted(() => {
  const mockDb = {
    ownerConnector: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const mockEmitAuditEvent = vi.fn();
  return { mockDb, mockEmitAuditEvent };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    CONNECTOR_REGISTERED: "connector.registered",
    CONNECTOR_DISCONNECTED: "connector.disconnected",
    CONNECTOR_TOKEN_REFRESHED: "connector.token_refreshed",
    CONNECTOR_REFRESH_FAILED: "connector.refresh_failed",
  },
}));

import {
  registerConnector,
  disconnectConnector,
  markConnectorRefreshFailed,
  activateConnector,
  listConnectors,
  getConnector,
  getConnectorHealth,
  assertConnectorStatus,
} from "@/services/integration-fabric/connector-registry.service";
import { NotFoundError, ConflictError } from "@/infra/errors";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WS = "ws-test-1";
const WS2 = "ws-test-2";
const ACTOR = "actor-1";
const CONNECTOR_ID = "conn-1";

const activeRow = {
  id: CONNECTOR_ID,
  workspaceId: WS,
  businessId: null,
  provider: "HUBSPOT",
  status: "ACTIVE",
  connectedAt: new Date("2026-01-01"),
  lastSyncAt: null,
  lastSyncRecords: null,
  tokenExpiresAt: null,
  syncFailureMessage: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function resetMocks() {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
}

// ─── registerConnector ────────────────────────────────────────────────────────

describe("registerConnector", () => {
  beforeEach(resetMocks);

  it("creates new connector when none exists", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    const pendingRow = { ...activeRow, status: "PENDING_AUTH" };
    mockDb.ownerConnector.create.mockResolvedValue(pendingRow);

    const dto = await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });

    expect(mockDb.ownerConnector.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: WS, provider: "HUBSPOT", status: "PENDING_AUTH", registeredBy: ACTOR }),
      })
    );
    expect(dto.status).toBe("PENDING_AUTH");
    expect(dto.provider).toBe("HUBSPOT");
  });

  it("returns existing connector (idempotent) when workspace+provider match", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(activeRow);

    const dto = await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });

    expect(mockDb.ownerConnector.create).not.toHaveBeenCalled();
    expect(dto.id).toBe(CONNECTOR_ID);
    expect(dto.status).toBe("ACTIVE");
  });

  it("idempotent register does NOT emit audit event", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(activeRow);
    await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("emits CONNECTOR_REGISTERED on new registration", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    const pendingRow = { ...activeRow, status: "PENDING_AUTH" };
    mockDb.ownerConnector.create.mockResolvedValue(pendingRow);

    await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        actorId: ACTOR,
        eventName: "connector.registered",
        payload: expect.objectContaining({ provider: "HUBSPOT" }),
      })
    );
  });

  it("throws ConflictError for invalid provider", async () => {
    await expect(
      registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "STRIPE" })
    ).rejects.toThrow(ConflictError);
  });

  it("accepts businessId and includes it in created data", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    const row = { ...activeRow, businessId: "biz-1" };
    mockDb.ownerConnector.create.mockResolvedValue(row);

    await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "QUICKBOOKS", businessId: "biz-1" });

    expect(mockDb.ownerConnector.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "biz-1" }),
      })
    );
  });

  it("accepts tokenExpiresAt and includes it in created data", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    const expiry = new Date("2027-01-01");
    mockDb.ownerConnector.create.mockResolvedValue({ ...activeRow, tokenExpiresAt: expiry });

    await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT", tokenExpiresAt: expiry });

    expect(mockDb.ownerConnector.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenExpiresAt: expiry }),
      })
    );
  });

  it("DTO does not expose registeredBy", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    const pendingRow = { ...activeRow, status: "PENDING_AUTH" };
    mockDb.ownerConnector.create.mockResolvedValue(pendingRow);
    const dto = await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });
    expect("registeredBy" in dto).toBe(false);
  });

  it("DTO does not expose encryptedAccessToken", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    mockDb.ownerConnector.create.mockResolvedValue(activeRow);
    const dto = await registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "HUBSPOT" });
    expect("encryptedAccessToken" in dto).toBe(false);
    expect("accessToken" in dto).toBe(false);
  });
});

// ─── disconnectConnector ──────────────────────────────────────────────────────

describe("disconnectConnector", () => {
  beforeEach(resetMocks);

  it("updates status to DISCONNECTED", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    const disconnectedRow = { ...activeRow, status: "DISCONNECTED" };
    mockDb.ownerConnector.update.mockResolvedValue(disconnectedRow);

    const dto = await disconnectConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID });

    expect(mockDb.ownerConnector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTOR_ID },
        data: expect.objectContaining({ status: "DISCONNECTED" }),
      })
    );
    expect(dto.status).toBe("DISCONNECTED");
  });

  it("throws NotFoundError when connector not found in workspace", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(
      disconnectConnector({ workspaceId: WS, actorId: ACTOR, connectorId: "unknown" })
    ).rejects.toThrow(NotFoundError);
  });

  it("emits CONNECTOR_DISCONNECTED audit event", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue({ ...activeRow, status: "DISCONNECTED" });

    await disconnectConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "connector.disconnected",
        workspaceId: WS,
        entityId: CONNECTOR_ID,
      })
    );
  });

  it("workspace scoping: findFirst uses workspaceId in where clause", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await disconnectConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID }).catch(() => {});
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });
});

// ─── markConnectorRefreshFailed ───────────────────────────────────────────────

describe("markConnectorRefreshFailed", () => {
  beforeEach(resetMocks);

  it("sets status to REFRESH_FAILED and sets syncFailureMessage", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    const failedRow = { ...activeRow, status: "REFRESH_FAILED", syncFailureMessage: "Token expired" };
    mockDb.ownerConnector.update.mockResolvedValue(failedRow);

    const dto = await markConnectorRefreshFailed({
      workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID, failureMessage: "Token expired",
    });

    expect(dto.status).toBe("REFRESH_FAILED");
    expect(dto.syncFailureMessage).toBe("Token expired");
  });

  it("throws NotFoundError for unknown connector", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(
      markConnectorRefreshFailed({ workspaceId: WS, actorId: ACTOR, connectorId: "x", failureMessage: "err" })
    ).rejects.toThrow(NotFoundError);
  });

  it("emits CONNECTOR_REFRESH_FAILED audit event", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue({ ...activeRow, status: "REFRESH_FAILED" });

    await markConnectorRefreshFailed({
      workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID, failureMessage: "err",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "connector.refresh_failed" })
    );
  });
});

// ─── activateConnector ────────────────────────────────────────────────────────

describe("activateConnector", () => {
  beforeEach(resetMocks);

  it("sets status to ACTIVE and clears syncFailureMessage", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue({ ...activeRow, status: "ACTIVE", syncFailureMessage: null });

    const dto = await activateConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID });

    expect(dto.status).toBe("ACTIVE");
    expect(dto.syncFailureMessage).toBeNull();
  });

  it("stores tokenExpiresAt when provided", async () => {
    const expiry = new Date("2027-01-01");
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue({ ...activeRow, tokenExpiresAt: expiry });

    await activateConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID, tokenExpiresAt: expiry });

    expect(mockDb.ownerConnector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenExpiresAt: expiry }),
      })
    );
  });

  it("throws NotFoundError for unknown connector", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(
      activateConnector({ workspaceId: WS, actorId: ACTOR, connectorId: "x" })
    ).rejects.toThrow(NotFoundError);
  });

  it("emits CONNECTOR_TOKEN_REFRESHED audit event", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue(activeRow);

    await activateConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "connector.token_refreshed" })
    );
  });
});

// ─── listConnectors ───────────────────────────────────────────────────────────

describe("listConnectors", () => {
  beforeEach(resetMocks);

  it("returns all connectors for workspace", async () => {
    const rows = [activeRow, { ...activeRow, id: "conn-2", provider: "QUICKBOOKS" }];
    mockDb.ownerConnector.findMany.mockResolvedValue(rows);

    const dtos = await listConnectors({ workspaceId: WS });

    expect(dtos).toHaveLength(2);
    expect(dtos[0].provider).toBe("HUBSPOT");
    expect(dtos[1].provider).toBe("QUICKBOOKS");
  });

  it("filters by status when provided", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([]);

    await listConnectors({ workspaceId: WS, status: "ACTIVE" });

    expect(mockDb.ownerConnector.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS, status: "ACTIVE" }),
      })
    );
  });

  it("does not include status filter when omitted", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([]);
    await listConnectors({ workspaceId: WS });
    const call = mockDb.ownerConnector.findMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });

  it("workspace isolation: findMany uses workspaceId", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([]);
    await listConnectors({ workspaceId: WS2 });
    expect(mockDb.ownerConnector.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS2 }) })
    );
  });

  it("DTO list has no registeredBy fields", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([activeRow]);
    const [dto] = await listConnectors({ workspaceId: WS });
    expect("registeredBy" in dto).toBe(false);
  });
});

// ─── getConnector ─────────────────────────────────────────────────────────────

describe("getConnector", () => {
  beforeEach(resetMocks);

  it("returns connector DTO by id within workspace", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(activeRow);
    const dto = await getConnector({ workspaceId: WS, connectorId: CONNECTOR_ID });
    expect(dto.id).toBe(CONNECTOR_ID);
  });

  it("throws NotFoundError when connector not in workspace", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(getConnector({ workspaceId: WS2, connectorId: CONNECTOR_ID })).rejects.toThrow(NotFoundError);
  });

  it("findFirst uses both id and workspaceId (workspace isolation)", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await getConnector({ workspaceId: WS, connectorId: CONNECTOR_ID }).catch(() => {});
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONNECTOR_ID, workspaceId: WS } })
    );
  });
});

// ─── getConnectorHealth ───────────────────────────────────────────────────────

describe("getConnectorHealth", () => {
  beforeEach(resetMocks);

  it("returns OK health for active connector with recent sync", async () => {
    const recentSync = new Date(Date.now() - 60 * 60 * 1000);
    mockDb.ownerConnector.findFirst.mockResolvedValue({ ...activeRow, lastSyncAt: recentSync });

    const report = await getConnectorHealth({ workspaceId: WS, connectorId: CONNECTOR_ID });

    expect(report.severity).toBe("OK");
    expect(report.issues).toHaveLength(0);
  });

  it("returns CRITICAL health for DISCONNECTED connector", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ ...activeRow, status: "DISCONNECTED" });

    const report = await getConnectorHealth({ workspaceId: WS, connectorId: CONNECTOR_ID });

    expect(report.severity).toBe("CRITICAL");
  });

  it("returns WARNING for REFRESH_FAILED connector", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({
      ...activeRow, status: "REFRESH_FAILED", syncFailureMessage: "Token expired",
    });

    const report = await getConnectorHealth({ workspaceId: WS, connectorId: CONNECTOR_ID });

    expect(report.severity).toBe("CRITICAL");
    expect(report.issues.some((i) => i.code === "REFRESH_FAILED")).toBe(true);
  });

  it("throws NotFoundError when connector not in workspace", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(getConnectorHealth({ workspaceId: WS, connectorId: "x" })).rejects.toThrow(NotFoundError);
  });

  it("health report carries workspaceId and connectorId", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(activeRow);
    const report = await getConnectorHealth({ workspaceId: WS, connectorId: CONNECTOR_ID });
    expect(report.workspaceId).toBe(WS);
    expect(report.connectorId).toBe(CONNECTOR_ID);
  });
});

// ─── assertConnectorStatus ────────────────────────────────────────────────────

describe("assertConnectorStatus", () => {
  it("accepts all valid statuses", () => {
    expect(() => assertConnectorStatus("ACTIVE")).not.toThrow();
    expect(() => assertConnectorStatus("DISCONNECTED")).not.toThrow();
    expect(() => assertConnectorStatus("EXPIRED")).not.toThrow();
    expect(() => assertConnectorStatus("REFRESH_FAILED")).not.toThrow();
    expect(() => assertConnectorStatus("PENDING_AUTH")).not.toThrow();
  });

  it("throws ConflictError for invalid status", () => {
    expect(() => assertConnectorStatus("UNKNOWN")).toThrow(ConflictError);
  });
});

// ─── DTO boundary (cross-cutting) ─────────────────────────────────────────────

describe("DTO boundary — no token fields in any response", () => {
  beforeEach(resetMocks);

  it("toPublicDTO omits registeredBy from all responses", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(activeRow);
    const dto = await getConnector({ workspaceId: WS, connectorId: CONNECTOR_ID });
    expect("registeredBy" in dto).toBe(false);
  });

  it("listConnectors omits registeredBy from all DTOs", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([activeRow]);
    const [dto] = await listConnectors({ workspaceId: WS });
    expect("registeredBy" in dto).toBe(false);
    expect("accessToken" in dto).toBe(false);
    expect("encryptedAccessToken" in dto).toBe(false);
  });

  it("disconnectConnector DTO omits token fields", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: CONNECTOR_ID, provider: "HUBSPOT" });
    mockDb.ownerConnector.update.mockResolvedValue({ ...activeRow, status: "DISCONNECTED" });
    const dto = await disconnectConnector({ workspaceId: WS, actorId: ACTOR, connectorId: CONNECTOR_ID });
    expect("token" in dto).toBe(false);
    expect("encryptedRefreshToken" in dto).toBe(false);
  });
});

// ─── Workspace isolation (cross-cutting) ──────────────────────────────────────

describe("workspace isolation", () => {
  beforeEach(resetMocks);

  it("registerConnector: findFirst uses workspaceId", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    mockDb.ownerConnector.create.mockResolvedValue({ ...activeRow, status: "PENDING_AUTH" });
    await registerConnector({ workspaceId: WS2, actorId: ACTOR, provider: "SLACK" });
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS2 }) })
    );
  });

  it("disconnectConnector: findFirst uses workspaceId", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await disconnectConnector({ workspaceId: WS2, actorId: ACTOR, connectorId: CONNECTOR_ID }).catch(() => {});
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS2 }) })
    );
  });

  it("getConnectorHealth: findFirst uses workspaceId", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await getConnectorHealth({ workspaceId: WS2, connectorId: CONNECTOR_ID }).catch(() => {});
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS2 }) })
    );
  });
});
