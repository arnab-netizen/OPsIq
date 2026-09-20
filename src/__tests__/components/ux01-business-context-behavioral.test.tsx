/**
 * UX-01 — canonical ActiveBusinessContext behavioral proof.
 *
 * The source-contract tests in business-context-selector-migration.test.ts prove each of the 13
 * migrated pages is wired to useActiveBusiness() at the code level. This file proves the actual
 * runtime behavior that wiring is supposed to guarantee, rendering real page components under a
 * real <ActiveBusinessProvider> with small fetch mocks:
 *
 *  - the page's first business-scoped request is explicitly for the context's active business —
 *    never an unscoped request that quietly defaults to businesses[0] server-side;
 *  - switching the shared selector updates the ONE shared context, and the next request is
 *    explicitly for the newly active business;
 *  - an out-of-order response for a business the owner has since switched away from never
 *    clobbers the newer selection's rendered data (requestSeq guard).
 *
 * Required representative classes per UX-01 section 21: a domain dashboard page (Cashflow), a
 * filtered/list workflow page (Approvals), a CRUD/list page (Marketing Campaigns), and an
 * aggregate command-center page (Wealth).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerCashflowPage from "@/app/(authenticated)/owner/cashflow/page";
import OwnerApprovalsPage from "@/app/(authenticated)/owner/approvals/page";
import CampaignsPage from "@/app/(authenticated)/owner/marketing/campaigns/page";
import OwnerWealthPage from "@/app/(authenticated)/owner/wealth/page";

const SESSION_KEY = "opsiq.activeBusinessId";

const BUSINESS_A = { id: "biz-a", name: "Alpha Bakery", currency: "USD", isActive: true };
const BUSINESS_B = { id: "biz-b", name: "Beta Landscaping", currency: "USD", isActive: true };
const BUSINESSES = [BUSINESS_A, BUSINESS_B];

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function businessIdOf(url: string): string | null {
  return new URL(url, "http://test.local").searchParams.get("businessId");
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderUnder(children: React.ReactElement) {
  return render(<ActiveBusinessProvider>{children}</ActiveBusinessProvider>);
}

function seedActiveBusiness(id: string) {
  window.sessionStorage.setItem(SESSION_KEY, id);
}

describe("UX-01 behavioral — Cashflow (domain dashboard)", () => {
  const cashflowFixture = (bizId: string) => ({
    businesses: BUSINESSES, // UX-01: the page must ignore this and use the shared context's list
    selectedBusinessId: bizId,
    hasData: false,
    latestSnapshot: null,
  });

  it("the first cashflow request is explicit for the context's active business (B), never unscoped", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/cashflow/dashboard")) return jsonResponse(cashflowFixture(businessIdOf(url)!));
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerCashflowPage />);

    await waitFor(() => {
      const dashboardCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/cashflow/dashboard"));
      expect(dashboardCalls.length).toBeGreaterThan(0);
    });
    const dashboardCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/cashflow/dashboard"));
    expect(dashboardCalls.every((u) => u.includes("businessId="))).toBe(true);
    expect(businessIdOf(dashboardCalls[0])).toBe("biz-b");
  });

  it("switching the selector to A updates the shared context and the next request is explicit for A", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/cashflow/dashboard")) return jsonResponse(cashflowFixture(businessIdOf(url)!));
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerCashflowPage />);
    const select = await screen.findByRole("combobox", { name: "Business" });
    expect((select as HTMLSelectElement).value).toBe("biz-b");

    fireEvent.change(select, { target: { value: "biz-a" } });

    await waitFor(() => {
      const dashboardCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/cashflow/dashboard"));
      expect(dashboardCalls.some((u) => businessIdOf(u) === "biz-a")).toBe(true);
    });
  });
});

describe("UX-01 behavioral — Approvals (filtered/list workflow)", () => {
  it("the first approvals request is explicit for the context's active business (B), never unscoped", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/approval?")) return jsonResponse({ approvals: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerApprovalsPage />);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/approval?"));
      expect(calls.length).toBeGreaterThan(0);
    });
    const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/approval?"));
    expect(calls.every((u) => u.includes("businessId="))).toBe(true);
    expect(businessIdOf(calls[0])).toBe("biz-b");
  });

  it("switching the selector to A updates the shared context and the next request is explicit for A", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/approval?")) return jsonResponse({ approvals: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerApprovalsPage />);
    const select = await screen.findByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-a" } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/approval?"));
      expect(calls.some((u) => businessIdOf(u) === "biz-a")).toBe(true);
    });
  });

});

describe("UX-01 behavioral — Marketing Campaigns (CRUD/list)", () => {
  it("the first campaigns request is explicit for the context's active business (B), never unscoped", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/marketing/campaigns?")) return jsonResponse({ campaigns: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<CampaignsPage />);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/marketing/campaigns?"));
      expect(calls.length).toBeGreaterThan(0);
    });
    const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/marketing/campaigns?"));
    expect(calls.every((u) => u.includes("businessId="))).toBe(true);
    expect(businessIdOf(calls[0])).toBe("biz-b");
  });

  it("switching the selector to A updates the shared context and the next request is explicit for A", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/marketing/campaigns?")) return jsonResponse({ campaigns: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<CampaignsPage />);
    const select = await screen.findByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-a" } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/marketing/campaigns?"));
      expect(calls.some((u) => businessIdOf(u) === "biz-a")).toBe(true);
    });
  });

  // This page renders its BusinessContextSelector in the PageHeader's `actions`, outside the
  // `loading ? <LoadingState/> : ...` gate that guards the table below — so, unlike Approvals or
  // /owner/now (which gate their ENTIRE render, selector included, behind `loading`), the
  // selector here stays mounted and interactive while a request is in flight. That makes the
  // literal "switch business again before the first response lands" race actually reachable on
  // this page, and is why it carries the required out-of-order proof for UX-01 section 21.
  it("an out-of-order stale response for the business the owner switched away from never clobbers the newer selection", async () => {
    seedActiveBusiness("biz-a");
    const resolvers: Record<string, (body: unknown) => void> = {};
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/marketing/campaigns?")) {
        const bizId = businessIdOf(url)!;
        return new Promise<Response>((resolve) => {
          resolvers[bizId] = (body: unknown) => resolve(jsonResponse(body));
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<CampaignsPage />);

    // Request for A starts and is left pending (deliberately never resolved yet).
    await waitFor(() => expect(resolvers["biz-a"]).toBeDefined());

    const select = await screen.findByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-b" } });

    // B's request starts; resolve it first, with data that identifies it as B's.
    await waitFor(() => expect(resolvers["biz-b"]).toBeDefined());
    resolvers["biz-b"]({
      campaigns: [{ id: "camp-b", name: "FROM-B", channel: "Email", status: "ACTIVE", spend: 0, leads: 0, revenue: 0 }],
    });
    await screen.findByText("FROM-B");

    // Now resolve A's stale request late, with data that would be visibly wrong if it won.
    resolvers["biz-a"]({
      campaigns: [{ id: "camp-a", name: "FROM-A-STALE", channel: "Email", status: "ACTIVE", spend: 0, leads: 0, revenue: 0 }],
    });

    // Give the stale resolution a tick to (wrongly) apply if the guard were missing.
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("FROM-A-STALE")).toBeNull();
    expect(screen.getByText("FROM-B")).toBeInTheDocument();
  });
});

describe("UX-01 behavioral — Wealth (aggregate command center)", () => {
  it("the first wealth-command-center request is explicit for the context's active business (B), never unscoped", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/wealth-command-center")) return jsonResponse({ commandCenter: {} });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerWealthPage />);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/wealth-command-center"));
      expect(calls.length).toBeGreaterThan(0);
    });
    const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/wealth-command-center"));
    expect(calls.every((u) => u.includes("businessId="))).toBe(true);
    expect(businessIdOf(calls[0])).toBe("biz-b");
  });

  it("switching the selector to A updates the shared context and the next request is explicit for A", async () => {
    seedActiveBusiness("biz-b");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/owner/businesses") return jsonResponse({ businesses: BUSINESSES });
      if (url.startsWith("/api/owner/wealth-command-center")) return jsonResponse({ commandCenter: {} });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderUnder(<OwnerWealthPage />);
    const select = await screen.findByRole("combobox", { name: "Business" });
    fireEvent.change(select, { target: { value: "biz-a" } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/owner/wealth-command-center"));
      expect(calls.some((u) => businessIdOf(u) === "biz-a")).toBe(true);
    });
  });
});
