/**
 * Sales / Evidence & Trust / Execution & SOP — business-context synchronization regression proof
 * (controlled-beta business-context-integrity closure).
 *
 * ROOT_CAUSE: unlike Money/Operations/Customers (already wired to the shared
 * ActiveBusinessContext), these three pages maintained fully local, disconnected business-context
 * state: on mount they called their loader with NO businessId at all (server picks its own
 * default), and their BusinessContextSelector's onChange only updated local state, never the
 * shared context. Live production evidence: with Trinity Services globally selected, all three
 * pages independently resolved a DIFFERENT business (the first one the server's own fallback
 * picked) — header and content disagreed.
 *
 * These jsdom integration tests drive the real page components (not a source-string proof)
 * because the fix is genuinely behavioral: reading the shared context on mount, waiting for it to
 * resolve before fetching, and writing back to it on every load/switch. Mirrors the exact pattern
 * already covered for Money's snapshot-draft tests (finance-snapshot-draft-and-error.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen, within } from "@testing-library/react";
import OwnerSalesPage from "@/app/(authenticated)/owner/sales/page";
import OwnerTrustPage from "@/app/(authenticated)/owner/trust/page";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Trinity Services", currency: "USD" };
const BIZ_B = { id: "biz-b", name: "Recovery Fixture Co", currency: "USD" };

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

let dashboardRequests: string[] = [];

function installFetchMock(dashboardPathFragment: string, extraShape: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A, BIZ_B] }) } as Response;
      }
      if (url.includes(dashboardPathFragment)) {
        dashboardRequests.push(url);
        const businessId = url.includes("businessId=") ? url.split("businessId=")[1] : BIZ_A.id;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            businesses: [BIZ_A, BIZ_B],
            selectedBusinessId: businessId,
            hasData: false,
            latestSnapshot: null,
            missingCriticalData: [],
            cycles: [],
            ...extraShape,
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  dashboardRequests = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sales/Trust/Execution honor the globally-selected business on mount (the actual leak)", () => {
  it("Sales: with Business B globally selected (stored preference), the dashboard is fetched for B, never defaults to the first business", async () => {
    window.localStorage.setItem("opsiq.lastActiveBusinessId", BIZ_B.id);
    installFetchMock("/api/owner/sales/dashboard");
    renderWithProvider(<OwnerSalesPage />);

    await waitFor(() => expect(dashboardRequests.length).toBeGreaterThan(0));
    expect(dashboardRequests[0]).toContain(`businessId=${BIZ_B.id}`);
  });

  it("Trust: with Business B globally selected, /api/owner/trust/cycles is fetched for B, never defaults to the first business", async () => {
    window.localStorage.setItem("opsiq.lastActiveBusinessId", BIZ_B.id);
    installFetchMock("/api/owner/trust/cycles", { cycles: [] });
    renderWithProvider(<OwnerTrustPage />);

    await waitFor(() => expect(dashboardRequests.length).toBeGreaterThan(0));
    expect(dashboardRequests[0]).toContain(`businessId=${BIZ_B.id}`);
  });

  it("Execution & SOP: with Business B globally selected, /api/owner/sop/dashboard is fetched for B, never defaults to the first business", async () => {
    window.localStorage.setItem("opsiq.lastActiveBusinessId", BIZ_B.id);
    installFetchMock("/api/owner/sop/dashboard");
    renderWithProvider(<OwnerExecutionPage />);

    await waitFor(() => expect(dashboardRequests.length).toBeGreaterThan(0));
    expect(dashboardRequests[0]).toContain(`businessId=${BIZ_B.id}`);
  });
});

describe("Header/content invariant: switching the shared business context re-fetches this page and stays in sync", () => {
  it("Sales: switching the on-page selector A -> B triggers a fresh request for B, and B -> A refetches A (no stale bleed-through)", async () => {
    installFetchMock("/api/owner/sales/dashboard");
    renderWithProvider(<OwnerSalesPage />);
    await waitFor(() => expect(dashboardRequests.some((u) => u.includes(`businessId=${BIZ_A.id}`))).toBe(true));

    fireEvent.change(await screen.findByTestId("business-context-selector"), { target: { value: BIZ_B.id } });
    await waitFor(() => expect(dashboardRequests.some((u) => u.includes(`businessId=${BIZ_B.id}`))).toBe(true));
    // The switch went through the shared context (setActiveBusinessId), not just local state —
    // confirmed by the persisted preference a real header switch would also rely on.
    await waitFor(() => expect(window.localStorage.getItem("opsiq.lastActiveBusinessId")).toBe(BIZ_B.id));
    // Wait for the loading skeleton to clear and the selector to remount before the next switch —
    // re-query rather than reuse the earlier DOM reference, since the page re-renders across the load.
    await waitFor(() => expect(screen.getByTestId("business-context-selector")).toHaveValue(BIZ_B.id));

    dashboardRequests = [];
    fireEvent.change(screen.getByTestId("business-context-selector"), { target: { value: BIZ_A.id } });
    await waitFor(() => expect(dashboardRequests.some((u) => u.includes(`businessId=${BIZ_A.id}`))).toBe(true));
    await waitFor(() => expect(window.localStorage.getItem("opsiq.lastActiveBusinessId")).toBe(BIZ_A.id));
  });
});

describe("Execution & SOP: business-selector action row retains all controls after the G9 mobile-wrap fix", () => {
  it("keeps the business selector and both action buttons present, and the row wraps instead of overflowing", async () => {
    installFetchMock("/api/owner/sop/dashboard");
    renderWithProvider(<OwnerExecutionPage />);

    const selector = await screen.findByTestId("business-context-selector");
    const row = selector.closest("div.flex.items-end");
    expect(row).toBeTruthy();
    // G9 fix: the row must be allowed to wrap its children onto multiple lines at narrow
    // widths, instead of forcing them onto one unbroken row that overflows the viewport.
    expect(row!.className).toMatch(/flex-wrap/);

    // The fix must not have dropped any control: same selector plus both action buttons.
    expect(within(row as HTMLElement).getByText("+ Add execution snapshot")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Run execution diagnosis")).toBeTruthy();
  });
});
