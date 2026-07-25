import { describe, it, expect } from "vitest";
import {
  SopConfidence as Conf,
  BaseWorkflowTemplate,
  SopVisibilityError,
  assessSopCompleteness,
  personalizeWorkflow,
  nextSopVersion,
  toEmployeeSopView,
} from "@/domain/execution/sop";

const base: BaseWorkflowTemplate = {
  kind: "BASE",
  baseTemplateId: "tpl-intake",
  businessArchetype: "laundry",
  title: "Customer/order intake",
  defaultSteps: [{ order: 1, instruction: "Greet and tag garments" }],
  defaultProofRequirements: ["tag_photo"],
  defaultEscalationRules: ["lost/damaged → owner"],
  allowedRoles: ["counter_staff"],
  forbiddenRoles: ["delivery_runner"],
  outcomeMetric: "intake_accuracy",
};

const fullCtx = {
  workspaceId: "ws-1",
  businessContext: "high-end retail, cash-tight",
  triggerCondition: "new walk-in order",
  role: "counter_staff",
  ownerBoundaryId: "bnd-1",
  customerCommunicationRules: "template-only",
  capacityAssumptions: "green",
  expectedOutcome: "accurate tagged intake",
  profitOrCashMetric: "revenue_per_order",
};

describe("SOP domain — module contract assertions", () => {
  it("assessSopCompleteness is a function", () => { expect(typeof assessSopCompleteness).toBe("function"); });
  it("personalizeWorkflow is a function", () => { expect(typeof personalizeWorkflow).toBe("function"); });
  it("nextSopVersion is a function", () => { expect(typeof nextSopVersion).toBe("function"); });
  it("toEmployeeSopView is a function", () => { expect(typeof toEmployeeSopView).toBe("function"); });
  it("Conf is an object", () => { expect(typeof Conf).toBe("object"); });
  it("Conf.HIGH is defined", () => { expect(Conf.HIGH).toBeDefined(); });
  it("Conf.NEEDS_OWNER_INPUT is defined", () => { expect(Conf.NEEDS_OWNER_INPUT).toBeDefined(); });
  it("SopVisibilityError is a class/function", () => { expect(typeof SopVisibilityError).toBe("function"); });
  it("base has kind 'BASE'", () => { expect(base.kind).toBe("BASE"); });
  it("base has allowedRoles array", () => { expect(Array.isArray(base.allowedRoles)).toBe(true); });
  it("fullCtx has workspaceId field", () => { expect(fullCtx).toHaveProperty("workspaceId"); });
  it("fullCtx has role field", () => { expect(fullCtx).toHaveProperty("role"); });
  it("personalizeWorkflow(base, 'sop-1', fullCtx) returns an object", () => { expect(typeof personalizeWorkflow(base, "sop-1", fullCtx)).toBe("object"); });
  it("personalizeWorkflow(base, 'sop-1', fullCtx).confidence is Conf.HIGH", () => { expect(personalizeWorkflow(base, "sop-1", fullCtx).confidence).toBe(Conf.HIGH); });
});

describe("assessSopCompleteness", () => {
  it("HIGH confidence when all essentials present", () => {
    const sop = personalizeWorkflow(base, "sop-1", fullCtx);
    expect(sop.confidence).toBe(Conf.HIGH);
    expect(sop.missingData).toEqual([]);
  });
  it("a generic SOP missing role/proof/escalation is not certain", () => {
    const r = assessSopCompleteness({
      role: null,
      proofRequirements: [],
      escalationRules: [],
      expectedOutcome: null,
      triggerCondition: null,
      ownerBoundaryId: null,
    });
    expect(r.confidence).toBe(Conf.NEEDS_OWNER_INPUT);
    expect(r.missingData).toEqual(
      expect.arrayContaining(["role", "proof", "escalation", "trigger", "ownerBoundary"])
    );
  });
  it("missing one or two essentials → LOW_CONFIDENCE", () => {
    const sop = personalizeWorkflow(base, "sop-2", { ...fullCtx, ownerBoundaryId: null });
    expect(sop.confidence).toBe(Conf.LOW_CONFIDENCE);
    expect(sop.missingData).toContain("ownerBoundary");
  });
});

describe("personalization includes business context + owner boundary", () => {
  it("carries business context and owner boundary into the instance", () => {
    const sop = personalizeWorkflow(base, "sop-1", fullCtx);
    expect(sop.businessContext).toBe("high-end retail, cash-tight");
    expect(sop.ownerBoundaryId).toBe("bnd-1");
    expect(sop.businessArchetype).toBe("laundry");
  });
});

describe("SOP versioning", () => {
  it("nextSopVersion increments version, deactivates, and does not mutate previous", () => {
    const v1 = personalizeWorkflow(base, "sop-1", fullCtx);
    const v2 = nextSopVersion(v1, { expectedOutcome: "even better intake" });
    expect(v2.version).toBe(2);
    expect(v2.isActive).toBe(false);
    expect(v2.approvedByOwnerId).toBeNull();
    expect(v2.expectedOutcome).toBe("even better intake");
    expect(v1.version).toBe(1); // unchanged
  });
});

describe("employee visibility", () => {
  it("employees cannot view a base template directly", () => {
    expect(() => toEmployeeSopView(base)).toThrow(SopVisibilityError);
  });
  it("employee view excludes owner-only fields (profit metric, business context, boundary id)", () => {
    const sop = personalizeWorkflow(base, "sop-1", fullCtx);
    const view = toEmployeeSopView(sop);
    const blob = JSON.stringify(view);
    expect(blob).not.toContain("revenue_per_order"); // profit metric excluded
    expect(blob).not.toContain("high-end retail"); // business context excluded
    expect(blob).not.toContain("bnd-1"); // owner boundary id excluded
    expect(view.steps.length).toBeGreaterThan(0); // but steps are present
    expect(view.escalationRules.length).toBeGreaterThan(0);
  });
});
