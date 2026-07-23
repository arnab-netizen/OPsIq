/**
 * Task query service — workspace-scoped reads for delegated tasks.
 *
 * All queries are isolated by workspaceId derived from server-verified context.
 * No mutation logic here; use task-workflow.service or the proven FSM services.
 */

import { db } from "@/lib/db";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

export interface TaskListOptions {
  status?: string;
  assignedUserId?: string;
  limit?: number;
  offset?: number;
}

export interface TaskListItem {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  priority: string | null;
  assignedUserId: string | null;
  assignedRole: string | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  proofRequirementId: string | null;
  sourceOperatorItemId: string | null;
}

export interface TaskDetail extends TaskListItem {
  description: string | null;
  workStartedAt: Date | null;
  createdByUserId: string | null;
  proof: {
    id: string;
    status: string;
    proofType: string | null;
    submittedByUserId: string | null;
    submittedAt: Date | null;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    reviewReason: string | null;
    duplicateFlagged: boolean;
  } | null;
  proofRequirement: {
    id: string;
    proofType: string;
    riskLevel: string | null;
    reviewerRole: string | null;
    ownerOverrideAllowed: boolean;
  } | null;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string | null;
    actorRole: string | null;
    occurredAt: Date;
  }>;
}

export async function getTaskList(workspaceId: string, options: TaskListOptions = {}): Promise<TaskListItem[]> {
  enforceWorkspaceId(workspaceId, "getTaskList", "DelegatedTask");
  const { status, assignedUserId, limit = 50, offset = 0 } = options;

  const where: Record<string, unknown> = { workspaceId };
  if (status) where.status = status;
  if (assignedUserId) where.assignedUserId = assignedUserId;

  const tasks = await db.delegatedTask.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(limit, 100),
    skip: offset,
    select: {
      id: true,
      workspaceId: true,
      title: true,
      status: true,
      priority: true,
      assignedUserId: true,
      assignedRole: true,
      dueAt: true,
      createdAt: true,
      updatedAt: true,
      proofRequirementId: true,
      sourceOperatorItemId: true,
    },
  });

  return tasks as TaskListItem[];
}

export async function getTaskDetail(taskId: string, workspaceId: string): Promise<TaskDetail | null> {
  enforceWorkspaceId(workspaceId, "getTaskDetail", "DelegatedTask");

  const task = await db.delegatedTask.findFirst({
    where: { id: taskId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      assignedUserId: true,
      assignedRole: true,
      dueAt: true,
      workStartedAt: true,
      createdAt: true,
      updatedAt: true,
      proofRequirementId: true,
      createdByUserId: true,
      sourceOperatorItemId: true,
    },
  });

  if (!task) return null;

  const [proof, proofRequirement, statusHistory] = await Promise.all([
    task.proofRequirementId
      ? db.proof.findFirst({
          where: { taskId, workspaceId },
          orderBy: { submittedAt: "desc" },
          select: {
            id: true,
            status: true,
            proofType: true,
            submittedByUserId: true,
            submittedAt: true,
            reviewedByUserId: true,
            reviewedAt: true,
            reviewReason: true,
            duplicateFlagged: true,
          },
        })
      : Promise.resolve(null),
    task.proofRequirementId
      ? db.proofRequirement.findFirst({
          where: { id: task.proofRequirementId, workspaceId },
          select: {
            id: true,
            proofType: true,
            riskLevel: true,
            reviewerRole: true,
            ownerOverrideAllowed: true,
          },
        })
      : Promise.resolve(null),
    db.taskStatusHistory.findMany({
      where: { taskId, workspaceId },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actorId: true,
        actorRole: true,
        occurredAt: true,
      },
    }),
  ]);

  return {
    ...(task as TaskListItem),
    description: task.description ?? null,
    workStartedAt: task.workStartedAt ?? null,
    createdByUserId: task.createdByUserId ?? null,
    proof: proof as TaskDetail["proof"],
    proofRequirement: proofRequirement as TaskDetail["proofRequirement"],
    statusHistory: statusHistory as TaskDetail["statusHistory"],
  };
}
