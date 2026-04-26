import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EngagementWorkspace } from "./engagement-workspace";

const mockEngagement = {
  id: "eng-123",
  code: "ENG-001",
  title: "Test Engagement",
  status: "active",
  healthStatus: "healthy",
  interventionMode: "stabilization",
  interventionPhase: "assessment",
  serviceTier: "premium",
  client: {
    id: "client-123",
    name: "Test Client",
    industry: "Finance",
  },
};

describe("EngagementWorkspace", () => {
  it("renders without crashing with minimal props", () => {
    const { container } = render(
      <EngagementWorkspace
        engagement={mockEngagement}
        initialFindings={[]}
        initialRecommendations={[]}
        initialActions={[]}
        initialKPIs={[]}
        initialEvidence={[]}
      />
    );
    expect(container).toBeTruthy();
  });

  it("renders with populated data", () => {
    const mockFindings = [{ id: "f1", title: "Issue", severity: "high", summary: "Test" }];
    const mockRecommendations = [{ id: "r1", title: "Rec", priority: "high" }];
    const mockActions = [{ id: "a1", title: "Action", status: "open" }];

    const { container } = render(
      <EngagementWorkspace
        engagement={mockEngagement}
        initialFindings={mockFindings}
        initialRecommendations={mockRecommendations}
        initialActions={mockActions}
        initialKPIs={[]}
        initialEvidence={[]}
      />
    );
    expect(container).toBeTruthy();
  });

  it("handles all empty states gracefully", () => {
    const { container } = render(
      <EngagementWorkspace
        engagement={mockEngagement}
        initialFindings={[]}
        initialRecommendations={[]}
        initialActions={[]}
        initialKPIs={[]}
        initialEvidence={[]}
      />
    );
    expect(container).toBeTruthy();
  });
});
