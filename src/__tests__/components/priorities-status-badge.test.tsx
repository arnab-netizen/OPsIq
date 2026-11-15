/**
 * /owner/priorities — status-badge regression.
 *
 * Root cause: the badge for the current governed action (processExecution.topRoute) was
 * derived purely from severity (TIER_LABEL[tier]), independent of the item's actual execution
 * status. After Start Work, the action text correctly switched to "In progress — continue on
 * Home", but the badge kept reading "Needs attention" -- a visible contradiction on the same row.
 *
 * The fix (owner/priorities/page.tsx's bridgeStatusLabel/bridgeStatusVariant) derives the badge
 * from the SAME topRoute.status/canStart values the action text already reads -- no second state
 * source. This test proves the two can never contradict, across the pre-start and in-progress
 * states.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, within } from "@testing-library/react";
import OwnerPrioritiesPage from "@/app/(authenticated)/owner/priorities/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TASK_KEY = "cp:biz-1:MISSING_UNIT_ECONOMICS";

function mockNowView(topRoute: { status: string; canStart: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/owner/now-view")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            processExecution: {
              topRoute: {
                taskKey: TASK_KEY,
                title: "Add the missing operational data to routine capture",
                ownerVisibleSummary: "Capture unit cost per job.",
                severity: "MEDIUM",
                executionRoute: "CREATE_MISSING_DATA_TASK",
                status: topRoute.status,
                canStart: topRoute.canStart,
              },
            },
          }),
        });
      }
      // risks / alerts / decisions — empty, so only the topRoute item is on the page.
      return Promise.resolve({ ok: true, json: async () => ({ risks: [], alerts: [], decisions: [] }) });
    })
  );
}

describe("Priorities — status badge reflects the same execution status as the action text", () => {
  it("pre-start (canStart=true): badge is 'Needs attention', action text offers to start it", async () => {
    mockNowView({ status: "PROPOSED", canStart: true });
    render(<ActiveBusinessProvider><OwnerPrioritiesPage /></ActiveBusinessProvider>);

    await waitFor(() => {
      // The governed route is shown by its owner-visible summary, in the unranked "Governed work" section.
      expect(within(screen.getByTestId("priorities-governed-work")).getByText("Capture unit cost per job.")).toBeTruthy();
    });

    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/Go to Home to start this/)).toBeTruthy();
    // No contradiction: never both "in progress" text and a not-yet-started action in the same row.
    expect(screen.queryByText("In progress")).toBeNull();
    expect(screen.queryByText(/continue on Home/)).toBeNull();
  });

  it("in-progress (canStart=false, status=IN_PROGRESS): badge is 'In progress', action text offers to continue — never 'Needs attention' or 'start this'", async () => {
    mockNowView({ status: "IN_PROGRESS", canStart: false });
    render(<ActiveBusinessProvider><OwnerPrioritiesPage /></ActiveBusinessProvider>);

    await waitFor(() => {
      // The governed route is shown by its owner-visible summary, in the unranked "Governed work" section.
      expect(within(screen.getByTestId("priorities-governed-work")).getByText("Capture unit cost per job.")).toBeTruthy();
    });

    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText(/continue on Home/)).toBeTruthy();
    // No contradiction: the badge must never claim this still needs to be started once it has been.
    expect(screen.queryByText("Needs attention")).toBeNull();
    expect(screen.queryByText(/Go to Home to start this/)).toBeNull();
  });
});
