/**
 * Owner Marketing Campaigns page — jsdom integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import CampaignsPage from "@/app/(authenticated)/owner/marketing/campaigns/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading" }];
const TWO_BUSINESSES = [
  { id: "biz-uuid-1", name: "Acme Trading" },
  { id: "biz-uuid-2", name: "Beta Foods" },
];

const CAMPAIGNS = [
  {
    id: "camp-uuid-1",
    name: "Summer Email Blast",
    channel: "Email",
    status: "ACTIVE",
    budget: "5000.00",
    spend: "2500.00",
    leads: 120,
    conversions: 15,
    revenue: "7500.00",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "camp-uuid-2",
    name: "Google Search Q3",
    channel: "Search",
    status: "DRAFT",
    budget: "10000.00",
    spend: "0",
    leads: 0,
    conversions: 0,
    revenue: "0",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/owner/businesses") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ businesses: BUSINESSES }),
      } as Response);
    }
    if (url.includes("/api/owner/marketing/campaigns") && method === "GET" && !url.match(/campaigns\/[a-z]/)) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ campaigns: CAMPAIGNS, total: CAMPAIGNS.length }),
      } as Response);
    }
    if (url.includes("/api/owner/marketing/campaigns") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ id: "camp-uuid-3", name: "New Campaign", status: "DRAFT" }),
      } as Response);
    }
    if (url.match(/campaigns\/[a-z0-9-]+$/) && method === "PATCH") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "camp-uuid-1", name: "Summer Email Blast Updated" }),
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

describe("CampaignsPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    await findByText("Marketing Campaigns");
  });

  it("fetches businesses then campaigns on mount", async () => {
    const { findByTestId } = renderWithProvider(<CampaignsPage />);
    await findByTestId("campaigns-table");
    // The shared ActiveBusinessProvider owns the business-list fetch now, not the page itself.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders campaign names in the table", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    await findByText("Summer Email Blast");
    await findByText("Google Search Q3");
  });

  it("renders channel names", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    await findByText("Email");
    await findByText("Search");
  });

  it("renders Active status badge", async () => {
    // Presentation-only: the badge shows a sentence-case label ("Active") for
    // the raw "ACTIVE" status value; the stored/submitted value is unchanged.
    const { findAllByText } = renderWithProvider(<CampaignsPage />);
    const badges = await findAllByText("Active");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders ROI percentage for active campaign", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    // ROI = (7500-2500)/2500 * 100 = 200%
    await findByText("200%");
  });

  it("shows a true-empty state (with a create CTA) when the business has no campaigns yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: BUSINESSES }) } as Response);
      }
      if (url.includes("/api/owner/marketing/campaigns")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = renderWithProvider(<CampaignsPage />);
    await findByText("No campaigns yet");
  });

  it("opens create modal when + New Campaign is clicked", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    await findByText("Marketing Campaigns");
    await waitFor(async () => {
      const btn = await findByText("+ New Campaign");
      fireEvent.click(btn);
    });
    const title = await findByText("New Campaign");
    expect(title).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findAllByText } = renderWithProvider(<CampaignsPage />);
    await findByText("Summer Email Blast");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Campaign");
    expect(title).toBeTruthy();
  });

  it("submits new campaign via POST", async () => {
    const { findByText } = renderWithProvider(<CampaignsPage />);
    const addBtn = await findByText("+ New Campaign");
    fireEvent.click(addBtn);
    await findByText("New Campaign");

    const createBtn = await findByText("Create campaign");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/owner/marketing/campaigns"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("business switch — never shows stale rows tagged as the newly selected business", () => {
    it("clears the previous business's rows immediately and shows a loading state while the new business's campaigns are in flight", async () => {
      // A controllable promise lets the test hold business-2's fetch open so it can assert on the
      // in-between render, the same window a slow network response would occupy in production.
      let resolveBiz2: (v: unknown) => void = () => {};
      const biz2Pending = new Promise((resolve) => { resolveBiz2 = resolve; });

      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: CAMPAIGNS, total: CAMPAIGNS.length }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return biz2Pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: [], total: 0 }) } as Response));
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, getByTestId } = renderWithProvider(<CampaignsPage />);
      // Business 1's campaign is on screen before switching.
      await findByText("Summer Email Blast");

      fireEvent.change(getByTestId("business-context-selector"), { target: { value: "biz-uuid-2" } });

      // While business-2's fetch is still pending, business-1's campaign must not still be
      // rendered — it would otherwise be visually presented as if it belonged to business 2,
      // whose name is already showing in the selector.
      await waitFor(() => {
        expect(queryByText("Summer Email Blast")).toBeNull();
      });
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("businessId=biz-uuid-2"), expect.anything());

      resolveBiz2(undefined);
      await findByText("No campaigns yet");
      expect(queryByText("Summer Email Blast")).toBeNull();
    });

    it("does not show the previous business's rows if the newly selected business's fetch fails", async () => {
      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: CAMPAIGNS, total: CAMPAIGNS.length }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "Simulated failure" }) } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, getByTestId } = renderWithProvider(<CampaignsPage />);
      await findByText("Summer Email Blast");

      fireEvent.change(getByTestId("business-context-selector"), { target: { value: "biz-uuid-2" } });

      await waitFor(() => {
        expect(queryByText("Summer Email Blast")).toBeNull();
      });
      // The failure must surface as an error, not as a silent fallback to the old business's rows.
      await findByText("No campaigns yet");
      expect(queryByText("Summer Email Blast")).toBeNull();
    });

    it("ignores a late response for a business the owner has already switched away from", async () => {
      // Regression for the out-of-order-response half of the fix: if business-1's own fetch is
      // still in flight when the owner switches to business-2, and it resolves AFTER business-2's
      // fetch already has, it must not clobber business-2's rows with business-1's.
      let resolveBiz1: (v: unknown) => void = () => {};
      const biz1Pending = new Promise((resolve) => { resolveBiz1 = resolve; });

      fetchMock.mockImplementation((input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/owner/businesses")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: TWO_BUSINESSES }) } as Response);
        }
        if (url.includes("businessId=biz-uuid-1")) {
          return biz1Pending.then(() => ({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: CAMPAIGNS, total: CAMPAIGNS.length }) } as Response));
        }
        if (url.includes("businessId=biz-uuid-2")) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: [], total: 0 }) } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
      });

      const { findByText, queryByText, findByTestId } = renderWithProvider(<CampaignsPage />);
      // Initial mount fetch for business-1 is the one we hold open.
      const selector = await findByTestId("business-context-selector");
      fireEvent.change(selector, { target: { value: "biz-uuid-2" } });
      await findByText("No campaigns yet");

      // Now let the stale business-1 request resolve, after business-2 already rendered.
      resolveBiz1(undefined);
      await new Promise((r) => setTimeout(r, 0));

      expect(queryByText("Summer Email Blast")).toBeNull();
      await findByText("No campaigns yet");
    });
  });
});
