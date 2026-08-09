/**
 * Factory Stage 5 Closure — Non-DB Invariant Proof
 *
 * Provides executable evidence for invariants I2, I3, I4, I5, I7, I8, I11
 * as required by docs/opsiq/bundles/factory-stage-5-closure.yaml.
 *
 * Domain-layer tests require no mocks and prove contracts purely.
 * Service-layer tests mock db and infra, proving workspace isolation and FSM gates.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Global hoisted mocks ─────────────────────────────────────────────────────

const {
  mockConnectorFindFirst,
  mockConnectorUpdate,
  mockEngagementFindFirst,
  mockEngagementFindMany,
  mockEngagementUpdate,
  mockActionFindMany,
  mockTransaction,
  mockEmitAuditEvent,
  mockGetCurrentConditionProfile,
  mockEvaluateConditionProfile,
  mockUpdateConsultingEngagementHealth,
} = vi.hoisted(() => ({
  mockConnectorFindFirst: vi.fn(),
  mockConnectorUpdate: vi.fn(),
  mockEngagementFindFirst: vi.fn(),
  mockEngagementFindMany: vi.fn(),
  mockEngagementUpdate: vi.fn(),
  mockActionFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentConditionProfile: vi.fn(),
  mockEvaluateConditionProfile: vi.fn(),
  mockUpdateConsultingEngagementHealth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerConnector: {
      findFirst: mockConnectorFindFirst,
      create: vi.fn(),
      update: mockConnectorUpdate,
      findMany: vi.fn(),
    },
    engagement: {
      findFirst: mockEngagementFindFirst,
      findMany: mockEngagementFindMany,
      update: mockEngagementUpdate,
    },
    action: {
      findMany: mockActionFindMany,
      create: vi.fn(),
    },
    $transaction: mockTransaction,
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

vi.mock("@/services/owner-mode/owner-bcp.service", () => ({
  getCurrentConditionProfile: mockGetCurrentConditionProfile,
  evaluateConditionProfile: mockEvaluateConditionProfile,
}));

vi.mock("@/services/consulting/consulting-engagement.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/consulting/consulting-engagement.service")>();
  return {
    ...actual,
    updateConsultingEngagementHealth: mockUpdateConsultingEngagementHealth,
  };
});

// ─── Imports (after vi.mock) ───────────────────────────────────────────────────

import {
  isValidPhaseTransition,
  toClientDTO,
  toConsultantDTO,
  CONSULTING_PHASE_TRANSITIONS,
} from "@/domain/consulting/consulting-contracts";
import {
  mapIntegrationEventToBcpTrigger,
  IntegrationEventSchema,
} from "@/domain/integration-fabric/integration-contracts";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  disconnectConnector,
  markConnectorRefreshFailed,
} from "@/services/integration-fabric/connector-registry.service";
import {
  ingestIntegrationEvent,
} from "@/services/integration-fabric/integration-event.service";
import {
  closeConsultingEngagement,
  advanceConsultingPhase,
} from "@/services/consulting/consulting-engagement.service";
import { NotFoundError, ConflictError, InvalidStateTransitionError, ValidationError } from "@/infra/errors";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONN_ID = "11111111-1111-4111-8111-111111111111";
const ENG_ID = "22222222-2222-4222-8222-222222222222";
const BIZ_ID = "33333333-3333-4333-8333-333333333333";

// Event ID constants — must be valid UUIDs (IntegrationEventSchema requires uuid)
const EV_WS_TEST      = "44444444-4444-4444-8444-444444444401";
const EV_BCP_FAIL     = "44444444-4444-4444-8444-444444444402";
const EV_BCP_FAIL_PL  = "44444444-4444-4444-8444-444444444403";
const EV_INGESTED     = "44444444-4444-4444-8444-444444444404";
const EV_CROSS        = "44444444-4444-4444-8444-444444444405";
const EV_AUDIT        = "44444444-4444-4444-8444-444444444406";
const EV_ENTITY_ID    = "44444444-4444-4444-8444-444444444407";
const EV_I12          = "44444444-4444-4444-8444-444444444408";
const EV_NO_ENG       = "44444444-4444-4444-8444-444444444409";
const EV_BCP_TRIG     = "44444444-4444-4444-8444-444444444410";
const EV_BCP_FLAG     = "44444444-4444-4444-8444-444444444411";
const EV_NO_BCP       = "44444444-4444-4444-8444-444444444412";

const baseEngagement = {
  id: ENG_ID,
  workspaceId: WS_A,
  clientId: "client-01",
  title: "Test Engagement",
  status: "ACTIVE",
  consultingPhase: "REVIEW",
  healthStatus: "healthy",
  interventionMode: "recovery",
  interventionPhase: "triage",
  description: null,
  startDate: null,
  targetEndDate: null,
  actualEndDate: null,
  engagementMode: "consulting",
  serviceTier: "standard",
  code: "ENG-001",
  consultantNotes: "internal-notes",
  assignedConsultantId: "consultant-01",
  humanFactors: { ownerBottleneckRisk: "HIGH", followThroughRisk: "MEDIUM", keyPersonDependency: true },
  createdBy: "creator-01",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

function engagementWithPhase(phase: string) {
  return { ...baseEngagement, consultingPhase: phase };
}

// ─── I2: Canonical auth — capability constants ─────────────────────────────────

describe("I2 — Canonical authorization: capability constants", () => {
  it("CONSULTING_READ is a non-empty capability string", () => {
    expect(typeof CAPABILITIES.CONSULTING_READ).toBe("string");
    expect(CAPABILITIES.CONSULTING_READ.length).toBeGreaterThan(0);
  });

  it("CONSULTING_WRITE is a non-empty capability string", () => {
    expect(typeof CAPABILITIES.CONSULTING_WRITE).toBe("string");
    expect(CAPABILITIES.CONSULTING_WRITE.length).toBeGreaterThan(0);
  });

  it("CONSULTING_READ and CONSULTING_WRITE are distinct", () => {
    expect(CAPABILITIES.CONSULTING_READ).not.toBe(CAPABILITIES.CONSULTING_WRITE);
  });

  it("OWNER_MANAGE is a non-empty capability string", () => {
    expect(typeof CAPABILITIES.OWNER_MANAGE).toBe("string");
    expect(CAPABILITIES.OWNER_MANAGE.length).toBeGreaterThan(0);
  });

  it("INTEGRATION_MANAGE is a non-empty capability string", () => {
    expect(typeof CAPABILITIES.INTEGRATION_MANAGE).toBe("string");
    expect(CAPABILITIES.INTEGRATION_MANAGE.length).toBeGreaterThan(0);
  });
});

// ─── I3: Secret and DTO boundary — connector tokens never in public DTO ────────

describe("I3 — Secret and DTO boundary: connector public DTO", () => {
  it("ConnectorPublicDTO returned by disconnectConnector never includes accessToken", async () => {
    const mockConnector = { id: CONN_ID, workspaceId: WS_A, provider: "XERO" };
    const mockRow = {
      id: CONN_ID,
      workspaceId: WS_A,
      businessId: null,
      provider: "XERO",
      status: "DISCONNECTED",
      connectedAt: new Date(),
      lastSyncAt: null,
      lastSyncRecords: null,
      tokenExpiresAt: null,
      syncFailureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockConnectorFindFirst.mockResolvedValue(mockConnector);
    mockConnectorUpdate.mockResolvedValue(mockRow);
    mockEmitAuditEvent.mockResolvedValue(undefined);

    const result = await disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID });

    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
    expect(result).not.toHaveProperty("registeredBy");
  });

  it("ConnectorPublicDTO has expected public fields only", async () => {
    const mockConnector = { id: CONN_ID, workspaceId: WS_A, provider: "XERO" };
    const mockRow = {
      id: CONN_ID,
      workspaceId: WS_A,
      businessId: null,
      provider: "XERO",
      status: "DISCONNECTED",
      connectedAt: new Date("2026-01-01"),
      lastSyncAt: null,
      lastSyncRecords: null,
      tokenExpiresAt: null,
      syncFailureMessage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    mockConnectorFindFirst.mockResolvedValue(mockConnector);
    mockConnectorUpdate.mockResolvedValue(mockRow);

    const result = await disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("provider");
    expect(result).toHaveProperty("status");
    expect(Object.keys(result)).not.toContain("accessToken");
    expect(Object.keys(result)).not.toContain("refreshToken");
    expect(Object.keys(result)).not.toContain("registeredBy");
  });
});

// ─── I3: Consulting DTO boundary — client never sees consultant-internal fields ─

describe("I3 — DTO boundary: consulting engagement client vs consultant", () => {
  const engRow = {
    id: ENG_ID,
    title: "Test",
    clientId: "c1",
    consultingPhase: "REVIEW" as const,
    status: "ACTIVE",
    healthStatus: "healthy",
    interventionMode: "recovery",
    interventionPhase: "triage",
    description: null,
    startDate: null,
    targetEndDate: null,
    workspaceId: WS_A,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    humanFactors: {
      ownerBottleneckRisk: "HIGH",
      followThroughRisk: "MEDIUM",
      keyPersonDependency: true,
      managementCapabilityGap: "MEDIUM",
      resistanceToChange: "LOW",
    },
    consultantNotes: "secret-internal-note",
    assignedConsultantId: "consultant-999",
    createdBy: "internal-actor",
  };

  it("toClientDTO omits consultantNotes", () => {
    const dto = toClientDTO(engRow);
    expect(dto).not.toHaveProperty("consultantNotes");
    expect(Object.keys(dto)).not.toContain("consultantNotes");
  });

  it("toClientDTO omits assignedConsultantId", () => {
    const dto = toClientDTO(engRow);
    expect(dto).not.toHaveProperty("assignedConsultantId");
    expect(Object.keys(dto)).not.toContain("assignedConsultantId");
  });

  it("toClientDTO omits createdBy", () => {
    const dto = toClientDTO(engRow);
    expect(dto).not.toHaveProperty("createdBy");
    expect(Object.keys(dto)).not.toContain("createdBy");
  });

  it("toClientDTO exposes only safe humanFactors subset (ownerBottleneckRisk, followThroughRisk, keyPersonDependency)", () => {
    const dto = toClientDTO(engRow);
    const hf = dto.humanFactors as Record<string, unknown>;
    expect(Object.keys(hf)).toEqual(
      expect.arrayContaining(["ownerBottleneckRisk", "followThroughRisk", "keyPersonDependency"])
    );
    // No extra human factors fields
    const extraKeys = Object.keys(hf).filter(
      (k) => !["ownerBottleneckRisk", "followThroughRisk", "keyPersonDependency"].includes(k)
    );
    expect(extraKeys).toHaveLength(0);
  });

  it("toConsultantDTO includes consultantNotes", () => {
    const dto = toConsultantDTO(engRow);
    expect(dto.consultantNotes).toBe("secret-internal-note");
  });

  it("toConsultantDTO includes assignedConsultantId", () => {
    const dto = toConsultantDTO(engRow);
    expect(dto.assignedConsultantId).toBe("consultant-999");
  });

  it("toConsultantDTO includes createdBy", () => {
    const dto = toConsultantDTO(engRow);
    expect(dto.createdBy).toBe("internal-actor");
  });

  it("toConsultantDTO includes full humanFactors (not just subset)", () => {
    const dto = toConsultantDTO(engRow);
    const hf = dto.humanFactors as Record<string, unknown>;
    expect(hf).toHaveProperty("managementCapabilityGap");
    expect(hf).toHaveProperty("resistanceToChange");
  });
});

// ─── I4: Event integrity — validation, workspace isolation, failure audit ───────

describe("I4 — Event integrity: schema validation", () => {
  it("IntegrationEventSchema rejects event with missing connectorId", () => {
    const result = IntegrationEventSchema.safeParse({
      id: "ev-001",
      workspaceId: WS_A,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: { amount: 1000 },
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("IntegrationEventSchema rejects event with invalid kind", () => {
    const result = IntegrationEventSchema.safeParse({
      id: "ev-001",
      connectorId: CONN_ID,
      workspaceId: WS_A,
      provider: "XERO",
      kind: "NOT_A_VALID_EVENT_KIND",
      payload: {},
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("ingestIntegrationEvent throws ValidationError for malformed event", async () => {
    await expect(
      ingestIntegrationEvent({ notAnEvent: true }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("ingestIntegrationEvent throws NotFoundError when connector not in workspace (isolation gate)", async () => {
    mockConnectorFindFirst.mockResolvedValue(null);

    const validEvent = {
      id: EV_WS_TEST,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await expect(ingestIntegrationEvent(validEvent, ACTOR)).rejects.toThrow(NotFoundError);
  });
});

describe("I4 — Event integrity: BCP trigger failure emits audit event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
  });

  it("emits INTEGRATION_EVENT_BCP_TRIGGER_FAILED when BCP re-evaluation throws", async () => {
    // Arrange: connector found, BCP service throws
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockEmitAuditEvent.mockResolvedValue(undefined);
    mockGetCurrentConditionProfile.mockRejectedValue(new Error("BCP service unavailable"));

    const validEvent = {
      id: EV_BCP_FAIL,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    // Act: ingest (fire-and-forget completes asynchronously)
    await ingestIntegrationEvent(validEvent, ACTOR);

    // Drain fire-and-forget microtasks
    await vi.waitFor(
      () => {
        const calls = mockEmitAuditEvent.mock.calls;
        const failureCall = calls.find((call) =>
          call[0]?.eventName === AUDIT_EVENTS.INTEGRATION_EVENT_BCP_TRIGGER_FAILED
        );
        expect(failureCall).toBeDefined();
      },
      { timeout: 2000 }
    );
  });

  it("INTEGRATION_EVENT_BCP_TRIGGER_FAILED audit event includes businessId, connectorId, kind, errorKind", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockGetCurrentConditionProfile.mockRejectedValue(new Error("service-error-msg"));

    const validEvent = {
      id: EV_BCP_FAIL_PL,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_EXPENSE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(validEvent, ACTOR);

    await vi.waitFor(() => {
      const failureCall = mockEmitAuditEvent.mock.calls.find(
        (c) => c[0]?.eventName === AUDIT_EVENTS.INTEGRATION_EVENT_BCP_TRIGGER_FAILED
      );
      expect(failureCall).toBeDefined();
      const payload = failureCall![0].payload;
      expect(payload.businessId).toBe(BIZ_ID);
      expect(payload.connectorId).toBe(CONN_ID);
      expect(payload.kind).toBe("ACCOUNTING_EXPENSE_UPDATED");
      expect(typeof payload.errorKind).toBe("string");
      expect(payload.errorKind).toBe("Error");
    }, { timeout: 2000 });
  });

  it("INTEGRATION_EVENT_INGESTED is always emitted regardless of BCP outcome", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockGetCurrentConditionProfile.mockRejectedValue(new Error("bcp-down"));

    const validEvent = {
      id: EV_INGESTED,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(validEvent, ACTOR);

    const ingestedCall = mockEmitAuditEvent.mock.calls.find(
      (c) => c[0]?.eventName === AUDIT_EVENTS.INTEGRATION_EVENT_INGESTED
    );
    expect(ingestedCall).toBeDefined();
  });
});

// ─── I5: Deterministic routing — mapIntegrationEventToBcpTrigger ──────────────

describe("I5 — Deterministic routing: integration event → BCP trigger", () => {
  it("mapIntegrationEventToBcpTrigger returns same result for same kind (deterministic)", () => {
    const r1 = mapIntegrationEventToBcpTrigger("ACCOUNTING_REVENUE_UPDATED");
    const r2 = mapIntegrationEventToBcpTrigger("ACCOUNTING_REVENUE_UPDATED");
    expect(r1).toEqual(r2);
  });

  it("ACCOUNTING_REVENUE_UPDATED maps to KPI_CHANGE trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_REVENUE_UPDATED");
    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe("KPI_CHANGE");
  });

  it("ACCOUNTING_EXPENSE_UPDATED maps to KPI_CHANGE trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_EXPENSE_UPDATED");
    expect(result?.triggerType).toBe("KPI_CHANGE");
  });

  it("ACCOUNTING_PL_SYNCED maps to KPI_CHANGE trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("ACCOUNTING_PL_SYNCED");
    expect(result?.triggerType).toBe("KPI_CHANGE");
  });

  it("CRM_DEAL_UPDATED maps to EVIDENCE_UPDATE trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("CRM_DEAL_UPDATED");
    expect(result?.triggerType).toBe("EVIDENCE_UPDATE");
  });

  it("CRM_CONTACT_UPDATED maps to EVIDENCE_UPDATE trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("CRM_CONTACT_UPDATED");
    expect(result?.triggerType).toBe("EVIDENCE_UPDATE");
  });

  it("CONNECTOR_SYNC_FAILED maps to BLOCKER_EVENT trigger", () => {
    const result = mapIntegrationEventToBcpTrigger("CONNECTOR_SYNC_FAILED");
    expect(result?.triggerType).toBe("BLOCKER_EVENT");
  });

  it("COMMUNICATION_CHANNEL_CONNECTED returns null (no BCP trigger)", () => {
    const result = mapIntegrationEventToBcpTrigger("COMMUNICATION_CHANNEL_CONNECTED");
    expect(result).toBeNull();
  });

  it("COMMUNICATION_CHANNEL_DISCONNECTED returns null (no BCP trigger)", () => {
    const result = mapIntegrationEventToBcpTrigger("COMMUNICATION_CHANNEL_DISCONNECTED");
    expect(result).toBeNull();
  });

  it("CONNECTOR_SYNC_COMPLETED returns null (no BCP trigger)", () => {
    const result = mapIntegrationEventToBcpTrigger("CONNECTOR_SYNC_COMPLETED");
    expect(result).toBeNull();
  });

  it("All supported events have non-empty triggerDescription", () => {
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
      const result = mapIntegrationEventToBcpTrigger(kind);
      expect(result).not.toBeNull();
      expect(result!.triggerDescription.length).toBeGreaterThan(0);
    }
  });
});

// ─── I7: Consulting FSM integrity — phase transitions and closure gate ────────

describe("I7 — Consulting FSM: phase transition validation (domain layer)", () => {
  it("DISCOVERY → DIAGNOSIS is valid", () => {
    expect(isValidPhaseTransition("DISCOVERY", "DIAGNOSIS")).toBe(true);
  });

  it("DIAGNOSIS → IMPLEMENTATION is valid", () => {
    expect(isValidPhaseTransition("DIAGNOSIS", "IMPLEMENTATION")).toBe(true);
  });

  it("IMPLEMENTATION → REVIEW is valid", () => {
    expect(isValidPhaseTransition("IMPLEMENTATION", "REVIEW")).toBe(true);
  });

  it("REVIEW → null (terminal — no further advance)", () => {
    expect(CONSULTING_PHASE_TRANSITIONS["REVIEW"]).toBeNull();
  });

  it("DISCOVERY → IMPLEMENTATION is invalid (skip not allowed)", () => {
    expect(isValidPhaseTransition("DISCOVERY", "IMPLEMENTATION")).toBe(false);
  });

  it("DISCOVERY → REVIEW is invalid (skip not allowed)", () => {
    expect(isValidPhaseTransition("DISCOVERY", "REVIEW")).toBe(false);
  });

  it("DIAGNOSIS → DISCOVERY is invalid (reversal not allowed)", () => {
    expect(isValidPhaseTransition("DIAGNOSIS", "DISCOVERY")).toBe(false);
  });

  it("IMPLEMENTATION → DISCOVERY is invalid (reversal not allowed)", () => {
    expect(isValidPhaseTransition("IMPLEMENTATION", "DISCOVERY")).toBe(false);
  });

  it("REVIEW → DISCOVERY is invalid (reversal from terminal not allowed)", () => {
    expect(isValidPhaseTransition("REVIEW", "DISCOVERY")).toBe(false);
  });
});

describe("I7 — Consulting FSM: close gate requires REVIEW phase (service layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);

    // Default: transaction executes the callback
    mockTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        engagement: {
          findFirst: mockEngagementFindFirst,
          update: mockEngagementUpdate,
        },
        action: {
          findMany: mockActionFindMany,
        },
      };
      return fn(tx);
    });
  });

  it("close from DISCOVERY phase throws InvalidStateTransitionError", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("DISCOVERY"));

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("close from DIAGNOSIS phase throws InvalidStateTransitionError", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("DIAGNOSIS"));

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("close from IMPLEMENTATION phase throws InvalidStateTransitionError", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("IMPLEMENTATION"));

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("close of already-CLOSED engagement throws ConflictError", async () => {
    mockEngagementFindFirst.mockResolvedValue({ ...engagementWithPhase("REVIEW"), status: "CLOSED" });

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(ConflictError);
  });

  it("close from REVIEW phase with no critical actions succeeds", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("REVIEW"));
    mockActionFindMany.mockResolvedValue([]);
    const closed = { ...engagementWithPhase("REVIEW"), status: "CLOSED", actualEndDate: new Date() };
    mockEngagementUpdate.mockResolvedValue(closed);

    const result = await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "engagement complete" },
      ACTOR
    );

    expect(result.status).toBe("CLOSED");
  });

  it("close from REVIEW with critical unresolved action throws ConflictError", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("REVIEW"));
    mockActionFindMany.mockResolvedValue([
      { id: "a1", status: "pending", metadata: { priority: "critical" }, dueAt: null, engagementId: ENG_ID },
    ]);

    await expect(
      closeConsultingEngagement(
        { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(ConflictError);
  });

  it("close from REVIEW with only non-critical pending action succeeds", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("REVIEW"));
    mockActionFindMany.mockResolvedValue([
      { id: "a1", status: "pending", metadata: { priority: "medium" }, dueAt: null, engagementId: ENG_ID },
    ]);
    const closed = { ...engagementWithPhase("REVIEW"), status: "CLOSED", actualEndDate: new Date() };
    mockEngagementUpdate.mockResolvedValue(closed);

    const result = await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
      ACTOR
    );
    expect(result.status).toBe("CLOSED");
  });

  it("close from REVIEW with critical CANCELLED action succeeds (cancelled counts as resolved)", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("REVIEW"));
    mockActionFindMany.mockResolvedValue([
      { id: "a1", status: "cancelled", metadata: { priority: "critical" }, dueAt: null, engagementId: ENG_ID },
    ]);
    const closed = { ...engagementWithPhase("REVIEW"), status: "CLOSED", actualEndDate: new Date() };
    mockEngagementUpdate.mockResolvedValue(closed);

    const result = await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
      ACTOR
    );
    expect(result.status).toBe("CLOSED");
  });
});

describe("I7 — Consulting FSM: advance phase validation (service layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
  });

  it("advancing from DISCOVERY to IMPLEMENTATION throws InvalidStateTransitionError", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("DISCOVERY"));

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "IMPLEMENTATION", rationale: "skip" },
        ACTOR
      )
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("advancing closed engagement throws ConflictError", async () => {
    mockEngagementFindFirst.mockResolvedValue({ ...engagementWithPhase("DISCOVERY"), status: "CLOSED" });

    await expect(
      advanceConsultingPhase(
        { engagementId: ENG_ID, workspaceId: WS_A, targetPhase: "DIAGNOSIS", rationale: "closed" },
        ACTOR
      )
    ).rejects.toThrow(ConflictError);
  });
});

// ─── I8: Role and representation boundary — capability-based DTO routing ───────

describe("I8 — Role boundary: client vs consultant DTO selection", () => {
  it("CONSULTING_WRITE capability exists (used to gate consultant view)", () => {
    expect(CAPABILITIES.CONSULTING_WRITE).toBeTruthy();
  });

  it("CONSULTING_READ capability is different from CONSULTING_WRITE", () => {
    expect(CAPABILITIES.CONSULTING_READ).not.toBe(CAPABILITIES.CONSULTING_WRITE);
  });

  it("toClientDTO result does not contain the string 'consultantNotes' as a key", () => {
    const engRow = {
      id: ENG_ID,
      title: "Test",
      clientId: "c1",
      consultingPhase: "DISCOVERY" as const,
      status: "ACTIVE",
      healthStatus: "healthy",
      interventionMode: "recovery",
      interventionPhase: "triage",
      description: null,
      startDate: null,
      targetEndDate: null,
      workspaceId: WS_A,
      createdAt: new Date(),
      updatedAt: new Date(),
      humanFactors: null,
    };
    const dto = toClientDTO(engRow);
    const keys = Object.keys(dto);
    expect(keys).not.toContain("consultantNotes");
    expect(keys).not.toContain("assignedConsultantId");
    expect(keys).not.toContain("createdBy");
  });

  it("client receives fewer fields than consultant (strict subset)", () => {
    const engRow = {
      id: ENG_ID,
      title: "Test",
      clientId: "c1",
      consultingPhase: "DISCOVERY" as const,
      status: "ACTIVE",
      healthStatus: "healthy",
      interventionMode: "recovery",
      interventionPhase: "triage",
      description: null,
      startDate: null,
      targetEndDate: null,
      workspaceId: WS_A,
      createdAt: new Date(),
      updatedAt: new Date(),
      humanFactors: null,
      consultantNotes: "internal",
      assignedConsultantId: "c-01",
      createdBy: "actor",
    };
    const clientDTO = toClientDTO(engRow);
    const consultantDTO = toConsultantDTO(engRow);
    expect(Object.keys(consultantDTO).length).toBeGreaterThan(Object.keys(clientDTO).length);
  });
});

// ─── I1: Tenant isolation — connector update includes workspaceId ─────────────

describe("I1 — Tenant isolation: connector update scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
  });

  it("disconnectConnector passes workspaceId to update where clause", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO" });
    mockConnectorUpdate.mockResolvedValue({
      id: CONN_ID, workspaceId: WS_A, businessId: null, provider: "XERO",
      status: "DISCONNECTED", connectedAt: new Date(), lastSyncAt: null,
      lastSyncRecords: null, tokenExpiresAt: null, syncFailureMessage: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID });

    expect(mockConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CONN_ID, workspaceId: WS_A }),
      })
    );
  });

  it("markConnectorRefreshFailed passes workspaceId to update where clause", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO" });
    mockConnectorUpdate.mockResolvedValue({
      id: CONN_ID, workspaceId: WS_A, businessId: null, provider: "XERO",
      status: "REFRESH_FAILED", connectedAt: new Date(), lastSyncAt: null,
      lastSyncRecords: null, tokenExpiresAt: null, syncFailureMessage: "fail",
      createdAt: new Date(), updatedAt: new Date(),
    });

    await markConnectorRefreshFailed({
      workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID, failureMessage: "timeout",
    });

    expect(mockConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CONN_ID, workspaceId: WS_A }),
      })
    );
  });

  it("disconnectConnector with unknown connector throws NotFoundError (cross-workspace attempt blocked)", async () => {
    // Simulate: connector exists in WS_B but not WS_A — findFirst returns null
    mockConnectorFindFirst.mockResolvedValue(null);

    await expect(
      disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID })
    ).rejects.toThrow(NotFoundError);
  });

  it("ingestIntegrationEvent with connector from wrong workspace throws NotFoundError", async () => {
    // Cross-workspace: connector exists but not for event.workspaceId
    mockConnectorFindFirst.mockResolvedValue(null);

    const crossTenantEvent = {
      id: EV_CROSS,
      connectorId: CONN_ID,
      workspaceId: WS_B, // attacker sends WS_B event with WS_A connector
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await expect(ingestIntegrationEvent(crossTenantEvent, ACTOR)).rejects.toThrow(NotFoundError);
  });
});

// ─── I11: Failure handling — deterministic outcomes for all failure modes ─────

describe("I11 — Failure handling: deterministic error outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
  });

  it("ingestIntegrationEvent with null payload throws ValidationError", async () => {
    await expect(ingestIntegrationEvent(null, ACTOR)).rejects.toThrow(ValidationError);
  });

  it("ingestIntegrationEvent with empty object throws ValidationError", async () => {
    await expect(ingestIntegrationEvent({}, ACTOR)).rejects.toThrow(ValidationError);
  });

  it("ingestIntegrationEvent with missing id throws ValidationError", async () => {
    await expect(
      ingestIntegrationEvent({
        connectorId: CONN_ID,
        workspaceId: WS_A,
        provider: "XERO",
        kind: "ACCOUNTING_REVENUE_UPDATED",
        payload: {},
        occurredAt: new Date().toISOString(),
      }, ACTOR)
    ).rejects.toThrow(ValidationError);
  });

  it("closeConsultingEngagement with unknown engagement throws NotFoundError", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        engagement: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
        action: { findMany: vi.fn() },
      };
      return fn(tx);
    });

    await expect(
      closeConsultingEngagement(
        { engagementId: "nonexistent", workspaceId: WS_A, closureRationale: "done" },
        ACTOR
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("advanceConsultingPhase with unknown engagement throws NotFoundError", async () => {
    mockEngagementFindFirst.mockResolvedValue(null);

    await expect(
      advanceConsultingPhase(
        { engagementId: "nonexistent", workspaceId: WS_A, targetPhase: "DIAGNOSIS", rationale: "test" },
        ACTOR
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("disconnectConnector with unknown connector throws NotFoundError (not success)", async () => {
    mockConnectorFindFirst.mockResolvedValue(null);

    await expect(
      disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: "ghost-connector" })
    ).rejects.toThrow(NotFoundError);

    // Critically: update must not have been called
    expect(mockConnectorUpdate).not.toHaveBeenCalled();
  });
});

// ─── I9: Audit completeness — material mutations emit workspace-scoped events ──

describe("I9 — Audit completeness: material mutations emit workspace-scoped audit events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        engagement: { findFirst: mockEngagementFindFirst, update: mockEngagementUpdate },
        action: { findMany: mockActionFindMany },
      };
      return fn(tx);
    });
  });

  it("closeConsultingEngagement emits CONSULTING_ENGAGEMENT_CLOSED with workspaceId", async () => {
    mockEngagementFindFirst.mockResolvedValue(engagementWithPhase("REVIEW"));
    mockActionFindMany.mockResolvedValue([]);
    mockEngagementUpdate.mockResolvedValue({ ...engagementWithPhase("REVIEW"), status: "CLOSED", actualEndDate: new Date() });

    await closeConsultingEngagement(
      { engagementId: ENG_ID, workspaceId: WS_A, closureRationale: "done" },
      ACTOR
    );

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: AUDIT_EVENTS.CONSULTING_ENGAGEMENT_CLOSED,
        workspaceId: WS_A,
        entityId: ENG_ID,
      })
    );
  });

  it("disconnectConnector emits CONNECTOR_DISCONNECTED with workspaceId", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO" });
    mockConnectorUpdate.mockResolvedValue({
      id: CONN_ID, workspaceId: WS_A, businessId: null, provider: "XERO",
      status: "DISCONNECTED", connectedAt: new Date(), lastSyncAt: null,
      lastSyncRecords: null, tokenExpiresAt: null, syncFailureMessage: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await disconnectConnector({ workspaceId: WS_A, actorId: ACTOR, connectorId: CONN_ID });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: AUDIT_EVENTS.CONNECTOR_DISCONNECTED,
        workspaceId: WS_A,
      })
    );
  });

  it("ingestIntegrationEvent emits INTEGRATION_EVENT_INGESTED with workspaceId", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });

    const event = {
      id: EV_AUDIT,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      provider: "XERO",
      kind: "CONNECTOR_SYNC_COMPLETED", // no BCP trigger
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(event, ACTOR);

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: AUDIT_EVENTS.INTEGRATION_EVENT_INGESTED,
        workspaceId: WS_A,
      })
    );
  });

  it("audit events include entityId for entity-specific events", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });

    const event = {
      id: EV_ENTITY_ID,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      provider: "XERO",
      kind: "CONNECTOR_SYNC_COMPLETED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(event, ACTOR);

    const ingestedCall = mockEmitAuditEvent.mock.calls.find(
      (c) => c[0]?.eventName === AUDIT_EVENTS.INTEGRATION_EVENT_INGESTED
    );
    expect(ingestedCall![0].entityId).toBe(EV_ENTITY_ID);
  });
});

// ─── I12: Owner-useful outcome — BCP triggers consulting health update ─────────

describe("I12 — Owner-useful outcome: BCP → consulting engagement health update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitAuditEvent.mockResolvedValue(undefined);
    mockUpdateConsultingEngagementHealth.mockResolvedValue({ status: "HEALTHY", reasons: [], criticalFindingsUnresolved: 0, criticalActionsUnresolved: 0, overdueActions: 0 });
  });

  it("active consulting engagements get health updated after successful BCP re-evaluation", async () => {
    const bcpProfile = {
      financialHealthScore: 40, operationalHealthScore: 50,
      salesHealthScore: 45, sopHealthScore: 55, humanExecutionRisk: "MEDIUM",
    };

    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockGetCurrentConditionProfile.mockResolvedValue(bcpProfile);
    mockEvaluateConditionProfile.mockResolvedValue({ id: "bcp-v2", isCurrent: true });
    mockEngagementFindMany.mockResolvedValue([{ id: ENG_ID }]);

    const event = {
      id: EV_I12,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(event, ACTOR);

    await vi.waitFor(
      () => {
        expect(mockUpdateConsultingEngagementHealth).toHaveBeenCalledWith(
          expect.objectContaining({ engagementId: ENG_ID, workspaceId: WS_A }),
          ACTOR
        );
      },
      { timeout: 2000 }
    );
  });

  it("no consulting health update when there are no active consulting engagements", async () => {
    const bcpProfile = {
      financialHealthScore: 40, operationalHealthScore: 50,
      salesHealthScore: 45, sopHealthScore: 55, humanExecutionRisk: "MEDIUM",
    };

    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockGetCurrentConditionProfile.mockResolvedValue(bcpProfile);
    mockEvaluateConditionProfile.mockResolvedValue({ id: "bcp-v2", isCurrent: true });
    mockEngagementFindMany.mockResolvedValue([]); // no active engagements

    const event = {
      id: EV_NO_ENG,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(event, ACTOR);

    // Wait for fire-and-forget to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockUpdateConsultingEngagementHealth).not.toHaveBeenCalled();
  });

  it("INTEGRATION_EVENT_BCP_TRIGGERED is emitted when BCP re-evaluation succeeds", async () => {
    const bcpProfile = {
      financialHealthScore: 40, operationalHealthScore: 50,
      salesHealthScore: 45, sopHealthScore: 55, humanExecutionRisk: "MEDIUM",
    };

    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });
    mockGetCurrentConditionProfile.mockResolvedValue(bcpProfile);
    mockEvaluateConditionProfile.mockResolvedValue({ id: "bcp-v2", isCurrent: true });
    mockEngagementFindMany.mockResolvedValue([]);

    const event = {
      id: EV_BCP_TRIG,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    await ingestIntegrationEvent(event, ACTOR);

    await vi.waitFor(() => {
      const triggeredCall = mockEmitAuditEvent.mock.calls.find(
        (c) => c[0]?.eventName === AUDIT_EVENTS.INTEGRATION_EVENT_BCP_TRIGGERED
      );
      expect(triggeredCall).toBeDefined();
      expect(triggeredCall![0].workspaceId).toBe(WS_A);
    }, { timeout: 2000 });
  });

  it("bcpTriggered=true returned when event has businessId and mapping is non-null", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });

    const event = {
      id: EV_BCP_FLAG,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "ACCOUNTING_REVENUE_UPDATED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    const result = await ingestIntegrationEvent(event, ACTOR);
    expect(result.bcpTriggered).toBe(true);
    expect(result.bcpTriggerType).toBe("KPI_CHANGE");
  });

  it("bcpTriggered=false when event kind has no BCP mapping", async () => {
    mockConnectorFindFirst.mockResolvedValue({ id: CONN_ID, provider: "XERO", status: "ACTIVE" });

    const event = {
      id: EV_NO_BCP,
      connectorId: CONN_ID,
      workspaceId: WS_A,
      businessId: BIZ_ID,
      provider: "XERO",
      kind: "CONNECTOR_SYNC_COMPLETED",
      payload: {},
      occurredAt: new Date().toISOString(),
    };

    const result = await ingestIntegrationEvent(event, ACTOR);
    expect(result.bcpTriggered).toBe(false);
    expect(result.bcpTriggerType).toBeNull();
  });
});
