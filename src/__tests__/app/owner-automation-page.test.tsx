/**
 * Owner Automation page — jsdom integration test.
 *
 * Verifies: mount fetches scheduler status exactly once, the Refresh button re-fetches from the
 * same endpoint, the loading skeleton shows during a fetch and clears once it settles, and a
 * failed fetch surfaces an error that the Refresh button can retry from.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import OwnerAutomationPage from "@/app/(authenticated)/owner/automation/page";

const STATUS_PAYLOAD = {
  workspaceId: "ws-1",
  pending: 2,
  running: 1,
  deadLetter: 0,
  partialFailure: 0,
  lastSuccess: { taskName: "email-retry", completedAt: "2026-09-01T00:00:00.000Z" },
  recentDeadLetters: [],
  recentPartialFailures: [],
  nextScheduled: null,
  cronCadence: "*/15 * * * *",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/owner/scheduler-status")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(STATUS_PAYLOAD) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerAutomationPage", () => {
  it("fetches scheduler status exactly once on mount (MOUNT_REQUEST_COUNT=1) from the unchanged endpoint (ENDPOINT_UNCHANGED=YES)", async () => {
    const { findByText } = render(<OwnerAutomationPage />);
    await findByText("Automation Health");
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/owner/scheduler-status"));
    expect(calls.length).toBe(1);
  });

  it("shows the loading skeleton while the initial fetch is pending, then clears it (LOADING_SKELETON_BEHAVIOR_PRESERVED=YES)", async () => {
    let resolveStatus: (() => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveStatus = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(STATUS_PAYLOAD) } as Response);
        })
    );
    const { getByRole, queryByRole, findByText } = render(<OwnerAutomationPage />);
    expect(getByRole("status", { name: /loading automation status/i })).toBeTruthy();

    expect(resolveStatus).not.toBeNull();
    resolveStatus!();

    await findByText("Automation Health");
    expect(queryByRole("status", { name: /loading automation status/i })).toBeNull();
  });

  it("the Refresh button re-fetches from the same endpoint, adding exactly one more request (REFRESH_ADDS_EXACTLY_ONE_REQUEST=YES)", async () => {
    const { findByText } = render(<OwnerAutomationPage />);
    await findByText("Automation Health");
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/owner/scheduler-status")).length).toBe(1);

    fireEvent.click(await findByText("Refresh"));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/owner/scheduler-status")).length).toBe(2)
    );
  });

  it("shows an error on a failed fetch, and Refresh retries against the same endpoint (ERROR_RETRY_BEHAVIOR_PRESERVED=YES)", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) } as Response)
    );
    const { findByText } = render(<OwnerAutomationPage />);
    await findByText("boom");

    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/scheduler-status")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(STATUS_PAYLOAD) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) } as Response);
    });
    fireEvent.click(await findByText("Refresh"));
    await findByText("Automation Health");
  });
});
