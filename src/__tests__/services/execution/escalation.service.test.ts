import { describe, it, expect } from "vitest";
import {
  EscalationResolutionError,
  EscalationConflictError,
  type EscalationDeps,
  type EscalationTx,
  type EscalationDb,
  raiseBlocker,
  resolveEscalation,
} from "@/services/execution/escalation.service";
import {
  BlockerType as B,
  EscalationStatus as St,
  EscalationTarget as Tgt,
} from "@/domain/execution/escalation";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const WS = "ws-1";

function makeDeps(opts: { committedStatus?: St; auditThrows?: boolean } = {}) {
  const committed = { status: opts.committedStatus ?? St.OPEN };
  let pending = { status: committed.status };
  const calls = { created: 0, updates: 0, audits: 0, lastCreate: null as Record<string, unknown> | null };
  const tx: EscalationTx = {
    escalation: {
      create: async (args) => {
        calls.created += 1;
        calls.lastCreate = args.data;
        return {};
      },
      updateMany: async (args) => {
        calls.updates += 1;
        const w = args.where as { status: St; workspaceId: string };
        const match = w.status === committed.status && w.workspaceId === WS;
        if (match) pending = { status: (args.data as { status: St }).status };
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
  const db: EscalationDb = {
    escalation: tx.escalation,
    auditEvent: tx.auditEvent,
    $transaction: async (fn) => {
      pending = { status: committed.status };
      const r = await fn(tx);
      committed.status = pending.status;
      return r;
    },
  };
  return { deps: { db, now: () => NOW } as EscalationDeps, committed, calls };
}

describe("raiseBlocker", () => {
  it("an employee raises a refund blocker → routed to owner, persisted, audited", async () => {
    const { deps, calls } = makeDeps();
    const r = await raiseBlocker(
      {
        escalationId: "e1",
        workspaceId: WS,
        taskId: "t1",
        blocker: B.REFUND_REQUEST,
        createdByUserId: "emp-1",
      },
      deps
    );
    expect(r.route.target).toBe(Tgt.OWNER);
    expect(r.dueAt).not.toBeNull();
    expect(calls.created).toBe(1);
    expect(calls.audits).toBe(1);
    expect(calls.lastCreate?.status).toBe(St.OPEN);
  });

  it("a discount beyond boundary routes to the owner", async () => {
    const { deps } = makeDeps();
    const r = await raiseBlocker(
      {
        escalationId: "e2",
        workspaceId: WS,
        taskId: "t1",
        blocker: B.DISCOUNT_REQUEST,
        context: { beyondBoundary: true },
        createdByUserId: "emp-1",
      },
      deps
    );
    expect(r.route.requiresOwner).toBe(true);
  });
});

describe("resolveEscalation", () => {
  it("resolves with a note + resolver and writes the audit", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: St.OPEN });
    const r = await resolveEscalation(
      {
        escalationId: "e1",
        workspaceId: WS,
        fromStatus: St.OPEN,
        resolutionNote: "owner approved the refund",
        resolvedBy: "owner-1",
      },
      deps
    );
    expect(r).toBe(St.RESOLVED);
    expect(committed.status).toBe(St.RESOLVED);
    expect(calls.audits).toBe(1);
  });

  it("cannot silently close: a blank note is refused with no write", async () => {
    const { deps, committed, calls } = makeDeps({ committedStatus: St.OPEN });
    await expect(
      resolveEscalation(
        { escalationId: "e1", workspaceId: WS, fromStatus: St.OPEN, resolutionNote: "  ", resolvedBy: "owner-1" },
        deps
      )
    ).rejects.toBeInstanceOf(EscalationResolutionError);
    expect(committed.status).toBe(St.OPEN);
    expect(calls.updates).toBe(0);
  });

  it("a failed audit write rolls back the resolution", async () => {
    const { deps, committed } = makeDeps({ committedStatus: St.OPEN, auditThrows: true });
    await expect(
      resolveEscalation(
        { escalationId: "e1", workspaceId: WS, fromStatus: St.OPEN, resolutionNote: "done", resolvedBy: "owner-1" },
        deps
      )
    ).rejects.toThrow(/audit write failed/);
    expect(committed.status).toBe(St.OPEN);
  });

  it("fails closed on a stale status (concurrency guard)", async () => {
    const { deps } = makeDeps({ committedStatus: St.RESOLVED });
    await expect(
      resolveEscalation(
        { escalationId: "e1", workspaceId: WS, fromStatus: St.OPEN, resolutionNote: "done", resolvedBy: "owner-1" },
        deps
      )
    ).rejects.toBeInstanceOf(EscalationConflictError);
  });
});
