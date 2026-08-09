/**
 * Bundle 3.6 — Owner Action Assignment and Outcome Tracking tests.
 *
 * Coverage:
 * 1. Static source enforcement (route uses withCanonicalEnforcement, OWNER_MANAGE)
 * 2. assignAction — idempotency, priority validation, audit event
 * 3. reassignAction — status guard (only ASSIGNED), audit event, previous assignee in payload
 * 4. recordOutcome — status guard (ASSIGNED|STALLED allowed), FAILED triggers seam, audit event
 * 5. evaluateStallDetection — batch marks overdue ASSIGNED as STALLED, idempotent, audit events
 * 6. listAssignments — filter validation, workspace scoping
 * 7. getBottleneckSummary — correct counts and bottleneckScore
 * 8. DTO boundary — assignedById, createdBy, updatedBy excluded
 * 9. Workspace isolation — cross-workspace blocked
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any service imports
// ---------------------------------------------------------------------------

const {
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockFindMany,
  mockUpdateMany,
  mockCount,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCount: vi.fn(),
  mockEmitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerActionAssignment: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
      count: mockCount,
    },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  assignAction,
  reassignAction,
  recordOutcome,
  evaluateStallDetection,
  getAssignment,
  listAssignments,
  getBottleneckSummary,
} from "@/services/owner-mode/owner-action-assignment-lifecycle.service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = randomUUID();
const OTHER_WS = randomUUID();
const ACTOR = randomUUID();
const ASSIGNMENT_ID = randomUUID();
const BUSINESS_ID = randomUUID();
const ACTION_ID = randomUUID();
const IDEM_KEY = `idem-${randomUUID()}`;
const now = new Date("2025-08-01T10:00:00Z");

function makeAssignmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    workspaceId: WS,
    businessId: BUSINESS_ID,
    idempotencyKey: IDEM_KEY,
    actionId: ACTION_ID,
    actionDomain: "operations",
    assignedTo: "Store Manager",
    assignedById: ACTOR,
    priority: "MEDIUM",
    dueAt: new Date("2025-08-08T00:00:00Z"),
    status: "ASSIGNED",
    stallDetected: false,
    outcomeNote: null,
    reassignReason: null,
    createdBy: ACTOR,
    updatedBy: null,
    createdAt: new Date("2025-08-01T00:00:00Z"),
    updatedAt: new Date("2025-08-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Static source enforcement
// ---------------------------------------------------------------------------

describe("Bundle 3.6 — static route source enforcement", () => {
  const routeSrc = fs.readFileSync(
    path.resolve("src/app/api/owner/action-assignments/route.ts"),
    "utf-8"
  );
  const serviceSrc = fs.readFileSync(
    path.resolve("src/services/owner-mode/owner-action-assignment-lifecycle.service.ts"),
    "utf-8"
  );

  it("route uses withCanonicalEnforcement", () => {
    expect(routeSrc).toContain("withCanonicalEnforcement");
  });

  it("route requires OWNER_MANAGE on all handlers", () => {
    expect(routeSrc.match(/OWNER_MANAGE/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("route requires workspace on all handlers", () => {
    expect(routeSrc.match(/requireWorkspace: true/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("PublicAssignmentDTO excludes assignedById", () => {
    const dtoBlock = serviceSrc.match(/export interface PublicAssignmentDTO \{[\s\S]*?\}/)?.[0] ?? "";
    expect(dtoBlock).not.toContain("assignedById");
  });

  it("PublicAssignmentDTO excludes createdBy", () => {
    const dtoBlock = serviceSrc.match(/export interface PublicAssignmentDTO \{[\s\S]*?\}/)?.[0] ?? "";
    expect(dtoBlock).not.toContain("createdBy");
  });

  it("PublicAssignmentDTO excludes updatedBy", () => {
    const dtoBlock = serviceSrc.match(/export interface PublicAssignmentDTO \{[\s\S]*?\}/)?.[0] ?? "";
    expect(dtoBlock).not.toContain("updatedBy");
  });

  it("toPublicDTO does not expose assignedById", () => {
    const fn = serviceSrc.match(/function toPublicDTO[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fn).not.toContain("assignedById");
  });

  it("service uses emitAuditEvent with eventName field", () => {
    const auditCalls = serviceSrc.match(/emitAuditEvent\(\{[\s\S]*?\}\)/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);
    for (const call of auditCalls) {
      expect(call).toContain("eventName:");
    }
  });

  it("loadAssignment enforces workspaceId in where clause", () => {
    expect(serviceSrc).toContain("where: { id, workspaceId }");
  });

  it("FAILED outcome triggers fire-and-forget signal", () => {
    expect(serviceSrc).toContain("fireActionFailedSignal");
    expect(serviceSrc).toContain('outcome === "FAILED"');
  });

  it("evaluateStallDetection transitions status to STALLED", () => {
    expect(serviceSrc).toContain("status: \"STALLED\"");
    expect(serviceSrc).toContain("stallDetected: true");
  });

  it("idempotency check uses both workspaceId and idempotencyKey", () => {
    expect(serviceSrc).toContain("workspaceId, idempotencyKey");
  });
});

// ---------------------------------------------------------------------------
// 2. assignAction — idempotency
// ---------------------------------------------------------------------------

describe("assignAction — idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing assignment when idempotencyKey already used in workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow());

    const result = await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "operations",
      assignedTo: "Duplicate attempt",
    });

    expect(result.id).toBe(ASSIGNMENT_ID);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("creates new assignment when idempotencyKey not found", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow());

    await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "new-key",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "finance",
      assignedTo: "Owner",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockEmitAuditEvent).toHaveBeenCalledOnce();
  });

  it("new assignment defaults to ASSIGNED status", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));

    await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "k1",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "sales",
      assignedTo: "Sales Lead",
    });

    expect(mockCreate.mock.calls[0][0].data.status).toBe("ASSIGNED");
  });

  it("defaults priority to MEDIUM when not provided", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow({ priority: "MEDIUM" }));

    await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "k2",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "sop",
      assignedTo: "Owner",
    });

    expect(mockCreate.mock.calls[0][0].data.priority).toBe("MEDIUM");
  });

  it("rejects invalid priority", async () => {
    await expect(
      assignAction({
        workspaceId: WS,
        actorId: ACTOR,
        idempotencyKey: "k3",
        businessId: BUSINESS_ID,
        actionId: ACTION_ID,
        actionDomain: "strategy",
        assignedTo: "Owner",
        priority: "URGENT",
      })
    ).rejects.toThrow(/Invalid priority/);
  });

  it("emits OWNER_ACTION_ASSIGNED with correct entity", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow());

    await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "k4",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "operations",
      assignedTo: "Manager",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.action_assigned",
        entityType: "OwnerActionAssignment",
        workspaceId: WS,
        actorId: ACTOR,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. reassignAction
// ---------------------------------------------------------------------------

describe("reassignAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reassigns successfully from ASSIGNED status", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ assignedTo: "Deputy Manager" }));

    const dto = await reassignAction({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      assignedTo: "Deputy Manager",
      reason: "Manager on leave",
    });

    expect(dto.assignedTo).toBe("Deputy Manager");
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("rejects reassignment from COMPLETED status", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "COMPLETED" }));

    await expect(
      reassignAction({
        workspaceId: WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        assignedTo: "New Owner",
        reason: "Trying to re-open",
      })
    ).rejects.toThrow(/Cannot reassign/);
  });

  it("rejects reassignment from FAILED status", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "FAILED" }));

    await expect(
      reassignAction({
        workspaceId: WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        assignedTo: "New Owner",
        reason: "Retrying",
      })
    ).rejects.toThrow(/Cannot reassign/);
  });

  it("emits OWNER_ACTION_REASSIGNED with previous assignee in payload", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ assignedTo: "Old Owner" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ assignedTo: "New Owner" }));

    await reassignAction({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      assignedTo: "New Owner",
      reason: "Rotation",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.action_reassigned",
        payload: expect.objectContaining({
          previousAssignedTo: "Old Owner",
          assignedTo: "New Owner",
          reason: "Rotation",
        }),
      })
    );
  });

  it("optionally updates dueAt and priority on reassign", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow());

    await reassignAction({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      assignedTo: "New Owner",
      reason: "Reprioritized",
      priority: "HIGH",
      dueAt: "2025-09-01T00:00:00Z",
    });

    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({
      priority: "HIGH",
      dueAt: new Date("2025-09-01T00:00:00Z"),
    });
  });
});

// ---------------------------------------------------------------------------
// 4. recordOutcome
// ---------------------------------------------------------------------------

describe("recordOutcome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records COMPLETED outcome from ASSIGNED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ status: "COMPLETED" }));

    const dto = await recordOutcome({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      outcome: "COMPLETED",
    });

    expect(dto.status).toBe("COMPLETED");
  });

  it("records FAILED outcome from ASSIGNED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ status: "FAILED" }));

    const dto = await recordOutcome({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      outcome: "FAILED",
    });

    expect(dto.status).toBe("FAILED");
  });

  it("records COMPLETED outcome from STALLED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "STALLED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ status: "COMPLETED" }));

    const dto = await recordOutcome({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      outcome: "COMPLETED",
      outcomeNote: "Finally completed after stall",
    });

    expect(dto.status).toBe("COMPLETED");
  });

  it("rejects recording outcome from COMPLETED (already terminal)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "COMPLETED" }));

    await expect(
      recordOutcome({
        workspaceId: WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        outcome: "FAILED",
      })
    ).rejects.toThrow(/Cannot record outcome/);
  });

  it("rejects invalid outcome status", async () => {
    await expect(
      recordOutcome({
        workspaceId: WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        outcome: "CANCELLED",
      })
    ).rejects.toThrow(/Invalid outcome status/);
  });

  it("emits OWNER_ACTION_OUTCOME_CLOSED audit event", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ status: "COMPLETED" }));

    await recordOutcome({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      outcome: "COMPLETED",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.action_outcome_closed",
        entityType: "OwnerActionAssignment",
        payload: expect.objectContaining({ outcome: "COMPLETED" }),
      })
    );
  });

  it("FAILED outcome emits audit event (fire-and-forget seam doesn't block)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ status: "ASSIGNED" }));
    mockUpdate.mockResolvedValueOnce(makeAssignmentRow({ status: "FAILED" }));

    await recordOutcome({
      workspaceId: WS,
      actorId: ACTOR,
      assignmentId: ASSIGNMENT_ID,
      outcome: "FAILED",
    });

    // Audit event must still be emitted
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "owner.action_outcome_closed",
        payload: expect.objectContaining({ outcome: "FAILED" }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 5. evaluateStallDetection
// ---------------------------------------------------------------------------

describe("evaluateStallDetection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty stalled array when no overdue assignments", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await evaluateStallDetection({ workspaceId: WS, actorId: ACTOR, now });

    expect(result.stalled).toEqual([]);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("marks overdue ASSIGNED assignments as STALLED and stallDetected=true", async () => {
    const ids = [randomUUID(), randomUUID()];
    mockFindMany.mockResolvedValueOnce(
      ids.map((id) => ({ id, actionId: ACTION_ID, actionDomain: "operations", assignedTo: "Owner" }))
    );
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await evaluateStallDetection({ workspaceId: WS, actorId: ACTOR, now });

    expect(result.stalled).toEqual(ids);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ids } },
        data: { stallDetected: true, status: "STALLED" },
      })
    );
  });

  it("emits OWNER_ACTION_STALL_DETECTED per stalled assignment", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    mockFindMany.mockResolvedValueOnce(
      ids.map((id) => ({ id, actionId: ACTION_ID, actionDomain: "sales", assignedTo: "Sales Lead" }))
    );
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });

    await evaluateStallDetection({ workspaceId: WS, actorId: ACTOR, now });

    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(3);
    for (const id of ids) {
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "owner.action_stall_detected",
          entityId: id,
        })
      );
    }
  });

  it("scopes findMany to workspace, ASSIGNED status, stallDetected=false, dueAt<now", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await evaluateStallDetection({ workspaceId: WS, actorId: ACTOR, now });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          status: "ASSIGNED",
          stallDetected: false,
          dueAt: { lt: now },
        }),
      })
    );
  });

  it("includes assignedTo in stall audit event payload", async () => {
    const id = randomUUID();
    mockFindMany.mockResolvedValueOnce([
      { id, actionId: ACTION_ID, actionDomain: "operations", assignedTo: "Store Manager" },
    ]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    await evaluateStallDetection({ workspaceId: WS, actorId: ACTOR, now });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ assignedTo: "Store Manager" }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 6. listAssignments — filters and workspace scoping
// ---------------------------------------------------------------------------

describe("listAssignments — filter validation and workspace scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid status filter", async () => {
    await expect(
      listAssignments({ workspaceId: WS, status: "PENDING" })
    ).rejects.toThrow(/Invalid status filter/);
  });

  it("accepts STALLED status filter", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await expect(listAssignments({ workspaceId: WS, status: "STALLED" })).resolves.toEqual([]);
  });

  it("scopes findMany to workspaceId", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await listAssignments({ workspaceId: WS });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });

  it("passes businessId filter to query", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await listAssignments({ workspaceId: WS, businessId: BUSINESS_ID });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: BUSINESS_ID }) })
    );
  });

  it("passes assignedTo filter to query", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await listAssignments({ workspaceId: WS, assignedTo: "Store Manager" });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assignedTo: "Store Manager" }) })
    );
  });

  it("stallOnly=true passes stallDetected:true to query", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await listAssignments({ workspaceId: WS, stallOnly: true });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stallDetected: true }) })
    );
  });
});

// ---------------------------------------------------------------------------
// 7. getBottleneckSummary
// ---------------------------------------------------------------------------

describe("getBottleneckSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes bottleneckScore as (stalled+failed)/totalAssigned", async () => {
    mockCount
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3)  // stalled
      .mockResolvedValueOnce(2)  // failed
      .mockResolvedValueOnce(4); // completed

    const summary = await getBottleneckSummary({ workspaceId: WS });

    expect(summary.totalAssigned).toBe(10);
    expect(summary.stalled).toBe(3);
    expect(summary.failed).toBe(2);
    expect(summary.completed).toBe(4);
    expect(summary.bottleneckScore).toBeCloseTo(0.5); // (3+2)/10
  });

  it("bottleneckScore is 0 when no assignments", async () => {
    mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const summary = await getBottleneckSummary({ workspaceId: WS });

    expect(summary.bottleneckScore).toBe(0);
    expect(summary.totalAssigned).toBe(0);
  });

  it("bottleneckScore = 1 when all assignments stalled or failed", async () => {
    mockCount
      .mockResolvedValueOnce(4) // total
      .mockResolvedValueOnce(2) // stalled
      .mockResolvedValueOnce(2) // failed
      .mockResolvedValueOnce(0); // completed

    const summary = await getBottleneckSummary({ workspaceId: WS });

    expect(summary.bottleneckScore).toBeCloseTo(1);
  });

  it("includes workspaceId in returned summary", async () => {
    mockCount.mockResolvedValue(0);
    const summary = await getBottleneckSummary({ workspaceId: WS });
    expect(summary.workspaceId).toBe(WS);
  });
});

// ---------------------------------------------------------------------------
// 8. DTO boundary
// ---------------------------------------------------------------------------

describe("DTO boundary — internal actor IDs excluded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assignAction result does not contain assignedById", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow({ assignedById: ACTOR }));

    const dto = await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "dto-1",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "finance",
      assignedTo: "Owner",
    });

    expect((dto as Record<string, unknown>)["assignedById"]).toBeUndefined();
  });

  it("assignAction result does not contain createdBy", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeAssignmentRow({ createdBy: ACTOR }));

    const dto = await assignAction({
      workspaceId: WS,
      actorId: ACTOR,
      idempotencyKey: "dto-2",
      businessId: BUSINESS_ID,
      actionId: ACTION_ID,
      actionDomain: "finance",
      assignedTo: "Owner",
    });

    expect((dto as Record<string, unknown>)["createdBy"]).toBeUndefined();
  });

  it("getAssignment result does not contain updatedBy", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow({ updatedBy: ACTOR }));

    const dto = await getAssignment({ workspaceId: WS, assignmentId: ASSIGNMENT_ID });

    expect((dto as Record<string, unknown>)["updatedBy"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Workspace isolation
// ---------------------------------------------------------------------------

describe("workspace isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loadAssignment passes workspaceId in where clause", async () => {
    mockFindFirst.mockResolvedValueOnce(makeAssignmentRow());

    await getAssignment({ workspaceId: WS, assignmentId: ASSIGNMENT_ID });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS }),
      })
    );
  });

  it("getAssignment throws when assignment not in workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      getAssignment({ workspaceId: OTHER_WS, assignmentId: ASSIGNMENT_ID })
    ).rejects.toThrow();
  });

  it("reassignAction throws when assignment not in workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      reassignAction({
        workspaceId: OTHER_WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        assignedTo: "Owner",
        reason: "Cross-workspace attempt",
      })
    ).rejects.toThrow();
  });

  it("recordOutcome throws when assignment not in workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      recordOutcome({
        workspaceId: OTHER_WS,
        actorId: ACTOR,
        assignmentId: ASSIGNMENT_ID,
        outcome: "COMPLETED",
      })
    ).rejects.toThrow();
  });

  it("listAssignments scopes findMany to workspaceId", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await listAssignments({ workspaceId: WS });

    expect(mockFindMany.mock.calls[0][0].where.workspaceId).toBe(WS);
  });
});
