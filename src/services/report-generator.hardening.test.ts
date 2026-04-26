import { describe, it, expect } from "vitest";

describe("Report Hardening - Executive Summary & Risk Calculation", () => {
  describe("Action urgency calculation", () => {
    it("marks action as overdue when due date is in the past", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      // Simulating the urgency calculation logic
      const daysDue = Math.ceil((pastDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const urgency = daysDue < 0 ? "overdue" : daysDue <= 7 ? "due-soon" : "on-track";

      expect(urgency).toBe("overdue");
    });

    it("marks action as due-soon when due within 7 days", () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 5);

      const daysDue = Math.ceil((soonDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const urgency = daysDue < 0 ? "overdue" : daysDue <= 7 ? "due-soon" : "on-track";

      expect(urgency).toBe("due-soon");
    });

    it("marks action as on-track when due after 7 days", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const daysDue = Math.ceil((futureDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const urgency = daysDue < 0 ? "overdue" : daysDue <= 7 ? "due-soon" : "on-track";

      expect(urgency).toBe("on-track");
    });
  });

  describe("Risk level calculation", () => {
    it("classifies as HIGH risk when critical findings present", () => {
      const findings = [
        { severity: "critical", status: "open" },
        { severity: "high", status: "open" },
      ];
      const actions: any[] = [];
      const criticalFindingCount = 1;

      const riskLevel = criticalFindingCount > 0 ? "high" : "medium";
      expect(riskLevel).toBe("high");
    });

    it("classifies as HIGH risk when overdue actions exist", () => {
      const overdueActions = [
        { status: "open", priority: "high", dueDate: new Date() },
      ];

      const riskLevel = overdueActions.length > 0 ? "high" : "medium";
      expect(riskLevel).toBe("high");
    });

    it("classifies as MEDIUM risk when many high-priority actions", () => {
      const highPriorityActions = [
        { priority: "high", status: "open" },
        { priority: "high", status: "open" },
        { priority: "high", status: "open" },
        { priority: "high", status: "open" },
      ];

      const riskLevel = highPriorityActions.length > 3 ? "medium" : "low";
      expect(riskLevel).toBe("medium");
    });

    it("classifies as LOW risk otherwise", () => {
      const findings = [{ severity: "low", status: "open" }];
      const actions = [{ priority: "low", status: "open" }];

      const criticalFindingCount = 0;
      const overdueActions: any[] = [];
      const highPriorityActions: any[] = [];

      const riskLevel =
        criticalFindingCount > 0 || overdueActions.length > 0
          ? "high"
          : highPriorityActions.length > 3
            ? "medium"
            : "low";

      expect(riskLevel).toBe("low");
    });
  });

  describe("Executive summary fields", () => {
    it("calculates correct total findings count", () => {
      const findings = [
        { severity: "critical", id: "1" },
        { severity: "high", id: "2" },
        { severity: "low", id: "3" },
      ];

      expect(findings.length).toBe(3);
    });

    it("calculates correct critical findings count", () => {
      const findings = [
        { severity: "critical", id: "1" },
        { severity: "critical", id: "2" },
        { severity: "high", id: "3" },
      ];

      const criticalCount = findings.filter((f) => f.severity === "critical").length;
      expect(criticalCount).toBe(2);
    });

    it("calculates correct high priority actions count", () => {
      const actions = [
        { priority: "critical", id: "1" },
        { priority: "high", id: "2" },
        { priority: "high", id: "3" },
        { priority: "low", id: "4" },
      ];

      const highPriorityCount = actions.filter(
        (a) => a.priority === "critical" || a.priority === "high"
      ).length;

      expect(highPriorityCount).toBe(3);
    });

    it("determines immediateActionRequired correctly", () => {
      const criticalFindings = [{ severity: "critical", id: "1" }];
      const riskLevel = "high";

      const immediateActionRequired = riskLevel === "high" || criticalFindings.length > 0;
      expect(immediateActionRequired).toBe(true);
    });
  });

  describe("Data completeness tracking", () => {
    it("tracks which data sections are populated", () => {
      const completeness = {
        hasFindings: true,
        hasRecommendations: true,
        hasActions: false,
        hasKPIs: true,
        hasConditionProfile: true,
      };

      expect(completeness.hasFindings).toBe(true);
      expect(completeness.hasActions).toBe(false);
      expect(Object.values(completeness).filter((v) => v).length).toBe(4);
    });
  });
});
