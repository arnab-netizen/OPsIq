/**
 * Owner Recovery page — error banner accessibility semantics.
 *
 * See the header comment in ../owner-error-banner-a11y-fixtures.ts for the shared ROOT_CAUSE
 * account. This file proves, for Recovery specifically: (1) a failed load exposes its error
 * banner via `role="alert"`; (2) the normal (non-error) empty state this page renders on a
 * successful-but-dataless load is never itself marked as an alert; (3) a subsequent successful
 * load removes the alert region and its content entirely, not just visually.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";
import OwnerRecoveryPage from "@/app/(authenticated)/owner/recovery/page";
import { BIZ_A, BIZ_B, jsonResponse, seedActiveBusiness } from "../owner-error-banner-a11y-fixtures";

let dashboardFailOnCall: number | null = null;
let dashboardCallCount = 0;

function dashboardOk(businessId: string) {
  return { businesses: [BIZ_A, BIZ_B], selectedBusinessId: businessId, hasData: false, latestSnapshot: null };
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: [BIZ_A, BIZ_B] });
      if (url.startsWith("/api/owner/recovery/dashboard")) {
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
      <OwnerRecoveryPage />
    </ActiveBusinessProvider>
  );
}

function renderPageWithSwitch() {
  return render(
    <ActiveBusinessProvider>
      <SwitchHarness />
      <OwnerRecoveryPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  dashboardFailOnCall = null;
  dashboardCallCount = 0;
  seedActiveBusiness(BIZ_A.id);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Owner Recovery page — error banner accessibility semantics", () => {
  it("a failed load exposes the error banner via role=\"alert\"", async () => {
    dashboardFailOnCall = 1;
    installFetchMock();
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/./);
    expect(alert).toHaveAttribute("data-testid", "recovery-page-error");
  });

  it("the normal empty state (successful, dataless load) is not marked as an alert", async () => {
    installFetchMock();
    renderPage();

    await screen.findByText(/No metric snapshot yet/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a subsequent successful load clears the alert region and its content entirely", async () => {
    dashboardFailOnCall = 1;
    installFetchMock();
    renderPageWithSwitch();

    await screen.findByRole("alert");

    fireEvent.click(screen.getByTestId("switch-business"));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByTestId("recovery-page-error")).not.toBeInTheDocument();
  });
});
