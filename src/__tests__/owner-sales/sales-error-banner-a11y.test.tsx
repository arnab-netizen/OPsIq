/**
 * Owner Sales page — error banner accessibility semantics.
 *
 * See the header comment in ../owner-error-banner-a11y-fixtures.ts for the shared ROOT_CAUSE
 * account. This file proves, for Sales specifically: (1) a failed load exposes its error banner
 * via `role="alert"` (an implicit assertive, atomic live region), so a screen-reader user is
 * told about it without having to discover it visually; (2) the normal (non-error) empty state
 * this page renders on a successful-but-dataless load is never itself marked as an alert; (3) a
 * subsequent successful load removes the alert region and its content entirely, not just visually.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";
import { BIZ_A, BIZ_B, jsonResponse } from "../owner-error-banner-a11y-fixtures";

let dashboardFailOnCall: number | null = null;
let dashboardCallCount = 0;

function dashboardOk(businessId: string) {
  return { businesses: [BIZ_A, BIZ_B], selectedBusinessId: businessId, hasData: false, latestSnapshot: null, missingCriticalData: [] };
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) return jsonResponse({ businesses: [BIZ_A, BIZ_B] });
      if (url.includes("/api/owner/sales/dashboard")) {
        dashboardCallCount += 1;
        if (dashboardFailOnCall !== null && dashboardCallCount === dashboardFailOnCall) {
          return jsonResponse({ error: "database connection pool exhausted" }, false, 500);
        }
        const businessId = new URL(url, "http://test.local").searchParams.get("businessId") ?? BIZ_A.id;
        return jsonResponse(dashboardOk(businessId));
      }
      return jsonResponse({});
    })
  );
}

function SwitchHarness() {
  const { setActiveBusinessId } = useActiveBusiness();
  return <button data-testid="switch-business" onClick={() => setActiveBusinessId(BIZ_B.id)}>switch</button>;
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

function renderPageWithSwitch() {
  return render(
    <ActiveBusinessProvider>
      <SwitchHarness />
      <OwnerSalesPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  dashboardFailOnCall = null;
  dashboardCallCount = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Sales page — error banner accessibility semantics", () => {
  it("a failed load exposes the error banner via role=\"alert\"", async () => {
    dashboardFailOnCall = 1;
    installFetchMock();
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/./);
    expect(alert).toHaveAttribute("data-testid", "sales-page-error");
  });

  it("the normal empty state (successful, dataless load) is not marked as an alert", async () => {
    installFetchMock();
    renderPage();

    await screen.findByText(/Not enough sales information yet/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a subsequent successful load clears the alert region and its content entirely", async () => {
    dashboardFailOnCall = 1;
    installFetchMock();
    renderPageWithSwitch();

    await screen.findByRole("alert");

    fireEvent.click(screen.getByTestId("switch-business"));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByTestId("sales-page-error")).not.toBeInTheDocument();
  });
});
