/**
 * Minimal task-access policy (Slice 5, pure logic).
 *
 * This is the SMALLEST pull-forward from Slice 7 needed to prove the Slice 5
 * security rule "an employee cannot access another employee's task" together with
 * workspace isolation. It deliberately models only the access-relevant shape of a
 * task (workspaceId + assignedUserId), NOT the full work-order/state-machine —
 * that remains Slice 7. The full Slice 7 task model must reuse this policy.
 */

import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";

/** The access-relevant projection of a task/work order. */
export interface TaskAccessSubject {
  workspaceId: string;
  /** The assigned employee, or null if unassigned (draft). */
  assignedUserId: string | null;
}

export interface TaskViewer {
  userId: string;
  workspaceId: string;
  status: EmployeeAccessStatus;
  /** Workspace role OWNER. */
  isOwner: boolean;
  /** Has an explicit VIEW_TEAM_TASKS grant (manager visibility across the team). */
  canViewTeamTasks: boolean;
}

/**
 * Fail-closed task visibility:
 *  - non-ACTIVE viewer (suspended/offboarded) → no access
 *  - cross-workspace task → no access (workspace isolation)
 *  - owner or a manager with VIEW_TEAM_TASKS → may view any task in the workspace
 *  - everyone else (plain employee) → only their OWN assigned task
 */
export function canViewTask(
  viewer: TaskViewer,
  task: TaskAccessSubject
): boolean {
  if (viewer.status !== EmployeeAccessStatus.ACTIVE) return false;
  if (task.workspaceId !== viewer.workspaceId) return false;
  if (viewer.isOwner) return true;
  if (viewer.canViewTeamTasks) return true;
  return task.assignedUserId !== null && task.assignedUserId === viewer.userId;
}
