import { describe, it, expect } from "vitest";
import { canViewTask, TaskViewer, TaskAccessSubject } from "@/domain/workspace/task-access";
import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";

const WS = "ws-1";
const task = (assignedUserId: string | null, workspaceId = WS): TaskAccessSubject => ({
  workspaceId,
  assignedUserId,
});
const viewer = (o: Partial<TaskViewer>): TaskViewer => ({
  userId: "emp-1",
  workspaceId: WS,
  status: EmployeeAccessStatus.ACTIVE,
  isOwner: false,
  canViewTeamTasks: false,
  ...o,
});

describe("canViewTask", () => {
  it("employee can view their own assigned task", () => {
    expect(canViewTask(viewer({ userId: "emp-1" }), task("emp-1"))).toBe(true);
  });
  it("employee cannot view another employee's task", () => {
    expect(canViewTask(viewer({ userId: "emp-1" }), task("emp-2"))).toBe(false);
  });
  it("employee cannot view an unassigned task", () => {
    expect(canViewTask(viewer({ userId: "emp-1" }), task(null))).toBe(false);
  });
  it("owner can view any task in the workspace", () => {
    expect(canViewTask(viewer({ isOwner: true }), task("emp-2"))).toBe(true);
    expect(canViewTask(viewer({ isOwner: true }), task(null))).toBe(true);
  });
  it("manager with VIEW_TEAM_TASKS can view any task", () => {
    expect(canViewTask(viewer({ canViewTeamTasks: true }), task("emp-2"))).toBe(true);
  });
  it("cross-workspace task is denied (workspace isolation), even for owner", () => {
    expect(
      canViewTask(viewer({ isOwner: true }), task("emp-1", "ws-OTHER"))
    ).toBe(false);
  });
  it("suspended/offboarded viewer is denied even for their own task", () => {
    expect(
      canViewTask(
        viewer({ userId: "emp-1", status: EmployeeAccessStatus.SUSPENDED }),
        task("emp-1")
      )
    ).toBe(false);
    expect(
      canViewTask(
        viewer({ userId: "emp-1", status: EmployeeAccessStatus.OFFBOARDED }),
        task("emp-1")
      )
    ).toBe(false);
  });
});
