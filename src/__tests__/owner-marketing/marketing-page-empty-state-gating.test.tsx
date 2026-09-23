/**
 * Owner Marketing page — initial-load empty-state gating (Group B of the false-empty-state defect
 * class; Group A — Finance/Operations/Sales — was fixed in PR #527, referencing the Execution fix
 * in PR #526).
 *
 * ROOT_CAUSE: on `/owner/marketing`, `businesses` comes from the independently loaded
 * `ActiveBusinessContext` (see useActiveBusiness()), NOT from `dashboard` — unlike Group A, so the
 * OUTER `businesses.length === 0` empty-business guidance is already correct and untouched by this
 * fix. The bug is in the INNER, dashboard-dependent branch: `!dashboard?.hasData` alone gated
 * "No marketing snapshot yet." / "Snapshot recorded…" guidance. `dashboard` starts `null` and is
 * set only inside `load()`'s success branch — never reset to `null` on failure (see `load()`'s
 * catch block) — so a failed INITIAL load (no successful response has ever landed) left
 * `dashboard === null`, and `!dashboard?.hasData` evaluated to `true` purely from absent data,
 * rendering "No marketing snapshot yet." next to the error banner instead of showing only the
 * error. Fix: gate the inner ternary on `dashboard === null` first, using existing state (no new
 * loading-history variable).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerMarketingPage from "@/app/(authenticated)/owner/marketing/page";

const SESSION_KEY = "opsiq.activeBusinessId";
const BIZ_A = { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true };
const BIZ_B = { id: "biz-b", name: "Beta Landscaping", currency: "USD", isActive: true };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function businessIdOf(url: string): string | null {
  return new URL(url, "http://test.local").searchParams.get("businessId");
}

function getErrorBanner(container: HTMLElement): HTMLElement | null {
  return container.querySelector(".text-destructive");
}

let businesses: Array<{ id: string; name: string; currency: string; isActive: boolean }> = [BIZ_A];
let dashboardCallCount = 0;
let dashboardFailOnCall: number | null = null;
let dashboardFailure: { status: number; body: unknown } | null = null;
let dashboardFixture: Record<string, unknown> | null = null;

function defaultDashboard(businessId: string | null) {
  return {
    businesses,
    selectedBusinessId: businessId,
    hasData: false,
    latestSnapshot: null,
  };
}

function populatedFixture(label: string) {
  return {
    businesses,
    selectedBusinessId: BIZ_A.id,
    hasData: true,
    latestSnapshot: { id: `snap-${label}` },
    missingCriticalData: [],
    domainScore: null,
    recommendedNextAction: {
      title: `MARKETING_${label}_ACTION`,
      description: "x",
      priorityScore: 1,
      expectedImpactScore: 1,
      effortScore: 1,
      verificationMetric: "revenue",
    },
    latestCycle: {
      id: `cycle-${label}`,
      sequenceNumber: 1,
      marketingState: "GROWING",
      healthScore: 80,
      riskScore: 10,
      opportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions: [],
    },
    cycleHistory: [],
  };
}

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/owner/businesses") {
        return jsonResponse({ businesses });
      }
      if (url.startsWith("/api/owner/marketing/dashboard")) {
        dashboardCallCount += 1;
        const shouldFail =
          dashboardFailure && (dashboardFailOnCall === null || dashboardCallCount === dashboardFailOnCall);
        if (shouldFail) {
          return jsonResponse(dashboardFailure!.body, false, dashboardFailure!.status);
        }
        return jsonResponse(dashboardFixture ?? defaultDashboard(businessIdOf(url)));
      }
      if (url.match(/\/api\/owner\/marketing\/businesses\/[^/]+\/diagnoses$/)) {
        return jsonResponse({});
      }
      return jsonResponse({});
    })
  );
}

function seedActiveBusiness(id: string) {
  window.sessionStorage.setItem(SESSION_KEY, id);
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerMarketingPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  businesses = [BIZ_A];
  dashboardCallCount = 0;
  dashboardFailOnCall = null;
  dashboardFailure = null;
  dashboardFixture = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Owner Marketing page — initial-load empty-state gating", () => {
  it("1. pending initial request: loading UI only, no premature no-snapshot claim", async () => {
    seedActiveBusiness(BIZ_A.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/owner/businesses") return jsonResponse({ businesses: [BIZ_A] });
        if (url.startsWith("/api/owner/marketing/dashboard")) return new Promise<Response>(() => {});
        return jsonResponse({});
      })
    );

    renderPage();

    expect(await screen.findByRole("status", { name: "Loading your marketing information" })).toBeInTheDocument();
    expect(screen.queryByText(/No marketing snapshot yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No businesses yet/)).not.toBeInTheDocument();
  });

  it("2. failed initial request with no prior payload: existing error, no false no-snapshot guidance or unsupported dashboard-dependent content", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { status: 500, body: { error: "boom" } };
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => expect(getErrorBanner(container)).not.toBeNull());
    expect(screen.queryByText(/No marketing snapshot yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Snapshot recorded/)).not.toBeInTheDocument();

    expect(screen.getByTestId("business-context-single")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add marketing snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run marketing diagnosis" })).toBeDisabled();
  });

  it("3. successful zero-business context: existing outer no-business guidance remains correct", async () => {
    businesses = [];
    installFetchMock();
    render(
      <ActiveBusinessProvider>
        <OwnerMarketingPage />
      </ActiveBusinessProvider>
    );

    await screen.findByText(/No businesses yet/);
  });

  it("4. successful dashboard with genuinely empty data: existing no-snapshot guidance and controls", async () => {
    seedActiveBusiness(BIZ_A.id);
    installFetchMock();
    const { container } = renderPage();

    await screen.findByText(/No marketing snapshot yet/);
    expect(getErrorBanner(container)).toBeNull();
    expect(screen.getByRole("button", { name: "+ Add marketing snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run marketing diagnosis" })).toBeDisabled();
  });

  it("5. a successful populated load followed by a failed reload preserves the prior content and shows the error", async () => {
    seedActiveBusiness(BIZ_A.id);
    dashboardFixture = populatedFixture("A");
    dashboardFailure = { status: 500, body: { error: "boom" } };
    dashboardFailOnCall = 2;
    installFetchMock();
    const { container } = renderPage();

    await screen.findByText("MARKETING_A_ACTION");
    expect(getErrorBanner(container)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run marketing diagnosis" }));

    await waitFor(() => expect(getErrorBanner(container)).not.toBeNull());
    expect(screen.getByText("MARKETING_A_ACTION")).toBeInTheDocument();
    expect(screen.queryByText(/No marketing snapshot yet/)).not.toBeInTheDocument();
  });

  it("6. a subsequent successful load clears the error and renders fresh data", async () => {
    businesses = [BIZ_A, BIZ_B];
    seedActiveBusiness(BIZ_A.id);
    dashboardFailure = { status: 500, body: { error: "boom" } };
    dashboardFailOnCall = 1;
    installFetchMock();
    const { container } = renderPage();

    await waitFor(() => expect(getErrorBanner(container)).not.toBeNull());
    expect(screen.queryByText(/No marketing snapshot yet/)).not.toBeInTheDocument();

    const select = screen.getByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: BIZ_B.id } });

    await screen.findByText(/No marketing snapshot yet/);
    expect(getErrorBanner(container)).toBeNull();
  });
});
