/**
 * Bundle 3.5 — Customer Complaint and Service Recovery tests.
 *
 * Coverage:
 * 1. Static source enforcement (route uses withCanonicalEnforcement, OWNER_MANAGE)
 * 2. State machine — valid transitions, invalid transitions rejected
 * 3. SLA computation by severity
 * 4. Idempotency on complaint creation
 * 5. DTO boundary — triageNotes and resolutionEvidenceId never in public output
 * 6. Workspace isolation — cross-workspace access rejected
 * 7. SLA breach evaluator logic
 * 8. Recovery action moves status to RECOVERING
 * 9. Audit event emission on every state change
 * 10. Input validation (severity enum, status filter enum, Zod schema)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const {
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockFindMany,
  mockUpdateMany,
  mockRecoveryCreate,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockRecoveryCreate: vi.fn(),
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    customerComplaint: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
    complaintRecoveryAction: {
      create: mockRecoveryCreate,
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  createComplaint,
  triageComplaint,
  addRecoveryAction,
  resolveComplaint,
  closeComplaint,
  reopenComplaint,
  evaluateOverdueComplaintSlas,
  getComplaint,
  listComplaints,
} from "@/services/owner-mode/customer-complaint.service";
import type { PublicComplaintDTO } from "@/services/owner-mode/customer-complaint.service";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WS = randomUUID();
const OTHER_WS = randomUUID();
const ACTOR = randomUUID();
const COMPLAINT_ID = randomUUID();
const IDEM_KEY = `idem-${randomUUID()}`;

const now = new Date("2025-06-01T10:00:00Z");

function makeComplaintRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COMPLAINT_ID,
    workspaceId: WS,
    idempotencyKey: IDEM_KEY,
    status: "OPEN",
    title: "Delayed delivery",
    description: "Order was 3 days late",
    channel: "DIRECT",
    severity: null,
    slaDueAt: null,
    slaBreached: false,
    triageNotes: "Internal triage note",
    resolutionSummary: null,
    resolutionEvidenceId: randomUUID(),
    reportedBy: "John Doe",
    businessId: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    recoveryActions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Static source enforcement
// ---------------------------------------------------------------------------

describe("Bundle 3.5 — static route source enforcement", () => {
  const routeSrc = fs.readFileSync(
    path.resolve("src/app/api/owner/complaints/route.ts"),
    "utf-8"
  );
  const serviceSrc = fs.readFileSync(
    path.resolve("src/services/owner-mode/customer-complaint.service.ts"),
    "utf-8"
  );

  it("route uses withCanonicalEnforcement", () => {
    expect(routeSrc).toContain("withCanonicalEnforcement");
  });

  it("route requires OWNER_MANAGE capability", () => {
    expect(routeSrc).toContain("OWNER_MANAGE");
  });

  it("route requires workspace on all handlers", () => {
    expect(routeSrc.match(/requireWorkspace: true/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("triageNotes is present in complaintSelect (internal use) but not returned in toPublicDTO", () => {
    expect(serviceSrc).toContain("triageNotes: true");
    // toPublicDTO function body must not reference triageNotes
    const dtoFnMatch = serviceSrc.match(/function toPublicDTO\([\s\S]*?\n\}/);
    expect(dtoFnMatch?.[0]).not.toContain("triageNotes");
  });

  it("PublicComplaintDTO interface does not include triageNotes", () => {
    const dtoBlock = serviceSrc.match(/export interface PublicComplaintDTO \{[\s\S]*?\}/)?.[0] ?? "";
    expect(dtoBlock).not.toContain("triageNotes");
  });

  it("PublicComplaintDTO interface does not include resolutionEvidenceId", () => {
    const dtoBlock = serviceSrc.match(/export interface PublicComplaintDTO \{[\s\S]*?\}/)?.[0] ?? "";
    expect(dtoBlock).not.toContain("resolutionEvidenceId");
  });

  it("toPublicDTO does not spread triageNotes", () => {
    const dtoFn = serviceSrc.match(/function toPublicDTO[\s\S]*?^}/m)?.[0] ?? "";
    expect(dtoFn).not.toContain("triageNotes");
  });

  it("toPublicDTO does not spread resolutionEvidenceId", () => {
    const dtoFn = serviceSrc.match(/function toPublicDTO[\s\S]*?^}/m)?.[0] ?? "";
    expect(dtoFn).not.toContain("resolutionEvidenceId");
  });

  it("service uses emitAuditEvent (not a custom logging call)", () => {
    expect(serviceSrc).toContain("emitAuditEvent");
  });

  it("all emitAuditEvent calls use eventName field", () => {
    const auditCalls = serviceSrc.match(/emitAuditEvent\(\{[\s\S]*?\}\)/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);
    for (const call of auditCalls) {
      expect(call).toContain("eventName:");
      expect(call).not.toContain("event:");
    }
  });

  it("state machine defines all expected statuses", () => {
    expect(serviceSrc).toContain('"OPEN"');
    expect(serviceSrc).toContain('"TRIAGED"');
    expect(serviceSrc).toContain('"RECOVERING"');
    expect(serviceSrc).toContain('"RESOLVED"');
    expect(serviceSrc).toContain('"CLOSED"');
    expect(serviceSrc).toContain('"REOPENED"');
  });

  it("SLA hours defined for all severities", () => {
    expect(serviceSrc).toContain("LOW:");
    expect(serviceSrc).toContain("MEDIUM:");
    expect(serviceSrc).toContain("HIGH:");
    expect(serviceSrc).toContain("CRITICAL:");
    expect(serviceSrc).toContain("120");
    expect(serviceSrc).toContain("48");
    expect(serviceSrc).toContain("24");
    expect(serviceSrc).toContain("4,");
  });

  it("loadComplaint enforces workspaceId parameter", () => {
    expect(serviceSrc).toContain("where: { id, workspaceId }");
  });

  it("idempotency check uses both workspaceId and idempotencyKey", () => {
    expect(serviceSrc).toContain("workspaceId, idempotencyKey");
  });
});

// ---------------------------------------------------------------------------
// 2. createComplaint — idempotency
// ---------------------------------------------------------------------------

describe("createComplaint — idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing complaint when idempotencyKey already used in workspace", async () => {
    const existing = makeComplaintRow();
    mockFindFirst.mockResolvedValueOnce(existing);

    const result = await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      title: "Duplicate attempt",
      description: "Should return existing",
    });

    expect(result.id).toBe(COMPLAINT_ID);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("creates new complaint when idempotencyKey not found", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const newRow = makeComplaintRow({ status: "OPEN" });
    mockCreate.mockResolvedValueOnce(newRow);

    const result = await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "new-key",
      title: "Fresh complaint",
      description: "First time",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockEmitAuditEvent).toHaveBeenCalledOnce();
    expect(result.status).toBe("OPEN");
  });

  it("new complaint defaults to OPEN status", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const row = makeComplaintRow({ status: "OPEN" });
    mockCreate.mockResolvedValueOnce(row);

    await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "key-fresh",
      title: "t",
      description: "d",
    });

    expect(mockCreate.mock.calls[0][0].data.status).toBe("OPEN");
  });

  it("new complaint defaults channel to DIRECT when not provided", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeComplaintRow({ channel: "DIRECT" }));

    await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "key-chan",
      title: "t",
      description: "d",
    });

    expect(mockCreate.mock.calls[0][0].data.channel).toBe("DIRECT");
  });

  it("emits COMPLAINT_CREATED audit event on new complaint", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeComplaintRow());

    await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "key-audit",
      title: "t",
      description: "d",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        actorId: ACTOR,
        entityType: "CustomerComplaint",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. DTO boundary — internal fields never exposed
// ---------------------------------------------------------------------------

describe("DTO boundary — triageNotes and resolutionEvidenceId excluded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createComplaint result does not contain triageNotes", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeComplaintRow({ triageNotes: "SECRET" }));

    const dto = await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "k1",
      title: "t",
      description: "d",
    });

    expect((dto as Record<string, unknown>)["triageNotes"]).toBeUndefined();
  });

  it("createComplaint result does not contain resolutionEvidenceId", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeComplaintRow({ resolutionEvidenceId: randomUUID() }));

    const dto = await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "k2",
      title: "t",
      description: "d",
    });

    expect((dto as Record<string, unknown>)["resolutionEvidenceId"]).toBeUndefined();
  });

  it("getComplaint result does not contain triageNotes", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ triageNotes: "INTERNAL" }));

    const dto = await getComplaint({ workspaceId: WS, complaintId: COMPLAINT_ID });

    expect((dto as Record<string, unknown>)["triageNotes"]).toBeUndefined();
  });

  it("listComplaints results do not contain triageNotes", async () => {
    mockFindMany.mockResolvedValueOnce([makeComplaintRow({ triageNotes: "NOTE" })]);

    const dtos = await listComplaints({ workspaceId: WS });

    expect((dtos[0] as Record<string, unknown>)["triageNotes"]).toBeUndefined();
  });

  it("triaged complaint DTO does not contain triageNotes", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    const triaged = makeComplaintRow({ status: "TRIAGED", severity: "HIGH", triageNotes: "INTERNAL" });
    mockUpdate.mockResolvedValueOnce(triaged);

    const dto = await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "HIGH",
      now,
    });

    expect((dto as Record<string, unknown>)["triageNotes"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. State machine — valid transitions
// ---------------------------------------------------------------------------

describe("state machine — valid transitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("OPEN → TRIAGED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "MEDIUM" }));

    const dto = await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "MEDIUM",
      now,
    });

    expect(dto.status).toBe("TRIAGED");
  });

  it("TRIAGED → RECOVERING via addRecoveryAction", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockRecoveryCreate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    const dto = await addRecoveryAction({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      description: "Issue refund",
    });

    expect(dto.status).toBe("RECOVERING");
  });

  it("TRIAGED → RESOLVED directly is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockUpdate.mockResolvedValueOnce(
      makeComplaintRow({ status: "RESOLVED", resolutionSummary: "Resolved quickly" })
    );

    const dto = await resolveComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      resolutionSummary: "Resolved quickly",
    });

    expect(dto.status).toBe("RESOLVED");
  });

  it("RECOVERING → RESOLVED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));
    mockUpdate.mockResolvedValueOnce(
      makeComplaintRow({ status: "RESOLVED", resolutionSummary: "Fixed" })
    );

    const dto = await resolveComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      resolutionSummary: "Fixed",
    });

    expect(dto.status).toBe("RESOLVED");
  });

  it("RESOLVED → CLOSED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RESOLVED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "CLOSED" }));

    const dto = await closeComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
    });

    expect(dto.status).toBe("CLOSED");
  });

  it("RESOLVED → REOPENED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RESOLVED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "REOPENED" }));

    const dto = await reopenComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      reason: "Customer not satisfied",
    });

    expect(dto.status).toBe("REOPENED");
  });

  it("CLOSED → REOPENED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "CLOSED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "REOPENED" }));

    const dto = await reopenComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      reason: "Escalated",
    });

    expect(dto.status).toBe("REOPENED");
  });

  it("REOPENED → TRIAGED is valid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "REOPENED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "HIGH" }));

    const dto = await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "HIGH",
      now,
    });

    expect(dto.status).toBe("TRIAGED");
  });
});

// ---------------------------------------------------------------------------
// 5. State machine — invalid transitions rejected
// ---------------------------------------------------------------------------

describe("state machine — invalid transitions rejected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("OPEN → RESOLVED is invalid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));

    await expect(
      resolveComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        resolutionSummary: "Skip triage",
      })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });

  it("OPEN → CLOSED is invalid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));

    await expect(
      closeComplaint({ workspaceId: WS, actorId: ACTOR, complaintId: COMPLAINT_ID })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });

  it("OPEN → REOPENED is invalid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));

    await expect(
      reopenComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        reason: "Was never closed",
      })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });

  it("RECOVERING → TRIAGED is invalid (must go through RESOLVED first)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    await expect(
      triageComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        severity: "LOW",
        now,
      })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });

  it("CLOSED → RESOLVED is invalid", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "CLOSED" }));

    await expect(
      resolveComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        resolutionSummary: "Cannot re-resolve from closed",
      })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });

  it("TRIAGED → CLOSED is invalid (must resolve first)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));

    await expect(
      closeComplaint({ workspaceId: WS, actorId: ACTOR, complaintId: COMPLAINT_ID })
    ).rejects.toThrow(/Invalid complaint status transition/);
  });
});

// ---------------------------------------------------------------------------
// 6. Severity validation
// ---------------------------------------------------------------------------

describe("severity validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown severity string", async () => {
    await expect(
      triageComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        severity: "URGENT",
        now,
      })
    ).rejects.toThrow(/Invalid complaint severity/);
  });

  it("accepts LOW severity", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "LOW" }));

    const dto = await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "LOW",
      now,
    });

    expect(dto.severity).toBe("LOW");
  });

  it("accepts CRITICAL severity", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "CRITICAL" }));

    const dto = await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "CRITICAL",
      now,
    });

    expect(dto.severity).toBe("CRITICAL");
  });
});

// ---------------------------------------------------------------------------
// 7. SLA computation by severity
// ---------------------------------------------------------------------------

describe("SLA computation by severity", () => {
  beforeEach(() => vi.clearAllMocks());

  const cases: [string, number][] = [
    ["LOW", 120],
    ["MEDIUM", 48],
    ["HIGH", 24],
    ["CRITICAL", 4],
  ];

  for (const [severity, hours] of cases) {
    it(`${severity} SLA = now + ${hours}h`, async () => {
      mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
      mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity }));

      await triageComplaint({
        workspaceId: WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        severity,
        now,
      });

      const updateData = mockUpdate.mock.calls[0][0].data;
      const expectedMs = now.getTime() + hours * 3600 * 1000;
      expect(updateData.slaDueAt.getTime()).toBe(expectedMs);
    });
  }

  it("slaDueAt is persisted in the DB update call", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "HIGH" }));

    await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "HIGH",
      now,
    });

    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({
      status: "TRIAGED",
      severity: "HIGH",
      slaDueAt: expect.any(Date),
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Workspace isolation — cross-workspace access rejected
// ---------------------------------------------------------------------------

describe("workspace isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loadComplaint throws NotFoundError when complaint is in different workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(null); // workspace filter returns nothing

    await expect(
      getComplaint({ workspaceId: OTHER_WS, complaintId: COMPLAINT_ID })
    ).rejects.toThrow();
  });

  it("triageComplaint rejects cross-workspace access", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      triageComplaint({
        workspaceId: OTHER_WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        severity: "HIGH",
      })
    ).rejects.toThrow();
  });

  it("resolveComplaint rejects cross-workspace access", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      resolveComplaint({
        workspaceId: OTHER_WS,
        actorId: ACTOR,
        complaintId: COMPLAINT_ID,
        resolutionSummary: "Resolved",
      })
    ).rejects.toThrow();
  });

  it("loadComplaint passes workspaceId in findFirst where clause", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow());

    await getComplaint({ workspaceId: WS, complaintId: COMPLAINT_ID });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS }),
      })
    );
  });

  it("listComplaints scopes findMany to workspaceId", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await listComplaints({ workspaceId: WS });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Audit event emission
// ---------------------------------------------------------------------------

describe("audit event emission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createComplaint emits COMPLAINT_CREATED", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeComplaintRow());

    await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "audit-1",
      title: "t",
      description: "d",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "complaint.created",
        entityType: "CustomerComplaint",
        entityId: COMPLAINT_ID,
      })
    );
  });

  it("triageComplaint emits COMPLAINT_TRIAGED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "OPEN" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED", severity: "MEDIUM" }));

    await triageComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      severity: "MEDIUM",
      now,
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "complaint.triaged" })
    );
  });

  it("addRecoveryAction emits COMPLAINT_RECOVERY_ACTION_ADDED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockRecoveryCreate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    await addRecoveryAction({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      description: "Refund",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "complaint.recovery_action_added" })
    );
  });

  it("resolveComplaint emits COMPLAINT_RESOLVED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RESOLVED" }));

    await resolveComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      resolutionSummary: "Done",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "complaint.resolved" })
    );
  });

  it("closeComplaint emits COMPLAINT_CLOSED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RESOLVED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "CLOSED" }));

    await closeComplaint({ workspaceId: WS, actorId: ACTOR, complaintId: COMPLAINT_ID });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "complaint.closed" })
    );
  });

  it("reopenComplaint emits COMPLAINT_REOPENED with reason in payload", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "CLOSED" }));
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "REOPENED" }));

    await reopenComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      reason: "Customer escalated",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "complaint.reopened",
        payload: expect.objectContaining({ reason: "Customer escalated" }),
      })
    );
  });

  it("idempotent createComplaint (existing) does NOT emit audit event", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow());

    await createComplaint({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      title: "t",
      description: "d",
    });

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 10. SLA breach evaluator
// ---------------------------------------------------------------------------

describe("evaluateOverdueComplaintSlas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty breached array when no overdue complaints", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await evaluateOverdueComplaintSlas({
      workspaceId: WS,
      actorId: ACTOR,
      now,
    });

    expect(result.breached).toEqual([]);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("marks overdue complaints as slaBreached=true", async () => {
    const ids = [randomUUID(), randomUUID()];
    mockFindMany.mockResolvedValueOnce(ids.map((id) => ({ id })));
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await evaluateOverdueComplaintSlas({
      workspaceId: WS,
      actorId: ACTOR,
      now,
    });

    expect(result.breached).toEqual(ids);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ids } },
        data: { slaBreached: true },
      })
    );
  });

  it("emits COMPLAINT_SLA_BREACHED for each breached complaint", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    mockFindMany.mockResolvedValueOnce(ids.map((id) => ({ id })));
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });

    await evaluateOverdueComplaintSlas({ workspaceId: WS, actorId: ACTOR, now });

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(3);
    for (const id of ids) {
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "complaint.sla_breached",
          entityId: id,
        })
      );
    }
  });

  it("scopes findMany to the correct workspace and statuses", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await evaluateOverdueComplaintSlas({ workspaceId: WS, actorId: ACTOR, now });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          status: { in: ["TRIAGED", "RECOVERING"] },
          slaBreached: false,
          slaDueAt: { lt: now },
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 11. listComplaints — filter validation
// ---------------------------------------------------------------------------

describe("listComplaints — filter validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid status filter", async () => {
    await expect(
      listComplaints({ workspaceId: WS, status: "PENDING" })
    ).rejects.toThrow(/Invalid status filter/);
  });

  it("rejects invalid severity filter", async () => {
    await expect(
      listComplaints({ workspaceId: WS, severity: "EXTREME" })
    ).rejects.toThrow(/Invalid severity filter/);
  });

  it("accepts valid status filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await expect(
      listComplaints({ workspaceId: WS, status: "OPEN" })
    ).resolves.toEqual([]);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "OPEN" }) })
    );
  });

  it("accepts valid severity filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await expect(
      listComplaints({ workspaceId: WS, severity: "CRITICAL" })
    ).resolves.toEqual([]);
  });

  it("slaBreachedOnly=true passes slaBreached:true to query", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await listComplaints({ workspaceId: WS, slaBreachedOnly: true });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ slaBreached: true }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 12. addRecoveryAction — status preservation when already RECOVERING
// ---------------------------------------------------------------------------

describe("addRecoveryAction — status handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves status from TRIAGED → RECOVERING when adding first action", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockRecoveryCreate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    await addRecoveryAction({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      description: "First action",
    });

    expect(mockUpdate.mock.calls[0][0].data.status).toBe("RECOVERING");
  });

  it("preserves RECOVERING status when adding subsequent action", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));
    mockRecoveryCreate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    await addRecoveryAction({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      description: "Second action",
    });

    expect(mockUpdate.mock.calls[0][0].data.status).toBe("RECOVERING");
  });

  it("creates recovery action record with correct complaintId and workspaceId", async () => {
    mockFindFirst.mockResolvedValueOnce(makeComplaintRow({ status: "TRIAGED" }));
    mockRecoveryCreate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce(makeComplaintRow({ status: "RECOVERING" }));

    await addRecoveryAction({
      workspaceId: WS,
      actorId: ACTOR,
      complaintId: COMPLAINT_ID,
      description: "Action desc",
    });

    expect(mockRecoveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WS,
          complaintId: COMPLAINT_ID,
          description: "Action desc",
        }),
      })
    );
  });
});
