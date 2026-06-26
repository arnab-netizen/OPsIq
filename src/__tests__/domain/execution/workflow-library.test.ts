import { describe, it, expect } from "vitest";
import {
  LAUNDRY_WORKFLOWS,
  HOUSEKEEPING_WORKFLOWS,
  validateWorkflowLibrary,
  WorkflowLibraryEntry,
} from "@/domain/execution/workflow-library";
import { personalizeWorkflow, toEmployeeSopView, SopVisibilityError } from "@/domain/execution/sop";

describe("workflow libraries (Slices 17 & 18)", () => {
  it("provides at least 24 laundry and 24 housekeeping workflows", () => {
    expect(LAUNDRY_WORKFLOWS.length).toBeGreaterThanOrEqual(24);
    expect(HOUSEKEEPING_WORKFLOWS.length).toBeGreaterThanOrEqual(24);
  });

  it("every entry has all required fields", () => {
    expect(validateWorkflowLibrary(LAUNDRY_WORKFLOWS).ok).toBe(true);
    expect(validateWorkflowLibrary(HOUSEKEEPING_WORKFLOWS).ok).toBe(true);
  });

  it("entry ids are unique within each library", () => {
    const lids = new Set(LAUNDRY_WORKFLOWS.map((w) => w.baseTemplateId));
    expect(lids.size).toBe(LAUNDRY_WORKFLOWS.length);
    const hids = new Set(HOUSEKEEPING_WORKFLOWS.map((w) => w.baseTemplateId));
    expect(hids.size).toBe(HOUSEKEEPING_WORKFLOWS.length);
  });

  it("high-risk workflows carry escalation + boundary needs", () => {
    const lost = LAUNDRY_WORKFLOWS.find((w) => w.title.includes("Lost/damaged"))!;
    expect(lost.defaultEscalationRules.join(" ")).toMatch(/owner/i);
    const payment = LAUNDRY_WORKFLOWS.find((w) => w.title.includes("Payment"))!;
    expect(payment.defaultOwnerBoundaryNeeds.length).toBeGreaterThan(0);
  });

  it("a library entry can be personalized for a workspace", () => {
    const entry: WorkflowLibraryEntry = LAUNDRY_WORKFLOWS[0];
    const sop = personalizeWorkflow(entry, "sop-x", {
      workspaceId: "ws-1",
      role: "counter_staff",
      ownerBoundaryId: "bnd-1",
      triggerCondition: "new order",
      expectedOutcome: "accurate intake",
    });
    expect(sop.kind).toBe("PERSONALIZED");
    expect(sop.workspaceId).toBe("ws-1");
    expect(sop.steps.length).toBeGreaterThan(0);
  });

  it("an employee cannot access a generic base template as a task", () => {
    expect(() => toEmployeeSopView(LAUNDRY_WORKFLOWS[0])).toThrow(SopVisibilityError);
    expect(() => toEmployeeSopView(HOUSEKEEPING_WORKFLOWS[0])).toThrow(SopVisibilityError);
  });
});
