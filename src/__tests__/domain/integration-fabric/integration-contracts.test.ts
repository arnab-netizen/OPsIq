/**
 * Bundle 5.1 — Integration Fabric Contracts tests.
 *
 * Covers: ConnectorPublicDTO token boundary, integration event schema validation,
 * BCP trigger mapping (all event kinds), connector health severity derivation,
 * health issue list building, NoTokenFields type guard, workspace isolation markers.
 */

import { describe, it, expect } from "vitest";
import {
  IntegrationEventSchema,
  mapIntegrationEventToBcpTrigger,
  deriveConnectorHealthSeverity,
  buildConnectorHealthIssues,
  assertNoTokenFields,
  CONNECTOR_PROVIDERS,
  CONNECTOR_STATUSES,
  INTEGRATION_EVENT_KINDS,
  type ConnectorPublicDTO,
  type IntegrationEventKind,
  type ConnectorStatus,
} from "@/domain/integration-fabric/integration-contracts";

// ─── ConnectorPublicDTO token boundary ───────────────────────────────────────

describe("ConnectorPublicDTO token boundary", () => {
  it("DTO object without token fields compiles and passes assertNoTokenFields", () => {
    const dto: ConnectorPublicDTO = {
      id: "conn-1",
      workspaceId: "ws-1",
      provider: "HUBSPOT",
      status: "ACTIVE",
      connectedAt: "2026-01-01T00:00:00Z",
      lastSyncAt: null,
      lastSyncRecords: null,
      tokenExpiresAt: null,
      syncFailureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    // assertNoTokenFields returns the same value — proves type boundary holds
    const safe = assertNoTokenFields(dto);
    expect(safe.id).toBe("conn-1");
  });

  it("DTO has no accessToken key", () => {
    const dto: ConnectorPublicDTO = {
      id: "conn-2",
      workspaceId: "ws-1",
      provider: "QUICKBOOKS",
      status: "ACTIVE",
      connectedAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-07-01T00:00:00Z",
      lastSyncRecords: 100,
      tokenExpiresAt: "2026-08-01T00:00:00Z",
      syncFailureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect("accessToken" in dto).toBe(false);
    expect("refreshToken" in dto).toBe(false);
    expect("encryptedAccessToken" in dto).toBe(false);
  });

  it("all ConnectorPublicDTO fields are present and typed correctly", () => {
    const dto: ConnectorPublicDTO = {
      id: "conn-3",
      workspaceId: "ws-2",
      provider: "SLACK",
      status: "EXPIRED",
      connectedAt: "2026-01-01T00:00:00Z",
      lastSyncAt: "2026-06-01T00:00:00Z",
      lastSyncRecords: 50,
      tokenExpiresAt: "2026-07-01T00:00:00Z",
      syncFailureMessage: "Token refresh failed",
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(dto.provider).toBe("SLACK");
    expect(dto.status).toBe("EXPIRED");
  });
});

// ─── CONNECTOR_PROVIDERS constant ────────────────────────────────────────────

describe("CONNECTOR_PROVIDERS", () => {
  it("contains required providers from bundle-5 spec", () => {
    expect(CONNECTOR_PROVIDERS).toContain("HUBSPOT");
    expect(CONNECTOR_PROVIDERS).toContain("QUICKBOOKS");
    expect(CONNECTOR_PROVIDERS).toContain("GOOGLE_SHEETS");
    expect(CONNECTOR_PROVIDERS).toContain("SLACK");
  });

  it("has at least 4 providers", () => {
    expect(CONNECTOR_PROVIDERS.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── CONNECTOR_STATUSES constant ─────────────────────────────────────────────

describe("CONNECTOR_STATUSES", () => {
  it("includes all lifecycle statuses", () => {
    expect(CONNECTOR_STATUSES).toContain("ACTIVE");
    expect(CONNECTOR_STATUSES).toContain("DISCONNECTED");
    expect(CONNECTOR_STATUSES).toContain("EXPIRED");
    expect(CONNECTOR_STATUSES).toContain("REFRESH_FAILED");
    expect(CONNECTOR_STATUSES).toContain("PENDING_AUTH");
  });
});

// ─── IntegrationEventSchema ───────────────────────────────────────────────────

describe("IntegrationEventSchema", () => {
  const validEvent = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    workspaceId: "ws-abc",
    connectorId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    provider: "HUBSPOT",
    kind: "CRM_DEAL_UPDATED",
    businessId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    payload: { dealId: "d123", amount: 5000 },
    occurredAt: "2026-07-01T12:00:00Z",
  };

  it("parses a valid integration event", () => {
    const result = IntegrationEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it("rejects missing workspaceId", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, workspaceId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid provider", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, provider: "STRIPE" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid event kind", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, kind: "UNKNOWN_EVENT" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed UUID for connectorId", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, connectorId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime for occurredAt", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, occurredAt: "2026-07-01" });
    expect(result.success).toBe(false);
  });

  it("accepts null businessId", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, businessId: null });
    expect(result.success).toBe(true);
  });

  it("accepts missing businessId (optional)", () => {
    const { businessId: _, ...withoutBusiness } = validEvent;
    const result = IntegrationEventSchema.safeParse(withoutBusiness);
    expect(result.success).toBe(true);
  });

  it("rejects missing payload", () => {
    const result = IntegrationEventSchema.safeParse({ ...validEvent, payload: undefined });
    expect(result.success).toBe(false);
  });

  it("accepts all INTEGRATION_EVENT_KINDS", () => {
    for (const kind of INTEGRATION_EVENT_KINDS) {
      const result = IntegrationEventSchema.safeParse({ ...validEvent, kind });
      expect(result.success, `kind=${kind} should be valid`).toBe(true);
    }
  });
});

// ─── mapIntegrationEventToBcpTrigger ─────────────────────────────────────────

describe("mapIntegrationEventToBcpTrigger", () => {
  it("maps ACCOUNTING_REVENUE_UPDATED → KPI_CHANGE", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_REVENUE_UPDATED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("KPI_CHANGE");
  });

  it("maps ACCOUNTING_EXPENSE_UPDATED → KPI_CHANGE", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_EXPENSE_UPDATED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("KPI_CHANGE");
  });

  it("maps ACCOUNTING_PL_SYNCED → KPI_CHANGE", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_PL_SYNCED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("KPI_CHANGE");
  });

  it("maps CRM_DEAL_UPDATED → EVIDENCE_UPDATE", () => {
    const result = mapIntegrationEventToBcpTrigger("CRM_DEAL_UPDATED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("EVIDENCE_UPDATE");
  });

  it("maps CRM_CONTACT_UPDATED → EVIDENCE_UPDATE", () => {
    const result = mapIntegrationEventToBcpTrigger("CRM_CONTACT_UPDATED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("EVIDENCE_UPDATE");
  });

  it("maps CONNECTOR_SYNC_FAILED → BLOCKER_EVENT", () => {
    const result = mapIntegrationEventToBcpTrigger("CONNECTOR_SYNC_FAILED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("BLOCKER_EVENT");
  });

  it("maps SHEET_DATA_SYNCED → EVIDENCE_UPDATE", () => {
    const result = mapIntegrationEventToBcpTrigger("SHEET_DATA_SYNCED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("EVIDENCE_UPDATE");
  });

  it("returns null for COMMUNICATION_CHANNEL_CONNECTED (no BCP relevance)", () => {
    expect(mapIntegrationEventToBcpTrigger("COMMUNICATION_CHANNEL_CONNECTED")).toBeNull();
  });

  it("returns null for COMMUNICATION_CHANNEL_DISCONNECTED (no BCP relevance)", () => {
    expect(mapIntegrationEventToBcpTrigger("COMMUNICATION_CHANNEL_DISCONNECTED")).toBeNull();
  });

  it("returns null for CONNECTOR_SYNC_COMPLETED (no BCP relevance)", () => {
    expect(mapIntegrationEventToBcpTrigger("CONNECTOR_SYNC_COMPLETED")).toBeNull();
  });

  it("trigger descriptions are non-empty strings for all mapped events", () => {
    const mappedKinds: IntegrationEventKind[] = [
      "ACCOUNTING_REVENUE_UPDATED",
      "ACCOUNTING_EXPENSE_UPDATED",
      "ACCOUNTING_PL_SYNCED",
      "CRM_DEAL_UPDATED",
      "CRM_CONTACT_UPDATED",
      "CONNECTOR_SYNC_FAILED",
      "SHEET_DATA_SYNCED",
    ];
    for (const kind of mappedKinds) {
      const result = mapIntegrationEventToBcpTrigger(kind);
      expect(result?.triggerDescription.length, `description missing for ${kind}`).toBeGreaterThan(0);
    }
  });
});

// ─── deriveConnectorHealthSeverity ───────────────────────────────────────────

describe("deriveConnectorHealthSeverity", () => {
  it("returns CRITICAL for DISCONNECTED status", () => {
    expect(deriveConnectorHealthSeverity("DISCONNECTED", null, null)).toBe("CRITICAL");
  });

  it("returns CRITICAL for REFRESH_FAILED status", () => {
    expect(deriveConnectorHealthSeverity("REFRESH_FAILED", null, null)).toBe("CRITICAL");
  });

  it("returns WARNING for EXPIRED status", () => {
    expect(deriveConnectorHealthSeverity("EXPIRED", null, null)).toBe("WARNING");
  });

  it("returns WARNING when syncFailureMessage is present", () => {
    expect(deriveConnectorHealthSeverity("ACTIVE", new Date(), "Sync error")).toBe("WARNING");
  });

  it("returns WARNING when last sync > 24h ago", () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(deriveConnectorHealthSeverity("ACTIVE", staleDate, null)).toBe("WARNING");
  });

  it("returns OK for ACTIVE with recent sync", () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(deriveConnectorHealthSeverity("ACTIVE", recentDate, null)).toBe("OK");
  });

  it("returns OK for ACTIVE with no sync yet (no error)", () => {
    expect(deriveConnectorHealthSeverity("ACTIVE", null, null)).toBe("OK");
  });
});

// ─── buildConnectorHealthIssues ───────────────────────────────────────────────

describe("buildConnectorHealthIssues", () => {
  it("returns NOT_CONNECTED issue for PENDING_AUTH status", () => {
    const issues = buildConnectorHealthIssues("PENDING_AUTH", null, null, null);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("NOT_CONNECTED");
  });

  it("returns REFRESH_FAILED issue for REFRESH_FAILED status", () => {
    const issues = buildConnectorHealthIssues("REFRESH_FAILED", null, null, null);
    expect(issues.some((i) => i.code === "REFRESH_FAILED")).toBe(true);
  });

  it("returns TOKEN_EXPIRED issue for EXPIRED status", () => {
    const issues = buildConnectorHealthIssues("EXPIRED", null, null, null);
    expect(issues.some((i) => i.code === "TOKEN_EXPIRED")).toBe(true);
  });

  it("returns TOKEN_EXPIRED issue when tokenExpiresAt is in the past", () => {
    const expiredDate = new Date(Date.now() - 1000);
    const issues = buildConnectorHealthIssues("ACTIVE", null, null, expiredDate);
    expect(issues.some((i) => i.code === "TOKEN_EXPIRED")).toBe(true);
  });

  it("returns SYNC_ERROR issue when syncFailureMessage is present", () => {
    const issues = buildConnectorHealthIssues("ACTIVE", new Date(), "Connection timeout", null);
    expect(issues.some((i) => i.code === "SYNC_ERROR")).toBe(true);
  });

  it("returns SYNC_STALE issue when last sync > 24h ago", () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const issues = buildConnectorHealthIssues("ACTIVE", staleDate, null, null);
    expect(issues.some((i) => i.code === "SYNC_STALE")).toBe(true);
  });

  it("returns empty issues for healthy ACTIVE connector", () => {
    const recentDate = new Date(Date.now() - 30 * 60 * 1000);
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const issues = buildConnectorHealthIssues("ACTIVE", recentDate, null, futureExpiry);
    expect(issues).toHaveLength(0);
  });

  it("can accumulate multiple issues (stale + error)", () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const issues = buildConnectorHealthIssues("ACTIVE", staleDate, "Quota exceeded", null);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("all issue messages are non-empty strings", () => {
    const expiredDate = new Date(Date.now() - 1000);
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const issues = buildConnectorHealthIssues("EXPIRED", staleDate, "Error", expiredDate);
    for (const issue of issues) {
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });
});

// ─── Workspace isolation (contract-level checks) ──────────────────────────────

describe("workspace isolation markers", () => {
  it("ConnectorPublicDTO always carries workspaceId", () => {
    const dto: ConnectorPublicDTO = {
      id: "c1",
      workspaceId: "ws-isolated",
      provider: "HUBSPOT",
      status: "ACTIVE",
      connectedAt: "2026-01-01T00:00:00Z",
      lastSyncAt: null,
      lastSyncRecords: null,
      tokenExpiresAt: null,
      syncFailureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(dto.workspaceId).toBe("ws-isolated");
  });

  it("IntegrationEventSchema requires workspaceId (not nullable)", () => {
    const result = IntegrationEventSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000001",
      workspaceId: null,
      connectorId: "00000000-0000-0000-0000-000000000002",
      provider: "HUBSPOT",
      kind: "CRM_DEAL_UPDATED",
      payload: {},
      occurredAt: "2026-07-01T12:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("two events with different workspaceIds are typed identically (no cross-workspace bleed in contract)", () => {
    const e1 = { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", workspaceId: "ws-A", connectorId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22", provider: "HUBSPOT" as const, kind: "CRM_DEAL_UPDATED" as const, payload: {}, occurredAt: "2026-07-01T12:00:00Z" };
    const e2 = { ...e1, workspaceId: "ws-B" };
    expect(IntegrationEventSchema.parse(e1).workspaceId).toBe("ws-A");
    expect(IntegrationEventSchema.parse(e2).workspaceId).toBe("ws-B");
  });
});
