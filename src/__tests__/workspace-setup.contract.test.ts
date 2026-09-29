import { describe, it, expect } from "vitest";
import type {
  WorkspaceSetupStateDTO,
  WorkspaceSetupExportDTO,
} from "@/lib/workspace-setup/workspace-setup.dto";

describe("Workspace Setup DTO Contract", () => {
  describe("WorkspaceSetupStateDTO contract", () => {
    it("should have all required setup state fields", () => {
      const setupState: WorkspaceSetupStateDTO = {
        workspaceId: "test-workspace-001",
        setupState: "WORKSPACE_EXISTS",
        workspaceMode: "LIVE",
        businessBasics: {},
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 0,
          progressPercent: 0,
          completedSections: [],
          incompleteSections: [
            "Business Basics",
            "Financial Basics",
            "Capacity Basics",
            "Customer Basics",
            "Owner Constraints",
          ],
        },
        missingData: {
          businessName: true,
          industryCategory: true,
          operatingLocationMarket: true,
          revenueModel: true,
          monthlyRevenueEstimate: true,
          monthlyCostEstimate: true,
          teamSizeCapacity: true,
          customerSegment: true,
          mainCurrentProblem: true,
          ownerTimeConstraint: true,
        },
        firstValueReady: false,
        nextStep: "Complete: Business Basics, Financial Basics, Capacity Basics, Customer Basics, Owner Constraints",
        safetyWarnings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(setupState.workspaceId).toBeDefined();
      expect(setupState.setupState).toBeDefined();
      expect(setupState.workspaceMode).toBeDefined();
      expect(setupState.businessBasics).toBeDefined();
      expect(setupState.progress).toBeDefined();
      expect(setupState.missingData).toBeDefined();
      expect(setupState.firstValueReady).toBeDefined();
      expect(setupState.generatedAt).toBeDefined();
    });

    it("should mark firstValueReady=false when required fields are missing", () => {
      const incompleteSetup: WorkspaceSetupStateDTO = {
        workspaceId: "test-workspace-001",
        setupState: "BUSINESS_BASICS_MISSING",
        workspaceMode: "LIVE",
        businessBasics: {
          businessName: "Test Business",
        },
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 1,
          progressPercent: 10,
          completedSections: [],
          incompleteSections: [],
        },
        missingData: {
          businessName: false,
          industryCategory: true,
          operatingLocationMarket: true,
          revenueModel: true,
          monthlyRevenueEstimate: true,
          monthlyCostEstimate: true,
          teamSizeCapacity: true,
          customerSegment: true,
          mainCurrentProblem: true,
          ownerTimeConstraint: true,
        },
        firstValueReady: false,
        nextStep: "Complete missing fields",
        safetyWarnings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(incompleteSetup.firstValueReady).toBe(false);
    });

    it("should mark firstValueReady=true only when all fields are present", () => {
      const completeSetup: WorkspaceSetupStateDTO = {
        workspaceId: "test-workspace-001",
        setupState: "MINIMUM_SETUP_COMPLETE",
        workspaceMode: "LIVE",
        businessBasics: {
          businessName: "Test Business",
          industryCategory: "Tech",
          operatingLocationMarket: "US",
          revenueModel: "SaaS",
        },
        ownerConstraints: {
          ownerTimeConstraint: "10 hours/week",
        },
        financialBasics: {
          monthlyRevenueEstimate: "$50,000",
          monthlyCostEstimate: "$30,000",
        },
        capacityBasics: {
          teamSizeCapacity: "5-10 people",
        },
        customerBasics: {
          customerSegment: "Enterprise",
          mainCurrentProblem: "Scaling challenges",
        },
        progress: {
          totalRequiredFields: 10,
          completedFields: 10,
          progressPercent: 100,
          completedSections: [
            "Business Basics",
            "Financial Basics",
            "Capacity Basics",
            "Customer Basics",
            "Owner Constraints",
          ],
          incompleteSections: [],
        },
        missingData: {
          businessName: false,
          industryCategory: false,
          operatingLocationMarket: false,
          revenueModel: false,
          monthlyRevenueEstimate: false,
          monthlyCostEstimate: false,
          teamSizeCapacity: false,
          customerSegment: false,
          mainCurrentProblem: false,
          ownerTimeConstraint: false,
        },
        firstValueReady: true,
        nextStep: "Continue to First-Value Visibility",
        safetyWarnings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(completeSetup.firstValueReady).toBe(true);
    });
  });

  describe("WorkspaceSetupExportDTO contract", () => {
    it("should have all required export fields without secrets", () => {
      const exportPacket: WorkspaceSetupExportDTO = {
        exportType: "WORKSPACE_SETUP_PROOF_PACKET",
        workspaceId: "workspace-001",
        workspaceName: "Test Workspace",
        workspaceMode: "LIVE",
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        setupState: "MINIMUM_SETUP_COMPLETE",
        businessBasics: {
          businessName: "Test Business",
        },
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 10,
          progressPercent: 100,
          completedSections: [],
          incompleteSections: [],
        },
        missingData: {
          businessName: false,
          industryCategory: false,
          operatingLocationMarket: false,
          revenueModel: false,
          monthlyRevenueEstimate: false,
          monthlyCostEstimate: false,
          teamSizeCapacity: false,
          customerSegment: false,
          mainCurrentProblem: false,
          ownerTimeConstraint: false,
        },
        firstValueReady: true,
        nextStep: "Continue to First-Value",
        safetyWarnings: [],
        documentVersion: "1.0",
      };

      const packetString = JSON.stringify(exportPacket);
      expect(packetString).not.toMatch(/password/i);
      expect(packetString).not.toMatch(/secret/i);
      expect(packetString).not.toMatch(/token/i);
      expect(packetString).not.toMatch(/DATABASE_URL/i);

      expect(exportPacket.exportType).toBeDefined();
      expect(exportPacket.workspaceId).toBeDefined();
      expect(exportPacket.generatedAt).toBeDefined();
      expect(exportPacket.documentVersion).toBe("1.0");
    });
  });

  describe("Setup state transitions", () => {
    it("should return WORKSPACE_EXISTS when no data is provided", () => {
      const state: WorkspaceSetupStateDTO = {
        workspaceId: "workspace-001",
        setupState: "WORKSPACE_EXISTS",
        workspaceMode: "LIVE",
        businessBasics: {},
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 0,
          progressPercent: 0,
          completedSections: [],
          incompleteSections: [
            "Business Basics",
            "Financial Basics",
            "Capacity Basics",
            "Customer Basics",
            "Owner Constraints",
          ],
        },
        missingData: {
          businessName: true,
          industryCategory: true,
          operatingLocationMarket: true,
          revenueModel: true,
          monthlyRevenueEstimate: true,
          monthlyCostEstimate: true,
          teamSizeCapacity: true,
          customerSegment: true,
          mainCurrentProblem: true,
          ownerTimeConstraint: true,
        },
        firstValueReady: false,
        nextStep: "Complete Business Basics",
        safetyWarnings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(state.setupState).toBe("WORKSPACE_EXISTS");
    });

    it("should return NEED_MORE_DATA when setup is partially complete", () => {
      const state: WorkspaceSetupStateDTO = {
        workspaceId: "workspace-001",
        setupState: "NEED_MORE_DATA",
        workspaceMode: "LIVE",
        businessBasics: {
          businessName: "Test",
          industryCategory: "Tech",
        },
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 2,
          progressPercent: 20,
          completedSections: [],
          incompleteSections: [],
        },
        missingData: {
          businessName: false,
          industryCategory: false,
          operatingLocationMarket: true,
          revenueModel: true,
          monthlyRevenueEstimate: true,
          monthlyCostEstimate: true,
          teamSizeCapacity: true,
          customerSegment: true,
          mainCurrentProblem: true,
          ownerTimeConstraint: true,
        },
        firstValueReady: false,
        nextStep: "Complete remaining sections",
        safetyWarnings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(state.setupState).toBe("NEED_MORE_DATA");
    });
  });

  describe("Demo workspace marking", () => {
    it("should explicitly mark demo workspaces", () => {
      const demoSetup: WorkspaceSetupStateDTO = {
        workspaceId: "demo-workspace-001",
        setupState: "MINIMUM_SETUP_COMPLETE",
        workspaceMode: "DEMO",
        businessBasics: { businessName: "Demo Business" },
        ownerConstraints: {},
        financialBasics: {},
        capacityBasics: {},
        customerBasics: {},
        progress: {
          totalRequiredFields: 10,
          completedFields: 10,
          progressPercent: 100,
          completedSections: [],
          incompleteSections: [],
        },
        missingData: {
          businessName: false,
          industryCategory: false,
          operatingLocationMarket: false,
          revenueModel: false,
          monthlyRevenueEstimate: false,
          monthlyCostEstimate: false,
          teamSizeCapacity: false,
          customerSegment: false,
          mainCurrentProblem: false,
          ownerTimeConstraint: false,
        },
        firstValueReady: false,
        nextStep: "Continue",
        safetyWarnings: ["DEMO workspace. All setup data is sample only."],
        generatedAt: new Date().toISOString(),
      };

      expect(demoSetup.workspaceMode).toBe("DEMO");
      expect(demoSetup.safetyWarnings).toContain("DEMO workspace. All setup data is sample only.");
    });
  });
});
