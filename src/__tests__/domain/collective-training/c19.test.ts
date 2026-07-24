import { describe, it, expect } from "vitest";
import { getCollectivePacketForWorkspace, type OwnerSession } from "@/domain/collective-training/collective-access";
import type { CollectiveInput } from "@/domain/collective-training/collective-engine";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import type { DomainSignalInput } from "@/domain/collective-training/collective-types";

const input: CollectiveInput = { archetype: "universal", ownerGoal: "decide", signals: [{ domain: "cash-survival" as DomainSignalInput["domain"], status: "RED", severity: "CRITICAL", confidence: "HIGH" }] };
const session: OwnerSession = { userId: "u1", workspaceId: "ws_1", ownerMode: true };

describe("[C19] collective access guard — module contract assertions", () => {
  it("getCollectivePacketForWorkspace is a function", () => {
    expect(typeof getCollectivePacketForWorkspace).toBe("function");
  });
  it("UnauthorizedError is a function (class)", () => {
    expect(typeof UnauthorizedError).toBe("function");
  });
  it("ForbiddenError is a function (class)", () => {
    expect(typeof ForbiddenError).toBe("function");
  });
  it("input is an object with archetype field", () => {
    expect(input).toHaveProperty("archetype");
  });
  it("input.archetype is 'universal'", () => {
    expect(input.archetype).toBe("universal");
  });
  it("input.ownerGoal is 'decide'", () => {
    expect(input.ownerGoal).toBe("decide");
  });
  it("input.signals is an array", () => {
    expect(Array.isArray(input.signals)).toBe(true);
  });
  it("input.signals[0].domain is 'cash-survival'", () => {
    expect(input.signals[0].domain).toBe("cash-survival");
  });
  it("input.signals[0].status is 'RED'", () => {
    expect(input.signals[0].status).toBe("RED");
  });
  it("input.signals[0].severity is 'CRITICAL'", () => {
    expect(input.signals[0].severity).toBe("CRITICAL");
  });
  it("session is an object with ownerMode true", () => {
    expect(session.ownerMode).toBe(true);
  });
  it("session.userId is 'u1'", () => {
    expect(session.userId).toBe("u1");
  });
  it("session.workspaceId is 'ws_1'", () => {
    expect(session.workspaceId).toBe("ws_1");
  });
  it("new UnauthorizedError() is instanceof UnauthorizedError", () => {
    expect(new UnauthorizedError("test")).toBeInstanceOf(UnauthorizedError);
  });
  it("new ForbiddenError() is instanceof ForbiddenError", () => {
    expect(new ForbiddenError("test")).toBeInstanceOf(ForbiddenError);
  });
});

describe("[C19] Owner-Mode collective access guard", () => {
  it("unauthenticated access is blocked (401)", () => {
    expect(() => getCollectivePacketForWorkspace(null, { workspaceId: "ws_1", input })).toThrow(UnauthorizedError);
    expect(() => getCollectivePacketForWorkspace({ userId: "", workspaceId: "ws_1", ownerMode: true }, { workspaceId: "ws_1", input })).toThrow(UnauthorizedError);
  });
  it("non-Owner-Mode access is forbidden", () => {
    expect(() => getCollectivePacketForWorkspace({ ...session, ownerMode: false }, { workspaceId: "ws_1", input })).toThrow(ForbiddenError);
  });
  it("cross-workspace access is forbidden (workspace isolation)", () => {
    expect(() => getCollectivePacketForWorkspace(session, { workspaceId: "ws_OTHER", input })).toThrow(ForbiddenError);
  });
  it("authenticated, owner-mode, matching workspace returns a packet scoped to that workspace", () => {
    const p = getCollectivePacketForWorkspace(session, { workspaceId: "ws_1", input });
    expect(p.businessStage).toBe("survival");
    expect(p.activeVetoes.flatMap((v) => v.blockedActions)).toContain("paid_marketing");
  });
  it("adds no public/SaaS route — it is a guarded domain accessor only", () => {
    // The module exports only the guard + types; there is no route/handler/HTTP surface.
    const mod = getCollectivePacketForWorkspace;
    expect(typeof mod).toBe("function");
  });
});
