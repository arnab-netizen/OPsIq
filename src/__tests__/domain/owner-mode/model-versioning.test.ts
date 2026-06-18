import { describe, it, expect } from "vitest";
import {
  recordVersionChange,
  createPromptTemplateVersion,
  createRulesetVersion,
  runPreChangeChecklist,
  attachVersionToOutputTrace,
  regressionIsRequired,
  validateRecordVersionChangeInput,
  validateCreatePromptTemplateVersionInput,
  validateCreateRulesetVersionInput,
  type RecordVersionChangeInput,
  type CreatePromptTemplateVersionInput,
  type CreateRulesetVersionInput,
  type PreChangeChecklistInput,
} from "../../../domain/owner-mode/model-versioning";

const WS = "ws-versioning-001";
const APPROVER = "admin-user-001";

function baseVersionChangeInput(overrides?: Partial<RecordVersionChangeInput>): RecordVersionChangeInput {
  return {
    id: "vc-001",
    workspaceId: WS,
    versionType: "model",
    versionName: "claude-diagnosis-model",
    previousVersion: "v1.0",
    newVersion: "v1.1",
    changeReason: "Improved diagnosis accuracy for cash-flow scenarios",
    riskLevel: "low",
    regressionRequired: false,
    regressionResult: "skipped",
    featureFlag: "flag_diagnosis_model_v1_1",
    rollbackPlan: "Revert featureFlag to v1.0 and redeploy",
    approvedBy: APPROVER,
    createdAt: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}

function basePromptInput(overrides?: Partial<CreatePromptTemplateVersionInput>): CreatePromptTemplateVersionInput {
  return {
    id: "pt-001",
    workspaceId: WS,
    templateName: "diagnosis_prompt",
    version: "v2.0",
    previousVersion: "v1.9",
    module: "diagnosis",
    changeReason: "Added cash runway handling to diagnosis prompt",
    riskLevel: "medium",
    regressionRequired: false,
    regressionResult: "skipped",
    featureFlag: "flag_diagnosis_prompt_v2",
    rollbackPlan: "Revert to v1.9 template",
    approvedBy: APPROVER,
    createdAt: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}

function baseRulesetInput(overrides?: Partial<CreateRulesetVersionInput>): CreateRulesetVersionInput {
  return {
    id: "rs-001",
    workspaceId: WS,
    rulesetName: "owner_constraints_ruleset",
    version: "r1.3",
    previousVersion: "r1.2",
    scope: "recommendation_generation",
    changeReason: "Added owner non-compliance constraint",
    riskLevel: "low",
    regressionRequired: false,
    regressionResult: "skipped",
    featureFlag: "flag_ruleset_r1_3",
    rollbackPlan: "Revert to r1.2",
    approvedBy: APPROVER,
    createdAt: "2026-06-18T10:00:00Z",
    ...overrides,
  };
}

function baseChecklist(overrides?: Partial<PreChangeChecklistInput>): PreChangeChecklistInput {
  return {
    riskLevel: "low",
    regressionSuiteRun: false,
    outputsCompared: true,
    genericitnessChecked: true,
    safetyOverridesChecked: true,
    ownerConstraintsChecked: true,
    tenantIsolationChecked: true,
    featureFlagDefined: true,
    rollbackPlanDefined: true,
    ...overrides,
  };
}

// ─── regressionIsRequired ─────────────────────────────────────────────────────

describe("regressionIsRequired", () => {
  it("returns false for low risk", () => {
    expect(regressionIsRequired("low")).toBe(false);
  });

  it("returns false for medium risk", () => {
    expect(regressionIsRequired("medium")).toBe(false);
  });

  it("returns true for high risk", () => {
    expect(regressionIsRequired("high")).toBe(true);
  });

  it("returns true for critical risk", () => {
    expect(regressionIsRequired("critical")).toBe(true);
  });
});

// ─── recordVersionChange ──────────────────────────────────────────────────────

describe("recordVersionChange", () => {
  it("creates a valid version change log entry", () => {
    const log = recordVersionChange(baseVersionChangeInput());
    expect(log.id).toBe("vc-001");
    expect(log.versionType).toBe("model");
    expect(log.previousVersion).toBe("v1.0");
    expect(log.newVersion).toBe("v1.1");
    expect(log.approvedBy).toBe(APPROVER);
  });

  it("accepts all four version types", () => {
    const types = ["model", "prompt_template", "ruleset", "evaluation"] as const;
    for (const versionType of types) {
      const log = recordVersionChange(baseVersionChangeInput({ versionType }));
      expect(log.versionType).toBe(versionType);
    }
  });

  it("throws when id is empty", () => {
    expect(() => recordVersionChange(baseVersionChangeInput({ id: "" }))).toThrow();
  });

  it("throws when previousVersion equals newVersion", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ previousVersion: "v1.0", newVersion: "v1.0" }))
    ).toThrow("newVersion must differ");
  });

  it("throws when changeReason is empty", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ changeReason: "" }))
    ).toThrow();
  });

  it("throws when rollbackPlan is empty (VERSION-RULE-2)", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ rollbackPlan: "" }))
    ).toThrow("VERSION-RULE-2");
  });

  it("throws when approvedBy is empty (VERSION-RULE-3)", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ approvedBy: "" }))
    ).toThrow("VERSION-RULE-3");
  });

  it("throws when featureFlag is empty (VERSION-RULE-4)", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ featureFlag: "" }))
    ).toThrow("VERSION-RULE-4");
  });

  it("throws when workspaceId is empty", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ workspaceId: "" }))
    ).toThrow();
  });

  it("throws when high risk change has regressionRequired=false (VERSION-RULE-1)", () => {
    expect(() =>
      recordVersionChange(
        baseVersionChangeInput({ riskLevel: "high", regressionRequired: false })
      )
    ).toThrow("VERSION-RULE-1");
  });

  it("throws when critical risk change has regressionRequired=false (VERSION-RULE-1)", () => {
    expect(() =>
      recordVersionChange(
        baseVersionChangeInput({ riskLevel: "critical", regressionRequired: false })
      )
    ).toThrow("VERSION-RULE-1");
  });

  it("accepts high risk change when regressionRequired=true", () => {
    const log = recordVersionChange(
      baseVersionChangeInput({
        riskLevel: "high",
        regressionRequired: true,
        regressionResult: "passed",
      })
    );
    expect(log.riskLevel).toBe("high");
    expect(log.regressionRequired).toBe(true);
    expect(log.regressionResult).toBe("passed");
  });

  it("accepts low risk change without regression", () => {
    const log = recordVersionChange(
      baseVersionChangeInput({ riskLevel: "low", regressionRequired: false })
    );
    expect(log.regressionRequired).toBe(false);
  });

  it("records all regression results", () => {
    const results = ["passed", "failed", "partial", "skipped", "pending"] as const;
    for (const regressionResult of results) {
      const log = recordVersionChange(baseVersionChangeInput({ regressionResult }));
      expect(log.regressionResult).toBe(regressionResult);
    }
  });
});

// ─── validateRecordVersionChangeInput ────────────────────────────────────────

describe("validateRecordVersionChangeInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateRecordVersionChangeInput(baseVersionChangeInput())).toHaveLength(0);
  });

  it("returns error for missing previousVersion", () => {
    const errors = validateRecordVersionChangeInput(
      baseVersionChangeInput({ previousVersion: "" })
    );
    expect(errors.some((e) => e.includes("previousVersion"))).toBe(true);
  });

  it("returns error for missing newVersion", () => {
    expect(validateRecordVersionChangeInput(baseVersionChangeInput({ newVersion: "" }))).toContain(
      "newVersion is required"
    );
  });

  it("returns error for same previous and new version", () => {
    const errors = validateRecordVersionChangeInput(
      baseVersionChangeInput({ previousVersion: "v1", newVersion: "v1" })
    );
    expect(errors.some((e) => e.includes("differ"))).toBe(true);
  });

  it("returns VERSION-RULE-1 error for high risk without regression", () => {
    const errors = validateRecordVersionChangeInput(
      baseVersionChangeInput({ riskLevel: "high", regressionRequired: false })
    );
    expect(errors.some((e) => e.includes("VERSION-RULE-1"))).toBe(true);
  });
});

// ─── createPromptTemplateVersion ─────────────────────────────────────────────

describe("createPromptTemplateVersion", () => {
  it("creates a valid prompt template version", () => {
    const ptv = createPromptTemplateVersion(basePromptInput());
    expect(ptv.templateName).toBe("diagnosis_prompt");
    expect(ptv.version).toBe("v2.0");
    expect(ptv.module).toBe("diagnosis");
    expect(ptv.approvedBy).toBe(APPROVER);
  });

  it("throws when templateName is empty", () => {
    expect(() =>
      createPromptTemplateVersion(basePromptInput({ templateName: "" }))
    ).toThrow();
  });

  it("throws when module is empty", () => {
    expect(() =>
      createPromptTemplateVersion(basePromptInput({ module: "" }))
    ).toThrow();
  });

  it("throws when high risk without regression (VERSION-RULE-1)", () => {
    expect(() =>
      createPromptTemplateVersion(
        basePromptInput({ riskLevel: "high", regressionRequired: false })
      )
    ).toThrow("VERSION-RULE-1");
  });

  it("throws when approvedBy is empty (VERSION-RULE-3)", () => {
    expect(() =>
      createPromptTemplateVersion(basePromptInput({ approvedBy: "" }))
    ).toThrow("VERSION-RULE-3");
  });

  it("throws when featureFlag is empty (VERSION-RULE-4)", () => {
    expect(() =>
      createPromptTemplateVersion(basePromptInput({ featureFlag: "" }))
    ).toThrow("VERSION-RULE-4");
  });

  it("accepts optional previousVersion as undefined", () => {
    const ptv = createPromptTemplateVersion(
      basePromptInput({ previousVersion: undefined })
    );
    expect(ptv.previousVersion).toBeUndefined();
  });
});

// ─── validateCreatePromptTemplateVersionInput ─────────────────────────────────

describe("validateCreatePromptTemplateVersionInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateCreatePromptTemplateVersionInput(basePromptInput())).toHaveLength(0);
  });

  it("returns error for missing rollbackPlan", () => {
    const errors = validateCreatePromptTemplateVersionInput(
      basePromptInput({ rollbackPlan: "" })
    );
    expect(errors.some((e) => e.includes("VERSION-RULE-2"))).toBe(true);
  });
});

// ─── createRulesetVersion ─────────────────────────────────────────────────────

describe("createRulesetVersion", () => {
  it("creates a valid ruleset version", () => {
    const rsv = createRulesetVersion(baseRulesetInput());
    expect(rsv.rulesetName).toBe("owner_constraints_ruleset");
    expect(rsv.version).toBe("r1.3");
    expect(rsv.scope).toBe("recommendation_generation");
  });

  it("throws when rulesetName is empty", () => {
    expect(() =>
      createRulesetVersion(baseRulesetInput({ rulesetName: "" }))
    ).toThrow();
  });

  it("throws when scope is empty", () => {
    expect(() =>
      createRulesetVersion(baseRulesetInput({ scope: "" }))
    ).toThrow();
  });

  it("throws when critical risk without regression", () => {
    expect(() =>
      createRulesetVersion(
        baseRulesetInput({ riskLevel: "critical", regressionRequired: false })
      )
    ).toThrow("VERSION-RULE-1");
  });

  it("accepts optional previousVersion", () => {
    const rsv = createRulesetVersion(baseRulesetInput({ previousVersion: undefined }));
    expect(rsv.previousVersion).toBeUndefined();
  });
});

// ─── validateCreateRulesetVersionInput ───────────────────────────────────────

describe("validateCreateRulesetVersionInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateCreateRulesetVersionInput(baseRulesetInput())).toHaveLength(0);
  });

  it("returns error for missing scope", () => {
    const errors = validateCreateRulesetVersionInput(baseRulesetInput({ scope: "" }));
    expect(errors.some((e) => e.includes("scope"))).toBe(true);
  });
});

// ─── runPreChangeChecklist ────────────────────────────────────────────────────

describe("runPreChangeChecklist", () => {
  it("returns approved=true when all checks pass (low risk)", () => {
    const result = runPreChangeChecklist(baseChecklist());
    expect(result.approved).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns approved=true when all checks pass (high risk with regression)", () => {
    const result = runPreChangeChecklist(
      baseChecklist({ riskLevel: "high", regressionSuiteRun: true })
    );
    expect(result.approved).toBe(true);
  });

  it("blocks when high risk but regression not run", () => {
    const result = runPreChangeChecklist(
      baseChecklist({ riskLevel: "high", regressionSuiteRun: false })
    );
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Regression suite"))).toBe(true);
  });

  it("blocks when critical risk but regression not run", () => {
    const result = runPreChangeChecklist(
      baseChecklist({ riskLevel: "critical", regressionSuiteRun: false })
    );
    expect(result.approved).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("blocks when outputs not compared", () => {
    const result = runPreChangeChecklist(baseChecklist({ outputsCompared: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Outputs must be compared"))).toBe(true);
  });

  it("blocks when genericness not checked", () => {
    const result = runPreChangeChecklist(baseChecklist({ genericitnessChecked: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Genericness"))).toBe(true);
  });

  it("blocks when safety overrides not checked", () => {
    const result = runPreChangeChecklist(baseChecklist({ safetyOverridesChecked: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Safety overrides"))).toBe(true);
  });

  it("blocks when owner constraints not checked", () => {
    const result = runPreChangeChecklist(baseChecklist({ ownerConstraintsChecked: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Owner constraints"))).toBe(true);
  });

  it("blocks when tenant isolation not checked", () => {
    const result = runPreChangeChecklist(baseChecklist({ tenantIsolationChecked: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("Tenant isolation"))).toBe(true);
  });

  it("blocks when feature flag not defined (VERSION-RULE-4)", () => {
    const result = runPreChangeChecklist(baseChecklist({ featureFlagDefined: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("VERSION-RULE-4"))).toBe(true);
  });

  it("blocks when rollback plan not defined (VERSION-RULE-2)", () => {
    const result = runPreChangeChecklist(baseChecklist({ rollbackPlanDefined: false }));
    expect(result.approved).toBe(false);
    expect(result.blockers.some((b) => b.includes("VERSION-RULE-2"))).toBe(true);
  });

  it("accumulates multiple blockers", () => {
    const result = runPreChangeChecklist(
      baseChecklist({
        riskLevel: "high",
        regressionSuiteRun: false,
        outputsCompared: false,
        featureFlagDefined: false,
      })
    );
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
    expect(result.approved).toBe(false);
  });
});

// ─── attachVersionToOutputTrace ───────────────────────────────────────────────

describe("attachVersionToOutputTrace", () => {
  it("attaches version info to an output trace", () => {
    const trace = attachVersionToOutputTrace(
      "trace-001",
      "output-001",
      {
        modelVersion: "v1.1",
        promptTemplateVersion: "v2.0",
        rulesetVersion: "r1.3",
        evaluationVersion: "eval-v1",
      },
      "2026-06-18T10:00:00Z"
    );
    expect(trace.traceId).toBe("trace-001");
    expect(trace.outputId).toBe("output-001");
    expect(trace.modelVersion).toBe("v1.1");
    expect(trace.promptTemplateVersion).toBe("v2.0");
    expect(trace.rulesetVersion).toBe("r1.3");
    expect(trace.evaluationVersion).toBe("eval-v1");
    expect(trace.capturedAt).toBe("2026-06-18T10:00:00Z");
  });

  it("output trace records version when only model version set", () => {
    const trace = attachVersionToOutputTrace(
      "trace-002",
      "output-002",
      { modelVersion: "v1.0" },
      "2026-06-18T10:01:00Z"
    );
    expect(trace.modelVersion).toBe("v1.0");
    expect(trace.promptTemplateVersion).toBeUndefined();
    expect(trace.rulesetVersion).toBeUndefined();
  });

  it("output trace records all version types independently", () => {
    const trace = attachVersionToOutputTrace(
      "trace-003",
      "output-003",
      { promptTemplateVersion: "diag-v3", rulesetVersion: "rules-v2" },
      "2026-06-18T10:02:00Z"
    );
    expect(trace.modelVersion).toBeUndefined();
    expect(trace.promptTemplateVersion).toBe("diag-v3");
    expect(trace.rulesetVersion).toBe("rules-v2");
  });

  it("throws when traceId is empty", () => {
    expect(() =>
      attachVersionToOutputTrace("", "output-001", {}, "2026-06-18T10:00:00Z")
    ).toThrow("traceId is required");
  });

  it("throws when outputId is empty", () => {
    expect(() =>
      attachVersionToOutputTrace("trace-001", "", {}, "2026-06-18T10:00:00Z")
    ).toThrow("outputId is required");
  });

  it("throws when capturedAt is empty", () => {
    expect(() =>
      attachVersionToOutputTrace("trace-001", "output-001", {}, "")
    ).toThrow("capturedAt is required");
  });
});

// ─── High-risk change requires regression (integration scenario) ──────────────

describe("high-risk change requires regression (full flow)", () => {
  it("blocks a high-risk change that skips the pre-change checklist", () => {
    // Checklist: regression not run for high risk
    const checklist = runPreChangeChecklist(
      baseChecklist({ riskLevel: "high", regressionSuiteRun: false })
    );
    expect(checklist.approved).toBe(false);
    // Attempt to record the change fails due to VERSION-RULE-1
    expect(() =>
      recordVersionChange(
        baseVersionChangeInput({ riskLevel: "high", regressionRequired: false })
      )
    ).toThrow("VERSION-RULE-1");
  });

  it("approves a high-risk change that passes the pre-change checklist", () => {
    const checklist = runPreChangeChecklist(
      baseChecklist({ riskLevel: "high", regressionSuiteRun: true })
    );
    expect(checklist.approved).toBe(true);
    const log = recordVersionChange(
      baseVersionChangeInput({
        riskLevel: "high",
        regressionRequired: true,
        regressionResult: "passed",
      })
    );
    expect(log.regressionRequired).toBe(true);
    expect(log.regressionResult).toBe("passed");
  });
});

// ─── Version change recorded (all four structures) ───────────────────────────

describe("version change recorded across all structures", () => {
  it("model change log records version correctly", () => {
    const log = recordVersionChange(
      baseVersionChangeInput({ versionType: "model", versionName: "diagnosis-llm", newVersion: "v2.0" })
    );
    expect(log.versionType).toBe("model");
    expect(log.versionName).toBe("diagnosis-llm");
    expect(log.newVersion).toBe("v2.0");
  });

  it("prompt template version records module", () => {
    const ptv = createPromptTemplateVersion(
      basePromptInput({ module: "recommendation", templateName: "rec-prompt" })
    );
    expect(ptv.module).toBe("recommendation");
    expect(ptv.templateName).toBe("rec-prompt");
  });

  it("ruleset version records scope", () => {
    const rsv = createRulesetVersion(
      baseRulesetInput({ scope: "evidence_verification", rulesetName: "evidence-rules" })
    );
    expect(rsv.scope).toBe("evidence_verification");
    expect(rsv.rulesetName).toBe("evidence-rules");
  });

  it("rollback plan required for all three structures", () => {
    expect(() => recordVersionChange(baseVersionChangeInput({ rollbackPlan: "" }))).toThrow("VERSION-RULE-2");
    expect(() => createPromptTemplateVersion(basePromptInput({ rollbackPlan: "" }))).toThrow("VERSION-RULE-2");
    expect(() => createRulesetVersion(baseRulesetInput({ rollbackPlan: "" }))).toThrow("VERSION-RULE-2");
  });
});

// ─── Rollback plan required ───────────────────────────────────────────────────

describe("rollback plan required", () => {
  it("empty rollback plan fails for model change (VERSION-RULE-2)", () => {
    const errors = validateRecordVersionChangeInput(
      baseVersionChangeInput({ rollbackPlan: "   " })
    );
    expect(errors.some((e) => e.includes("VERSION-RULE-2"))).toBe(true);
  });

  it("non-empty rollback plan passes", () => {
    const log = recordVersionChange(
      baseVersionChangeInput({ rollbackPlan: "Revert feature flag to prior version" })
    );
    expect(log.rollbackPlan).toBe("Revert feature flag to prior version");
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("workspace isolation", () => {
  it("recordVersionChange throws when workspaceId is empty", () => {
    expect(() =>
      recordVersionChange(baseVersionChangeInput({ workspaceId: "" }))
    ).toThrow();
  });

  it("createPromptTemplateVersion throws when workspaceId is empty", () => {
    expect(() =>
      createPromptTemplateVersion(basePromptInput({ workspaceId: "" }))
    ).toThrow();
  });

  it("createRulesetVersion throws when workspaceId is empty", () => {
    expect(() =>
      createRulesetVersion(baseRulesetInput({ workspaceId: "" }))
    ).toThrow();
  });
});
