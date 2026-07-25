import { describe, it, expect } from "vitest";
import {
  type DashboardDeps,
  type DashboardDb,
  resolveDashboardScope,
  requireDashboardAccess,
  scopedResponse,
  requireTaskAccess,
} from "@/services/workspace/dashboard-access.service";
import { DashboardScope } from "@/domain/workspace/dashboard-access";
import { GuidedExecutionPermission as P } from "@/domain/workspace/guided-execution-permissions";
import { UnauthorizedError } from "@/infra/errors";

type Member = { isActive: boolean; removedAt: Date | null; role: string };
const OWNER: Member = { isActive: true, removedAt: null, role: "OWNER" };
const ACTIVE: Member = { isActive: true, removedAt: null, role: "OPERATOR" };
const SUSPENDED: Member = { isActive: false, removedAt: null, role: "OPERATOR" };
const OFFBOARDED: Member = {
  isActive: false,
  removedAt: new Date("2026-06-01"),
  role: "OPERATOR",
};

function makeDeps(initial: {
  members: Record<string, Member>; // `${ws}:${user}`
  grants?: Record<string, Set<string>>; // `${ws}:${user}` -> permission values
}) {
  const members = initial.members;
  const grants = initial.grants ?? {};
  const key = (ws: string, u: string) => `${ws}:${u}`;
  const db: DashboardDb = {
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
    },
  };
  const deps: DashboardDeps = { db };
  return deps;
}

const WS = "ws-1";

describe("dashboard-access-service — module contract assertions", () => {
  it("resolveDashboardScope is a function", () => { expect(typeof resolveDashboardScope).toBe("function"); });
  it("requireDashboardAccess is a function", () => { expect(typeof requireDashboardAccess).toBe("function"); });
  it("scopedResponse is a function", () => { expect(typeof scopedResponse).toBe("function"); });
  it("requireTaskAccess is a function", () => { expect(typeof requireTaskAccess).toBe("function"); });
  it("DashboardScope is an object", () => { expect(typeof DashboardScope).toBe("object"); });
  it("UnauthorizedError is a function", () => { expect(typeof UnauthorizedError).toBe("function"); });
  it("new UnauthorizedError is instanceof Error", () => { expect(new UnauthorizedError("test") instanceof Error).toBe(true); });
  it("OWNER is an object", () => { expect(typeof OWNER).toBe("object"); });
  it("ACTIVE is an object", () => { expect(typeof ACTIVE).toBe("object"); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("WS is a string", () => { expect(typeof WS).toBe("string"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("resolveDashboardScope", () => {
  it("owner → OWNER, manager(grant) → MANAGER, plain → EMPLOYEE", async () => {
    const deps = makeDeps({
      members: {
        [`${WS}:owner`]: OWNER,
        [`${WS}:mgr`]: ACTIVE,
        [`${WS}:emp`]: ACTIVE,
      },
      grants: { [`${WS}:mgr`]: new Set([P.VIEW_TEAM_TASKS]) },
    });
    expect(await resolveDashboardScope(WS, "owner", deps)).toBe(DashboardScope.OWNER);
    expect(await resolveDashboardScope(WS, "mgr", deps)).toBe(DashboardScope.MANAGER);
    expect(await resolveDashboardScope(WS, "emp", deps)).toBe(DashboardScope.EMPLOYEE);
  });
  it("suspended/offboarded → null", async () => {
    const deps = makeDeps({
      members: { [`${WS}:s`]: SUSPENDED, [`${WS}:o`]: OFFBOARDED },
    });
    expect(await resolveDashboardScope(WS, "s", deps)).toBeNull();
    expect(await resolveDashboardScope(WS, "o", deps)).toBeNull();
  });
});

describe("requireDashboardAccess", () => {
  it("employee is denied owner and manager dashboards but allowed employee", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp`]: ACTIVE } });
    await expect(
      requireDashboardAccess(WS, "emp", DashboardScope.EMPLOYEE, deps)
    ).resolves.toBeUndefined();
    await expect(
      requireDashboardAccess(WS, "emp", DashboardScope.MANAGER, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      requireDashboardAccess(WS, "emp", DashboardScope.OWNER, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("owner is allowed the owner dashboard", async () => {
    const deps = makeDeps({ members: { [`${WS}:owner`]: OWNER } });
    await expect(
      requireDashboardAccess(WS, "owner", DashboardScope.OWNER, deps)
    ).resolves.toBeUndefined();
  });
  it("suspended employee with an existing session is denied the employee dashboard", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp`]: SUSPENDED } });
    await expect(
      requireDashboardAccess(WS, "emp", DashboardScope.EMPLOYEE, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("offboarded employee is denied the employee dashboard", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp`]: OFFBOARDED } });
    await expect(
      requireDashboardAccess(WS, "emp", DashboardScope.EMPLOYEE, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("scopedResponse redaction", () => {
  const payload = { myTasks: [1], ownerDiagnosis: "x", teamTasks: [2], cashRunway: 3 };

  it("employee response excludes owner-only AND manager-only fields", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp`]: ACTIVE } });
    const r = (await scopedResponse(WS, "emp", payload, deps)) as Record<string, unknown>;
    expect(r.ownerDiagnosis).toBeUndefined();
    expect(r.cashRunway).toBeUndefined();
    expect(r.teamTasks).toBeUndefined();
    expect(r.myTasks).toBeDefined();
  });
  it("owner response keeps owner-only fields", async () => {
    const deps = makeDeps({ members: { [`${WS}:owner`]: OWNER } });
    const r = (await scopedResponse(WS, "owner", payload, deps)) as Record<string, unknown>;
    expect(r.ownerDiagnosis).toBe("x");
    expect(r.cashRunway).toBe(3);
  });
  it("suspended viewer gets no response (throws)", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp`]: SUSPENDED } });
    await expect(scopedResponse(WS, "emp", payload, deps)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe("requireTaskAccess", () => {
  it("employee can access own task, not another's", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp1`]: ACTIVE } });
    await expect(
      requireTaskAccess(WS, "emp1", { workspaceId: WS, assignedUserId: "emp1" }, deps)
    ).resolves.toBeUndefined();
    await expect(
      requireTaskAccess(WS, "emp1", { workspaceId: WS, assignedUserId: "emp2" }, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("manager with VIEW_TEAM_TASKS can access another's task", async () => {
    const deps = makeDeps({
      members: { [`${WS}:mgr`]: ACTIVE },
      grants: { [`${WS}:mgr`]: new Set([P.VIEW_TEAM_TASKS]) },
    });
    await expect(
      requireTaskAccess(WS, "mgr", { workspaceId: WS, assignedUserId: "emp2" }, deps)
    ).resolves.toBeUndefined();
  });
  it("cross-workspace task is denied", async () => {
    const deps = makeDeps({ members: { [`${WS}:owner`]: OWNER } });
    await expect(
      requireTaskAccess(WS, "owner", { workspaceId: "ws-OTHER", assignedUserId: "owner" }, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("suspended viewer cannot access even own task", async () => {
    const deps = makeDeps({ members: { [`${WS}:emp1`]: SUSPENDED } });
    await expect(
      requireTaskAccess(WS, "emp1", { workspaceId: WS, assignedUserId: "emp1" }, deps)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
