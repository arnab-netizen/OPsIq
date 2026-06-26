import { describe, it, expect } from "vitest";
import { validateAuditEvent, assertAuditable, AuditLog, UnauditableActionError, type AuditEvent } from "@/domain/remote-operations/audit-trail";
import { dispatchApprovedPlan, type DispatchedTask } from "@/domain/remote-operations/automated-dispatch";
import type { DistributionPlan, PlanItem } from "@/domain/remote-operations/distribution-plan";
import type { FeasibilityContext } from "@/domain/remote-operations/dispatch-feasibility";

const feasible = (over: Partial<FeasibilityContext> = {}): FeasibilityContext => ({
  staffAvailable: true, roleSkillMatch: true, workloadCapacityOk: true, locationValid: true, accessReady: true, suppliesReady: true,
  checklistAttached: true, proofRequirementAttached: true, verifierAssigned: true, pairRiskBlockActive: false, falseCompletionBlockActive: false,
  deadlineFeasible: true, dependencyChainSatisfied: true, backupForCritical: true, locationPaused: false, locationReadyBlocked: false,
  approvalThresholdsSatisfied: true, complianceGatePassed: true, safetyGatePassed: true, customerTimingKnown: true, costApprovalSatisfied: true,
  ownerApprovalSatisfied: true, vendorPrequalified: true, workloadDataComplete: true, approvalFresh: true, ...over,
});
const item = (over: Partial<PlanItem> = {}): PlanItem => ({ taskTemplateType: "TURNOVER_SERVICE", locationId: "locA", scheduledAtMs: 1, assignee: "s1", supervisor: "sup1", riskLevel: "STANDARD", ...over });
const plan = (items: PlanItem[]): DistributionPlan => ({ distributionPlanId: "dp1", workspaceId: "ws1", businessId: "b1", locationId: "locA", version: 1, createdAtMs: 1, createdBy: "owner1", sourceType: "HUMAN_CREATED", status: "DISPATCHED", items, idempotencyKey: "k1", dispatched: true, changeLog: [] });

describe("[R21] audit trail", () => {
  const ev = (over: Partial<AuditEvent> = {}): AuditEvent => ({ workspaceId: "ws1", actor: "u1", type: "DISPATCH", timestampMs: 10, detail: "x", ...over });
  it("a complete audit event validates; missing workspace/actor/type/timestamp fails", () => {
    expect(validateAuditEvent(ev())).toEqual([]);
    expect(validateAuditEvent(ev({ workspaceId: "" }))).toContain("missing_workspace_id");
    expect(validateAuditEvent(ev({ actor: "" }))).toContain("missing_actor");
    expect(() => assertAuditable(ev({ timestampMs: 0 }))).toThrow(UnauditableActionError);
  });
  it("the audit log is append-only and queryable", () => {
    const log = new AuditLog();
    log.append(ev({ type: "ACCESS_CODE_VIEW", subjectId: "task1" }));
    log.append(ev({ type: "OWNER_OVERRIDE", subjectId: "task1" }));
    expect(log.all().length).toBe(2);
    expect(log.forSubject("task1").length).toBe(2);
    expect(log.ofType("OWNER_OVERRIDE").length).toBe(1);
  });
});

describe("[R8] automated dispatch through Owner Mode tasks", () => {
  it("dispatches feasible tasks with timers, alerts and audit events", () => {
    const out = dispatchApprovedPlan(plan([item()]), [feasible()], 1000);
    expect(out.dispatched.length).toBe(1);
    const t = out.dispatched[0] as DispatchedTask;
    expect(t.status).toBe("ASSIGNED");
    expect(t.checklistAttached).toBe(true);
    expect(t.timers.ackDeadlineMs).toBeGreaterThan(1000);
    expect(out.alerts.some((a) => a.terminal === "EMPLOYEE")).toBe(true);
    expect(out.alerts.some((a) => a.terminal === "SUPERVISOR")).toBe(true);
    expect(out.auditEvents.every((e) => validateAuditEvent(e).length === 0)).toBe(true);
  });
  it("re-runs feasibility at dispatch time and records blocked items (not dispatched)", () => {
    const out = dispatchApprovedPlan(plan([item(), item({ assignee: "s2" })]), [feasible(), feasible({ accessReady: false })], 1);
    expect(out.dispatched.length).toBe(1);
    expect(out.blocked.length).toBe(1);
    expect(out.blocked[0].blocked).toContain("ACCESS_NOT_READY");
  });
  it("is idempotent — an already-dispatched task is not duplicated on retry", () => {
    const p = plan([item()]);
    const first = dispatchApprovedPlan(p, [feasible()], 1);
    const seen = new Set(first.dispatched.map((t) => t.taskId));
    const retry = dispatchApprovedPlan(p, [feasible()], 2, seen);
    expect(retry.dispatched.length).toBe(0);
  });
  it("CRITICAL tasks also alert the manager terminal", () => {
    const out = dispatchApprovedPlan(plan([item({ riskLevel: "CRITICAL" })]), [feasible()], 1);
    expect(out.alerts.some((a) => a.terminal === "MANAGER")).toBe(true);
  });
});
