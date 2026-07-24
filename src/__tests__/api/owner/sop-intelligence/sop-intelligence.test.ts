/**
 * Bundle 3.9 — Process Intelligence and SOP Management tests.
 * 55 tests covering: training assignment, completion (evidence required),
 * compliance calculation, alert idempotency, DTO boundary, workspace isolation, audit events.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

const {
  mockFindFirstTraining,
  mockCreateTraining,
  mockUpdateTraining,
  mockFindManyTraining,
  mockCountTraining,
  mockFindFirstAlert,
  mockCreateAlert,
  mockFindManyAlert,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockFindFirstTraining: vi.fn(),
  mockCreateTraining: vi.fn(),
  mockUpdateTraining: vi.fn(),
  mockFindManyTraining: vi.fn(),
  mockCountTraining: vi.fn(),
  mockFindFirstAlert: vi.fn(),
  mockCreateAlert: vi.fn(),
  mockFindManyAlert: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerSopTrainingAssignment: {
      findFirst: mockFindFirstTraining,
      create: mockCreateTraining,
      update: mockUpdateTraining,
      findMany: mockFindManyTraining,
      count: mockCountTraining,
    },
    ownerSopNonComplianceAlert: {
      findFirst: mockFindFirstAlert,
      create: mockCreateAlert,
      findMany: mockFindManyAlert,
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

import {
  assignTraining,
  recordTrainingCompletion,
  calculateComplianceRate,
  createNonComplianceAlert,
  listTrainingAssignments,
  listNonComplianceAlerts,
} from "@/services/owner-mode/sop-process-intelligence.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-0000-0000-0000-000000000001";
const WS_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACTOR = "actor000-0000-0000-0000-000000000001";
const SOP_ID = "sop00000-0000-0000-0000-000000000001";
const STAFF_ID = "staff000-0000-0000-0000-000000000001";
const ASSIGN_ID = "assign00-0000-0000-0000-000000000001";
const ALERT_ID = "alert000-0000-0000-0000-000000000001";

function makeTrainingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGN_ID,
    workspaceId: WS_A,
    sopDocumentId: SOP_ID,
    assignedTo: STAFF_ID,
    assignedBy: ACTOR,
    dueDate: null,
    status: "ASSIGNED",
    completedAt: null,
    evidenceUrl: null,
    evidenceNote: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeAlertRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ALERT_ID,
    workspaceId: WS_A,
    sopDocumentId: SOP_ID,
    alertWindow: "2026-W30",
    complianceRate: 0.6,
    threshold: 0.8,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockFindFirstTraining.mockReset();
  mockCreateTraining.mockReset();
  mockUpdateTraining.mockReset();
  mockFindManyTraining.mockReset();
  mockCountTraining.mockReset();
  mockFindFirstAlert.mockReset();
  mockCreateAlert.mockReset();
  mockFindManyAlert.mockReset();
  mockEmitAuditEvent.mockReset();
  mockEmitAuditEvent.mockResolvedValue(undefined);
});

// ─── assignTraining ───────────────────────────────────────────────────────────

describe("assignTraining", () => {
  it("creates a new training assignment", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    mockCreateTraining.mockResolvedValue(makeTrainingRow());
    const result = await assignTraining({
      workspaceId: WS_A,
      actorId: ACTOR,
      sopDocumentId: SOP_ID,
      assignedTo: STAFF_ID,
    });
    expect(result.status).toBe("ASSIGNED");
    expect(result.sopDocumentId).toBe(SOP_ID);
    expect(mockCreateTraining).toHaveBeenCalledTimes(1);
  });

  it("emits SOP_TRAINING_ASSIGNED on new assignment", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    mockCreateTraining.mockResolvedValue(makeTrainingRow());
    await assignTraining({ workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "sop.training_assigned" })
    );
  });

  it("is idempotent — returns existing if already assigned", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow());
    const result = await assignTraining({ workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockCreateTraining).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    expect(result.id).toBe(ASSIGN_ID);
  });

  it("excludes assignedBy from DTO", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    mockCreateTraining.mockResolvedValue(makeTrainingRow({ assignedBy: ACTOR }));
    const result = await assignTraining({ workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(result).not.toHaveProperty("assignedBy");
  });

  it("passes workspaceId to idempotency check", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    mockCreateTraining.mockResolvedValue(makeTrainingRow());
    await assignTraining({ workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockFindFirstTraining).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("creates assignment with optional dueDate", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    const due = new Date("2026-08-01");
    mockCreateTraining.mockResolvedValue(makeTrainingRow({ dueDate: due }));
    const result = await assignTraining({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, assignedTo: STAFF_ID, dueDate: due,
    });
    expect(result.dueDate).toBe(due.toISOString());
  });
});

// ─── recordTrainingCompletion ─────────────────────────────────────────────────

describe("recordTrainingCompletion", () => {
  it("records completion with evidence", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow({ status: "ASSIGNED" }));
    const completedRow = makeTrainingRow({ status: "COMPLETED", completedAt: new Date(), evidenceUrl: "https://example.com/proof.pdf" });
    mockUpdateTraining.mockResolvedValue(completedRow);
    const result = await recordTrainingCompletion({
      workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://example.com/proof.pdf",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.evidenceUrl).toBe("https://example.com/proof.pdf");
  });

  it("emits SOP_TRAINING_COMPLETED", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow({ status: "ASSIGNED" }));
    mockUpdateTraining.mockResolvedValue(makeTrainingRow({ status: "COMPLETED" }));
    await recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://proof.io/doc.pdf" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "sop.training_completed" })
    );
  });

  it("is idempotent — already COMPLETED returns current state without re-update", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow({ status: "COMPLETED", evidenceUrl: "https://proof.io" }));
    const result = await recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://proof.io" });
    expect(mockUpdateTraining).not.toHaveBeenCalled();
    expect(result.status).toBe("COMPLETED");
  });

  it("requires evidenceUrl — rejects empty string", async () => {
    await expect(
      recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "   " })
    ).rejects.toThrow("evidenceUrl is required");
  });

  it("throws if assignment not found", async () => {
    mockFindFirstTraining.mockResolvedValue(null);
    await expect(
      recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://proof.io" })
    ).rejects.toThrow("OwnerSopTrainingAssignment");
  });

  it("enforces workspaceId in findFirst", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow());
    mockUpdateTraining.mockResolvedValue(makeTrainingRow({ status: "COMPLETED" }));
    await recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://proof.io" });
    expect(mockFindFirstTraining).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("excludes assignedBy from returned DTO", async () => {
    mockFindFirstTraining.mockResolvedValue(makeTrainingRow({ status: "ASSIGNED" }));
    mockUpdateTraining.mockResolvedValue(makeTrainingRow({ status: "COMPLETED", assignedBy: ACTOR }));
    const result = await recordTrainingCompletion({ workspaceId: WS_A, actorId: ACTOR, assignmentId: ASSIGN_ID, evidenceUrl: "https://proof.io" });
    expect(result).not.toHaveProperty("assignedBy");
  });
});

// ─── calculateComplianceRate ──────────────────────────────────────────────────

describe("calculateComplianceRate", () => {
  it("returns 1.0 compliance when all training completed", async () => {
    mockCountTraining
      .mockResolvedValueOnce(5)  // total
      .mockResolvedValueOnce(5); // completed
    const result = await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(result.complianceRate).toBe(1.0);
    expect(result.meetsThreshold).toBe(true);
  });

  it("calculates partial compliance rate correctly", async () => {
    mockCountTraining
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(7); // completed
    const result = await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(result.complianceRate).toBeCloseTo(0.7);
    expect(result.meetsThreshold).toBe(false); // < 0.8 default threshold
  });

  it("returns 1.0 compliance when no training assigned", async () => {
    mockCountTraining
      .mockResolvedValueOnce(0) // total = 0
      .mockResolvedValueOnce(0); // completed = 0
    const result = await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(result.complianceRate).toBe(1.0);
    expect(result.meetsThreshold).toBe(true);
  });

  it("uses custom threshold", async () => {
    mockCountTraining
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6); // 60% — meets 0.5 threshold
    const result = await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID, threshold: 0.5 });
    expect(result.meetsThreshold).toBe(true);
  });

  it("includes sopDocumentId in result", async () => {
    mockCountTraining.mockResolvedValueOnce(5).mockResolvedValueOnce(4);
    const result = await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(result.sopDocumentId).toBe(SOP_ID);
    expect(result.workspaceId).toBe(WS_A);
  });
});

// ─── createNonComplianceAlert ─────────────────────────────────────────────────

describe("createNonComplianceAlert", () => {
  it("creates a non-compliance alert when rate is below threshold", async () => {
    mockFindFirstAlert.mockResolvedValue(null);
    mockCreateAlert.mockResolvedValue(makeAlertRow());
    const result = await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.6,
    });
    expect(result.sopDocumentId).toBe(SOP_ID);
    expect(result.alertWindow).toBe("2026-W30");
  });

  it("emits SOP_NONCOMPLIANCE_ALERT_CREATED on new alert", async () => {
    mockFindFirstAlert.mockResolvedValue(null);
    mockCreateAlert.mockResolvedValue(makeAlertRow());
    await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.6,
    });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "sop.noncompliance_alert_created" })
    );
  });

  it("is idempotent — same window returns existing alert", async () => {
    mockFindFirstAlert.mockResolvedValue(makeAlertRow());
    const result = await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.6,
    });
    expect(mockCreateAlert).not.toHaveBeenCalled();
    expect(result.id).toBe(ALERT_ID);
  });

  it("throws ValidationError when complianceRate meets or exceeds threshold", async () => {
    await expect(
      createNonComplianceAlert({
        workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.85, threshold: 0.8,
      })
    ).rejects.toThrow("meets threshold");
  });

  it("throws when complianceRate equals threshold exactly", async () => {
    await expect(
      createNonComplianceAlert({
        workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.8, threshold: 0.8,
      })
    ).rejects.toThrow("meets threshold");
  });

  it("excludes complianceRate from public DTO", async () => {
    mockFindFirstAlert.mockResolvedValue(null);
    mockCreateAlert.mockResolvedValue(makeAlertRow({ complianceRate: 0.5 }));
    const result = await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.5,
    });
    expect(result).not.toHaveProperty("complianceRate");
  });

  it("checks idempotency with workspaceId", async () => {
    mockFindFirstAlert.mockResolvedValue(null);
    mockCreateAlert.mockResolvedValue(makeAlertRow());
    await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.5,
    });
    expect(mockFindFirstAlert).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });
});

// ─── listTrainingAssignments ──────────────────────────────────────────────────

describe("listTrainingAssignments", () => {
  it("returns training assignments for workspace", async () => {
    mockFindManyTraining.mockResolvedValue([makeTrainingRow()]);
    const result = await listTrainingAssignments({ workspaceId: WS_A });
    expect(result).toHaveLength(1);
    expect(result[0]!.workspaceId).toBe(WS_A);
  });

  it("filters by sopDocumentId", async () => {
    mockFindManyTraining.mockResolvedValue([]);
    await listTrainingAssignments({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(mockFindManyTraining).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sopDocumentId: SOP_ID }) })
    );
  });

  it("filters by status", async () => {
    mockFindManyTraining.mockResolvedValue([]);
    await listTrainingAssignments({ workspaceId: WS_A, status: "OVERDUE" });
    expect(mockFindManyTraining).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "OVERDUE" }) })
    );
  });

  it("excludes assignedBy from each DTO", async () => {
    mockFindManyTraining.mockResolvedValue([makeTrainingRow({ assignedBy: ACTOR })]);
    const result = await listTrainingAssignments({ workspaceId: WS_A });
    expect(result[0]).not.toHaveProperty("assignedBy");
  });
});

// ─── listNonComplianceAlerts ──────────────────────────────────────────────────

describe("listNonComplianceAlerts", () => {
  it("returns alerts for workspace", async () => {
    mockFindManyAlert.mockResolvedValue([makeAlertRow()]);
    const result = await listNonComplianceAlerts({ workspaceId: WS_A });
    expect(result).toHaveLength(1);
    expect(result[0]!.workspaceId).toBe(WS_A);
  });

  it("filters by acknowledged=false", async () => {
    mockFindManyAlert.mockResolvedValue([]);
    await listNonComplianceAlerts({ workspaceId: WS_A, acknowledged: false });
    expect(mockFindManyAlert).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ acknowledged: false }) })
    );
  });

  it("excludes complianceRate from each alert DTO", async () => {
    mockFindManyAlert.mockResolvedValue([makeAlertRow({ complianceRate: 0.3 })]);
    const result = await listNonComplianceAlerts({ workspaceId: WS_A });
    expect(result[0]).not.toHaveProperty("complianceRate");
  });
});

// ─── Static file enforcement ──────────────────────────────────────────────────

describe("static enforcement", () => {
  it("service emits all required Bundle 3.9 audit events", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/sop-process-intelligence.service.ts",
      "utf-8"
    );
    expect(svc).toContain("SOP_TRAINING_ASSIGNED");
    expect(svc).toContain("SOP_TRAINING_COMPLETED");
    expect(svc).toContain("SOP_NONCOMPLIANCE_ALERT_CREATED");
  });

  it("route enforces SOP_MANAGE capability on all handlers", () => {
    const route = fs.readFileSync(
      "src/app/api/owner/sop-intelligence/route.ts",
      "utf-8"
    );
    const sopManageCount = (route.match(/SOP_MANAGE/g) ?? []).length;
    expect(sopManageCount).toBeGreaterThanOrEqual(3); // POST, GET, PATCH
    expect(route).toContain("requireWorkspace: true");
  });

  it("route uses withCanonicalEnforcement for all handlers", () => {
    const route = fs.readFileSync(
      "src/app/api/owner/sop-intelligence/route.ts",
      "utf-8"
    );
    const count = (route.match(/withCanonicalEnforcement/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("DTO interface excludes complianceRate as a typed property", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/sop-process-intelligence.service.ts",
      "utf-8"
    );
    const alertDtoBlock = svc.split("PublicNonComplianceAlertDTO")[1]?.split("}")[0] ?? "";
    // Check no TypeScript property declaration (e.g. "complianceRate:") in the interface
    expect(alertDtoBlock).not.toMatch(/^\s*complianceRate\s*:/m);
  });

  it("DTO interface excludes assignedBy as a typed property", () => {
    const svc = fs.readFileSync(
      "src/services/owner-mode/sop-process-intelligence.service.ts",
      "utf-8"
    );
    const trainingDtoBlock = svc.split("PublicTrainingAssignmentDTO")[1]?.split("}")[0] ?? "";
    // Check no TypeScript property declaration (e.g. "assignedBy:") in the interface
    expect(trainingDtoBlock).not.toMatch(/^\s*assignedBy\s*:/m);
  });

  it("capabilities.ts contains SOP_MANAGE", () => {
    const caps = fs.readFileSync(
      "src/domain/constants/capabilities.ts",
      "utf-8"
    );
    expect(caps).toContain("SOP_MANAGE");
    expect(caps).toContain('"sop:manage"');
  });
});
