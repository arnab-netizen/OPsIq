/**
 * ONE QuickBooks architecture: the legacy generic connector registry can no longer create, activate or feed events for a
 * QuickBooks "connector" (it had no OAuth and could be flipped to ACTIVE by hand).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  ownerConnector: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: () => mockDb }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn() }));

import { registerConnector, activateConnector, listConnectors } from "@/services/integration-fabric/connector-registry.service";
import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";
import { CONNECTOR_PROVIDERS, REGISTRABLE_CONNECTOR_PROVIDERS, isRetiredConnectorProvider } from "@/domain/integration-fabric/integration-contracts";

const WS = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";

describe("legacy generic QuickBooks connector path is closed", () => {
  beforeEach(() => { Object.values(mockDb.ownerConnector).forEach((f) => f.mockReset()); });

  it("QUICKBOOKS stays a readable vocabulary value (historical rows) but is not registrable", () => {
    expect(CONNECTOR_PROVIDERS).toContain("QUICKBOOKS");
    expect(isRetiredConnectorProvider("QUICKBOOKS")).toBe(true);
    expect(REGISTRABLE_CONNECTOR_PROVIDERS).not.toContain("QUICKBOOKS");
    expect(REGISTRABLE_CONNECTOR_PROVIDERS).toContain("HUBSPOT");
  });

  it("registerConnector refuses QUICKBOOKS before any database access and points to the governed flow", async () => {
    await expect(registerConnector({ workspaceId: WS, actorId: ACTOR, provider: "QUICKBOOKS" })).rejects.toThrow(/Connected accounts/);
    expect(mockDb.ownerConnector.findFirst).not.toHaveBeenCalled();
    expect(mockDb.ownerConnector.create).not.toHaveBeenCalled();
  });

  it("a legacy QUICKBOOKS row cannot be activated by hand", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: "c1", provider: "QUICKBOOKS" });
    await expect(activateConnector({ workspaceId: WS, actorId: ACTOR, connectorId: "c1" })).rejects.toThrow(/Connected accounts/);
    expect(mockDb.ownerConnector.update).not.toHaveBeenCalled();
  });

  it("generic integration events for QUICKBOOKS are refused (no hollow re-evaluation path)", async () => {
    await expect(ingestIntegrationEvent({
      id: "33333333-3333-4333-8333-333333333333", workspaceId: WS, connectorId: "44444444-4444-4444-8444-444444444444",
      provider: "QUICKBOOKS", kind: "CONNECTOR_SYNC_COMPLETED", payload: {}, occurredAt: "2026-10-24T00:00:00.000Z",
    }, ACTOR)).rejects.toThrow(/Connected accounts/);
    expect(mockDb.ownerConnector.findFirst).not.toHaveBeenCalled();
  });

  it("the STORED connector decides: a legacy QUICKBOOKS connector cannot be reached by claiming another provider", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue({ id: "c1", provider: "QUICKBOOKS", status: "ACTIVE" });
    await expect(ingestIntegrationEvent({
      id: "33333333-3333-4333-8333-333333333333", workspaceId: WS, connectorId: "44444444-4444-4444-8444-444444444444",
      provider: "SHOPIFY", kind: "CONNECTOR_SYNC_COMPLETED", payload: {}, occurredAt: "2026-10-24T00:00:00.000Z",
    }, ACTOR)).rejects.toThrow(/Connected accounts/);
  });

  it("historical QuickBooks rows remain listable (read path unaffected)", async () => {
    mockDb.ownerConnector.findMany.mockResolvedValue([]);
    await expect(listConnectors({ workspaceId: WS })).resolves.toEqual([]);
  });
});
