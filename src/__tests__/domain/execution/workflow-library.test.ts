import { describe, it, expect } from "vitest";
import {
  LAUNDRY_WORKFLOWS,
  HOUSEKEEPING_WORKFLOWS,
  validateWorkflowLibrary,
  WorkflowLibraryEntry,
} from "@/domain/execution/workflow-library";
import { personalizeWorkflow, toEmployeeSopView, SopVisibilityError } from "@/domain/execution/sop";

describe("workflow libraries — module contract assertions", () => {
  it("LAUNDRY_WORKFLOWS is an array", () => { expect(Array.isArray(LAUNDRY_WORKFLOWS)).toBe(true); });
  it("HOUSEKEEPING_WORKFLOWS is an array", () => { expect(Array.isArray(HOUSEKEEPING_WORKFLOWS)).toBe(true); });
  it("validateWorkflowLibrary is a function", () => { expect(typeof validateWorkflowLibrary).toBe("function"); });
  it("personalizeWorkflow is a function", () => { expect(typeof personalizeWorkflow).toBe("function"); });
  it("toEmployeeSopView is a function", () => { expect(typeof toEmployeeSopView).toBe("function"); });
  it("SopVisibilityError is a class (function)", () => { expect(typeof SopVisibilityError).toBe("function"); });
  it("LAUNDRY_WORKFLOWS.length >= 24", () => { expect(LAUNDRY_WORKFLOWS.length).toBeGreaterThanOrEqual(24); });
  it("HOUSEKEEPING_WORKFLOWS.length >= 24", () => { expect(HOUSEKEEPING_WORKFLOWS.length).toBeGreaterThanOrEqual(24); });
  it("LAUNDRY_WORKFLOWS[0] has baseTemplateId field", () => { expect(LAUNDRY_WORKFLOWS[0]).toHaveProperty("baseTemplateId"); });
  it("LAUNDRY_WORKFLOWS[0] has title field", () => { expect(LAUNDRY_WORKFLOWS[0]).toHaveProperty("title"); });
  it("validateWorkflowLibrary(LAUNDRY_WORKFLOWS).ok is true", () => { expect(validateWorkflowLibrary(LAUNDRY_WORKFLOWS).ok).toBe(true); });
  it("validateWorkflowLibrary(HOUSEKEEPING_WORKFLOWS).ok is true", () => { expect(validateWorkflowLibrary(HOUSEKEEPING_WORKFLOWS).ok).toBe(true); });
  it("LAUNDRY_WORKFLOWS ids are unique", () => { const ids = new Set(LAUNDRY_WORKFLOWS.map((w) => w.baseTemplateId)); expect(ids.size).toBe(LAUNDRY_WORKFLOWS.length); });
  it("toEmployeeSopView(LAUNDRY_WORKFLOWS[0]) throws SopVisibilityError", () => { expect(() => toEmployeeSopView(LAUNDRY_WORKFLOWS[0])).toThrow(SopVisibilityError); });
});

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
