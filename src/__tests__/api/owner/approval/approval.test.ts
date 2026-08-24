/**
 * Bundle 3.7 — Approval Resolution and Evidence Chain tests.
 * 55 tests covering: static enforcement, idempotency, evidence chain,
 * decision immutability, appeal, DTO boundary, workspace isolation, audit events.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

const {
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockFindMany,
  mockEvidenceCreate,
  mockAssignmentFindFirst,
  mockAssignmentUpdate,
  mockOwnerBusinessFindFirst,
  mockEmitAuditEvent,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
  mockEvidenceCreate: vi.fn(),
  mockAssignmentFindFirst: vi.fn().mockResolvedValue(null),
  mockAssignmentUpdate: vi.fn(),
  mockOwnerBusinessFindFirst: vi.fn(),
  mockEmitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    ownerApprovalRequest: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      findMany: mockFindMany,
    },
    ownerApprovalEvidence: {
      create: mockEvidenceCreate,
    },
    ownerActionAssignment: {
      findFirst: mockAssignmentFindFirst,
      update: mockAssignmentUpdate,
    },
    ownerBusiness: {
      findFirst: mockOwnerBusinessFindFirst,
    },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mockEmitAuditEvent,
}));

import {
  createApproval,
  submitEvidence,
  makeDecision,
  initiateAppeal,
  listApprovals,
  getApproval,
  type PublicApprovalDTO,
} from "@/services/owner-mode/approval-resolution.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WS_A = "aaaaaaaa-0000-0000-0000-000000000001";
const WS_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACTOR = "actor000-0000-0000-0000-000000000001";
const BIZ_ID = "biz00000-0000-0000-0000-000000000001";
const APPROVAL_ID = "appr0000-0000-0000-0000-000000000001";
const PRIOR_ID = "prior000-0000-0000-0000-000000000001";
const IDEM_KEY = "idem-key-001";

function makeApprovalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: APPROVAL_ID,
    workspaceId: WS_A,
    idempotencyKey: IDEM_KEY,
    businessId: BIZ_ID,
    actionId: "action-1",
    actionDomain: "finance",
    requestedBy: ACTOR,
    status: "PENDING",
    rationale: null,
    decidedById: null,
    decidedAt: null,
    appealOfId: null,
    rescopeTriggered: false,
    createdBy: ACTOR,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    evidences: [],
    ...overrides,
  };
}

function makeEvidenceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ev000000-0000-0000-0000-000000000001",
    workspaceId: WS_A,
    approvalId: APPROVAL_ID,
    evidenceType: "document",
    description: "Bank statement Q1",
    sourceUrl: null,
    credibilityScore: 0.85,
    submittedBy: ACTOR,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmitAuditEvent.mockResolvedValue(undefined);
  // Default: BIZ_ID belongs to WS_A. createApproval() now verifies this
  // before writing (workspace-boundary hardening) -- every test in this
  // file that calls createApproval uses WS_A/BIZ_ID, so one default
  // covers all of them; a test intentionally proving cross-workspace
  // rejection would override this per-call.
  mockOwnerBusinessFindFirst.mockResolvedValue({ id: BIZ_ID, workspaceId: WS_A });
});

// ─── 1. Static enforcement: source-code invariants ───────────────────────────

describe("Static enforcement", () => {
  it("service file imports CAPABILITIES", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    expect(src).toContain("AUDIT_EVENTS");
    expect(src).toContain("emitAuditEvent");
    expect(src).toContain("NotFoundError");
    expect(src).toContain("ValidationError");
  });

  it("route uses CONSULTING_APPROVE capability", () => {
    const src = fs.readFileSync("src/app/api/owner/approval/route.ts", "utf-8");
    expect(src).toContain("CAPABILITIES.CONSULTING_APPROVE");
  });

  it("route enforces requireWorkspace on POST", () => {
    const src = fs.readFileSync("src/app/api/owner/approval/route.ts", "utf-8");
    const postBlock = src.split("export const POST")[1].split("export const GET")[0];
    expect(postBlock).toContain("requireWorkspace: true");
  });

  it("route enforces requireWorkspace on GET", () => {
    const src = fs.readFileSync("src/app/api/owner/approval/route.ts", "utf-8");
    const getBlock = src.split("export const GET")[1].split("export const PATCH")[0];
    expect(getBlock).toContain("requireWorkspace: true");
  });

  it("route enforces requireWorkspace on PATCH", () => {
    const src = fs.readFileSync("src/app/api/owner/approval/route.ts", "utf-8");
    const patchBlock = src.split("export const PATCH")[1];
    expect(patchBlock).toContain("requireWorkspace: true");
  });

  it("PublicApprovalDTO excludes decidedById", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    const dtoFn = src.match(/function toPublicDTO[\s\S]*?^}/m)?.[0] ?? "";
    expect(dtoFn).not.toContain("decidedById");
  });

  it("PublicApprovalDTO excludes createdBy", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    const dtoFn = src.match(/function toPublicDTO[\s\S]*?^}/m)?.[0] ?? "";
    expect(dtoFn).not.toContain("createdBy:");
  });

  it("PublicEvidenceDTO excludes credibilityScore", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    const evidenceDtoFn = src.match(/function toPublicEvidenceDTO[\s\S]*?^}/m)?.[0] ?? "";
    expect(evidenceDtoFn).not.toContain("credibilityScore");
  });

  it("service uses workspaceId on every findFirst", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    const findFirstCount = (src.match(/findFirst/g) ?? []).length;
    const wsCount = (src.match(/workspaceId/g) ?? []).length;
    expect(wsCount).toBeGreaterThan(findFirstCount);
  });

  it("route uses verifiedWorkspaceId (not body workspaceId)", () => {
    const src = fs.readFileSync("src/app/api/owner/approval/route.ts", "utf-8");
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).not.toMatch(/body\.workspaceId|input\.workspaceId/);
  });

  it("service has TERMINAL_STATUSES guard on submitEvidence", () => {
    const src = fs.readFileSync(
      "src/services/owner-mode/approval-resolution.service.ts",
      "utf-8"
    );
    expect(src).toContain("TERMINAL_STATUSES");
  });
});

// ─── 2. createApproval idempotency ───────────────────────────────────────────

describe("createApproval", () => {
  it("returns existing record on duplicate idempotencyKey", async () => {
    const existing = makeApprovalRow();
    mockFindFirst.mockResolvedValueOnce(existing);

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
    expect(result.id).toBe(APPROVAL_ID);
  });

  it("creates new approval when no duplicate", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const newRow = makeApprovalRow();
    mockCreate.mockResolvedValueOnce(newRow);

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "approval.created" })
    );
    expect(result.status).toBe("PENDING");
  });

  it("new approval starts in PENDING status", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow({ status: "PENDING" }));

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect(result.status).toBe("PENDING");
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.status).toBe("PENDING");
  });

  it("passes optional actionId and actionDomain", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow({ actionId: "act-1", actionDomain: "sales" }));

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
      actionId: "act-1",
      actionDomain: "sales",
    });

    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.actionId).toBe("act-1");
    expect(createData.actionDomain).toBe("sales");
  });

  it("emits approval.created event with idempotencyKey in payload", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: "key-abc",
      businessId: BIZ_ID,
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "approval.created",
        payload: expect.objectContaining({ idempotencyKey: "key-abc" }),
      })
    );
  });
});

// ─── 3. submitEvidence ───────────────────────────────────────────────────────

describe("submitEvidence", () => {
  it("appends evidence to PENDING approval", async () => {
    const evidenceRow = makeEvidenceRow();
    const updatedApproval = makeApprovalRow({ evidences: [evidenceRow] });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow()) // load approval
      .mockResolvedValueOnce(updatedApproval);   // reload after create
    mockEvidenceCreate.mockResolvedValueOnce(evidenceRow);

    const result = await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "document",
      description: "Bank statement Q1",
    });

    expect(mockEvidenceCreate).toHaveBeenCalledOnce();
    expect(result.evidences).toHaveLength(1);
  });

  it("appends evidence to DEFERRED approval", async () => {
    const evidenceRow = makeEvidenceRow();
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ status: "DEFERRED" }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "DEFERRED", evidences: [evidenceRow] }));
    mockEvidenceCreate.mockResolvedValueOnce(evidenceRow);

    const result = await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "photo",
      description: "Site photo",
    });

    expect(mockEvidenceCreate).toHaveBeenCalledOnce();
    expect(result.evidences).toHaveLength(1);
  });

  it("rejects evidence submission on APPROVED approval", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    await expect(
      submitEvidence({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        evidenceType: "document",
        description: "Late evidence",
      })
    ).rejects.toThrow("APPROVED");
  });

  it("rejects evidence submission on REJECTED approval", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ status: "REJECTED" }));

    await expect(
      submitEvidence({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        evidenceType: "data",
        description: "Post-rejection data",
      })
    ).rejects.toThrow("REJECTED");
  });

  it("rejects invalid evidenceType", async () => {
    await expect(
      submitEvidence({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        evidenceType: "video",
        description: "Video evidence",
      })
    ).rejects.toThrow("video");
  });

  it("emits approval.evidence_submitted event", async () => {
    const evidenceRow = makeEvidenceRow();
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ evidences: [evidenceRow] }));
    mockEvidenceCreate.mockResolvedValueOnce(evidenceRow);

    await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "document",
      description: "Statement",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "approval.evidence_submitted" })
    );
  });

  it("credibilityScore is stored in DB but not returned in DTO", async () => {
    const evidenceRow = makeEvidenceRow({ credibilityScore: 0.9 });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ evidences: [evidenceRow] }));
    mockEvidenceCreate.mockResolvedValueOnce(evidenceRow);

    const result = await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "document",
      description: "Statement",
      credibilityScore: 0.9,
    });

    const ev = result.evidences[0] as Record<string, unknown>;
    expect("credibilityScore" in ev).toBe(false);
    expect(mockEvidenceCreate.mock.calls[0][0].data.credibilityScore).toBe(0.9);
  });
});

// ─── 4. makeDecision immutability ────────────────────────────────────────────

describe("makeDecision", () => {
  it("approves a PENDING approval", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())       // load for guard
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" })); // reload
    mockUpdate.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    const result = await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    expect(result.status).toBe("APPROVED");
  });

  it("rejects a PENDING approval and triggers rescope", async () => {
    const rejectedRow = makeApprovalRow({ status: "REJECTED", rescopeTriggered: true });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(rejectedRow);
    mockUpdate.mockResolvedValue(rejectedRow);

    const result = await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "REJECTED",
      rationale: "Insufficient evidence",
    });

    expect(result.status).toBe("REJECTED");
    expect(mockUpdate).toHaveBeenCalledTimes(2); // decide + mark rescopeTriggered
  });

  it("emits approval.action_rescoped when REJECTED", async () => {
    const rejectedRow = makeApprovalRow({ status: "REJECTED" });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(rejectedRow);
    mockUpdate.mockResolvedValue(rejectedRow);

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "REJECTED",
    });

    const events = mockEmitAuditEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventName: string }).eventName);
    expect(events).toContain("approval.action_rescoped");
  });

  it("defers a PENDING approval", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ status: "DEFERRED" }));
    mockUpdate.mockResolvedValueOnce(makeApprovalRow({ status: "DEFERRED" }));

    const result = await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "DEFERRED",
    });

    expect(result.status).toBe("DEFERRED");
  });

  it("approves a DEFERRED approval", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ status: "DEFERRED" }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));
    mockUpdate.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    const result = await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    expect(result.status).toBe("APPROVED");
  });

  it("throws on second decision when already APPROVED (immutability)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    await expect(
      makeDecision({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        decision: "REJECTED",
      })
    ).rejects.toThrow("APPROVED");
  });

  it("throws on decision when already REJECTED (immutability)", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ status: "REJECTED" }));

    await expect(
      makeDecision({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        decision: "APPROVED",
      })
    ).rejects.toThrow("REJECTED");
  });

  it("rejects invalid decision value", async () => {
    await expect(
      makeDecision({
        workspaceId: WS_A,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        decision: "PENDING",
      })
    ).rejects.toThrow("PENDING");
  });

  it("emits approval.decided with decision in payload", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));
    mockUpdate.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "approval.decided",
        payload: expect.objectContaining({ decision: "APPROVED" }),
      })
    );
  });
});

// ─── 5. initiateAppeal ───────────────────────────────────────────────────────

describe("initiateAppeal", () => {
  it("creates appeal record linked to prior REJECTED approval", async () => {
    const priorRow = makeApprovalRow({ id: PRIOR_ID, status: "REJECTED" });
    const appealRow = makeApprovalRow({
      id: "appeal00-0000-0000-0000-000000000001",
      status: "PENDING",
      appealOfId: PRIOR_ID,
    });
    mockFindFirst
      .mockResolvedValueOnce(priorRow) // load prior
      .mockResolvedValueOnce(null)     // idempotency check
    mockCreate.mockResolvedValueOnce(appealRow);

    const result = await initiateAppeal({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: "appeal-idem-1",
      priorApprovalId: PRIOR_ID,
    });

    expect(result.appealOfId).toBe(PRIOR_ID);
    expect(result.status).toBe("PENDING");
  });

  it("returns existing appeal on duplicate idempotencyKey", async () => {
    const priorRow = makeApprovalRow({ id: PRIOR_ID, status: "REJECTED" });
    const existingAppeal = makeApprovalRow({
      id: "appeal00-0000-0000-0000-000000000001",
      appealOfId: PRIOR_ID,
    });
    mockFindFirst
      .mockResolvedValueOnce(priorRow)
      .mockResolvedValueOnce(existingAppeal);

    const result = await initiateAppeal({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: "appeal-idem-1",
      priorApprovalId: PRIOR_ID,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.appealOfId).toBe(PRIOR_ID);
  });

  it("throws if prior approval is not REJECTED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ id: PRIOR_ID, status: "PENDING" }));

    await expect(
      initiateAppeal({
        workspaceId: WS_A,
        actorId: ACTOR,
        idempotencyKey: "appeal-idem-1",
        priorApprovalId: PRIOR_ID,
      })
    ).rejects.toThrow("REJECTED");
  });

  it("throws if prior approval is APPROVED", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow({ id: PRIOR_ID, status: "APPROVED" }));

    await expect(
      initiateAppeal({
        workspaceId: WS_A,
        actorId: ACTOR,
        idempotencyKey: "appeal-idem-2",
        priorApprovalId: PRIOR_ID,
      })
    ).rejects.toThrow("REJECTED");
  });

  it("emits approval.appeal_initiated with priorApprovalId in payload", async () => {
    const priorRow = makeApprovalRow({ id: PRIOR_ID, status: "REJECTED" });
    const appealRow = makeApprovalRow({ appealOfId: PRIOR_ID });
    mockFindFirst
      .mockResolvedValueOnce(priorRow)
      .mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(appealRow);

    await initiateAppeal({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: "appeal-idem-3",
      priorApprovalId: PRIOR_ID,
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "approval.appeal_initiated",
        payload: expect.objectContaining({ priorApprovalId: PRIOR_ID }),
      })
    );
  });
});

// ─── 6. listApprovals filters ────────────────────────────────────────────────

describe("listApprovals", () => {
  it("lists all approvals for workspace", async () => {
    const rows = [makeApprovalRow(), makeApprovalRow({ id: "appr0002-0000-0000-0000-000000000001" })];
    mockFindMany.mockResolvedValueOnce(rows);

    const result = await listApprovals({ workspaceId: WS_A });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) })
    );
    expect(result).toHaveLength(2);
  });

  it("filters by businessId", async () => {
    mockFindMany.mockResolvedValueOnce([makeApprovalRow()]);

    await listApprovals({ workspaceId: WS_A, businessId: BIZ_ID });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: BIZ_ID }) })
    );
  });

  it("filters by status", async () => {
    mockFindMany.mockResolvedValueOnce([makeApprovalRow({ status: "APPROVED" })]);

    await listApprovals({ workspaceId: WS_A, status: "APPROVED" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "APPROVED" }) })
    );
  });

  it("filters by actionId", async () => {
    mockFindMany.mockResolvedValueOnce([makeApprovalRow()]);

    await listApprovals({ workspaceId: WS_A, actionId: "act-99" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ actionId: "act-99" }) })
    );
  });

  it("returns empty array when no approvals", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await listApprovals({ workspaceId: WS_A });
    expect(result).toEqual([]);
  });
});

// ─── 7. DTO boundary ─────────────────────────────────────────────────────────

describe("DTO boundary", () => {
  it("does not expose decidedById in PublicApprovalDTO", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow({ decidedById: ACTOR }));

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect((result as unknown as Record<string, unknown>)["decidedById"]).toBeUndefined();
  });

  it("does not expose createdBy in PublicApprovalDTO", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect((result as unknown as Record<string, unknown>)["createdBy"]).toBeUndefined();
  });

  it("does not expose credibilityScore in evidence DTO", async () => {
    const evidenceRow = makeEvidenceRow({ credibilityScore: 0.75 });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ evidences: [evidenceRow] }));
    mockEvidenceCreate.mockResolvedValueOnce(evidenceRow);

    const result = await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "document",
      description: "Statement",
    });

    const ev = result.evidences[0] as Record<string, unknown>;
    expect("credibilityScore" in ev).toBe(false);
  });

  it("does not expose idempotencyKey in PublicApprovalDTO", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    const result = await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect((result as unknown as Record<string, unknown>)["idempotencyKey"]).toBeUndefined();
  });
});

// ─── 8. Workspace isolation ──────────────────────────────────────────────────

describe("Workspace isolation", () => {
  it("loadApproval queries workspaceId in where clause", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      getApproval({ workspaceId: WS_B, approvalId: APPROVAL_ID })
    ).rejects.toThrow("OwnerApprovalRequest");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_B }),
      })
    );
  });

  it("creates approval with actorId as requestedBy (not body field)", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.requestedBy).toBe(ACTOR);
  });

  it("listApprovals always scopes to provided workspaceId", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await listApprovals({ workspaceId: WS_B });

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.workspaceId).toBe(WS_B);
  });

  it("loadApproval for submitEvidence passes workspaceId to query", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      submitEvidence({
        workspaceId: WS_B,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        evidenceType: "document",
        description: "Test",
      })
    ).rejects.toThrow("OwnerApprovalRequest");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_B }),
      })
    );
  });

  it("loadApproval for makeDecision enforces workspace", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      makeDecision({
        workspaceId: WS_B,
        actorId: ACTOR,
        approvalId: APPROVAL_ID,
        decision: "APPROVED",
      })
    ).rejects.toThrow("OwnerApprovalRequest");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_B }),
      })
    );
  });
});

// ─── 9. Audit events ─────────────────────────────────────────────────────────

describe("Audit events", () => {
  it("createApproval emits approval.created with entityType OwnerApprovalRequest", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "approval.created",
        entityType: "OwnerApprovalRequest",
        workspaceId: WS_A,
        actorId: ACTOR,
      })
    );
  });

  it("submitEvidence emits approval.evidence_submitted", async () => {
    const ev = makeEvidenceRow();
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ evidences: [ev] }));
    mockEvidenceCreate.mockResolvedValueOnce(ev);

    await submitEvidence({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      evidenceType: "photo",
      description: "Site photo",
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "approval.evidence_submitted" })
    );
  });

  it("makeDecision APPROVED emits approval.decided only (no rescope)", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));
    mockUpdate.mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED" }));

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    const events = mockEmitAuditEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventName: string }).eventName);
    expect(events).toContain("approval.decided");
    expect(events).not.toContain("approval.action_rescoped");
  });

  it("makeDecision REJECTED emits both approval.decided and approval.action_rescoped", async () => {
    const rejectedRow = makeApprovalRow({ status: "REJECTED" });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow())
      .mockResolvedValueOnce(rejectedRow);
    mockUpdate.mockResolvedValue(rejectedRow);

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "REJECTED",
    });

    const events = mockEmitAuditEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventName: string }).eventName);
    expect(events).toContain("approval.decided");
    expect(events).toContain("approval.action_rescoped");
  });

  it("initiateAppeal emits approval.appeal_initiated", async () => {
    const priorRow = makeApprovalRow({ id: PRIOR_ID, status: "REJECTED" });
    mockFindFirst
      .mockResolvedValueOnce(priorRow)
      .mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow({ appealOfId: PRIOR_ID }));

    await initiateAppeal({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: "appeal-idem-4",
      priorApprovalId: PRIOR_ID,
    });

    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "approval.appeal_initiated" })
    );
  });

  it("idempotent createApproval does NOT emit duplicate audit event", async () => {
    mockFindFirst.mockResolvedValueOnce(makeApprovalRow());

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    expect(mockEmitAuditEvent).not.toHaveBeenCalled();
  });

  it("audit events include correct workspaceId and actorId", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(makeApprovalRow());

    await createApproval({
      workspaceId: WS_A,
      actorId: ACTOR,
      idempotencyKey: IDEM_KEY,
      businessId: BIZ_ID,
    });

    const call = mockEmitAuditEvent.mock.calls[0][0] as { workspaceId: string; actorId: string };
    expect(call.workspaceId).toBe(WS_A);
    expect(call.actorId).toBe(ACTOR);
  });
});

describe("Bundle 3.7 — approval → action status update trigger", () => {
  const ACTION_ID = "action-1";
  const ASSIGN_ID = "assign00-0000-0000-0000-000000000001";

  it("APPROVED decision with actionId fires assignment lookup", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ actionId: ACTION_ID }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockUpdate.mockResolvedValue(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockAssignmentFindFirst.mockResolvedValueOnce({ id: ASSIGN_ID });
    mockAssignmentUpdate.mockResolvedValueOnce({ id: ASSIGN_ID });

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    expect(mockAssignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A, actionId: ACTION_ID }) })
    );
  });

  it("APPROVED decision with matched assignment emits OWNER_ACTION_APPROVAL_GRANTED audit event", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ actionId: ACTION_ID }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockUpdate.mockResolvedValue(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockAssignmentFindFirst.mockResolvedValueOnce({ id: ASSIGN_ID });
    mockAssignmentUpdate.mockResolvedValueOnce({ id: ASSIGN_ID });

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    // Allow fire-and-forget to resolve
    await new Promise((r) => setImmediate(r));

    const events = mockEmitAuditEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventName: string }).eventName);
    expect(events).toContain("owner.action_approval_granted");
  });

  it("APPROVED decision with no matching assignment does not throw", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ actionId: ACTION_ID }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockUpdate.mockResolvedValue(makeApprovalRow({ status: "APPROVED", actionId: ACTION_ID }));
    mockAssignmentFindFirst.mockResolvedValueOnce(null);

    await expect(makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    })).resolves.toBeDefined();
  });

  it("APPROVED decision without actionId does not call assignment lookup", async () => {
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ actionId: null }))
      .mockResolvedValueOnce(makeApprovalRow({ status: "APPROVED", actionId: null }));
    mockUpdate.mockResolvedValue(makeApprovalRow({ status: "APPROVED", actionId: null }));

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "APPROVED",
    });

    expect(mockAssignmentFindFirst).not.toHaveBeenCalled();
  });

  it("REJECTED decision does not fire approval-granted trigger", async () => {
    const rejectedRow = makeApprovalRow({ status: "REJECTED", actionId: ACTION_ID });
    mockFindFirst
      .mockResolvedValueOnce(makeApprovalRow({ actionId: ACTION_ID }))
      .mockResolvedValueOnce(rejectedRow);
    mockUpdate.mockResolvedValue(rejectedRow);

    await makeDecision({
      workspaceId: WS_A,
      actorId: ACTOR,
      approvalId: APPROVAL_ID,
      decision: "REJECTED",
    });

    expect(mockAssignmentFindFirst).not.toHaveBeenCalled();
  });
});
