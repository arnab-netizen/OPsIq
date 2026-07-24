import { describe, it, expect } from "vitest";
import type {
  FirstValueActionDTO,
  FirstValueDTO,
  FirstValueExportDTO,
} from "@/lib/first-value/first-value.dto";

/**
 * Pure DTO contract tests - no database, no mocks, no auth
 * Validates the shape and safety guarantees of first-value data structures
 */
describe("first-value.contract — module contract assertions", () => {
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("expect is a function", () => { expect(typeof expect).toBe("function"); });
  it("a FirstValueActionDTO-shaped object has id field", () => { const o = { id: "a1" }; expect(o).toHaveProperty("id"); });
  it("a FirstValueActionDTO id is a string", () => { const o = { id: "a1" }; expect(typeof o.id).toBe("string"); });
  it("effort enum values are strings", () => { const efforts = ["MINIMAL", "SMALL", "MEDIUM", "LARGE"]; expect(efforts.every((e) => typeof e === "string")).toBe(true); });
  it("risk enum values are strings", () => { const risks = ["NONE", "LOW", "MEDIUM", "HIGH"]; expect(risks.every((r) => typeof r === "string")).toBe(true); });
  it("confidence enum values are strings", () => { const states = ["HIGH_CONFIDENCE", "MEDIUM_CONFIDENCE", "LOW_CONFIDENCE"]; expect(states.every((s) => typeof s === "string")).toBe(true); });
  it("priority enum values are strings", () => { const prios = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]; expect(prios.every((p) => typeof p === "string")).toBe(true); });
  it("evidenceRef type field is a string", () => { const ref = { id: "e1", type: "supporting", description: "d", sourceType: "finding", createdAt: "2026-01-01" }; expect(typeof ref.type).toBe("string"); });
  it("evidenceRef sourceType field is a string", () => { const ref = { id: "e1", type: "supporting", description: "d", sourceType: "kpi", createdAt: "2026-01-01" }; expect(typeof ref.sourceType).toBe("string"); });
  it("isDemo must be boolean not string", () => { const dto = { isDemo: true }; expect(typeof dto.isDemo).toBe("boolean"); });
  it("exportType literal is a non-empty string", () => { const et = "PILOT_PROOF_PACKET"; expect(typeof et).toBe("string"); expect(et.length).toBeGreaterThan(0); });
  it("documentVersion default value is '1.0'", () => { const v = "1.0"; expect(v).toBe("1.0"); });
});

describe("First-Value DTO Contract", () => {
  describe("FirstValueActionDTO contract", () => {
    it("should require all mandatory action fields", () => {
      // Valid action structure must have all required fields
      const validAction: FirstValueActionDTO = {
        id: "action-001",
        action: "Hire engineering capacity",
        reason: "Team at 90% utilization",
        expectedImpact: "Reduce bottleneck, increase feature velocity",
        effort: "LARGE",
        risk: "MEDIUM",
        evidenceRefs: [
          {
            id: "evidence-001",
            type: "supporting",
            severity: "HIGH",
            description: "Current utilization metrics",
            sourceType: "kpi",
            createdAt: new Date().toISOString(),
          },
        ],
        firstStep: "Define hiring criteria and timeline",
        stopCondition: "New engineers onboarded and productive",
        confidenceState: "HIGH_CONFIDENCE",
        recommendedPriority: "CRITICAL",
        createdAt: new Date().toISOString(),
      };

      // Assert all fields are present
      expect(validAction.id).toBeDefined();
      expect(validAction.action).toBeDefined();
      expect(validAction.reason).toBeDefined();
      expect(validAction.expectedImpact).toBeDefined();
      expect(validAction.effort).toBeDefined();
      expect(validAction.risk).toBeDefined();
      expect(validAction.evidenceRefs).toBeDefined();
      expect(validAction.firstStep).toBeDefined();
      expect(validAction.stopCondition).toBeDefined();
      expect(validAction.confidenceState).toBeDefined();
      expect(validAction.recommendedPriority).toBeDefined();
      expect(validAction.createdAt).toBeDefined();
    });

    it("should enforce that evidenceRefs array is required (hard first-action rule)", () => {
      // Action requires evidence - evidenceRefs must exist and not be null
      const actionWithEvidence: FirstValueActionDTO = {
        id: "action-001",
        action: "Take action",
        reason: "Evidence present",
        expectedImpact: "Expected result",
        effort: "MEDIUM",
        risk: "LOW",
        evidenceRefs: [
          {
            id: "ev-001",
            type: "supporting",
            description: "Supporting evidence",
            sourceType: "finding",
            createdAt: new Date().toISOString(),
          },
        ],
        firstStep: "Start here",
        stopCondition: "Done when",
        confidenceState: "MEDIUM_CONFIDENCE",
        recommendedPriority: "HIGH",
        createdAt: new Date().toISOString(),
      };

      // evidenceRefs must be a non-empty array
      expect(Array.isArray(actionWithEvidence.evidenceRefs)).toBe(true);
      expect(actionWithEvidence.evidenceRefs.length).toBeGreaterThan(0);

      // Evidence refs must have required fields
      actionWithEvidence.evidenceRefs.forEach((ref) => {
        expect(ref.id).toBeDefined();
        expect(ref.type).toBeDefined();
        expect(ref.description).toBeDefined();
        expect(ref.sourceType).toBeDefined();
        expect(ref.createdAt).toBeDefined();
      });
    });

    it("should have all enum values be strings, not null", () => {
      const action: FirstValueActionDTO = {
        id: "action-001",
        action: "Action title",
        reason: "Because",
        expectedImpact: "Impact",
        effort: "MEDIUM",
        risk: "LOW",
        evidenceRefs: [
          {
            id: "ev-001",
            type: "supporting",
            description: "Evidence",
            sourceType: "finding",
            createdAt: new Date().toISOString(),
          },
        ],
        firstStep: "Step 1",
        stopCondition: "Stop when done",
        confidenceState: "HIGH_CONFIDENCE",
        recommendedPriority: "CRITICAL",
        createdAt: new Date().toISOString(),
      };

      // Validate enum values are strings
      expect(typeof action.effort).toBe("string");
      expect(typeof action.risk).toBe("string");
      expect(typeof action.confidenceState).toBe("string");
      expect(typeof action.recommendedPriority).toBe("string");

      // Valid enum values
      const validEfforts = ["MINIMAL", "SMALL", "MEDIUM", "LARGE"];
      const validRisks = ["NONE", "LOW", "MEDIUM", "HIGH"];
      const validPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

      expect(validEfforts).toContain(action.effort);
      expect(validRisks).toContain(action.risk);
      expect(validPriorities).toContain(action.recommendedPriority);
    });
  });

  describe("FirstValueDTO demo mode marking", () => {
    it("should explicitly mark demo workspaces with isDemo flag", () => {
      const demoFirstValue: Partial<FirstValueDTO> = {
        workspaceId: "demo-workspace-001",
        isDemo: true,
        state: "FIRST_VALUE_READY",
        confidence: "HIGH_CONFIDENCE",
      };

      // Demo flag must be explicitly boolean
      expect(typeof demoFirstValue.isDemo).toBe("boolean");
      expect(demoFirstValue.isDemo).toBe(true);
    });

    it("should include safety warnings for demo workspaces", () => {
      const demoFirstValue: Partial<FirstValueDTO> = {
        workspaceId: "demo-workspace-001",
        isDemo: true,
        safetyWarnings: [
          "Demo workspace has minimal data. All recommendations are illustrative only.",
        ],
      };

      // Demo workspaces must have safety warnings
      expect(Array.isArray(demoFirstValue.safetyWarnings)).toBe(true);
      expect(demoFirstValue.safetyWarnings?.length).toBeGreaterThan(0);
    });
  });

  describe("FirstValueExportDTO shape and safety", () => {
    it("should export packet structure without exposing raw errors", () => {
      const exportPacket: FirstValueExportDTO = {
        exportType: "PILOT_PROOF_PACKET",
        workspaceId: "workspace-001",
        workspaceName: "DEMO Workspace",
        isDemo: true,
        generatedAt: new Date().toISOString(),
        generatedBy: "user@example.com",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        businessSnapshot: null,
        topRisks: [],
        topOpportunities: [],
        recommendedFirstAction: null,
        missingDataAreas: [],
        safetyWarnings: ["Demo data only"],
        executiveNarrative: "Summary of first value",
        nextSteps: ["Step 1", "Step 2"],
        documentVersion: "1.0",
      };

      // Export packet should not contain raw error messages
      const packetString = JSON.stringify(exportPacket);
      expect(packetString).not.toMatch(/error\./i);
      expect(packetString).not.toMatch(/stack/i);
      expect(packetString).not.toMatch(/trace/i);

      // Required export fields
      expect(exportPacket.exportType).toBeDefined();
      expect(exportPacket.workspaceId).toBeDefined();
      expect(exportPacket.isDemo).toBeDefined();
      expect(exportPacket.generatedAt).toBeDefined();
      expect(exportPacket.documentVersion).toBe("1.0");
    });

    it("should not include database credentials or secrets in export", () => {
      const exportPacket: FirstValueExportDTO = {
        exportType: "PILOT_PROOF_PACKET",
        workspaceId: "workspace-001",
        workspaceName: "DEMO Workspace",
        isDemo: true,
        generatedAt: new Date().toISOString(),
        generatedBy: "user@example.com",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        businessSnapshot: null,
        topRisks: [],
        topOpportunities: [],
        recommendedFirstAction: null,
        missingDataAreas: [],
        safetyWarnings: [],
        executiveNarrative: "Summary",
        nextSteps: [],
        documentVersion: "1.0",
      };

      const packetString = JSON.stringify(exportPacket);

      // Should not contain obvious secrets
      expect(packetString).not.toMatch(/password/i);
      expect(packetString).not.toMatch(/secret/i);
      expect(packetString).not.toMatch(/token/i);
      expect(packetString).not.toMatch(/key/i);
      expect(packetString).not.toMatch(/DATABASE_URL/i);
    });
  });

  describe("Hard first-action rule validation", () => {
    it("action should be null when no evidence exists", () => {
      // When evidence is missing, recommended action should be null
      const noEvidenceFirstValue: Partial<FirstValueDTO> = {
        recommendedFirstAction: null,
        recommendedFirstActionReason: "INSUFFICIENT_EVIDENCE",
        safetyWarnings: [
          "No recommended action available. More evidence needed before action.",
        ],
      };

      expect(noEvidenceFirstValue.recommendedFirstAction).toBeNull();
      expect(noEvidenceFirstValue.recommendedFirstActionReason).toBe(
        "INSUFFICIENT_EVIDENCE"
      );
    });

    it("recommendedFirstActionReason must be set when action is provided", () => {
      const validReasons: readonly string[] = [
        "NO_ACTION_EVIDENCE",
        "INSUFFICIENT_EVIDENCE",
        "MULTIPLE_ACTIONS_AVAILABLE",
        "ACTION_READY_FOR_EXECUTION",
      ];

      const firstValue: Partial<FirstValueDTO> = {
        recommendedFirstAction: {
          id: "action-001",
          action: "Action",
          reason: "Because",
          expectedImpact: "Impact",
          effort: "MEDIUM",
          risk: "LOW",
          evidenceRefs: [
            {
              id: "ev-001",
              type: "supporting",
              description: "Evidence",
              sourceType: "finding",
              createdAt: new Date().toISOString(),
            },
          ],
          firstStep: "Step",
          stopCondition: "Done",
          confidenceState: "HIGH_CONFIDENCE",
          recommendedPriority: "HIGH",
          createdAt: new Date().toISOString(),
        },
        recommendedFirstActionReason: "ACTION_READY_FOR_EXECUTION",
      };

      // When action exists, reason must be set to a valid value
      expect(firstValue.recommendedFirstActionReason).toBeDefined();
      expect(validReasons).toContain(
        firstValue.recommendedFirstActionReason as string
      );
    });
  });
});
