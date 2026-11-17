/**
 * /admin/overview — journey-window selector (jsdom).
 *
 * Before this change the page always requested the hardcoded 7-day window with no way for an operator to
 * ask for a longer one. Verifies the page defaults to 7, re-fetches with the chosen preset's windowDays
 * query param when a different button is pressed, and never sends anything other than the three governed
 * presets (7/30/90) -- matching the server-side allowlist in src/app/api/admin/overview/route.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOverviewPage from "@/app/(authenticated)/admin/overview/page";

const OVERVIEW_DATA = {
  capacity: { admitted: 1, verified: 1, pending: 0, ledger: 0, limit: 100, admissionMode: "OPEN_BETA", source: "db" },
  journey: { windowDays: 7, truncated: false, steps: [], failures: [] },
  requests: { requested: 0, invited: 0, revoked: 0, rejected: 0 },
  customers: { registered: 0, awaitingVerification: 0, active: 0, verifiedNoPassword: 0 },
  readiness: { status: "READY", checks: {} },
  quickbooks: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    const windowDays = new URL(url, "http://localhost").searchParams.get("windowDays");
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...OVERVIEW_DATA, journey: { ...OVERVIEW_DATA.journey, windowDays: Number(windowDays) } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/admin/overview journey window selector", () => {
  it("requests the 7-day window by default", async () => {
    render(<AdminOverviewPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/overview?windowDays=7");
    await waitFor(() => expect(screen.getByText(/last 7 days/)).toBeInTheDocument());
  });

  it("re-fetches with the chosen preset when a window button is pressed", async () => {
    render(<AdminOverviewPage />);
    await waitFor(() => expect(screen.getByText(/last 7 days/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "90d" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/overview?windowDays=90"));
    await waitFor(() => expect(screen.getByText(/last 90 days/)).toBeInTheDocument());
  });

  it("only ever sends one of the three governed presets, never an arbitrary value", async () => {
    render(<AdminOverviewPage />);
    await waitFor(() => expect(screen.getByText(/last 7 days/)).toBeInTheDocument());

    for (const label of ["7d", "30d", "90d"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => {
        const lastUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
        const sent = new URL(lastUrl, "http://localhost").searchParams.get("windowDays");
        expect(["7", "30", "90"]).toContain(sent);
      });
    }
  });
});
