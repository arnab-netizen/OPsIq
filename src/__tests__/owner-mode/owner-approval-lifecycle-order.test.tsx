/**
 * Owner-approval lifecycle order: OWNER_APPROVAL_REQUIRED work is approval-first.
 *   PROPOSED | ACKNOWLEDGED | BLOCKED | NEEDS_DATA → APPROVE → APPROVED → START → IN_PROGRESS
 * Progress, pausing (block / needs-data) and completion are only valid IN_PROGRESS; SUBMIT_EVIDENCE never starts work.
 * Proves the server guards (applyProcessExecutionAction), the ONE shared affordance policy, and that both UI surfaces
 * (MinimumOwnerCockpit, ProcessExecutionBridgePanel) offer the same transitions. Mocked-DB pattern mirrors
 * process-execution-request-reassessment-businessid.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { applyProcessExecutionAction, type ProcessBridgeDb } from "@/services/owner-mode/process-execution-bridge.service";
import { MinimumOwnerCockpit, allowedCockpitActions } from "@/components/owner/MinimumOwnerCockpit";
import { ProcessExecutionBridgePanel, type BridgedRouteView } from "@/components/owner/ProcessIntelligencePanel";
import { allowedProcessTaskActions, computeCanStart } from "@/domain/owner-mode/process-execution-bridge";

afterEach(() => cleanup());

const WS = "aaaaaaaa-aaaa-4000-8000-000000000001";
const KEY = "pc:corr-1";
const OWNER_LEVEL = "OWNER_APPROVAL_REQUIRED";

function task(over: Record<string, unknown> = {}) {
  return {
    id: "task-1", workspaceId: WS, businessId: null, taskKey: KEY, status: "PROPOSED",
    executionRoute: "CREATE_OWNER_APPROVAL_TASK", approvalLevel: OWNER_LEVEL,
    sourceFindingKey: "corr-1", sourceFamily: "PROCESS_CORRECTION", evidenceRefs: [], requiredEvidence: ["decision evidence"],
    workStartedAt: null, ...over,
  };
}

function harness(t: Record<string, unknown>) {
  const updateMany = vi.fn(async (_a: unknown) => ({ count: 1 }));
  const auditCreate = vi.fn(async () => ({}));
  const progressCreate = vi.fn(async () => ({ id: "prog-1" }));
  const tx = {
    processExecutionTask: { updateMany }, auditEvent: { create: auditCreate },
    startupOwnerDecision: { updateMany }, processExecutionTaskProgress: { create: progressCreate },
  };
  const db = {
    processExecutionTask: { findFirst: vi.fn(async () => t), updateMany },
    processExecutionTaskProgress: { create: progressCreate },
    ownerBusiness: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (x: unknown) => unknown) => fn(tx)),
  };
  const run = (action: string, extra: Record<string, unknown> = {}, actorRole: string = "owner") =>
    applyProcessExecutionAction(
      { workspaceId: WS, actorId: "actor-1", actorRole: actorRole as "owner", taskKey: KEY, action: action as "START", ...extra },
      { db: db as unknown as ProcessBridgeDb, uuid: () => "u1", now: () => new Date("2026-09-30T00:00:00Z") },
    );
  return { run, updateMany };
}

const code = (r: unknown) => (r as { code?: string }).code;
const PRE_WORK = ["PROPOSED", "ACKNOWLEDGED", "APPROVED", "BLOCKED", "NEEDS_DATA"];

describe("server: owner-approval task is approval-first", () => {
  it("C1: PROPOSED — APPROVE accepted; START, COMPLETE, RECORD_PROGRESS, MARK_BLOCKED refused", async () => {
    expect(await harness(task()).run("APPROVE")).toMatchObject({ ok: true, status: "APPROVED" });
    for (const [action, extra] of [["START", {}], ["COMPLETE", { evidenceRefs: ["e1"] }], ["RECORD_PROGRESS", {}], ["MARK_BLOCKED", { reason: "x" }]] as const) {
      const h = harness(task());
      expect((await h.run(action, extra)).ok, action).toBe(false);
      expect(h.updateMany, action).not.toHaveBeenCalled();
    }
  });

  it("C2: ACKNOWLEDGED — APPROVE accepted; START and RECORD_PROGRESS refused", async () => {
    expect(await harness(task({ status: "ACKNOWLEDGED" })).run("APPROVE")).toMatchObject({ ok: true, status: "APPROVED" });
    expect((await harness(task({ status: "ACKNOWLEDGED" })).run("START")).ok).toBe(false);
    expect((await harness(task({ status: "ACKNOWLEDGED" })).run("RECORD_PROGRESS")).ok).toBe(false);
  });

  it("C3/C4: APPROVED — START → IN_PROGRESS; APPROVE, COMPLETE, RECORD_PROGRESS refused", async () => {
    expect(await harness(task({ status: "APPROVED" })).run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
    expect(code(await harness(task({ status: "APPROVED" })).run("APPROVE"))).toBe("INVALID_TRANSITION");
    expect((await harness(task({ status: "APPROVED" })).run("COMPLETE", { evidenceRefs: ["e1"] })).ok).toBe(false);
    expect((await harness(task({ status: "APPROVED" })).run("RECORD_PROGRESS")).ok).toBe(false);
  });

  it("C5: IN_PROGRESS — APPROVE refused; RECORD_PROGRESS, MARK_BLOCKED, REQUEST_MISSING_DATA permitted; COMPLETE proceeds with evidence", async () => {
    expect(code(await harness(task({ status: "IN_PROGRESS" })).run("APPROVE"))).toBe("INVALID_TRANSITION");
    expect((await harness(task({ status: "IN_PROGRESS" })).run("RECORD_PROGRESS")).ok).toBe(true);
    expect(await harness(task({ status: "IN_PROGRESS" })).run("MARK_BLOCKED", { reason: "waiting" })).toMatchObject({ ok: true, status: "BLOCKED" });
    expect(await harness(task({ status: "IN_PROGRESS" })).run("REQUEST_MISSING_DATA")).toMatchObject({ ok: true, status: "NEEDS_DATA" });
    expect(await harness(task({ status: "IN_PROGRESS" })).run("COMPLETE", { evidenceRefs: ["e1"] })).toMatchObject({ ok: true, status: "COMPLETED" });
    // Existing evidence gate is intact.
    expect(code(await harness(task({ status: "IN_PROGRESS" })).run("COMPLETE"))).toBe("EVIDENCE_REQUIRED");
  });

  for (const paused of ["BLOCKED", "NEEDS_DATA"] as const) {
    it(`C6/C7: ${paused} — direct START refused; APPROVE (resume) → APPROVED; START → IN_PROGRESS`, async () => {
      const direct = harness(task({ status: paused }));
      expect((await direct.run("START")).ok).toBe(false);
      expect(direct.updateMany).not.toHaveBeenCalled();
      expect(await harness(task({ status: paused })).run("APPROVE")).toMatchObject({ ok: true, status: "APPROVED" });
      expect(await harness(task({ status: "APPROVED" })).run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
    });
  }

  it("C8: SUBMIT_EVIDENCE on PROPOSED persists evidence and leaves the task PROPOSED", async () => {
    const h = harness(task());
    const r = await h.run("SUBMIT_EVIDENCE", { evidenceRefs: ["doc-1"] });
    expect(r).toMatchObject({ ok: true, status: "PROPOSED" });
    expect(h.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ evidenceRefs: ["doc-1"], status: "PROPOSED" }) }));
  });

  it("C9: COMPLETE is refused from every pre-work status", async () => {
    for (const status of PRE_WORK) {
      const h = harness(task({ status }));
      const r = await h.run("COMPLETE", { evidenceRefs: ["e1", "e2"], outcomeNotes: "done" });
      expect(r.ok, status).toBe(false);
      expect(code(r), status).toBe("INVALID_TRANSITION");
      expect(h.updateMany, status).not.toHaveBeenCalled();
    }
  });

  it("MARK_BLOCKED / REQUEST_MISSING_DATA are refused before work is in progress", async () => {
    for (const status of PRE_WORK) {
      expect((await harness(task({ status })).run("MARK_BLOCKED", { reason: "x" })).ok, status).toBe(false);
      expect((await harness(task({ status })).run("REQUEST_MISSING_DATA")).ok, status).toBe(false);
    }
  });

  it("C10: a non-owner actor cannot approve or resume", async () => {
    for (const status of ["PROPOSED", "BLOCKED"]) {
      const h = harness(task({ status }));
      expect(code(await h.run("APPROVE", {}, "manager"))).toBe("OWNER_APPROVAL_REQUIRED");
      expect(h.updateMany).not.toHaveBeenCalled();
    }
  });

  it("C11: a non-owner-approval task keeps its existing behavior (START from PROPOSED, evidence starts work, pause/complete unchanged)", async () => {
    const mgr = { approvalLevel: "MANAGER_APPROVAL_REQUIRED", executionRoute: "CREATE_MANAGER_TASK" };
    expect(await harness(task({ ...mgr })).run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
    expect(await harness(task({ ...mgr, status: "BLOCKED" })).run("START")).toMatchObject({ ok: true, status: "IN_PROGRESS" });
    expect(await harness(task({ ...mgr })).run("SUBMIT_EVIDENCE", { evidenceRefs: ["e"] })).toMatchObject({ ok: true, status: "IN_PROGRESS" });
    expect(await harness(task({ ...mgr })).run("MARK_BLOCKED", { reason: "x" })).toMatchObject({ ok: true, status: "BLOCKED" });
    expect(await harness(task({ ...mgr, status: "IN_PROGRESS" })).run("COMPLETE", { evidenceRefs: ["e"] })).toMatchObject({ ok: true, status: "COMPLETED" });
  });
});

const view = (status: string, approvalLevel = OWNER_LEVEL): BridgedRouteView => ({
  taskKey: KEY, sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "corr-1",
  executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel,
  requiredEvidence: ["decision evidence"], completionCriteria: "c", reassessmentTrigger: "r", riskIfIgnored: "risk",
  ownerVisibleSummary: "Approve the correction", notActionableReason: null, evidenceRefs: [], severity: "HIGH", priorityRank: 1,
  status, canStart: false,
} as unknown as BridgedRouteView);

function panelActions(v: BridgedRouteView): string[] {
  const { container, unmount } = render(
    <ProcessExecutionBridgePanel data={{ routes: [v], topRoute: v, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } }} onAction={() => {}} />,
  );
  const out = Array.from(container.querySelectorAll('[data-testid^="bridge-action-"]')).map((e) => e.getAttribute("data-testid")!.replace("bridge-action-", ""));
  unmount();
  return out;
}

function cockpitActions(v: BridgedRouteView): string[] {
  const { container, unmount } = render(
    <MinimumOwnerCockpit bridge={{ routes: [v], topRoute: v, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } } as never} onAction={() => {}} />,
  );
  const out = Array.from(container.querySelectorAll('[data-testid^="cockpit-action-"]')).map((e) => e.getAttribute("data-testid")!.replace("cockpit-action-", ""));
  unmount();
  return out;
}

describe("C12: one affordance policy, identical on every UI surface", () => {
  const STATUSES = ["PROPOSED", "ACKNOWLEDGED", "APPROVED", "IN_PROGRESS", "BLOCKED", "NEEDS_DATA"];

  it("policy offers exactly the permitted owner-approval transitions", () => {
    const a = (s: string) => allowedProcessTaskActions(view(s));
    for (const s of ["PROPOSED", "ACKNOWLEDGED", "BLOCKED", "NEEDS_DATA"]) {
      expect(a(s), s).toContain("APPROVE");
      expect(a(s), s).not.toContain("START");
      expect(a(s), s).not.toContain("COMPLETE");
    }
    expect(a("APPROVED")).toContain("START");
    expect(a("APPROVED")).not.toContain("APPROVE");
    expect(a("APPROVED")).not.toContain("COMPLETE");
    expect(a("IN_PROGRESS")).not.toContain("APPROVE");
    expect(a("IN_PROGRESS")).not.toContain("START");
    for (const x of ["COMPLETE", "MARK_BLOCKED", "REQUEST_MISSING_DATA"]) expect(a("IN_PROGRESS")).toContain(x);
    for (const s of ["PROPOSED", "ACKNOWLEDGED", "APPROVED", "BLOCKED", "NEEDS_DATA"]) expect(a(s)).not.toContain("MARK_BLOCKED");
  });

  it("MinimumOwnerCockpit helper, the cockpit render and the bridge panel all match the policy", () => {
    for (const s of STATUSES) {
      const v = view(s);
      const policy = allowedProcessTaskActions(v);
      expect(allowedCockpitActions(v), s).toEqual(policy);
      const panel = panelActions(v);
      expect(panel, `panel ${s}`).toEqual(policy.filter((x) => panel.includes(x)));
      expect(panel.includes("APPROVE"), `panel APPROVE ${s}`).toBe(policy.includes("APPROVE"));
      expect(panel.includes("START"), `panel START ${s}`).toBe(policy.includes("START"));
      const cockpit = cockpitActions(v);
      expect(cockpit.includes("APPROVE"), `cockpit APPROVE ${s}`).toBe(policy.includes("APPROVE"));
      expect(cockpit.includes("START"), `cockpit START ${s}`).toBe(policy.includes("START"));
    }
  });

  it("blocked / needs-data tasks are resumed through an 'Approve to resume' control on both surfaces", () => {
    for (const s of ["BLOCKED", "NEEDS_DATA"]) {
      const v = view(s);
      const { container, unmount } = render(<ProcessExecutionBridgePanel data={{ routes: [v], topRoute: v, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } }} onAction={() => {}} />);
      expect(container.querySelector('[data-testid="bridge-action-APPROVE"]')!.textContent).toBe("Approve to resume");
      unmount();
      const c = render(<MinimumOwnerCockpit bridge={{ routes: [v], topRoute: v, summary: { total: 1, ownerApproval: 1, managerStaff: 0, dataTasks: 0, monitorOnly: 0 } } as never} onAction={() => {}} />);
      expect(c.container.querySelector('[data-testid="cockpit-action-APPROVE"]')!.textContent).toBe("Approve to resume");
      c.unmount();
    }
  });

  it("non-owner-approval tasks keep START from PROPOSED / NEEDS_DATA / BLOCKED", () => {
    for (const s of ["PROPOSED", "NEEDS_DATA", "BLOCKED"]) expect(allowedProcessTaskActions(view(s, "MANAGER_APPROVAL_REQUIRED"))).toContain("START");
    expect(computeCanStart("CREATE_OWNER_APPROVAL_TASK", "PROPOSED", OWNER_LEVEL)).toBe(false);
    expect(computeCanStart("CREATE_OWNER_APPROVAL_TASK", "APPROVED", OWNER_LEVEL)).toBe(true);
    expect(computeCanStart("CREATE_MANAGER_TASK", "PROPOSED", "MANAGER_APPROVAL_REQUIRED")).toBe(true);
  });
});
