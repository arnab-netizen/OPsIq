import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OwnerDashboard } from "./owner-dashboard";

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const createMockDashboardData = (overrides?: any) => ({
  engagementId: "eng-123",
  engagementCode: "ENG-001",
  engagementTitle: "Test",
  status: "active",
  healthStatus: "healthy",
  interventionMode: "tactical",
  executionCertainty: {
    engagementId: "eng-123",
    generatedAt: new Date().toISOString(),
    score: 85,
    level: "high",
    blockers: [],
    risks: [],
    reasons: [],
  },
  drift: {
    engagementId: "eng-123",
    driftDetected: false,
    severity: "low",
    reasons: [],
    affectedActions: [],
    requiredAttention: false,
    detectedAt: new Date().toISOString(),
  },
  criticalBlockers: [],
  overdueActions: [],
  criticalActions: [],
  openRecommendations: [],
  nextBestAction: null,
  businessImpact: {
    summary: "Engagement tracking well",
    keyRisks: [],
    opportunities: [],
  },
  generatedAt: new Date().toISOString(),
  ...overrides,
});

describe("OwnerDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    global.fetch = vi.fn(() =>
      new Promise(() => {}) // Never resolves, stays loading
    );

    const { container } = render(<OwnerDashboard engagementId="eng-123" />);

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders engagement title when data loads", async () => {
    const mockData = createMockDashboardData({
      engagementTitle: "Important Client",
      engagementCode: "ENG-001",
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText("Important Client")).toBeTruthy();
      expect(screen.getByText("ENG-001")).toBeTruthy();
    });
  });

  it("displays health status badge", async () => {
    const mockData = createMockDashboardData();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText("healthy")).toBeTruthy();
    });
  });

  it("displays execution certainty score and level", async () => {
    const mockData = createMockDashboardData({
      executionCertainty: {
        engagementId: "eng-123",
        generatedAt: new Date().toISOString(),
        score: 75,
        level: "high",
        blockers: [],
        risks: [],
        reasons: [],
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText("75")).toBeTruthy();
      expect(screen.getByText("high")).toBeTruthy();
    });
  });

  it("displays critical blockers when present", async () => {
    const mockData = createMockDashboardData({
      criticalBlockers: ["Critical action blocked: act-1"],
      executionCertainty: {
        engagementId: "eng-123",
        generatedAt: new Date().toISOString(),
        score: 30,
        level: "blocked",
        blockers: ["Critical action blocked: act-1"],
        risks: [],
        reasons: [],
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText(/1 Critical Blocker/)).toBeTruthy();
    });
  });

  it("displays overdue actions when present", async () => {
    const mockData = createMockDashboardData({
      overdueActions: [
        {
          id: "act-1",
          title: "Resolve customer issue",
          priority: "critical",
          status: "in_progress",
          dueDate: new Date(Date.now() - 86400000).toISOString(),
          urgency: "overdue",
        },
      ],
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText(/1 Overdue Action/)).toBeTruthy();
      expect(screen.getByText("Resolve customer issue")).toBeTruthy();
    });
  });

  it("displays next best action", async () => {
    const mockData = createMockDashboardData({
      nextBestAction: {
        type: "action",
        id: "act-1",
        title: "Complete impact assessment",
        reason: "Critical action is overdue",
        priority: "critical",
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText("Next Best Action")).toBeTruthy();
      expect(screen.getByText("Complete impact assessment")).toBeTruthy();
    });
  });

  it("displays business impact summary", async () => {
    const mockData = createMockDashboardData({
      businessImpact: {
        summary: "Strong execution certainty enables next phase",
        keyRisks: [],
        opportunities: ["Engagement health stable", "Strong execution"],
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Why This Matters/)).toBeTruthy();
      expect(screen.getByText("Strong execution certainty enables next phase")).toBeTruthy();
    });
  });

  it("shows empty state when no actions or recommendations", async () => {
    const mockData = createMockDashboardData({
      executionCertainty: {
        engagementId: "eng-123",
        generatedAt: new Date().toISOString(),
        score: 95,
        level: "certain",
        blockers: [],
        risks: [],
        reasons: [],
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText(/No overdue actions or critical items/)).toBeTruthy();
    });
  });

  it("handles fetch error gracefully", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("Network error"))
    );

    render(<OwnerDashboard engagementId="eng-error" />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to Load Dashboard/)).toBeTruthy();
    });
  });

  it("handles API error response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-fail" />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to Load Dashboard/)).toBeTruthy();
    });
  });

  it("displays drift detection when drift is detected", async () => {
    const mockData = createMockDashboardData({
      drift: {
        engagementId: "eng-123",
        driftDetected: true,
        severity: "high",
        reasons: ["2 critical action(s) are overdue"],
        affectedActions: ["act-1"],
        requiredAttention: true,
        detectedAt: new Date().toISOString(),
      },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<OwnerDashboard engagementId="eng-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Needs Attention/)).toBeTruthy();
      expect(screen.getByText(/Execution Drift Detected/)).toBeTruthy();
    });
  });
});
