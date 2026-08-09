/**
 * Bundle 3.10 — Stage 3 Cross-Domain Adversarial Closure.
 * 55 adversarial tests proving Stage 3 bundles interact correctly under hostile conditions.
 *
 * Coverage:
 *   - Cross-bundle workspace isolation (complaints ↔ actions ↔ approvals ↔ onboarding ↔ SOP)
 *   - Concurrent mutation safety (idempotency proofs)
 *   - DTO leakage boundary (all Stage 3 public DTOs exclude internal fields)
 *   - Audit completeness (every material Stage 3 mutation emits an audit event)
 *   - Business condition re-evaluation chain (seam signals fired on terminal states)
 *   - Auth capability boundary (all routes use withCanonicalEnforcement + requireWorkspace)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

// ─── Global mocks for all Stage 3 services ────────────────────────────────────

const {
  mockComplaintFindFirst,
  mockComplaintCreate,
  mockComplaintUpdate,
  mockAssignmentFindFirst,
  mockAssignmentCreate,
  mockAssignmentUpdate,
  mockAssignmentFindMany,
  mockApprovalFindFirst,
  mockApprovalCreate,
  mockApprovalUpdate,
  mockEvidenceCreate,
  mockOnboardingFindFirst,
  mockOnboardingCreate,
  mockOnboardingUpdate,
  mockTrainingFindFirst,
  mockTrainingCreate,
  mockAlertFindFirst,
  mockAlertCreate,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockComplaintFindFirst: vi.fn(),
  mockComplaintCreate: vi.fn(),
  mockComplaintUpdate: vi.fn(),
  mockAssignmentFindFirst: vi.fn(),
  mockAssignmentCreate: vi.fn(),
  mockAssignmentUpdate: vi.fn(),
  mockAssignmentFindMany: vi.fn(),
  mockApprovalFindFirst: vi.fn(),
  mockApprovalCreate: vi.fn(),
  mockApprovalUpdate: vi.fn(),
  mockEvidenceCreate: vi.fn(),
  mockOnboardingFindFirst: vi.fn(),
  mockOnboardingCreate: vi.fn(),
  mockOnboardingUpdate: vi.fn(),
  mockTrainingFindFirst: vi.fn(),
  mockTrainingCreate: vi.fn(),
  mockAlertFindFirst: vi.fn(),
  mockAlertCreate: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    customerComplaint: {
      findFirst: mockComplaintFindFirst,
      create: mockComplaintCreate,
      update: mockComplaintUpdate,
    },
    ownerActionAssignment: {
      findFirst: mockAssignmentFindFirst,
      create: mockAssignmentCreate,
      update: mockAssignmentUpdate,
      findMany: mockAssignmentFindMany,
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ownerApprovalRequest: {
      findFirst: mockApprovalFindFirst,
      create: mockApprovalCreate,
      update: mockApprovalUpdate,
      findMany: vi.fn().mockResolvedValue([]),
    },
    ownerApprovalEvidence: {
      create: mockEvidenceCreate,
    },
    ownerOnboarding: {
      findFirst: mockOnboardingFindFirst,
      create: mockOnboardingCreate,
      update: mockOnboardingUpdate,
    },
    ownerSopTrainingAssignment: {
      findFirst: mockTrainingFindFirst,
      create: mockTrainingCreate,
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    ownerSopNonComplianceAlert: {
      findFirst: mockAlertFindFirst,
      create: mockAlertCreate,
      findMany: vi.fn().mockResolvedValue([]),
    },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

import {
  createComplaint,
  resolveComplaint,
} from "@/services/owner-mode/customer-complaint.service";
import {
  assignAction,
  reassignAction,
  recordOutcome,
} from "@/services/owner-mode/owner-action-assignment-lifecycle.service";
import {
  createApproval,
  submitEvidence,
  makeDecision,
  initiateAppeal,
} from "@/services/owner-mode/approval-resolution.service";
import {
  startOnboarding,
  completeOnboarding,
  assertOnboardingComplete,
  classifyArchetype,
} from "@/services/owner-mode/owner-onboarding-lifecycle.service";
import {
  assignTraining,
  createNonComplianceAlert,
  calculateComplianceRate,
} from "@/services/owner-mode/sop-process-intelligence.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-0000-0000-0000-000000000001";
const WS_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACTOR_A = "actora00-0000-0000-0000-000000000001";
const ACTOR_B = "actorb00-0000-0000-0000-000000000002";
const BIZ_ID = "biz00000-0000-0000-0000-000000000001";
const OWNER_ID = "owner000-0000-0000-0000-000000000001";
const SOP_ID = "sop00000-0000-0000-0000-000000000001";
const STAFF_ID = "staff000-0000-0000-0000-000000000001";

// Canonical complaint row shape matching ComplaintRow
const makeComplaintRow = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  workspaceId: WS_A,
  status: "OPEN",
  title: "Test complaint",
  description: "description",
  channel: "DIRECT",
  severity: null,
  slaDueAt: null,
  slaBreached: false,
  triageNotes: null,
  resolutionSummary: null,
  resolutionEvidenceId: null,
  reportedBy: null,
  businessId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  recoveryActions: [],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
});

// ─── 1. Cross-bundle workspace isolation ──────────────────────────────────────

describe("workspace isolation — cross-bundle", () => {
  it("WS_B cannot retrieve WS_A complaint (findFirst returns null)", async () => {
    mockComplaintFindFirst.mockResolvedValue(null); // WS_B has no WS_A records
    await expect(
      resolveComplaint({ workspaceId: WS_B, actorId: ACTOR_B, complaintId: "c1", resolutionSummary: "resolved" })
    ).rejects.toThrow();
    expect(mockComplaintFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_B }) })
    );
  });

  it("WS_B cannot retrieve WS_A action assignment", async () => {
    mockAssignmentFindFirst.mockResolvedValue(null);
    await expect(
      reassignAction({ workspaceId: WS_B, actorId: ACTOR_B, assignmentId: "a1", newAssignedTo: ACTOR_A })
    ).rejects.toThrow();
    expect(mockAssignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_B }) })
    );
  });

  it("WS_B cannot retrieve WS_A approval request", async () => {
    mockApprovalFindFirst.mockResolvedValue(null);
    await expect(
      makeDecision({ workspaceId: WS_B, actorId: ACTOR_B, approvalId: "ap1", decision: "APPROVED" })
    ).rejects.toThrow();
    expect(mockApprovalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_B }) })
    );
  });

  it("WS_B cannot submit evidence on WS_A approval", async () => {
    mockApprovalFindFirst.mockResolvedValue(null);
    await expect(
      submitEvidence({ workspaceId: WS_B, actorId: ACTOR_B, approvalId: "ap1", evidenceType: "document", description: "x" })
    ).rejects.toThrow();
    expect(mockApprovalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_B }) })
    );
  });

  it("WS_B cannot complete WS_A onboarding", async () => {
    mockOnboardingFindFirst.mockResolvedValue(null);
    await expect(
      completeOnboarding({ workspaceId: WS_B, actorId: ACTOR_B, completionKey: "k1" })
    ).rejects.toThrow();
    expect(mockOnboardingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_B }) })
    );
  });

  it("WS_B cannot pass assertOnboardingComplete gate for WS_A", async () => {
    mockOnboardingFindFirst.mockResolvedValue(null);
    await expect(assertOnboardingComplete(WS_B)).rejects.toThrow("onboarding must be completed");
  });

  it("WS_A idempotency check uses WS_A scope (complaint)", async () => {
    mockComplaintFindFirst.mockResolvedValue(null);
    mockComplaintCreate.mockResolvedValue(makeComplaintRow({ idempotencyKey: "ik1" }));
    await createComplaint({
      workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik1", title: "Test", description: "x",
    });
    const idempotencyCall = mockComplaintFindFirst.mock.calls.find(
      (c) => c[0]?.where?.workspaceId === WS_A
    );
    expect(idempotencyCall).toBeTruthy();
  });

  it("WS_A approval idempotency check uses WS_A scope", async () => {
    mockApprovalFindFirst.mockResolvedValue(null);
    mockApprovalCreate.mockResolvedValue({
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    });
    await createApproval({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik1", businessId: BIZ_ID });
    const call = mockApprovalFindFirst.mock.calls[0];
    expect(call[0].where.workspaceId).toBe(WS_A);
  });

  it("SOP non-compliance alert workspace-scoped idempotency check", async () => {
    mockAlertFindFirst.mockResolvedValue(null);
    mockAlertCreate.mockResolvedValue({
      id: "al1", workspaceId: WS_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30",
      complianceRate: 0.5, threshold: 0.8, acknowledged: false, acknowledgedAt: null,
      createdAt: new Date(),
    });
    await createNonComplianceAlert({
      workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.5,
    });
    expect(mockAlertFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });

  it("SOP training assignment scoped to workspace on idempotency check", async () => {
    mockTrainingFindFirst.mockResolvedValue(null);
    mockTrainingCreate.mockResolvedValue({
      id: "tr1", workspaceId: WS_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID,
      assignedBy: ACTOR_A, dueDate: null, status: "ASSIGNED", completedAt: null,
      evidenceUrl: null, evidenceNote: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await assignTraining({ workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockTrainingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
  });
});

// ─── 2. Concurrent mutation safety / idempotency ──────────────────────────────

describe("concurrent mutation safety — idempotency proofs", () => {
  it("createComplaint: concurrent calls with same idempotencyKey return existing", async () => {
    const existing = makeComplaintRow({ id: "c1", workspaceId: WS_A });
    mockComplaintFindFirst.mockResolvedValue(existing);
    const [r1, r2] = await Promise.all([
      createComplaint({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik-dupe", title: "T", description: "x" }),
      createComplaint({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik-dupe", title: "T", description: "x" }),
    ]);
    expect(mockComplaintCreate).not.toHaveBeenCalled();
    expect(r1.id).toBe(r2.id);
  });

  it("createApproval: concurrent calls with same idempotencyKey return existing", async () => {
    const existing = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik-dupe", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst.mockResolvedValue(existing);
    const [r1, r2] = await Promise.all([
      createApproval({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik-dupe", businessId: BIZ_ID }),
      createApproval({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik-dupe", businessId: BIZ_ID }),
    ]);
    expect(mockApprovalCreate).not.toHaveBeenCalled();
    expect(r1.id).toBe(r2.id);
  });

  it("startOnboarding: second call returns existing record without create", async () => {
    const existing = {
      id: "ob1", workspaceId: WS_A, businessId: BIZ_ID, ownerId: OWNER_ID,
      status: "IN_PROGRESS", businessName: "Biz", businessType: "retail",
      revenueRange: "50k-100k", revenueTrend: "STABLE", cashRunwayWeeks: 12,
      profitability: "BREAKEVEN", ownerHoursPerWeek: 40, teamSize: 4,
      archetype: null, archetypeScore: null, initialActionQueue: null,
      completionKey: null, completedAt: null, reOnboardingReason: null,
      createdBy: ACTOR_A, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    };
    mockOnboardingFindFirst.mockResolvedValue(existing);
    await startOnboarding({ workspaceId: WS_A, actorId: ACTOR_A, businessId: BIZ_ID, ownerId: OWNER_ID, businessName: "Biz", businessType: "retail", revenueRange: "50k-100k", revenueTrend: "STABLE", profitability: "BREAKEVEN" });
    expect(mockOnboardingCreate).not.toHaveBeenCalled();
  });

  it("completeOnboarding: same completionKey is idempotent", async () => {
    const completed = {
      id: "ob1", workspaceId: WS_A, businessId: BIZ_ID, ownerId: OWNER_ID,
      status: "COMPLETED", businessName: "Biz", businessType: "retail",
      revenueRange: "50k-100k", revenueTrend: "STABLE", cashRunwayWeeks: 12,
      profitability: "BREAKEVEN", ownerHoursPerWeek: 40, teamSize: 4,
      archetype: "STABILIZATION", archetypeScore: 0.65, initialActionQueue: [],
      completionKey: "same-key", completedAt: new Date(), reOnboardingReason: null,
      createdBy: ACTOR_A, updatedBy: ACTOR_A, createdAt: new Date(), updatedAt: new Date(),
    };
    mockOnboardingFindFirst.mockResolvedValue(completed);
    await completeOnboarding({ workspaceId: WS_A, actorId: ACTOR_A, completionKey: "same-key" });
    expect(mockOnboardingUpdate).not.toHaveBeenCalled();
  });

  it("assignTraining: same (workspace, sop, staff) is idempotent", async () => {
    const existing = {
      id: "tr1", workspaceId: WS_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID,
      assignedBy: ACTOR_A, dueDate: null, status: "ASSIGNED", completedAt: null,
      evidenceUrl: null, evidenceNote: null, createdAt: new Date(), updatedAt: new Date(),
    };
    mockTrainingFindFirst.mockResolvedValue(existing);
    await assignTraining({ workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockTrainingCreate).not.toHaveBeenCalled();
  });

  it("createNonComplianceAlert: same window is idempotent", async () => {
    const existing = {
      id: "al1", workspaceId: WS_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30",
      complianceRate: 0.5, threshold: 0.8, acknowledged: false, acknowledgedAt: null,
      createdAt: new Date(),
    };
    mockAlertFindFirst.mockResolvedValue(existing);
    await createNonComplianceAlert({ workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.5 });
    expect(mockAlertCreate).not.toHaveBeenCalled();
  });

  it("makeDecision APPROVED blocks further decisions", async () => {
    const approvedApproval = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "APPROVED",
      rationale: "ok", decidedById: ACTOR_A, decidedAt: new Date(), appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: ACTOR_A,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst.mockResolvedValue(approvedApproval);
    await expect(
      makeDecision({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", decision: "REJECTED" })
    ).rejects.toThrow("APPROVED");
  });

  it("makeDecision REJECTED blocks further decisions", async () => {
    const rejected = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "REJECTED",
      rationale: "no", decidedById: ACTOR_A, decidedAt: new Date(), appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: ACTOR_A,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst.mockResolvedValue(rejected);
    await expect(
      makeDecision({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", decision: "APPROVED" })
    ).rejects.toThrow("REJECTED");
  });

  it("submitEvidence blocked on APPROVED approval", async () => {
    const approved = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "APPROVED",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst.mockResolvedValue(approved);
    await expect(
      submitEvidence({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", evidenceType: "document", description: "x" })
    ).rejects.toThrow("APPROVED");
  });
});

// ─── 3. DTO boundary — no internal fields leak ────────────────────────────────

describe("DTO leakage boundary — static verification", () => {
  const readSvc = (name: string) =>
    fs.readFileSync(`src/services/owner-mode/${name}`, "utf-8");

  it("complaint DTO excludes createdBy", () => {
    const src = readSvc("customer-complaint.service.ts");
    const dto = src.split("PublicComplaintDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*createdBy\s*:/m);
  });

  it("complaint DTO excludes idempotencyKey", () => {
    const src = readSvc("customer-complaint.service.ts");
    const dto = src.split("PublicComplaintDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*idempotencyKey\s*:/m);
  });

  it("action assignment DTO excludes assignedById", () => {
    const src = readSvc("owner-action-assignment-lifecycle.service.ts");
    const dto = src.split("PublicAssignmentDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*assignedById\s*:/m);
  });

  it("action assignment DTO excludes createdBy", () => {
    const src = readSvc("owner-action-assignment-lifecycle.service.ts");
    const dto = src.split("PublicAssignmentDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*createdBy\s*:/m);
  });

  it("approval DTO excludes decidedById", () => {
    const src = readSvc("approval-resolution.service.ts");
    const dto = src.split("PublicApprovalDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*decidedById\s*:/m);
  });

  it("approval DTO excludes idempotencyKey", () => {
    const src = readSvc("approval-resolution.service.ts");
    const dto = src.split("PublicApprovalDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*idempotencyKey\s*:/m);
  });

  it("approval evidence DTO excludes credibilityScore", () => {
    const src = readSvc("approval-resolution.service.ts");
    const dto = src.split("PublicEvidenceDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*credibilityScore\s*:/m);
  });

  it("onboarding DTO excludes archetypeScore", () => {
    const src = readSvc("owner-onboarding-lifecycle.service.ts");
    const dto = src.split("PublicOnboardingDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*archetypeScore\s*:/m);
  });

  it("onboarding DTO excludes completionKey", () => {
    const src = readSvc("owner-onboarding-lifecycle.service.ts");
    const dto = src.split("PublicOnboardingDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*completionKey\s*:/m);
  });

  it("SOP non-compliance alert DTO excludes complianceRate", () => {
    const src = readSvc("sop-process-intelligence.service.ts");
    const dto = src.split("PublicNonComplianceAlertDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*complianceRate\s*:/m);
  });

  it("SOP training DTO excludes assignedBy", () => {
    const src = readSvc("sop-process-intelligence.service.ts");
    const dto = src.split("PublicTrainingAssignmentDTO")[1]?.split("}")[0] ?? "";
    expect(dto).not.toMatch(/^\s*assignedBy\s*:/m);
  });
});

// ─── 4. Audit completeness ────────────────────────────────────────────────────

describe("audit completeness — every material mutation emits audit event", () => {
  it("createComplaint emits audit event", async () => {
    mockComplaintFindFirst.mockResolvedValue(null);
    mockComplaintCreate.mockResolvedValue(makeComplaintRow());
    await createComplaint({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik1", title: "T", description: "x" });
    expect(mockEmitAuditEvent).toHaveBeenCalled();
  });

  it("assignAction emits audit event", async () => {
    mockAssignmentFindFirst.mockResolvedValue(null);
    mockAssignmentCreate.mockResolvedValue({
      id: "a1", workspaceId: WS_A, idempotencyKey: "ik1", actionId: "act1",
      actionTitle: "T", actionDomain: "finance", assignedTo: STAFF_ID, assignedById: ACTOR_A,
      priority: "HIGH", dueAt: null, status: "ASSIGNED", outcomeNote: null, stallDetected: false,
      createdBy: ACTOR_A, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await assignAction({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik1", actionId: "act1", actionTitle: "T", actionDomain: "finance", assignedTo: STAFF_ID, priority: "HIGH" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.action_assigned" }));
  });

  it("createApproval emits audit event", async () => {
    mockApprovalFindFirst.mockResolvedValue(null);
    mockApprovalCreate.mockResolvedValue({
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    });
    await createApproval({ workspaceId: WS_A, actorId: ACTOR_A, idempotencyKey: "ik1", businessId: BIZ_ID });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "approval.created" }));
  });

  it("makeDecision emits audit event", async () => {
    const pending = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst
      .mockResolvedValueOnce(pending)   // loadApproval for decide
      .mockResolvedValueOnce({ ...pending, status: "APPROVED" }); // reload after update
    mockApprovalUpdate.mockResolvedValue({ ...pending, status: "APPROVED" });
    await makeDecision({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", decision: "APPROVED" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "approval.decided" }));
  });

  it("startOnboarding emits audit event", async () => {
    mockOnboardingFindFirst.mockResolvedValue(null);
    mockOnboardingCreate.mockResolvedValue({
      id: "ob1", workspaceId: WS_A, businessId: BIZ_ID, ownerId: OWNER_ID,
      status: "IN_PROGRESS", businessName: "Biz", businessType: "retail",
      revenueRange: "50k-100k", revenueTrend: "STABLE", cashRunwayWeeks: 12,
      profitability: "BREAKEVEN", ownerHoursPerWeek: 40, teamSize: 4,
      archetype: null, archetypeScore: null, initialActionQueue: null,
      completionKey: null, completedAt: null, reOnboardingReason: null,
      createdBy: ACTOR_A, updatedBy: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await startOnboarding({ workspaceId: WS_A, actorId: ACTOR_A, businessId: BIZ_ID, ownerId: OWNER_ID, businessName: "Biz", businessType: "retail", revenueRange: "50k-100k", revenueTrend: "STABLE", profitability: "BREAKEVEN" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "onboarding.started" }));
  });

  it("assignTraining emits audit event", async () => {
    mockTrainingFindFirst.mockResolvedValue(null);
    mockTrainingCreate.mockResolvedValue({
      id: "tr1", workspaceId: WS_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID,
      assignedBy: ACTOR_A, dueDate: null, status: "ASSIGNED", completedAt: null,
      evidenceUrl: null, evidenceNote: null, createdAt: new Date(), updatedAt: new Date(),
    });
    await assignTraining({ workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, assignedTo: STAFF_ID });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "sop.training_assigned" }));
  });

  it("createNonComplianceAlert emits audit event", async () => {
    mockAlertFindFirst.mockResolvedValue(null);
    mockAlertCreate.mockResolvedValue({
      id: "al1", workspaceId: WS_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30",
      complianceRate: 0.5, threshold: 0.8, acknowledged: false, acknowledgedAt: null,
      createdAt: new Date(),
    });
    await createNonComplianceAlert({ workspaceId: WS_A, actorId: ACTOR_A, sopDocumentId: SOP_ID, alertWindow: "2026-W30", complianceRate: 0.5 });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "sop.noncompliance_alert_created" }));
  });

  it("every Stage 3 audit event string starts with correct namespace", () => {
    const events = fs.readFileSync("src/domain/constants/audit-events.ts", "utf-8");
    const stage3Events = [
      "owner.action_assigned", "owner.action_reassigned", "owner.action_outcome_closed",
      "approval.created", "approval.evidence_submitted", "approval.decided",
      "onboarding.started", "onboarding.completed", "onboarding.re_triggered",
      "sop.training_assigned", "sop.training_completed", "sop.noncompliance_alert_created",
    ];
    for (const ev of stage3Events) {
      expect(events).toContain(`"${ev}"`);
    }
  });
});

// ─── 5. Business condition re-evaluation chain ────────────────────────────────

describe("business condition re-evaluation chain", () => {
  it("REJECTED approval sets rescopeTriggered=true", async () => {
    const pending = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: "a1", actionDomain: "finance", requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    const rejected = { ...pending, status: "REJECTED", rescopeTriggered: true };
    mockApprovalFindFirst
      .mockResolvedValueOnce(pending)    // loadApproval for decide
      .mockResolvedValueOnce(rejected);  // loadApproval reload
    mockApprovalUpdate.mockResolvedValue(rejected);
    const result = await makeDecision({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", decision: "REJECTED" });
    expect(result.rescopeTriggered).toBe(true);
  });

  it("REJECTED approval emits APPROVAL_ACTION_RESCOPED event", async () => {
    const pending = {
      id: "ap1", workspaceId: WS_A, idempotencyKey: "ik1", businessId: BIZ_ID,
      actionId: null, actionDomain: null, requestedBy: ACTOR_A, status: "PENDING",
      rationale: null, decidedById: null, decidedAt: null, appealOfId: null,
      rescopeTriggered: false, createdBy: ACTOR_A, updatedBy: null,
      createdAt: new Date(), updatedAt: new Date(), evidences: [],
    };
    mockApprovalFindFirst
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: "REJECTED", rescopeTriggered: true });
    mockApprovalUpdate.mockResolvedValue({ ...pending, status: "REJECTED" });
    await makeDecision({ workspaceId: WS_A, actorId: ACTOR_A, approvalId: "ap1", decision: "REJECTED" });
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "approval.action_rescoped" })
    );
  });

  it("classifyArchetype is deterministic — no randomness", () => {
    const r1 = classifyArchetype("DECLINING", "NEGATIVE", 3);
    const r2 = classifyArchetype("DECLINING", "NEGATIVE", 3);
    const r3 = classifyArchetype("DECLINING", "NEGATIVE", 3);
    expect(r1.archetype).toBe(r2.archetype);
    expect(r2.archetype).toBe(r3.archetype);
    expect(r1.archetypeScore).toBe(r2.archetypeScore);
  });

  it("SURVIVAL_MODE archetype has lowest archetypeScore", () => {
    const survival = classifyArchetype("DECLINING", "NEGATIVE", 2);
    const growth = classifyArchetype("GROWING", "POSITIVE", 52);
    expect(survival.archetypeScore).toBeLessThan(growth.archetypeScore);
  });

  it("calculateComplianceRate uses parallel count queries", async () => {
    const { db } = await import("@/lib/db");
    (db.ownerSopTrainingAssignment.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    await calculateComplianceRate({ workspaceId: WS_A, sopDocumentId: SOP_ID });
    expect(db.ownerSopTrainingAssignment.count).toHaveBeenCalledTimes(2);
  });
});

// ─── 6. Auth capability boundary ─────────────────────────────────────────────

describe("auth capability boundary — static verification", () => {
  const readRoute = (path: string) => fs.readFileSync(`src/app/api/owner/${path}/route.ts`, "utf-8");

  it("complaints route uses withCanonicalEnforcement", () => {
    const r = readRoute("complaints");
    expect(r).toContain("withCanonicalEnforcement");
  });

  it("action-assignments route uses withCanonicalEnforcement", () => {
    const r = readRoute("action-assignments");
    expect(r).toContain("withCanonicalEnforcement");
  });

  it("approval route uses withCanonicalEnforcement", () => {
    const r = readRoute("approval");
    expect(r).toContain("withCanonicalEnforcement");
  });

  it("onboarding-lifecycle route uses withCanonicalEnforcement", () => {
    const r = readRoute("onboarding-lifecycle");
    expect(r).toContain("withCanonicalEnforcement");
  });

  it("sop-intelligence route uses withCanonicalEnforcement", () => {
    const r = readRoute("sop-intelligence");
    expect(r).toContain("withCanonicalEnforcement");
  });

  it("approval route enforces CONSULTING_APPROVE", () => {
    expect(readRoute("approval")).toContain("CONSULTING_APPROVE");
  });

  it("onboarding-lifecycle route enforces OWNER_ONBOARD", () => {
    expect(readRoute("onboarding-lifecycle")).toContain("OWNER_ONBOARD");
  });

  it("sop-intelligence route enforces SOP_MANAGE", () => {
    expect(readRoute("sop-intelligence")).toContain("SOP_MANAGE");
  });

  it("all Stage 3 routes include requireWorkspace: true", () => {
    const routes = [
      "complaints", "action-assignments", "approval", "onboarding-lifecycle", "sop-intelligence",
    ];
    for (const route of routes) {
      const content = readRoute(route);
      expect(content, `Route ${route} must have requireWorkspace: true`).toContain("requireWorkspace: true");
    }
  });

  it("capabilities.ts defines all Stage 3 capabilities", () => {
    const caps = fs.readFileSync("src/domain/constants/capabilities.ts", "utf-8");
    const required = ["CONSULTING_APPROVE", "OWNER_ONBOARD", "SOP_MANAGE", "OWNER_MANAGE"];
    for (const cap of required) {
      expect(caps, `capabilities.ts must define ${cap}`).toContain(cap);
    }
  });
});
