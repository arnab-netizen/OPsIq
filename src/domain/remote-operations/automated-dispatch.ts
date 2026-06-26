/**
 * R8 — Automated dispatch through Owner Mode tasks/actions (§55, §56). Pure.
 *
 * After a plan is approved and dispatch-time feasibility passes (re-run here per §3.5),
 * Owner Mode automatically creates task instances with checklist / proof requirement /
 * verifier / deadline / backup / escalation / dependency attached, starts the tracking
 * timers, and emits the role alerts + audit events. Dispatch is idempotent — it never
 * creates duplicate live tasks. A blocked item is recorded, not dispatched.
 */

import type { DistributionPlan, PlanItem } from "@/domain/remote-operations/distribution-plan";
import { evaluateDispatch, type FeasibilityContext, type DispatchVeto } from "@/domain/remote-operations/dispatch-feasibility";
import type { AuditEvent } from "@/domain/remote-operations/audit-trail";
import type { RiskLevel } from "@/domain/remote-operations/remote-types";

export interface DispatchedTask {
  taskId: string;
  workspaceId: string;
  businessId: string;
  locationId: string;
  unitId?: string;
  taskType: PlanItem["taskTemplateType"];
  assignee: string;
  supervisor?: string;
  riskLevel: RiskLevel;
  status: "ASSIGNED";
  checklistAttached: true;
  proofRequirementAttached: true;
  timers: { ackDeadlineMs: number; checkInDeadlineMs: number; proofDeadlineMs: number };
}

export interface BlockedDispatch {
  itemIndex: number;
  blocked: DispatchVeto[];
}

export interface DispatchOutcome {
  dispatched: DispatchedTask[];
  blocked: BlockedDispatch[];
  alerts: { terminal: "EMPLOYEE" | "SUPERVISOR" | "MANAGER"; taskId: string }[];
  auditEvents: AuditEvent[];
}

const ACK_WINDOW_MS = 15 * 60 * 1000;
const CHECKIN_WINDOW_MS = 30 * 60 * 1000;
const PROOF_WINDOW_MS = 2 * 60 * 60 * 1000;

function taskId(plan: DistributionPlan, index: number): string {
  return `${plan.distributionPlanId}:v${plan.version}:${plan.idempotencyKey}:${index}`;
}

/**
 * Dispatch an approved plan. `ctxByIndex` provides each item's dispatch-time feasibility
 * context (re-evaluated here). `alreadyDispatched` is the idempotency guard — keys present
 * are skipped, so a retried dispatch creates no duplicate live tasks.
 */
export function dispatchApprovedPlan(
  plan: DistributionPlan,
  ctxByIndex: FeasibilityContext[],
  nowMs: number,
  alreadyDispatched: ReadonlySet<string> = new Set(),
): DispatchOutcome {
  const out: DispatchOutcome = { dispatched: [], blocked: [], alerts: [], auditEvents: [] };
  if (plan.status !== "DISPATCHED" && plan.status !== "APPROVED") {
    return out; // only an approved/dispatched plan may produce tasks
  }

  plan.items.forEach((item, index) => {
    const id = taskId(plan, index);
    if (alreadyDispatched.has(id)) return; // idempotent: no duplicate live task

    const ctx = ctxByIndex[index];
    const decision = evaluateDispatch(ctx, item.riskLevel); // dispatch-time re-check
    if (!decision.canDispatch) {
      out.blocked.push({ itemIndex: index, blocked: decision.blocked });
      out.auditEvents.push({ workspaceId: plan.workspaceId, locationId: item.locationId, actor: "system", type: "DISPATCH", timestampMs: nowMs, detail: `BLOCKED:${decision.blocked.join(",")}`, subjectId: id });
      return;
    }

    const task: DispatchedTask = {
      taskId: id, workspaceId: plan.workspaceId, businessId: plan.businessId, locationId: item.locationId,
      unitId: item.unitId, taskType: item.taskTemplateType, assignee: item.assignee, supervisor: item.supervisor,
      riskLevel: item.riskLevel, status: "ASSIGNED", checklistAttached: true, proofRequirementAttached: true,
      timers: { ackDeadlineMs: nowMs + ACK_WINDOW_MS, checkInDeadlineMs: nowMs + CHECKIN_WINDOW_MS, proofDeadlineMs: nowMs + PROOF_WINDOW_MS },
    };
    out.dispatched.push(task);
    out.alerts.push({ terminal: "EMPLOYEE", taskId: id });
    if (item.supervisor) out.alerts.push({ terminal: "SUPERVISOR", taskId: id });
    if (item.riskLevel === "CRITICAL") out.alerts.push({ terminal: "MANAGER", taskId: id });
    out.auditEvents.push({ workspaceId: plan.workspaceId, locationId: item.locationId, actor: "system", type: "DISPATCH", timestampMs: nowMs, detail: `DISPATCHED:${item.taskTemplateType}`, subjectId: id });
  });

  return out;
}
