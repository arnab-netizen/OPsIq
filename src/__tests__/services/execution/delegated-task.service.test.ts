import { describe, it, expect } from "vitest";
import {
  TaskTransitionNotAllowedError,
  TaskTransitionConflictError,
  type TaskDeps,
  type TaskTx,
  type TaskDb,
  applyTaskTransition,
} from "@/services/execution/delegated-task.service";
import {
  DelegatedTask,
  DelegatedTaskStatus as T,
  TaskActor,
  TaskActorRole,
} from "@/domain/execution/delegated-task";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const WS = "ws-1";

const ownerActor: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};
const employeeAssignee: TaskActor = {
  role: TaskActorRole.EMPLOYEE,
  isAssignee: true,
  canApproveCompletion: false,
  canReviewProof: false,
  canAssign: false,
};

function task(status: T, workspaceId = WS): DelegatedTask {
  return {
    taskId: "task-1",
    workspaceId,
    workOrderId: "wo-1",
    assignedUserId: "emp-1",
    assignedRole: "counter_staff",
    status,
    approvedBoundaryId: "bnd-1",
    approvedBoundaryVersion: 1,
    boundaryContentHash: "hash",
  };
}

function makeDeps(opts: { committedStatus: T; auditThrows?: boolean }) {
  const committed = { status: opts.committedStatus };
  let pending = { status: opts.committedStatus };
  const calls = { updates: 0, audits: 0 };

  const tx: TaskTx = {
    delegatedTask: {
      updateMany: async (args) => {
        calls.updates += 1;
        const w = args.where as { status: T; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) pending = { status: (args.data as { status: T }).status };
        return { count: match ? 1 : 0 };
      },
    },
    auditEvent: {
      create: async () => {
        calls.audits += 1;
        if (opts.auditThrows) throw new Error("audit write failed");
        return {};
      },
    },
  };

  const db: TaskDb = {
    delegatedTask: tx.delegatedTask,
    auditEvent: tx.auditEvent,
    $transaction: async (fn) => {
      pending = { status: committed.status };
      const r = await fn(tx); // throws → caller sees error, committed unchanged
      committed.status = pending.status; // commit only on success
      return r;
    },
  };

  const deps: TaskDeps = { db, now: () => NOW };
  return { deps, committed, calls };
}

describe("applyTaskTransition — module contract assertions", () => {
  it("applyTaskTransition is a function", () => { expect(typeof applyTaskTransition).toBe("function"); });
  it("TaskTransitionNotAllowedError is a class/function", () => { expect(typeof TaskTransitionNotAllowedError).toBe("function"); });
  it("TaskTransitionConflictError is a class/function", () => { expect(typeof TaskTransitionConflictError).toBe("function"); });
  it("T (DelegatedTaskStatus) is an object", () => { expect(typeof T).toBe("object"); });
  it("T.IN_PROGRESS is defined", () => { expect(T.IN_PROGRESS).toBeDefined(); });
  it("T.PROOF_REQUIRED is defined", () => { expect(T.PROOF_REQUIRED).toBeDefined(); });
  it("T.COMPLETED_PENDING_REVIEW is defined", () => { expect(T.COMPLETED_PENDING_REVIEW).toBeDefined(); });
  it("T.APPROVED_COMPLETE is defined", () => { expect(T.APPROVED_COMPLETE).toBeDefined(); });
  it("T.DRAFT is defined", () => { expect(T.DRAFT).toBeDefined(); });
  it("T.BLOCKED is defined", () => { expect(T.BLOCKED).toBeDefined(); });
  it("TaskActorRole is an object", () => { expect(typeof TaskActorRole).toBe("object"); });
  it("TaskActorRole.OWNER is defined", () => { expect(TaskActorRole.OWNER).toBeDefined(); });
  it("TaskActorRole.EMPLOYEE is defined", () => { expect(TaskActorRole.EMPLOYEE).toBeDefined(); });
  it("ownerActor.canApproveCompletion is true", () => { expect(ownerActor.canApproveCompletion).toBe(true); });
});

describe("applyTaskTransition", () => {
  it("applies a valid, authorized transition and writes the audit event", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: T.IN_PROGRESS });
    const result = await applyTaskTransition(
      { task: task(T.IN_PROGRESS), to: T.PROOF_REQUIRED, actor: ownerActor, actorId: "owner-1" },
      deps
    );
    expect(result).toBe(T.PROOF_REQUIRED);
    expect(committed.status).toBe(T.PROOF_REQUIRED);
    expect(calls.updates).toBe(1);
    expect(calls.audits).toBe(1);
  });

  it("rejects an unauthorized transition (employee → APPROVED_COMPLETE) with no writes", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: T.COMPLETED_PENDING_REVIEW });
    await expect(
      applyTaskTransition(
        { task: task(T.COMPLETED_PENDING_REVIEW), to: T.APPROVED_COMPLETE, actor: employeeAssignee, actorId: "emp-1" },
        deps
      )
    ).rejects.toBeInstanceOf(TaskTransitionNotAllowedError);
    expect(committed.status).toBe(T.COMPLETED_PENDING_REVIEW);
    expect(calls.updates).toBe(0);
    expect(calls.audits).toBe(0);
  });

  it("rejects a graph-invalid transition", async () => {
    const { deps } = makeDeps({ committedStatus: T.DRAFT });
    await expect(
      applyTaskTransition(
        { task: task(T.DRAFT), to: T.APPROVED_COMPLETE, actor: ownerActor, actorId: "owner-1" },
        deps
      )
    ).rejects.toBeInstanceOf(TaskTransitionNotAllowedError);
  });

  it("FAILED AUDIT WRITE rolls back the state change (rule 4)", async () => {
    const { deps, committed, calls } = makeDeps({
      committedStatus: T.IN_PROGRESS,
      auditThrows: true,
    });
    await expect(
      applyTaskTransition(
        { task: task(T.IN_PROGRESS), to: T.PROOF_REQUIRED, actor: ownerActor, actorId: "owner-1" },
        deps
      )
    ).rejects.toThrow(/audit write failed/);
    // status update was attempted but rolled back — committed state is unchanged
    expect(committed.status).toBe(T.IN_PROGRESS);
    expect(calls.updates).toBe(1);
    expect(calls.audits).toBe(1);
  });

  it("fails closed on a stale current status (concurrency guard matched 0 rows)", async () => {
    // task claims IN_PROGRESS but the committed row is already BLOCKED
    const { deps, committed } = makeDeps({ committedStatus: T.BLOCKED });
    await expect(
      applyTaskTransition(
        { task: task(T.IN_PROGRESS), to: T.PROOF_REQUIRED, actor: ownerActor, actorId: "owner-1" },
        deps
      )
    ).rejects.toBeInstanceOf(TaskTransitionConflictError);
    expect(committed.status).toBe(T.BLOCKED);
  });

  it("enforces workspace isolation (cross-workspace task matched 0 rows)", async () => {
    const { deps } = makeDeps({ committedStatus: T.IN_PROGRESS });
    await expect(
      applyTaskTransition(
        {
          task: task(T.IN_PROGRESS, "ws-OTHER"),
          to: T.PROOF_REQUIRED,
          actor: ownerActor,
          actorId: "owner-1",
        },
        deps
      )
    ).rejects.toBeInstanceOf(TaskTransitionConflictError);
  });
});
