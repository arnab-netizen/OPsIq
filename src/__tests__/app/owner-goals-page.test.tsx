/**
 * Owner Goals page — jsdom integration test.
 *
 * Stubs fetch to serve active goal + trajectory. Asserts: page renders goal
 * summary card, trajectory progress bar, and create modal submits correctly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import GoalsPage from "@/app/(authenticated)/owner/goals/page";

// The page defaults the goal currency from the active business (INR here, to prove no USD default).
vi.mock("@/context/active-business-context", () => ({
  useActiveBusiness: () => ({ activeBusiness: { id: "biz-1", name: "Biz", currency: "INR" } }),
}));

const ACTIVE_GOAL = {
  goal: {
    id: "goal-uuid-1",
    targetType: "PROFIT",
    targetAmount: 500000,
    targetCurrency: "USD",
    targetDate: "2027-06-30T00:00:00.000Z",
    baselineAmount: 120000,
    status: "ACTIVE",
    isOverdue: false,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
};

const TRAJECTORY_RESULT = {
  result: {
    goal: ACTIVE_GOAL.goal,
    // Exact JSON shape of GoalTrajectoryResult (src/services/owner-strategy/goal-trajectory.service.ts).
    // A previous fixture used invented field names (percentComplete/gapToTarget/onTrack/
    // projectedAchievementDate on a shape the server never sent), which hid "Progress NaN%".
    trajectory: {
      projectedMonthsToGoal: 7,
      currentTrajectoryDate: "2027-04-15T00:00:00.000Z",
      // Real TrajectoryConfidence values are uppercase -- see CONFIDENCE_LABEL.
      confidence: "MEDIUM",
      confidenceRationale: "trajectory is within normal confidence bounds",
      requiredMonthlyImprovement: 31000,
      gapToClose: 280000,
      trajectoryMiss: false,
      assumptions: [],
      currentValue: 220000,
      percentComplete: 44,
      onTrack: true,
      targetDatePassed: false,
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

  it("shows the humanized status badge with its accessible semantic variant, and never leaks the raw ACTIVE enum value (G5 + G6)", async () => {
    const { findByText, queryByText } = render(<GoalsPage />);
    const badge = await findByText("Active");
    // The raw GoalStatus enum value must never leak into the rendered badge.
    expect(queryByText("ACTIVE")).toBeNull();
    // STATUS_VARIANT.ACTIVE migrated from "default" to "default-accessible" (G6). "default"
    // and "default-accessible" share the same bg-primary/10 fill (only the text-color token
    // differs -- see badge.tsx), so a bg-primary-only assertion would pass even if the
    // migration were fully reverted. Pin the accessible variant specifically by asserting the
    // "default-accessible"-only text token, not just the shared category fill.
    expect(badge.className).toMatch(/bg-primary/);
    expect(badge.className).toMatch(/text-\[var\(--primary-text\)\]/);
    expect(badge.className).not.toMatch(/bg-destructive|bg-warning/);
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

  it("associates the create-goal modal's fields with their visible labels (G1)", async () => {
    const { findByText, getByLabelText } = render(<GoalsPage />);
    const btn = await findByText("Update Goal");
    fireEvent.click(btn);
    await findByText("Update Financial Goal");

    // getByLabelText resolves via the label's htmlFor -> input/select id association;
    // it throws if no element has that accessible name, so this fails if the wiring
    // (G1 fix) regresses even though the label text is still visually present.
    expect(getByLabelText(/Goal type/)).toBeTruthy();
    expect(getByLabelText(/Target amount/)).toBeTruthy();
    expect(getByLabelText("Currency")).toBeTruthy();
    expect(getByLabelText(/Target date/)).toBeTruthy();
    expect(getByLabelText("Baseline amount (optional)")).toBeTruthy();
  });

  it("renders unavailable data as 'Not enough data' — never NaN — when the trajectory has no recorded values", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/goals/trajectory")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({
            result: {
              goal: { ...ACTIVE_GOAL.goal, targetCurrency: "INR", isOverdue: true },
              trajectory: {
                projectedMonthsToGoal: null, currentTrajectoryDate: null, confidence: "LOW",
                confidenceRationale: "only 0 period(s) with data — minimum 3 required for any confidence; target date has already passed",
                requiredMonthlyImprovement: null, gapToClose: null, trajectoryMiss: false,
                assumptions: ["Insufficient data for projection"], currentValue: null,
                percentComplete: null, onTrack: null, targetDatePassed: true,
              },
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ goal: { ...ACTIVE_GOAL.goal, targetCurrency: "INR", isOverdue: true } }),
      } as Response);
    });
    const { findByTestId, getByText, getAllByText } = render(<GoalsPage />);
    const traj = await findByTestId("goal-trajectory");
    expect(traj.textContent).not.toMatch(/NaN|Infinity|undefined|null/);
    expect(getAllByText("Not enough data").length).toBeGreaterThanOrEqual(2);
    expect(getByText("Unknown")).toBeTruthy();
    expect(getByText("Overdue")).toBeTruthy();
  });

  it("defaults the new-goal currency to the active business currency, never USD", async () => {
    const { findByText, getByLabelText } = render(<GoalsPage />);
    fireEvent.click(await findByText("Update Goal"));
    await findByText("Update Financial Goal");
    expect((getByLabelText("Currency") as HTMLInputElement).value).toBe("INR");
  });

  it("shows the server's field error next to the target date field", async () => {
    fetchMock.mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/owner/goals") && (init?.method ?? "GET").toUpperCase() === "POST") {
        return Promise.resolve({
          ok: false, status: 400,
          json: () => Promise.resolve({
            error: "Validation failed",
            fieldErrors: [{ path: "targetAmount", message: "Too small: expected number to be >0" }],
          }),
        } as Response);
      }
      if (url.includes("/api/owner/goals/trajectory")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TRAJECTORY_RESULT) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ACTIVE_GOAL) } as Response);
    });
    const { findByText, getByLabelText } = render(<GoalsPage />);
    fireEvent.click(await findByText("Update Goal"));
    await findByText("Update Financial Goal");
    fireEvent.change(document.querySelector("select") as HTMLSelectElement, { target: { value: "REVENUE" } });
    fireEvent.change(getByLabelText(/Target amount/), { target: { value: "750000" } });
    fireEvent.change(getByLabelText(/Target date/), { target: { value: "2099-01-01" } });
    fireEvent.click(await findByText("Set new goal"));
    await findByText("Too small: expected number to be >0");
    expect(getByLabelText(/Target amount/).getAttribute("aria-invalid")).toBe("true");
  });

  it("rejects a past target date on the client before submitting", async () => {
    const { findByText, getByLabelText } = render(<GoalsPage />);
    fireEvent.click(await findByText("Update Goal"));
    await findByText("Update Financial Goal");
    fireEvent.change(document.querySelector("select") as HTMLSelectElement, { target: { value: "PROFIT" } });
    fireEvent.change(getByLabelText(/Target amount/), { target: { value: "750000" } });
    fireEvent.change(getByLabelText(/Target date/), { target: { value: "2020-01-01" } });
    fireEvent.click(await findByText("Set new goal"));
    await findByText("Target date must be in the future");
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/owner/goals"), expect.objectContaining({ method: "POST" }));
  });
});
