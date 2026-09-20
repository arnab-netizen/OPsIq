/**
 * Owner UI — Working-Capital ageing entry section (owner-visibility proof).
 *
 * Renders the real /owner/budget page with mocked routes and asserts the owner can SEE
 * receivable/payable ageing buckets computed from owner-entered (manual/import-ready)
 * items, the collection-first and vendor-pressure warnings, and the honest manual-data
 * label. Component-level proof (jsdom) — not a live browser run (documented limitation).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import OwnerBudgetPlanPage from "@/app/(authenticated)/owner/budget/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, json: async () => body } as unknown as Response);
    if (url.includes("/api/owner/businesses")) return json({ businesses: [{ id: "b1", name: "Acme", currency: "INR" }] });
    if (url.includes("/api/owner/budget/working-capital")) return json([
      { id: "r1", kind: "receivable", counterparty: "BigClient", amount: 120000, status: "open", sourceType: "MANUAL", dueDate: daysAgo(120), updatedAt: daysAgo(2) },
      { id: "p1", kind: "payable", counterparty: "Supplier", amount: 80000, status: "open", sourceType: "MANUAL", dueDate: daysAgo(100), updatedAt: daysAgo(2) },
    ]);
    if (url.includes("/api/owner/budget/guidance")) return json({ hasPlan: true, mode: "STABILIZE", confidence: "OPERATIONAL" });
    if (url.includes("/api/owner/budget/snapshots")) return json([]);
    if (url.includes("/api/owner/budget/forecast")) return json(null);
    if (url.includes("/api/owner/budget/authority")) return json([]);
    if (url.includes("/api/owner/budget/actions")) return json([]);
    return json({});
  });
}

describe("Owner Budget — Working-Capital ageing entry section", () => {
  it("renders receivable & payable ageing buckets from owner-entered items", async () => {
    mockFetch();
    const { container } = renderWithProvider(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Working capital — receivables"));
    const text = container.textContent ?? "";
    expect(text).toContain("Receivables ageing");
    expect(text).toContain("Payables ageing");
    expect(text).toMatch(/90\+/); // 90+ bucket label shown
  });

  it("shows the collection-first warning for a 90+ overdue receivable", async () => {
    mockFetch();
    const { container } = renderWithProvider(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Working capital — receivables"));
    expect(container.textContent ?? "").toMatch(/Collection-first: receivables 90\+ days overdue/i);
  });

  it("shows the vendor-pressure warning for an overdue payable", async () => {
    mockFetch();
    const { container } = renderWithProvider(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Working capital — receivables"));
    expect(container.textContent ?? "").toMatch(/Vendor pressure: overdue payables create supply risk/i);
  });

  it("labels the data manual / import-ready and not live-verified", async () => {
    mockFetch();
    const { container } = renderWithProvider(<OwnerBudgetPlanPage />);
    await waitFor(() => expect(container.textContent ?? "").toContain("Working capital — receivables"));
    const text = container.textContent ?? "";
    expect(text).toMatch(/manual \/ import-ready/i);
    expect(text).toMatch(/NOT a live bank\/accounting feed/i);
  });
});
