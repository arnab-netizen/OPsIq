/**
 * Owner Goals page — jsdom integration test.
 *
 * Stubs fetch to serve active goal + trajectory. Asserts: page renders goal
 * summary card, trajectory progress bar, and create modal submits correctly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import GoalsPage from "@/app/(authenticated)/owner/goals/page";

const ACTIVE_GOAL = {
  goal: {
    id: "goal-uuid-1",
    targetType: "PROFIT",
    targetAmount: 500000,
    targetCurrency: "USD",
    targetDate: "2027-06-30T00:00:00.000Z",
    baselineAmount: 120000,
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
};

const TRAJECTORY_RESULT = {
  result: {
    goal: ACTIVE_GOAL.goal,
    trajectory: {
      projectedAchievementDate: "2027-04-15T00:00:00.000Z",
      onTrack: true,
      // Real TrajectoryConfidence values are uppercase (see
      // src/services/owner-strategy/goal-trajectory.service.ts) -- this fixture
      // previously used lowercase "medium", which never occurs in production and
      // masked the G5 raw-enum-leak bug this page was fixed for (see CONFIDENCE_LABEL).
      confidence: "MEDIUM",
      points: [],
      gapToTarget: 280000,
      percentComplete: 44,
    },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/owner/goals/trajectory")) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(TRAJECTORY_RESULT),
      } as Response);
    }
    if (url.endsWith("/api/owner/goals") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(ACTIVE_GOAL),
      } as Response);
    }
    if (url.endsWith("/api/owner/goals") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ goalId: "goal-uuid-2" }),
      } as Response);
    }
    return Promise.resolve({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: "not found" }),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalsPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = render(<GoalsPage />);
    await findByText("Financial Goal");
  });

  it("loads and renders the active goal card", async () => {
    const { findByTestId } = render(<GoalsPage />);
    const detail = await findByTestId("goal-detail");
    expect(detail.textContent).toMatch(/Net Profit/);
  });

  it("fetches both goals and trajectory endpoints", async () => {
    const { findByTestId } = render(<GoalsPage />);
    await findByTestId("goal-detail");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/goals"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/goals/trajectory"),
      expect.anything(),
    );
  });

  it("renders the trajectory section when trajectory is available", async () => {
    const { findByTestId } = render(<GoalsPage />);
    await findByTestId("goal-trajectory");
  });

  it("displays on-track badge as Yes", async () => {
    const { findByText } = render(<GoalsPage />);
    await findByText("Yes");
  });

  it("displays progress percentage from trajectory", async () => {
    const { findByText } = render(<GoalsPage />);
    await findByText("44%");
  });

  it("shows the humanized status badge, not the raw ACTIVE enum value", async () => {
    const { findByText, queryByText } = render(<GoalsPage />);
    await findByText("Active");
    // The raw GoalStatus enum value must never leak into the rendered badge.
    expect(queryByText("ACTIVE")).toBeNull();
  });

  it("shows Update Goal button when a goal exists", async () => {
    const { findByText } = render(<GoalsPage />);
    await findByText("Update Goal");
  });

  it("opens create modal when Update Goal is clicked", async () => {
    const { findByText } = render(<GoalsPage />);
    const btn = await findByText("Update Goal");
    fireEvent.click(btn);
    const modalTitle = await findByText("Update Financial Goal");
    expect(modalTitle).toBeTruthy();
  });

  it("shows No financial goal set when goal is null", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/goals/trajectory")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ result: null }) } as Response);
      }
      if (url.includes("/api/owner/goals")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ goal: null }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<GoalsPage />);
    await findByText("No financial goal set yet.");
  });

  it("shows Set your first goal button when no goal exists", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/goals")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ goal: null, result: null }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<GoalsPage />);
    await findByText("Set your first goal");
  });

  it("submits new goal via POST to /api/owner/goals", async () => {
    const { findByText } = render(<GoalsPage />);
    const btn = await findByText("Update Goal");
    fireEvent.click(btn);
    await findByText("Update Financial Goal");

    await waitFor(() => {
      const typeSelect = document.querySelector('select') as HTMLSelectElement | null;
      if (typeSelect) fireEvent.change(typeSelect, { target: { value: "REVENUE" } });
    });

    const inputs = document.querySelectorAll('input');
    const amountInput = Array.from(inputs).find((i) => (i as HTMLInputElement).type === "number");
    if (amountInput) fireEvent.change(amountInput, { target: { value: "750000" } });

    const dateInput = Array.from(inputs).find((i) => (i as HTMLInputElement).type === "date");
    if (dateInput) fireEvent.change(dateInput, { target: { value: "2028-01-01" } });

    const createBtn = await findByText("Set new goal");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/owner/goals"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows projected achievement date from trajectory", async () => {
    const { findByText } = render(<GoalsPage />);
    await findByText(/Projected achievement/);
  });

  it("renders the humanized confidence value, not the raw MEDIUM enum value", async () => {
    const { findByText, queryByText } = render(<GoalsPage />);
    await findByText("Medium");
    // The raw TrajectoryConfidence enum value must never leak into the rendered text.
    expect(queryByText("MEDIUM")).toBeNull();
    expect(queryByText("medium")).toBeNull();
  });
});
