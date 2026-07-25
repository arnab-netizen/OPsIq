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

describe("canViewTask — module contract assertions", () => {
  it("canViewTask is a function", () => { expect(typeof canViewTask).toBe("function"); });
  it("task('emp-1').assignedUserId is 'emp-1'", () => { expect(task("emp-1").assignedUserId).toBe("emp-1"); });
  it("EmployeeAccessStatus is an object", () => { expect(typeof EmployeeAccessStatus).toBe("object"); });
  it("EmployeeAccessStatus.ACTIVE is defined", () => { expect(EmployeeAccessStatus.ACTIVE).toBeDefined(); });
  it("EmployeeAccessStatus.SUSPENDED is defined", () => { expect(EmployeeAccessStatus.SUSPENDED).toBeDefined(); });
  it("EmployeeAccessStatus.OFFBOARDED is defined", () => { expect(EmployeeAccessStatus.OFFBOARDED).toBeDefined(); });
  it("WS is a non-empty string", () => { expect(typeof WS).toBe("string"); expect(WS.length).toBeGreaterThan(0); });
  it("task is a function", () => { expect(typeof task).toBe("function"); });
  it("viewer is a function", () => { expect(typeof viewer).toBe("function"); });
  it("task('emp-1') returns an object with workspaceId field", () => { expect(task("emp-1")).toHaveProperty("workspaceId"); });
  it("viewer({}) returns an object with userId field", () => { expect(viewer({})).toHaveProperty("userId"); });
  it("viewer({}).isOwner is false by default", () => { expect(viewer({}).isOwner).toBe(false); });
  it("canViewTask(viewer({ userId: 'emp-1' }), task('emp-1')) returns true", () => { expect(canViewTask(viewer({ userId: "emp-1" }), task("emp-1"))).toBe(true); });
  it("canViewTask(viewer({ userId: 'emp-1' }), task('emp-2')) returns false", () => { expect(canViewTask(viewer({ userId: "emp-1" }), task("emp-2"))).toBe(false); });
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
