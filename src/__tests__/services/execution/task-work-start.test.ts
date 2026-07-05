/**
 * Task work-start timestamp population (service, DI — no DB).
 *
 * Proves applyTaskTransition stamps a server-trusted workStartedAt ONLY on the first-start edge
 * (ACKNOWLEDGED → IN_PROGRESS), and NOT on a resume (BLOCKED → IN_PROGRESS) — so the original start
 * time is never overwritten and is never fabricated for a task that never started.
 */
import { describe, it, expect } from "vitest";
import { type TaskDeps, type TaskTx, type TaskDb, applyTaskTransition } from "@/services/execution/delegated-task.service";
import { DelegatedTask, DelegatedTaskStatus as T, TaskActor, TaskActorRole } from "@/domain/execution/delegated-task";

const NOW = new Date("2026-07-05T12:00:00.000Z");
const WS = "ws-1";

const employeeAssignee: TaskActor = { role: TaskActorRole.EMPLOYEE, isAssignee: true, canApproveCompletion: false, canReviewProof: false, canAssign: false };

const task = (status: T): DelegatedTask => ({
  taskId: "task-1", workspaceId: WS, workOrderId: "wo-1", assignedUserId: "emp-1", assignedRole: "counter_staff",
  status, approvedBoundaryId: "bnd-1", approvedBoundaryVersion: 1, boundaryContentHash: "hash",
});

function makeDeps(committedStatus: T) {
  const committed = { status: committedStatus };
  const captured = { data: null as Record<string, unknown> | null };
  const tx: TaskTx = {
    delegatedTask: {
      updateMany: async (args) => {
        const w = args.where as { status: T; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) captured.data = args.data as Record<string, unknown>;
        return { count: match ? 1 : 0 };
      },
    },
    auditEvent: { create: async () => ({}) },
  };
  const db: TaskDb = { delegatedTask: tx.delegatedTask, auditEvent: tx.auditEvent, $transaction: async (fn) => fn(tx) };
  return { deps: { db, now: () => NOW } as TaskDeps, captured };
}

describe("applyTaskTransition — work-start timestamp", () => {
  it("sets workStartedAt on the first start (ACKNOWLEDGED → IN_PROGRESS)", async () => {
    const { deps, captured } = makeDeps(T.ACKNOWLEDGED);
    await applyTaskTransition({ task: task(T.ACKNOWLEDGED), to: T.IN_PROGRESS, actor: employeeAssignee, actorId: "emp-1" }, deps);
    expect(captured.data?.workStartedAt).toEqual(NOW);
    expect(captured.data?.status).toBe(T.IN_PROGRESS);
  });

  it("does NOT set workStartedAt on a resume (BLOCKED → IN_PROGRESS) — original start preserved", async () => {
    const { deps, captured } = makeDeps(T.BLOCKED);
    await applyTaskTransition({ task: task(T.BLOCKED), to: T.IN_PROGRESS, actor: employeeAssignee, actorId: "emp-1" }, deps);
    expect(captured.data && "workStartedAt" in captured.data).toBe(false);
    expect(captured.data?.status).toBe(T.IN_PROGRESS);
  });

  it("does NOT set workStartedAt on a non-start transition (ASSIGNED → ACKNOWLEDGED)", async () => {
    const { deps, captured } = makeDeps(T.ASSIGNED);
    await applyTaskTransition({ task: task(T.ASSIGNED), to: T.ACKNOWLEDGED, actor: employeeAssignee, actorId: "emp-1" }, deps);
    expect(captured.data && "workStartedAt" in captured.data).toBe(false);
  });
});
