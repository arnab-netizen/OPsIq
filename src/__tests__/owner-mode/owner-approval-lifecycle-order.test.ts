/**
 * Owner-approval lifecycle order: OWNER_APPROVAL_REQUIRED work is approved BEFORE it starts
 * (PROPOSED → APPROVED → IN_PROGRESS). Proves the server transition guard
 * (applyProcessExecutionAction), the shared cockpit affordance (allowedCockpitActions) and the
 * domain canStart flag all agree, and that non-owner-approval tasks keep their existing START.
 * Mocked-DB pattern mirrors process-execution-request-reassessment-businessid.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { applyProcessExecutionAction, type ProcessBridgeDb } from "@/services/owner-mode/process-execution-bridge.service";
import { allowedCockpitActions, type BridgedRouteView } from "@/components/owner/MinimumOwnerCockpit";
import { computeCanStart } from "@/domain/owner-mode/process-execution-bridge";

const WS = "aaaaaaaa-aaaa-4000-8000-000000000001";
const KEY = "pc:corr-1";

function task(over: Record<string, unknown> = {}) {
  return {
    id: "task-1", workspaceId: WS, businessId: null, taskKey: KEY, status: "PROPOSED",
    executionRoute: "CREATE_OWNER_APPROVAL_TASK", approvalLevel: "OWNER_APPROVAL_REQUIRED",
    sourceFindingKey: "corr-1", sourceFamily: "PROCESS_CORRECTION", evidenceRefs: [], workStartedAt: null, ...over,
  };
}

function harness(t: Record<string, unknown>) {
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const auditCreate = vi.fn(async () => ({}));
  const tx = { processExecutionTask: { updateMany }, auditEvent: { create: auditCreate }, startupOwnerDecision: { updateMany } };
  const db = {
    processExecutionTask: { findFirst: vi.fn(async () => t), updateMany },
    ownerBusiness: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (x: unknown) => unknown) => fn(tx)),
  };
  const run = (action: "START" | "APPROVE", actorRole: string = "owner") =>
    applyProcessExecutionAction(
      { workspaceId: WS, actorId: "actor-1", actorRole: actorRole as "owner", taskKey: KEY, action },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-30T00:00:00Z") },
    );
  return { run, updateMany, auditCreate };
}

const view = (status: string, approvalLevel = "OWNER_APPROVAL_REQUIRED") =>
  ({ status, approvalLevel, executionRoute: "CREATE_OWNER_APPROVAL_TASK" }) as unknown as BridgedRouteView;

describe("owner-approval lifecycle order", () => {
  it("C1/C3: PROPOSED owner-approval task can be approved by the owner → APPROVED, with audit", async () => {
    const h = harness(task());
    const r = await h.run("APPROVE");
    expect(r).toMatchObject({ ok: true, status: "APPROVED" });
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("C2: START directly from PROPOSED is refused and nothing is written", async () => {
    const h = harness(task());
    const r = await h.run("START");
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("OWNER_APPROVAL_REQUIRED");
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("C2b: START from ACKNOWLEDGED / BLOCKED / NEEDS_DATA cannot bypass approval", async () => {
    for (const status of ["ACKNOWLEDGED", "BLOCKED", "NEEDS_DATA"]) {
      const h = harness(task({ status }));
      expect((await h.run("START")).ok).toBe(false);
      expect(h.updateMany).not.toHaveBeenCalled();
    }
  });

  it("C4/C5: START from APPROVED is allowed → IN_PROGRESS", async () => {
    const h = harness(task({ status: "APPROVED" }));
    expect(await h.run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });

  it("C6: APPROVE after work is IN_PROGRESS is refused (the reversed START → APPROVE order)", async () => {
    const h = harness(task({ status: "IN_PROGRESS" }));
    const r = await h.run("APPROVE");
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("INVALID_TRANSITION");
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("C7: a non-owner actor cannot approve", async () => {
    const h = harness(task());
    const r = await h.run("APPROVE", "manager");
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("OWNER_APPROVAL_REQUIRED");
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("C8: a non-owner-approval task keeps its existing START from PROPOSED", async () => {
    const h = harness(task({ approvalLevel: "MANAGER_APPROVAL_REQUIRED", executionRoute: "CREATE_MANAGER_TASK" }));
    expect(await h.run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });
});

describe("cockpit affordances mirror the server", () => {
  it("PROPOSED owner-approval: APPROVE offered, START not offered", () => {
    const a = allowedCockpitActions(view("PROPOSED"));
    expect(a).toContain("APPROVE");
    expect(a).not.toContain("START");
  });
  it("APPROVED owner-approval: START offered, APPROVE not", () => {
    const a = allowedCockpitActions(view("APPROVED"));
    expect(a).toContain("START");
    expect(a).not.toContain("APPROVE");
  });
  it("IN_PROGRESS owner-approval: APPROVE not offered", () => {
    expect(allowedCockpitActions(view("IN_PROGRESS"))).not.toContain("APPROVE");
  });
  it("non-owner-approval PROPOSED task still offers START", () => {
    expect(allowedCockpitActions(view("PROPOSED", "MANAGER_APPROVAL_REQUIRED"))).toContain("START");
  });
  it("canStart follows the same rule", () => {
    expect(computeCanStart("CREATE_OWNER_APPROVAL_TASK", "PROPOSED", "OWNER_APPROVAL_REQUIRED")).toBe(false);
    expect(computeCanStart("CREATE_OWNER_APPROVAL_TASK", "APPROVED", "OWNER_APPROVAL_REQUIRED")).toBe(true);
    expect(computeCanStart("CREATE_MANAGER_TASK", "PROPOSED", "MANAGER_APPROVAL_REQUIRED")).toBe(true);
  });
});
