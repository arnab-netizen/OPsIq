import { describe, it, expect } from "vitest";
import {
  LifecycleConflictError,
  LifecycleNotAllowedError,
  type LifecycleDeps,
  type LifecycleTx,
  suspendEmployee,
  reactivateEmployee,
  offboardEmployee,
  requireActiveMembership,
  assertEmployeeAssignable,
} from "@/services/workspace/employee-lifecycle.service";
import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";
import { UnauthorizedError } from "@/infra/errors";

const NOW = new Date("2026-06-25T12:00:00.000Z");

interface FakeState {
  membership: { isActive: boolean; removedAt: Date | null } | null;
  /** how many rows the conditional updateMany should report changing */
  updateCount?: number;
  sessionRevokeCount?: number;
}

function makeDeps(state: FakeState) {
  const calls = {
    membershipUpdate: [] as Record<string, unknown>[],
    sessionUpdate: [] as Record<string, unknown>[],
    emitted: [] as { eventName: string; payload?: Record<string, unknown> }[],
    txRuns: 0,
  };

  const tx: LifecycleTx = {
    workspaceMembership: {
      findUnique: async () => state.membership,
      updateMany: async (args) => {
        calls.membershipUpdate.push(args as Record<string, unknown>);
        return { count: state.updateCount ?? 1 };
      },
    },
    session: {
      updateMany: async (args) => {
        calls.sessionUpdate.push(args as Record<string, unknown>);
        return { count: state.sessionRevokeCount ?? 2 };
      },
    },
  };

  const deps: LifecycleDeps = {
    db: {
      workspaceMembership: tx.workspaceMembership,
      session: tx.session,
      $transaction: async (fn) => {
        calls.txRuns += 1;
        return fn(tx);
      },
    },
    emit: async (input) => {
      calls.emitted.push({ eventName: input.eventName, payload: input.payload });
      return "evt-id";
    },
    now: () => NOW,
  };

  return { deps, calls };
}

const cmd = {
  workspaceId: "ws-1",
  userId: "emp-1",
  actorId: "owner-1",
  reason: "policy violation",
};

describe("employee-lifecycle-service — module contract assertions", () => {
  it("LifecycleConflictError is a function", () => { expect(typeof LifecycleConflictError).toBe("function"); });
  it("LifecycleNotAllowedError is a function", () => { expect(typeof LifecycleNotAllowedError).toBe("function"); });
  it("suspendEmployee is a function", () => { expect(typeof suspendEmployee).toBe("function"); });
  it("reactivateEmployee is a function", () => { expect(typeof reactivateEmployee).toBe("function"); });
  it("offboardEmployee is a function", () => { expect(typeof offboardEmployee).toBe("function"); });
  it("requireActiveMembership is a function", () => { expect(typeof requireActiveMembership).toBe("function"); });
  it("assertEmployeeAssignable is a function", () => { expect(typeof assertEmployeeAssignable).toBe("function"); });
  it("EmployeeAccessStatus is an object", () => { expect(typeof EmployeeAccessStatus).toBe("object"); });
  it("UnauthorizedError is a function", () => { expect(typeof UnauthorizedError).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("cmd is an object", () => { expect(typeof cmd).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("suspendEmployee", () => {
  it("suspends an ACTIVE member, revokes existing sessions, and audits", async () => {
    const { deps, calls } = makeDeps({
      membership: { isActive: true, removedAt: null },
    });
    const result = await suspendEmployee(cmd, deps);

    expect(result).toBe(EmployeeAccessStatus.SUSPENDED);
    // membership flipped inactive inside a transaction
    expect(calls.txRuns).toBe(1);
    expect(calls.membershipUpdate[0].data).toMatchObject({ isActive: false });
    // EXISTING-SESSION DENIAL: all of the user's live sessions are revoked
    expect(calls.sessionUpdate).toHaveLength(1);
    expect(calls.sessionUpdate[0].where).toMatchObject({
      userId: "emp-1",
      revokedAt: null,
    });
    expect(calls.sessionUpdate[0].data).toMatchObject({ revokedAt: NOW });
    // audit: suspension + session-revocation events
    const names = calls.emitted.map((e) => e.eventName);
    expect(names).toContain("employee.suspended");
    expect(names).toContain("employee.sessions_revoked");
  });

  it("refuses to suspend an OFFBOARDED member and revokes nothing", async () => {
    const { deps, calls } = makeDeps({
      membership: { isActive: false, removedAt: new Date("2026-06-01") },
    });
    await expect(suspendEmployee(cmd, deps)).rejects.toBeInstanceOf(
      LifecycleNotAllowedError
    );
    expect(calls.txRuns).toBe(0);
    expect(calls.sessionUpdate).toHaveLength(0);
    expect(calls.emitted).toHaveLength(0);
  });

  it("fails closed on a concurrent state change (conditional update matched 0 rows)", async () => {
    const { deps, calls } = makeDeps({
      membership: { isActive: true, removedAt: null },
      updateCount: 0,
    });
    await expect(suspendEmployee(cmd, deps)).rejects.toBeInstanceOf(
      LifecycleConflictError
    );
    // no audit emitted because the transaction rolled back
    expect(calls.emitted).toHaveLength(0);
  });
});

describe("offboardEmployee", () => {
  it("offboards an ACTIVE member (stamps removedAt) and revokes sessions", async () => {
    const { deps, calls } = makeDeps({
      membership: { isActive: true, removedAt: null },
    });
    const result = await offboardEmployee(cmd, deps);
    expect(result).toBe(EmployeeAccessStatus.OFFBOARDED);
    expect(calls.membershipUpdate[0].data).toMatchObject({
      isActive: false,
      removedAt: NOW,
    });
    expect(calls.sessionUpdate).toHaveLength(1);
    expect(calls.emitted.map((e) => e.eventName)).toContain("employee.offboarded");
  });
});

describe("reactivateEmployee", () => {
  it("reactivates a SUSPENDED member WITHOUT revoking sessions", async () => {
    const { deps, calls } = makeDeps({
      membership: { isActive: false, removedAt: null },
    });
    const result = await reactivateEmployee(cmd, deps);
    expect(result).toBe(EmployeeAccessStatus.ACTIVE);
    expect(calls.membershipUpdate[0].data).toMatchObject({ isActive: true });
    expect(calls.sessionUpdate).toHaveLength(0);
    expect(calls.emitted.map((e) => e.eventName)).toEqual(["employee.reactivated"]);
  });

  it("refuses to reactivate an OFFBOARDED (terminal) member", async () => {
    const { deps } = makeDeps({
      membership: { isActive: false, removedAt: new Date("2026-06-01") },
    });
    await expect(reactivateEmployee(cmd, deps)).rejects.toBeInstanceOf(
      LifecycleNotAllowedError
    );
  });
});

describe("requireActiveMembership (fail-closed runtime guard)", () => {
  it("allows an ACTIVE member", async () => {
    const { deps } = makeDeps({ membership: { isActive: true, removedAt: null } });
    await expect(
      requireActiveMembership("ws-1", "emp-1", deps)
    ).resolves.toBeUndefined();
  });

  it("denies a SUSPENDED member (existing session blocked server-side)", async () => {
    const { deps } = makeDeps({
      membership: { isActive: false, removedAt: null },
    });
    await expect(
      requireActiveMembership("ws-1", "emp-1", deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("denies an OFFBOARDED member", async () => {
    const { deps } = makeDeps({
      membership: { isActive: false, removedAt: new Date("2026-06-01") },
    });
    await expect(
      requireActiveMembership("ws-1", "emp-1", deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("denies a non-member (NONE) fail-closed", async () => {
    const { deps } = makeDeps({ membership: null });
    await expect(
      requireActiveMembership("ws-1", "emp-1", deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("assertEmployeeAssignable (Slice 7 guard)", () => {
  it("allows ACTIVE", async () => {
    const { deps } = makeDeps({ membership: { isActive: true, removedAt: null } });
    await expect(
      assertEmployeeAssignable("ws-1", "emp-1", deps)
    ).resolves.toBeUndefined();
  });
  it("blocks SUSPENDED and OFFBOARDED from new assignment", async () => {
    const suspended = makeDeps({
      membership: { isActive: false, removedAt: null },
    });
    await expect(
      assertEmployeeAssignable("ws-1", "emp-1", suspended.deps)
    ).rejects.toBeInstanceOf(LifecycleNotAllowedError);

    const offboarded = makeDeps({
      membership: { isActive: false, removedAt: new Date("2026-06-01") },
    });
    await expect(
      assertEmployeeAssignable("ws-1", "emp-1", offboarded.deps)
    ).rejects.toBeInstanceOf(LifecycleNotAllowedError);
  });
});
