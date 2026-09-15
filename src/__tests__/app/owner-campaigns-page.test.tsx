/**
 * Owner Marketing Campaigns page — jsdom integration test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import CampaignsPage from "@/app/(authenticated)/owner/marketing/campaigns/page";

const BUSINESSES = [{ id: "biz-uuid-1", name: "Acme Trading" }];

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
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/owner/recovery/businesses") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(BUSINESSES),
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
    const { findByText } = render(<CampaignsPage />);
    await findByText("Marketing Campaigns");
  });

  it("fetches businesses then campaigns on mount", async () => {
    const { findByTestId } = render(<CampaignsPage />);
    await findByTestId("campaigns-table");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/recovery/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders campaign names in the table", async () => {
    const { findByText } = render(<CampaignsPage />);
    await findByText("Summer Email Blast");
    await findByText("Google Search Q3");
  });

  it("renders channel names", async () => {
    const { findByText } = render(<CampaignsPage />);
    await findByText("Email");
    await findByText("Search");
  });

  it("renders Active status badge", async () => {
    // Presentation-only: the badge shows a sentence-case label ("Active") for
    // the raw "ACTIVE" status value; the stored/submitted value is unchanged.
    const { findAllByText } = render(<CampaignsPage />);
    const badges = await findAllByText("Active");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders ROI percentage for active campaign", async () => {
    const { findByText } = render(<CampaignsPage />);
    // ROI = (7500-2500)/2500 * 100 = 200%
    await findByText("200%");
  });

  it("shows a true-empty state (with a create CTA) when the business has no campaigns yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/marketing/campaigns")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ campaigns: [], total: 0 }) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<CampaignsPage />);
    await findByText("No campaigns yet");
  });

  it("opens create modal when + New Campaign is clicked", async () => {
    const { findByText } = render(<CampaignsPage />);
    await findByText("Marketing Campaigns");
    await waitFor(async () => {
      const btn = await findByText("+ New Campaign");
      fireEvent.click(btn);
    });
    const title = await findByText("New Campaign");
    expect(title).toBeTruthy();
  });

  it("opens edit modal when Edit is clicked", async () => {
    const { findByText, findAllByText } = render(<CampaignsPage />);
    await findByText("Summer Email Blast");
    const editBtns = await findAllByText("Edit");
    fireEvent.click(editBtns[0]);
    const title = await findByText("Edit Campaign");
    expect(title).toBeTruthy();
  });

  it("submits new campaign via POST", async () => {
    const { findByText } = render(<CampaignsPage />);
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
});
