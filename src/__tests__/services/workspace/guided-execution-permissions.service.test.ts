import { describe, it, expect } from "vitest";
import {
  PermissionGrantError,
  type PermissionsDeps,
  type PermissionsDb,
  grantPermission,
  revokePermission,
  requirePermission,
  hasPermissionFor,
  getActivePermissions,
} from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission as P } from "@/domain/workspace/guided-execution-permissions";
import { UnauthorizedError } from "@/infra/errors";

const NOW = new Date("2026-06-25T12:00:00.000Z");

type Member = { isActive: boolean; removedAt: Date | null; role: string };

const OWNER: Member = { isActive: true, removedAt: null, role: "OWNER" };
const MANAGER: Member = { isActive: true, removedAt: null, role: "OPERATOR" };
const SUSPENDED: Member = { isActive: false, removedAt: null, role: "OPERATOR" };
const OFFBOARDED: Member = {
  isActive: false,
  removedAt: new Date("2026-06-01"),
  role: "OPERATOR",
};

function makeDeps(initial: {
  members: Record<string, Member>; // key `${ws}:${user}`
  grants?: Record<string, Set<string>>; // key `${ws}:${user}` -> permission values
}) {
  const members = initial.members;
  const grants: Record<string, Set<string>> = initial.grants ?? {};
  const calls = {
    created: [] as Record<string, unknown>[],
    updated: [] as Record<string, unknown>[],
    emitted: [] as { eventName: string; payload?: Record<string, unknown> }[],
  };
  const key = (ws: string, u: string) => `${ws}:${u}`;

  const db: PermissionsDb = {
    workspaceMembership: {
      findUnique: async (args) => {
        const k = args.where.workspaceId_userId as {
          workspaceId: string;
          userId: string;
        };
        return members[key(k.workspaceId, k.userId)] ?? null;
      },
    },
    userRoleAssignment: {
      findMany: async (args) => {
        const w = args.where as { scopeId: string; userId: string };
        const s = grants[key(w.scopeId, w.userId)] ?? new Set<string>();
        return Array.from(s).map((role) => ({ role }));
      },
      findFirst: async (args) => {
        const w = args.where as {
          scopeId: string;
          userId: string;
          role: string;
        };
        const s = grants[key(w.scopeId, w.userId)] ?? new Set<string>();
        return s.has(w.role) ? { id: `row-${w.role}`, isActive: true } : null;
      },
      create: async (args) => {
        calls.created.push(args.data);
        const d = args.data as {
          scopeId: string;
          userId: string;
          role: string;
        };
        (grants[key(d.scopeId, d.userId)] ??= new Set()).add(d.role);
        return {};
      },
      updateMany: async (args) => {
        calls.updated.push(args);
        const w = args.where as {
          scopeId: string;
          userId: string;
          role: string;
        };
        const data = args.data as { isActive?: boolean };
        const k = key(w.scopeId, w.userId);
        const s = grants[k];
        if (data.isActive === false) {
          if (s && s.has(w.role)) {
            s.delete(w.role);
            return { count: 1 };
          }
          return { count: 0 };
        }
        (grants[k] ??= new Set()).add(w.role);
        return { count: 1 };
      },
    },
  };

  const deps: PermissionsDeps = {
    db,
    emit: async (e) => {
      calls.emitted.push({ eventName: e.eventName, payload: e.payload });
      return "evt";
    },
    now: () => NOW,
  };
  return { deps, calls, grants };
}

const WS = "ws-1";
const OWNER_ID = "owner-1";
const MGR_ID = "mgr-1";

describe("grantPermission", () => {
  it("owner can grant a grantable permission to a manager (and it is audited)", async () => {
    const { deps, calls } = makeDeps({
      members: { [`${WS}:${OWNER_ID}`]: OWNER, [`${WS}:${MGR_ID}`]: MANAGER },
    });
    await grantPermission({
      workspaceId: WS,
      userId: MGR_ID,
      permission: P.PROOF_REVIEW_PAYMENT,
      actorId: OWNER_ID,
    }, deps);

    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({
      userId: MGR_ID,
      role: P.PROOF_REVIEW_PAYMENT,
      scope: "workspace",
      scopeId: WS,
    });
    expect(calls.emitted.map((e) => e.eventName)).toContain("permission.granted");
    // manager can now review payment proof
    await expect(
      hasPermissionFor(WS, MGR_ID, P.PROOF_REVIEW_PAYMENT, deps)
    ).resolves.toBe(true);
  });

  it("a non-owner actor cannot grant", async () => {
    const { deps } = makeDeps({
      members: {
        [`${WS}:${MGR_ID}`]: MANAGER,
        [`${WS}:emp-1`]: MANAGER,
      },
    });
    await expect(
      grantPermission(
        { workspaceId: WS, userId: "emp-1", permission: P.VIEW_TEAM_TASKS, actorId: MGR_ID },
        deps
      )
    ).rejects.toBeInstanceOf(PermissionGrantError);
  });

  it("owner-only permissions cannot be delegated", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${OWNER_ID}`]: OWNER, [`${WS}:${MGR_ID}`]: MANAGER },
    });
    await expect(
      grantPermission(
        { workspaceId: WS, userId: MGR_ID, permission: P.APPROVE_REFUND, actorId: OWNER_ID },
        deps
      )
    ).rejects.toBeInstanceOf(PermissionGrantError);
  });

  it("cannot grant to a non-ACTIVE member", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${OWNER_ID}`]: OWNER, [`${WS}:${MGR_ID}`]: SUSPENDED },
    });
    await expect(
      grantPermission(
        { workspaceId: WS, userId: MGR_ID, permission: P.VIEW_TEAM_TASKS, actorId: OWNER_ID },
        deps
      )
    ).rejects.toBeInstanceOf(PermissionGrantError);
  });
});

describe("requirePermission (server-side, fail-closed)", () => {
  it("manager without the grant cannot review proof", async () => {
    const { deps } = makeDeps({ members: { [`${WS}:${MGR_ID}`]: MANAGER } });
    await expect(
      requirePermission(WS, MGR_ID, P.PROOF_REVIEW_COMPLAINT, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("manager with the grant can review the allowed proof", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${MGR_ID}`]: MANAGER },
      grants: { [`${WS}:${MGR_ID}`]: new Set([P.PROOF_REVIEW_COMPLAINT]) },
    });
    await expect(
      requirePermission(WS, MGR_ID, P.PROOF_REVIEW_COMPLAINT, deps)
    ).resolves.toBeUndefined();
  });

  it("employee cannot approve routine completion without the grant", async () => {
    const { deps } = makeDeps({ members: { [`${WS}:emp-1`]: MANAGER } });
    await expect(
      requirePermission(WS, "emp-1", P.APPROVE_ROUTINE_COMPLETION, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("employee cannot verify outcome or approve learning even if a grant row exists (owner-only)", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:emp-1`]: MANAGER },
      grants: {
        [`${WS}:emp-1`]: new Set([P.VERIFY_FINAL_OUTCOME, P.APPROVE_LEARNING]),
      },
    });
    await expect(
      requirePermission(WS, "emp-1", P.VERIFY_FINAL_OUTCOME, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      requirePermission(WS, "emp-1", P.APPROVE_LEARNING, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("owner passes owner-only checks", async () => {
    const { deps } = makeDeps({ members: { [`${WS}:${OWNER_ID}`]: OWNER } });
    await expect(
      requirePermission(WS, OWNER_ID, P.VERIFY_FINAL_OUTCOME, deps)
    ).resolves.toBeUndefined();
  });

  it("SUSPENDED member cannot use a previously-granted permission", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${MGR_ID}`]: SUSPENDED },
      grants: { [`${WS}:${MGR_ID}`]: new Set([P.PROOF_REVIEW_PAYMENT]) },
    });
    await expect(
      requirePermission(WS, MGR_ID, P.PROOF_REVIEW_PAYMENT, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("OFFBOARDED member cannot use a previously-granted permission", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${MGR_ID}`]: OFFBOARDED },
      grants: { [`${WS}:${MGR_ID}`]: new Set([P.PROOF_REVIEW_PAYMENT]) },
    });
    await expect(
      requirePermission(WS, MGR_ID, P.PROOF_REVIEW_PAYMENT, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("workspace scoping", () => {
  it("a grant in one workspace cannot be used in another", async () => {
    // member is a manager in both ws-1 and ws-2; granted only in ws-1
    const { deps } = makeDeps({
      members: {
        [`ws-1:${MGR_ID}`]: MANAGER,
        [`ws-2:${MGR_ID}`]: MANAGER,
      },
      grants: { [`ws-1:${MGR_ID}`]: new Set([P.VIEW_TEAM_TASKS]) },
    });
    await expect(
      hasPermissionFor("ws-1", MGR_ID, P.VIEW_TEAM_TASKS, deps)
    ).resolves.toBe(true);
    await expect(
      hasPermissionFor("ws-2", MGR_ID, P.VIEW_TEAM_TASKS, deps)
    ).resolves.toBe(false);
  });
});

describe("revokePermission", () => {
  it("owner can revoke a grant; it is audited and the permission is lost", async () => {
    const { deps, calls } = makeDeps({
      members: { [`${WS}:${OWNER_ID}`]: OWNER, [`${WS}:${MGR_ID}`]: MANAGER },
      grants: { [`${WS}:${MGR_ID}`]: new Set([P.VIEW_TEAM_TASKS]) },
    });
    await revokePermission(
      { workspaceId: WS, userId: MGR_ID, permission: P.VIEW_TEAM_TASKS, actorId: OWNER_ID },
      deps
    );
    expect(calls.emitted.map((e) => e.eventName)).toContain("permission.revoked");
    await expect(
      hasPermissionFor(WS, MGR_ID, P.VIEW_TEAM_TASKS, deps)
    ).resolves.toBe(false);
  });

  it("a non-owner cannot revoke", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${MGR_ID}`]: MANAGER },
      grants: { [`${WS}:emp-1`]: new Set([P.VIEW_TEAM_TASKS]) },
    });
    await expect(
      revokePermission(
        { workspaceId: WS, userId: "emp-1", permission: P.VIEW_TEAM_TASKS, actorId: MGR_ID },
        deps
      )
    ).rejects.toBeInstanceOf(PermissionGrantError);
  });
});

describe("getActivePermissions", () => {
  it("lists only active grantable permission values", async () => {
    const { deps } = makeDeps({
      members: { [`${WS}:${MGR_ID}`]: MANAGER },
      grants: {
        [`${WS}:${MGR_ID}`]: new Set([P.VIEW_TEAM_TASKS, P.PROOF_REVIEW_LOW_RISK]),
      },
    });
    const perms = await getActivePermissions(WS, MGR_ID, deps);
    expect(perms.sort()).toEqual(
      [P.PROOF_REVIEW_LOW_RISK, P.VIEW_TEAM_TASKS].sort()
    );
  });
});
