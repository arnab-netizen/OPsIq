/**
 * Unit tests for task-query.service — workspace isolation and field projection.
 * Uses in-process fakes; no DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock workspace-validation so enforceWorkspaceId is a no-op in these unit tests.
vi.mock("@/lib/workspace-validation", () => ({
  enforceWorkspaceId: vi.fn(),
}));

// Mock db with fakes.
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    delegatedTask: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    proof: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    proofRequirement: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    taskStatusHistory: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

import { getTaskList, getTaskDetail } from "@/services/execution/task-query.service";

const WS = "ws-aaa";
const TASK_ID = "task-bbb";

const baseTask = {
  id: TASK_ID,
  workspaceId: WS,
  title: "Test task",
  status: "IN_PROGRESS",
  priority: "high",
  assignedUserId: "user-x",
  assignedRole: null,
  dueAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  proofRequirementId: null,
  sourceOperatorItemId: null,
};

describe("getTaskList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes workspaceId in where clause", async () => {
    mockFindMany.mockResolvedValueOnce([baseTask]);
    await getTaskList(WS);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });

  it("applies status filter when provided", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await getTaskList(WS, { status: "BLOCKED" });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "BLOCKED" }) })
    );
  });

  it("applies assignedUserId filter when provided", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await getTaskList(WS, { assignedUserId: "user-y" });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assignedUserId: "user-y" }) })
    );
  });

  it("caps limit at 100", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await getTaskList(WS, { limit: 9999 });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("returns the mapped tasks array", async () => {
    mockFindMany.mockResolvedValueOnce([baseTask]);
    const result = await getTaskList(WS);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(TASK_ID);
  });
});

describe("getTaskDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when task not found", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await getTaskDetail(TASK_ID, WS);
    expect(result).toBeNull();
  });

  it("fetches proof and history concurrently when proofRequirementId is set", async () => {
    const taskWithProof = { ...baseTask, proofRequirementId: "req-1", description: null, workStartedAt: null, createdByUserId: null };
    const fakeProof = { id: "proof-1", status: "SUBMITTED", proofType: "photo", submittedByUserId: "user-x", submittedAt: new Date(), reviewedByUserId: null, reviewedAt: null, reviewReason: null, duplicateFlagged: false };
    const fakeReq = { id: "req-1", proofType: "photo", riskLevel: "LOW", reviewerRole: null, ownerOverrideAllowed: false };
    const fakeHistory = [{ id: "h1", fromStatus: null, toStatus: "ASSIGNED", actorId: "user-a", actorRole: "OWNER", occurredAt: new Date() }];

    // getTaskDetail calls findFirst for task, then Promise.all([proof.findFirst, proofReq.findFirst, history.findMany])
    mockFindFirst
      .mockResolvedValueOnce(taskWithProof) // delegatedTask.findFirst
      .mockResolvedValueOnce(fakeProof)     // proof.findFirst
      .mockResolvedValueOnce(fakeReq);      // proofRequirement.findFirst
    mockFindMany.mockResolvedValueOnce(fakeHistory); // taskStatusHistory.findMany

    const result = await getTaskDetail(TASK_ID, WS);
    expect(result).not.toBeNull();
    expect(result!.proof).toMatchObject({ id: "proof-1", status: "SUBMITTED" });
    expect(result!.proofRequirement).toMatchObject({ proofType: "photo" });
    expect(result!.statusHistory).toHaveLength(1);
  });

  it("does not query proof when proofRequirementId is null", async () => {
    const taskNoProof = { ...baseTask, proofRequirementId: null, description: null, workStartedAt: null, createdByUserId: null };
    mockFindFirst.mockResolvedValueOnce(taskNoProof);
    mockFindMany.mockResolvedValueOnce([]); // history

    const result = await getTaskDetail(TASK_ID, WS);
    expect(result).not.toBeNull();
    expect(result!.proof).toBeNull();
    expect(result!.proofRequirement).toBeNull();
  });

  it("enforces workspace isolation by passing workspaceId in where", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await getTaskDetail(TASK_ID, WS);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    );
  });
});
