import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExecutionCertaintyCard } from "./execution-certainty-card";

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe("ExecutionCertaintyCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    global.fetch = vi.fn(() =>
      new Promise(() => {}) // Never resolves, stays loading
    );

    render(<ExecutionCertaintyCard engagementId="eng-123" />);

    expect(screen.getByText(/Execution Certainty/i)).toBeTruthy();
  });

  it("renders score and level when data loads", async () => {
    const mockData = {
      score: 85,
      level: "high" as const,
      blockers: [],
      risks: [],
      reasons: ["Good progress on actions"],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<ExecutionCertaintyCard engagementId="eng-456" />);

    await waitFor(() => {
      expect(screen.getByText("85")).toBeTruthy();
      expect(screen.getByText("high")).toBeTruthy();
    });
  });

  it("displays blockers count when present", async () => {
    const mockData = {
      score: 30,
      level: "blocked" as const,
      blockers: ["Critical action blocked: act-1", "Critical action blocked: act-2"],
      risks: [],
      reasons: ["2 unresolved critical finding(s)"],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<ExecutionCertaintyCard engagementId="eng-789" />);

    await waitFor(() => {
      expect(screen.getByText("2 blocker(s)")).toBeTruthy();
    });
  });

  it("displays risks count when present", async () => {
    const mockData = {
      score: 65,
      level: "medium" as const,
      blockers: [],
      risks: ["Engagement at risk", "KPI trend deteriorating"],
      reasons: ["At-risk health state"],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<ExecutionCertaintyCard engagementId="eng-abc" />);

    await waitFor(() => {
      expect(screen.getByText("2 risk(s)")).toBeTruthy();
    });
  });

  it("displays top 3 reasons", async () => {
    const mockData = {
      score: 75,
      level: "high" as const,
      blockers: [],
      risks: [],
      reasons: [
        "1 completed action(s)",
        "Engagement health is stable/positive",
        "KPI trend improving",
      ],
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)
    );

    render(<ExecutionCertaintyCard engagementId="eng-def" />);

    await waitFor(() => {
      expect(screen.getByText(/1 completed action/)).toBeTruthy();
      expect(screen.getByText(/Engagement health is stable/)).toBeTruthy();
      expect(screen.getByText(/KPI trend improving/)).toBeTruthy();
    });
  });

  it("handles fetch error gracefully", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("Network error"))
    );

    render(<ExecutionCertaintyCard engagementId="eng-error" />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy();
    });
  });

  it("handles API error response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    );

    render(<ExecutionCertaintyCard engagementId="eng-fail" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeTruthy();
    });
  });
});
