/**
 * Thin user-facing guided-execution route handlers (Slice 10 proper).
 *
 * These are the minimum functional owner/manager/employee handlers that wire the
 * already-proven backend guards into the request path. Each handler enforces, in
 * order: active membership (suspended/offboarded denial) → dashboard/task access /
 * permission → the domain service → owner-only-field redaction. The employee
 * guidance handler routes through `generateEmployeeGuidance`, so guidance is shown
 * only on BOUNDARY_VALIDATION_PASSED, untrusted text is contained, a durable
 * AI-ledger record is written, and the unsafe instruction is never returned.
 *
 * Deps are injectable so the handlers are unit-testable without a DB; in
 * production each guard/service resolves the real `db` lazily.
 */

import {
  requireActiveMembership,
  type LifecycleDeps,
} from "@/services/workspace/employee-lifecycle.service";
import {
  requireDashboardAccess,
  requireTaskAccess,
  scopedResponse,
  type DashboardDeps,
} from "@/services/workspace/dashboard-access.service";
import {
  requirePermission,
  type PermissionsDeps,
} from "@/services/workspace/guided-execution-permissions.service";
import {
  generateEmployeeGuidance,
  type GuidanceDeps,
  type GenerateEmployeeGuidanceParams,
} from "@/services/execution/employee-guidance.service";
import {
  submitProof,
  reviewProof,
  type ProofDeps,
  type SubmitProofCommand,
  type ReviewProofCommand,
} from "@/services/execution/proof.service";
import {
  raiseBlocker,
  type EscalationDeps,
  type RaiseBlockerCommand,
} from "@/services/execution/escalation.service";
import { DashboardScope } from "@/domain/workspace/dashboard-access";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { TaskAccessSubject } from "@/domain/workspace/task-access";

export interface GuidedRouteDeps {
  lifecycle?: LifecycleDeps;
  dashboard?: DashboardDeps;
  permissions?: PermissionsDeps;
  guidance?: GuidanceDeps;
  proof?: ProofDeps;
  escalation?: EscalationDeps;
}

export interface ActorCtx {
  workspaceId: string;
  actorId: string;
}

/** Owner guided-choice surface — owner dashboard scope only; redacted. */
export async function ownerGuidedChoiceHandler<T>(
  input: ActorCtx & { choices: T },
  deps: GuidedRouteDeps = {}
): Promise<T> {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  await requireDashboardAccess(input.workspaceId, input.actorId, DashboardScope.OWNER, deps.dashboard);
  return scopedResponse(input.workspaceId, input.actorId, input.choices, deps.dashboard);
}

/** Employee task list — employee dashboard scope; owner-only fields redacted. */
export async function employeeTaskListHandler<T>(
  input: ActorCtx & { tasks: T },
  deps: GuidedRouteDeps = {}
): Promise<T> {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  await requireDashboardAccess(input.workspaceId, input.actorId, DashboardScope.EMPLOYEE, deps.dashboard);
  return scopedResponse(input.workspaceId, input.actorId, input.tasks, deps.dashboard);
}

/**
 * Employee task guidance — requires task access, then routes through the boundary
 * gate. Returns only the employee-safe result; the unsafe instruction is never
 * included (only the gate's escalation/blocked message or the allowed guidance).
 */
export async function employeeTaskGuidanceHandler(
  input: ActorCtx & {
    task: TaskAccessSubject & { taskId: string };
    boundary: GenerateEmployeeGuidanceParams["boundary"];
    instruction: GenerateEmployeeGuidanceParams["instruction"];
    untrusted?: GenerateEmployeeGuidanceParams["untrusted"];
  },
  deps: GuidedRouteDeps = {}
): Promise<{
  kind: string;
  message: string;
  allowed: boolean;
  guidance: unknown;
  ledgerId: string;
}> {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  await requireTaskAccess(input.workspaceId, input.actorId, input.task, deps.dashboard);

  const result = await generateEmployeeGuidance(
    {
      workspaceId: input.workspaceId,
      taskId: input.task.taskId,
      boundary: input.boundary,
      instruction: input.instruction,
      untrusted: input.untrusted,
    },
    deps.guidance
  );

  // Employee-safe projection ONLY — never echo the unsafe instruction.
  return {
    kind: result.kind,
    message: result.message,
    allowed: result.allowed,
    guidance: result.allowed ? result.guidance : null,
    ledgerId: result.ledgerId,
  };
}

/** Employee proof submission — requires access to the linked task. */
export async function proofSubmitHandler(
  input: ActorCtx & { task: TaskAccessSubject; command: SubmitProofCommand },
  deps: GuidedRouteDeps = {}
) {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  await requireTaskAccess(input.workspaceId, input.actorId, input.task, deps.dashboard);
  return submitProof(input.command, deps.proof);
}

/** Manager/owner proof review — requires an explicit proof-review permission. */
export async function proofReviewHandler(
  input: ActorCtx & {
    command: ReviewProofCommand;
    requiredPermission: GuidedExecutionPermission;
  },
  deps: GuidedRouteDeps = {}
) {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  await requirePermission(
    input.workspaceId,
    input.actorId,
    input.requiredPermission,
    deps.permissions
  );
  return reviewProof(input.command, deps.proof);
}

/** Employee/manager raises a blocker/escalation — routed by severity to owner/manager. */
export async function raiseEscalationHandler(
  input: ActorCtx & { command: RaiseBlockerCommand },
  deps: GuidedRouteDeps = {}
) {
  await requireActiveMembership(input.workspaceId, input.actorId, deps.lifecycle);
  return raiseBlocker(input.command, deps.escalation);
}
