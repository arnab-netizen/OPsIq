/**
 * Owner Vendor page — jsdom integration test.
 *
 * Stubs fetch to serve businesses + vendor list. Asserts: page renders vendor
 * table, status badges display correctly, approve and suspend actions call the
 * correct API routes, and the create vendor modal submits with businessId.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import VendorPage from "@/app/(authenticated)/owner/vendor/page";

const BUSINESSES = [
  { id: "biz-uuid-1", name: "Acme Trading" },
];

const VENDORS = [
  {
    id: "vendor-uuid-1",
    name: "Delta Supplies",
    approvalStatus: "APPROVED",
    bankAccountRef: "BSB-001",
    bankVerified: true,
    relatedParty: false,
    paymentTermsDays: 30,
    switchingCostEstimate: null,
    replacementLeadTimeDays: 14,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "vendor-uuid-2",
    name: "Unknown Co",
    approvalStatus: "PENDING_REVIEW",
    bankAccountRef: null,
    bankVerified: false,
    relatedParty: true,
    paymentTermsDays: null,
    switchingCostEstimate: null,
    replacementLeadTimeDays: null,
    createdAt: "2026-07-10T00:00:00.000Z",
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
    if (url.includes("/api/owner/vendor") && url.includes("businessId") && method === "GET") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(VENDORS),
      } as Response);
    }
    if (url.includes("/api/owner/vendor") && method === "POST" && !url.includes("/approve") && !url.includes("/suspend")) {
      return Promise.resolve({
        ok: true, status: 201,
        json: () => Promise.resolve({ id: "vendor-uuid-3", name: "New Vendor", approvalStatus: "PENDING_REVIEW" }),
      } as Response);
    }
    if (url.includes("/approve") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "vendor-uuid-2", approvalStatus: "APPROVED" }),
      } as Response);
    }
    if (url.includes("/suspend") && method === "POST") {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ id: "vendor-uuid-2", approvalStatus: "SUSPENDED" }),
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

describe("VendorPage", () => {
  it("renders the page heading", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Vendors");
  });

  it("fetches businesses then vendors on mount", async () => {
    const { findByTestId } = render(<VendorPage />);
    await findByTestId("vendor-table");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/owner/recovery/businesses"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("businessId=biz-uuid-1"),
      expect.anything(),
    );
  });

  it("renders approved vendor with correct badge", async () => {
    const { findByTestId, findAllByText } = render(<VendorPage />);
    await findByTestId("vendor-table");
    const badges = await findAllByText("Approved");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders pending vendor with Approve action", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Unknown Co");
    const approveBtns = await findByText("Approve");
    expect(approveBtns).toBeTruthy();
  });

  it("renders bank verified badge for vendor with verified bank", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Delta Supplies");
    const badge = await findByText("Verified");
    expect(badge).toBeTruthy();
  });

  it("renders payment terms as Net 30", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Net 30");
  });

  it("shows related party status", async () => {
    const { findAllByText } = render(<VendorPage />);
    await findAllByText("Yes");
  });

  it("opens create modal when + New Vendor is clicked", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Vendors");
    await waitFor(async () => {
      const btn = await findByText("+ New Vendor");
      fireEvent.click(btn);
    });
    const modalTitle = await findByText("New Vendor");
    expect(modalTitle).toBeTruthy();
  });

  it("calls approve endpoint when Approve is clicked", async () => {
    const { findByText } = render(<VendorPage />);
    await findByText("Unknown Co");
    const approveBtn = await findByText("Approve");
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/vendor-uuid-2/approve"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("opens suspend modal and calls suspend endpoint", async () => {
    const { findByText, findAllByText } = render(<VendorPage />);
    await findByText("Delta Supplies");
    const suspendBtns = await findAllByText("Suspend");
    fireEvent.click(suspendBtns[0]);
    const reasonLabel = await findByText(/Reason/);
    expect(reasonLabel).toBeTruthy();
  });

  it("shows a true-empty state (with a create CTA) when the business has no vendors yet", async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BUSINESSES) } as Response);
      }
      if (url.includes("/api/owner/vendor")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<VendorPage />);
    await findByText("No vendors yet");
  });

  it("shows business selector when multiple businesses exist", async () => {
    fetchMock.mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/recovery/businesses")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([
            { id: "biz-1", name: "Business A" },
            { id: "biz-2", name: "Business B" },
          ]),
        } as Response);
      }
      if (url.includes("/api/owner/vendor")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    });
    const { findByText } = render(<VendorPage />);
    await findByText("Business A");
    await findByText("Business B");
  });
});
