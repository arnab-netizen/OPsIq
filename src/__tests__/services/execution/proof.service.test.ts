import { describe, it, expect } from "vitest";
import {
  ProofValidationError,
  ProofTransitionNotAllowedError,
  ProofConflictError,
  type ProofDeps,
  type ProofTx,
  type ProofDb,
  submitProof,
  reviewProof,
} from "@/services/execution/proof.service";
import {
  ProofStatus as PS,
  ProofType,
  ProofRiskLevel,
  ProofActor,
} from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const WS = "ws-1";

const assignee: ProofActor = {
  role: TaskActorRole.EMPLOYEE,
  isAssignee: true,
  canReviewProof: false,
};
const otherEmployee: ProofActor = { ...assignee, isAssignee: false };
const reviewer: ProofActor = {
  role: TaskActorRole.MANAGER,
  isAssignee: false,
  canReviewProof: true,
};

function makeDeps(opts: { committedStatus: PS; auditThrows?: boolean }) {
  const committed = { status: opts.committedStatus };
  let pending = { status: opts.committedStatus };
  const calls = { updates: 0, audits: 0 };
  const tx: ProofTx = {
    proof: {
      updateMany: async (args) => {
        calls.updates += 1;
        const w = args.where as { status: PS; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) pending = { status: (args.data as { status: PS }).status };
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
  const db: ProofDb = {
    proof: tx.proof,
    auditEvent: tx.auditEvent,
    $transaction: async (fn) => {
      pending = { status: committed.status };
      const r = await fn(tx);
      committed.status = pending.status;
      return r;
    },
  };
  return { deps: { db, now: () => NOW } as ProofDeps, committed, calls };
}

const requirement = {
  proofType: ProofType.PAYMENT_CONFIRMATION,
  requiredFields: ["amount"],
  riskLevel: ProofRiskLevel.HIGH,
};
const goodSubmission = {
  proofType: ProofType.PAYMENT_CONFIRMATION,
  fields: { amount: 500 },
  fileHash: "h-new",
  submittedByUserId: "emp-1",
};

describe("submitProof", () => {
  it("validates, authorizes, records SUBMITTED + audit", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: PS.PENDING_SUBMISSION });
    const r = await submitProof(
      {
        proofId: "p1",
        taskId: "t1",
        workspaceId: WS,
        fromStatus: PS.PENDING_SUBMISSION,
        requirement,
        submission: goodSubmission,
        actor: assignee,
      },
      deps
    );
    expect(r.status).toBe(PS.SUBMITTED);
    expect(committed.status).toBe(PS.SUBMITTED);
    expect(calls.audits).toBe(1);
  });

  it("rejects a wrong-type / missing-field submission before any write", async () => {
    const { deps, calls } = makeDeps({ committedStatus: PS.PENDING_SUBMISSION });
    await expect(
      submitProof(
        {
          proofId: "p1",
          taskId: "t1",
          workspaceId: WS,
          fromStatus: PS.PENDING_SUBMISSION,
          requirement,
          submission: { ...goodSubmission, fields: {} },
          actor: assignee,
        },
        deps
      )
    ).rejects.toBeInstanceOf(ProofValidationError);
    expect(calls.updates).toBe(0);
  });

  it("an employee cannot submit proof for another employee's task", async () => {
    const { deps } = makeDeps({ committedStatus: PS.PENDING_SUBMISSION });
    await expect(
      submitProof(
        {
          proofId: "p1",
          taskId: "t1",
          workspaceId: WS,
          fromStatus: PS.PENDING_SUBMISSION,
          requirement,
          submission: goodSubmission,
          actor: otherEmployee,
        },
        deps
      )
    ).rejects.toBeInstanceOf(ProofTransitionNotAllowedError);
  });

  it("flags a duplicate file hash", async () => {
    const { deps } = makeDeps({ committedStatus: PS.PENDING_SUBMISSION });
    const r = await submitProof(
      {
        proofId: "p1",
        taskId: "t1",
        workspaceId: WS,
        fromStatus: PS.PENDING_SUBMISSION,
        requirement,
        submission: { ...goodSubmission, fileHash: "dupe" },
        actor: assignee,
        existingHashes: new Set(["dupe"]),
      },
      deps
    );
    expect(r.duplicateFlagged).toBe(true);
  });
});

describe("reviewProof", () => {
  it("an authorized reviewer can accept; audit is written", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: PS.NEEDS_HUMAN_REVIEW });
    const r = await reviewProof(
      { proofId: "p1", workspaceId: WS, fromStatus: PS.NEEDS_HUMAN_REVIEW, to: PS.ACCEPTED, actor: reviewer, actorId: "mgr-1" },
      deps
    );
    expect(r).toBe(PS.ACCEPTED);
    expect(committed.status).toBe(PS.ACCEPTED);
    expect(calls.audits).toBe(1);
  });

  it("rejection without a reason is refused with no write", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: PS.NEEDS_HUMAN_REVIEW });
    await expect(
      reviewProof(
        { proofId: "p1", workspaceId: WS, fromStatus: PS.NEEDS_HUMAN_REVIEW, to: PS.REJECTED, actor: reviewer, actorId: "mgr-1" },
        deps
      )
    ).rejects.toBeInstanceOf(ProofTransitionNotAllowedError);
    expect(committed.status).toBe(PS.NEEDS_HUMAN_REVIEW);
    expect(calls.updates).toBe(0);
  });

  it("an employee cannot review proof", async () => {
    const { deps } = makeDeps({ committedStatus: PS.NEEDS_HUMAN_REVIEW });
    await expect(
      reviewProof(
        { proofId: "p1", workspaceId: WS, fromStatus: PS.NEEDS_HUMAN_REVIEW, to: PS.ACCEPTED, actor: assignee, actorId: "emp-1" },
        deps
      )
    ).rejects.toBeInstanceOf(ProofTransitionNotAllowedError);
  });

  it("FAILED proof-review audit write prevents the final proof status update", async () => {
    const { deps, committed, calls } = makeDeps({
      committedStatus: PS.NEEDS_HUMAN_REVIEW,
      auditThrows: true,
    });
    await expect(
      reviewProof(
        { proofId: "p1", workspaceId: WS, fromStatus: PS.NEEDS_HUMAN_REVIEW, to: PS.ACCEPTED, actor: reviewer, actorId: "mgr-1" },
        deps
      )
    ).rejects.toThrow(/audit write failed/);
    expect(committed.status).toBe(PS.NEEDS_HUMAN_REVIEW); // rolled back
    expect(calls.updates).toBe(1);
  });

  it("fails closed on a stale current status (concurrency guard)", async () => {
    const { deps } = makeDeps({ committedStatus: PS.ACCEPTED });
    await expect(
      reviewProof(
        { proofId: "p1", workspaceId: WS, fromStatus: PS.NEEDS_HUMAN_REVIEW, to: PS.ACCEPTED, actor: reviewer, actorId: "mgr-1" },
        deps
      )
    ).rejects.toBeInstanceOf(ProofConflictError);
  });
});
