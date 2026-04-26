import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReportClient } from "./report-client";

const mockReport = {
  summary: {
    engagementId: "eng-123",
    engagementCode: "ENG-001",
    engagementTitle: "Test Engagement",
    status: "active",
    healthStatus: "healthy",
    interventionMode: "stabilization",
  },
  findings: [],
  recommendations: [],
  actions: [],
  kpis: [],
  reviewStatus: {
    trend: "improving",
    reasoning: "No critical findings",
    findingCount: 0,
    criticalFindingCount: 0,
    openActionCount: 0,
    completedActionCount: 0,
  },
  generatedAt: new Date().toISOString(),
};

describe("ReportClient", () => {
  it("renders download and print buttons", () => {
    const { container } = render(
      <ReportClient report={mockReport} engagementId="eng-123" />
    );
    expect(container).toBeTruthy();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("renders without crashing with populated report", () => {
    const { container } = render(
      <ReportClient report={mockReport} engagementId="eng-123" />
    );
    expect(container).toBeTruthy();
  });
});
