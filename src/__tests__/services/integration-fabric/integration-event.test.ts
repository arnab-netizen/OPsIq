/**
 * Bundle 5.3 — Integration Event Ingestion Service tests.
 *
 * Covers: schema validation, connector ownership verification (workspace isolation),
 * audit event emission, BCP trigger mapping (null → skip, non-null → fire-and-forget),
 * ingest result shape, error paths (ValidationError, NotFoundError).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockDb, mockEmitAuditEvent, mockGetCurrentConditionProfile, mockEvaluateConditionProfile } = vi.hoisted(() => {
  const mockDb = {
    ownerConnector: {
      findFirst: vi.fn(),
    },
  };
  const mockEmitAuditEvent = vi.fn();
  const mockGetCurrentConditionProfile = vi.fn();
  const mockEvaluateConditionProfile = vi.fn();
  return { mockDb, mockEmitAuditEvent, mockGetCurrentConditionProfile, mockEvaluateConditionProfile };
});

vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    INTEGRATION_EVENT_INGESTED: "integration_event.ingested",
    INTEGRATION_EVENT_BCP_TRIGGERED: "integration_event.bcp_triggered",
  },
}));
vi.mock("@/services/owner-mode/owner-bcp.service", () => ({
  getCurrentConditionProfile: mockGetCurrentConditionProfile,
  evaluateConditionProfile: mockEvaluateConditionProfile,
}));

import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WS = "ws-test-1";
const WS2 = "ws-test-2";
const ACTOR = "actor-1";
const CONNECTOR_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const EVENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const BUSINESS_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

const validEvent = {
  id: EVENT_ID,
  workspaceId: WS,
  connectorId: CONNECTOR_ID,
  provider: "HUBSPOT",
  kind: "CRM_DEAL_UPDATED",
  businessId: BUSINESS_ID,
  payload: { dealId: "d123" },
  occurredAt: "2026-07-01T12:00:00Z",
};

const activeConnector = {
  id: CONNECTOR_ID,
  provider: "HUBSPOT",
  status: "ACTIVE",
};

const bcpProfile = {
  financialHealthScore: 70,
  operationalHealthScore: 65,
  salesHealthScore: 75,
  sopHealthScore: 80,
  humanExecutionRisk: "MEDIUM",
};

function resetMocks() {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  mockDb.ownerConnector.findFirst.mockResolvedValue(activeConnector);
  mockGetCurrentConditionProfile.mockResolvedValue(bcpProfile);
  mockEvaluateConditionProfile.mockResolvedValue({});
}

// ─── ingestIntegrationEvent — validation ─────────────────────────────────────

describe("ingestIntegrationEvent — schema validation", () => {
  beforeEach(resetMocks);

  it("throws ValidationError for invalid event kind", async () => {
    await expect(
      ingestIntegrationEvent({ ...validEvent, kind: "INVALID_KIND" }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for missing workspaceId", async () => {
    await expect(
      ingestIntegrationEvent({ ...validEvent, workspaceId: "" }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for malformed UUID connectorId", async () => {
    await expect(
      ingestIntegrationEvent({ ...validEvent, connectorId: "not-a-uuid" }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid provider", async () => {
    await expect(
      ingestIntegrationEvent({ ...validEvent, provider: "STRIPE" }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for malformed occurredAt", async () => {
    await expect(
      ingestIntegrationEvent({ ...validEvent, occurredAt: "not-a-date" }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("accepts valid event and returns IngestResult", async () => {
    const result = await ingestIntegrationEvent(validEvent, ACTOR);
    expect(result.eventId).toBe(EVENT_ID);
    expect(result.workspaceId).toBe(WS);
    expect(result.kind).toBe("CRM_DEAL_UPDATED");
  });
});

// ─── workspace isolation ──────────────────────────────────────────────────────

describe("ingestIntegrationEvent — workspace isolation", () => {
  beforeEach(resetMocks);

  it("verifies connector belongs to event's workspaceId", async () => {
    await ingestIntegrationEvent(validEvent, ACTOR);
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTOR_ID, workspaceId: WS },
      })
    );
  });

  it("throws NotFoundError when connector not in workspace", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null);
    await expect(ingestIntegrationEvent(validEvent, ACTOR)).rejects.toThrow(NotFoundError);
  });

  it("cross-workspace: connector from WS2 not found in WS1 event", async () => {
    mockDb.ownerConnector.findFirst.mockResolvedValue(null); // WS1 doesn't own connector
    await expect(
      ingestIntegrationEvent({ ...validEvent, workspaceId: WS }, ACTOR)
    ).rejects.toThrow(NotFoundError);
    expect(mockDb.ownerConnector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });
});

// ─── audit events ────────────────────────────────────────────────────────────

describe("ingestIntegrationEvent — audit events", () => {
  beforeEach(resetMocks);

  it("emits INTEGRATION_EVENT_INGESTED for every valid event", async () => {
    await ingestIntegrationEvent(validEvent, ACTOR);
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        actorId: ACTOR,
        eventName: "integration_event.ingested",
        entityId: EVENT_ID,
      })
    );
  });

  it("payload includes provider, kind, connectorId, businessId", async () => {
    await ingestIntegrationEvent(validEvent, ACTOR);
    const call = mockEmitAuditEvent.mock.calls[0][0];
    expect(call.payload).toMatchObject({
      connectorId: CONNECTOR_ID,
      provider: "HUBSPOT",
      kind: "CRM_DEAL_UPDATED",
      businessId: BUSINESS_ID,
    });
  });

  it("emits INTEGRATION_EVENT_INGESTED even when BCP trigger is null (no-business event)", async () => {
    const eventNoBusinessAndNoTrigger = {
      ...validEvent,
      kind: "CONNECTOR_SYNC_COMPLETED", // maps to null
      businessId: null,
    };
    await ingestIntegrationEvent(eventNoBusinessAndNoTrigger, ACTOR);
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "integration_event.ingested" })
    );
  });
});

// ─── BCP trigger mapping ──────────────────────────────────────────────────────

describe("ingestIntegrationEvent — BCP trigger routing", () => {
  beforeEach(resetMocks);

  it("triggers BCP re-evaluation for KPI_CHANGE event (ACCOUNTING_REVENUE_UPDATED)", async () => {
    const result = await ingestIntegrationEvent(
      { ...validEvent, kind: "ACCOUNTING_REVENUE_UPDATED", businessId: BUSINESS_ID },
      ACTOR
    );
    expect(result.bcpTriggered).toBe(true);
    expect(result.bcpTriggerType).toBe("KPI_CHANGE");
  });

  it("does NOT trigger BCP when businessId is null (no business context)", async () => {
    const result = await ingestIntegrationEvent(
      { ...validEvent, businessId: null },
      ACTOR
    );
    expect(result.bcpTriggered).toBe(false);
    expect(result.bcpTriggerType).toBeNull();
  });

  it("does NOT trigger BCP for CONNECTOR_SYNC_COMPLETED (null mapping)", async () => {
    const result = await ingestIntegrationEvent(
      { ...validEvent, kind: "CONNECTOR_SYNC_COMPLETED" },
      ACTOR
    );
    expect(result.bcpTriggered).toBe(false);
    expect(result.bcpTriggerType).toBeNull();
  });

  it("does NOT trigger BCP for COMMUNICATION_CHANNEL_CONNECTED (null mapping)", async () => {
    const result = await ingestIntegrationEvent(
      { ...validEvent, kind: "COMMUNICATION_CHANNEL_CONNECTED" },
      ACTOR
    );
    expect(result.bcpTriggered).toBe(false);
  });

  it("BCP re-evaluation failure does not propagate to ingest caller", async () => {
    mockGetCurrentConditionProfile.mockRejectedValue(new Error("DB connection lost"));
    // Should resolve without throwing
    await expect(
      ingestIntegrationEvent(validEvent, ACTOR)
    ).resolves.toBeDefined();
  });

  it("ingest still returns when evaluateConditionProfile throws", async () => {
    mockEvaluateConditionProfile.mockRejectedValue(new Error("BCP evaluation failed"));
    await expect(ingestIntegrationEvent(validEvent, ACTOR)).resolves.toBeDefined();
  });
});

// ─── IngestResult shape ───────────────────────────────────────────────────────

describe("IngestResult shape", () => {
  beforeEach(resetMocks);

  it("result contains all expected fields", async () => {
    const result = await ingestIntegrationEvent(validEvent, ACTOR);
    expect(result).toMatchObject({
      eventId: EVENT_ID,
      workspaceId: WS,
      connectorId: CONNECTOR_ID,
      provider: "HUBSPOT",
      kind: "CRM_DEAL_UPDATED",
      bcpTriggered: expect.any(Boolean),
      bcpTriggerType: expect.anything(),
    });
  });

  it("result never contains token fields", async () => {
    const result = await ingestIntegrationEvent(validEvent, ACTOR);
    expect("accessToken" in result).toBe(false);
    expect("encryptedAccessToken" in result).toBe(false);
  });

  it("returns correct provider from parsed event", async () => {
    const result = await ingestIntegrationEvent({ ...validEvent, provider: "QUICKBOOKS" }, ACTOR);
    expect(result.provider).toBe("QUICKBOOKS");
  });
});

// ─── Additional event kinds coverage ─────────────────────────────────────────

describe("ingestIntegrationEvent — all trigger-mapping event kinds", () => {
  beforeEach(resetMocks);

  const triggeringKinds = [
    "ACCOUNTING_REVENUE_UPDATED",
    "ACCOUNTING_EXPENSE_UPDATED",
    "ACCOUNTING_PL_SYNCED",
    "CRM_DEAL_UPDATED",
    "CRM_CONTACT_UPDATED",
    "CONNECTOR_SYNC_FAILED",
    "SHEET_DATA_SYNCED",
  ] as const;

  for (const kind of triggeringKinds) {
    it(`${kind} triggers BCP re-evaluation when businessId present`, async () => {
      resetMocks();
      const result = await ingestIntegrationEvent(
        { ...validEvent, kind, businessId: BUSINESS_ID },
        ACTOR
      );
      expect(result.bcpTriggered).toBe(true);
      expect(result.bcpTriggerType).not.toBeNull();
    });
  }
});
